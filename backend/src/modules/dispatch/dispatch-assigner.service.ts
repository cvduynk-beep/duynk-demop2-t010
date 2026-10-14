import { Injectable } from '@nestjs/common';
import { HostDutyStatus, HostRole, Prisma, TicketStatus, ViewingStatus } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { LIVE_TICKET_STATUSES, LIVE_VIEWING_STATUSES, MIN_GAP_MIN } from './dispatch.constants';

type Db = PrismaService | Prisma.TransactionClient;

const VN_OFFSET_MS = 7 * 3600 * 1000;
const DAY_MS = 24 * 3600 * 1000;

/** [00:00, 24:00) giờ Việt Nam (UTC+7, không có giờ mùa hè) chứa `at`. */
export function vnDayRange(at: Date): { from: Date; to: Date } {
  const startMs = Math.floor((at.getTime() + VN_OFFSET_MS) / DAY_MS) * DAY_MS - VN_OFFSET_MS;
  return { from: new Date(startMs), to: new Date(startMs + DAY_MS) };
}

/**
 * Chọn Sale cho một ca (dùng chung A6 tạo lịch, A8 đổi giờ, reject). Điều kiện đúng 01-CONTRACTS §4:
 * vai SALE · tài khoản đang mở · SĐT đã xác thực (Sale chưa xác thực không nhận được ca ⇒ ticket treo quá SLA) · ONLINE_AVAILABLE · cùng phân khu · không có ca trong ±45′ · không bị loại.
 * Chia đều việc: ít ca trong ngày hơn → rating cao hơn → vào hệ thống sớm hơn.
 */
@Injectable()
export class DispatchAssignerService {
  constructor(private readonly prisma: PrismaService) {}

  async pickHost(
    tx: Db,
    args: { zoneName: string; slot: Date; excludeHostIds?: string[]; excludeViewingId?: string },
  ): Promise<{ id: string } | null> {
    const candidates = await this.candidates(tx, args);
    if (candidates.length === 0) return null;
    if (candidates.length === 1) return { id: candidates[0].id };
    return { id: (await this.byLoad(tx, candidates, args.slot))[0].id };
  }

  /**
   * Hết SLA mà phân khu của căn không còn Sale rảnh (quyết định 2026-10-14): Sale rảnh ở phân khu GẦN NHẤT.
   * Khoảng cách = từ sảnh tòa của căn tới tâm (trung bình toạ độ sảnh) các tòa thuộc phân khu chính của Sale.
   * Cùng khoảng cách ⇒ chia đều việc như `pickHost`. Không ai đủ điều kiện ⇒ null.
   */
  async pickNearestHost(
    tx: Db,
    args: { lat: number; lng: number; slot: Date; excludeHostIds?: string[]; excludeViewingId?: string },
  ): Promise<{ id: string; zone: string; distanceM: number } | null> {
    const candidates = await this.candidates(tx, args);
    if (candidates.length === 0) return null;
    const buildings = await tx.building.findMany({ select: { zoneName: true, lobbyLatitude: true, lobbyLongitude: true } });
    const centroid = new Map<string, { lat: number; lng: number }>();
    for (const zone of new Set(buildings.map((b) => b.zoneName))) {
      const pts = buildings.filter((b) => b.zoneName === zone);
      centroid.set(zone, {
        lat: pts.reduce((a, b) => a + Number(b.lobbyLatitude), 0) / pts.length,
        lng: pts.reduce((a, b) => a + Number(b.lobbyLongitude), 0) / pts.length,
      });
    }
    const placed = candidates
      .map((c) => {
        const zone = [...centroid.keys()].find((z) => c.assignedZone.includes(z));
        const at = zone ? centroid.get(zone)! : null;
        return { c, zone: zone ?? c.assignedZone, distanceM: at ? haversineM(args.lat, args.lng, at.lat, at.lng) : Number.POSITIVE_INFINITY };
      })
      .filter((x) => Number.isFinite(x.distanceM));
    if (placed.length === 0) return null;
    const nearest = Math.min(...placed.map((x) => x.distanceM));
    // Coi các phân khu chênh < 50 m là "bằng nhau" (sai số toạ độ) ⇒ chia đều việc giữa họ.
    const tied = placed.filter((x) => x.distanceM - nearest < 50);
    const firstId = tied.length === 1 ? tied[0].c.id : (await this.byLoad(tx, tied.map((x) => x.c), args.slot))[0].id;
    const chosen = tied.find((x) => x.c.id === firstId)!;
    return { id: chosen.c.id, zone: chosen.zone, distanceM: Math.round(chosen.distanceM) };
  }

  /** Điều kiện chung của người được giao (01-CONTRACTS §4); `zoneName` có ⇒ chỉ phân khu chính chứa tên đó. */
  private candidates(tx: Db, args: { zoneName?: string; slot: Date; excludeHostIds?: string[]; excludeViewingId?: string }) {
    const gapMs = MIN_GAP_MIN * 60 * 1000;
    return tx.fieldHost.findMany({
      where: {
        roles: { has: HostRole.SALE },
        dutyStatus: HostDutyStatus.ONLINE_AVAILABLE,
        profile: { isActive: true, isPhoneVerified: true },
        ...(args.zoneName ? { assignedZone: { contains: args.zoneName } } : {}),
        ...(args.excludeHostIds?.length ? { id: { notIn: args.excludeHostIds } } : {}),
        tickets: {
          none: {
            status: { in: LIVE_TICKET_STATUSES },
            viewing: {
              status: { in: LIVE_VIEWING_STATUSES },
              viewingSlot: { gt: new Date(args.slot.getTime() - gapMs), lt: new Date(args.slot.getTime() + gapMs) },
              ...(args.excludeViewingId ? { id: { not: args.excludeViewingId } } : {}),
            },
          },
        },
      },
      select: { id: true, rating: true, createdAt: true, assignedZone: true },
    });
  }

  /** Chia đều việc: ít ca trong ngày hơn → rating cao hơn → vào hệ thống sớm hơn. */
  private async byLoad<T extends { id: string; rating: unknown; createdAt: Date }>(tx: Db, candidates: T[], slot: Date): Promise<T[]> {
    const day = vnDayRange(slot);
    const loads = await tx.dispatchTicket.groupBy({
      by: ['hostId'],
      where: {
        hostId: { in: candidates.map((c) => c.id) },
        status: { in: [TicketStatus.ACCEPTED, TicketStatus.COMPLETED] },
        viewing: { viewingSlot: { gte: day.from, lt: day.to }, status: { not: ViewingStatus.CANCELLED } },
      },
      _count: { _all: true },
    });
    const load = new Map(loads.map((l) => [l.hostId as string, l._count._all]));
    return [...candidates].sort(
      (a, b) =>
        (load.get(a.id) ?? 0) - (load.get(b.id) ?? 0) ||
        Number(b.rating) - Number(a.rating) ||
        a.createdAt.getTime() - b.createdAt.getTime(),
    );
  }

  /** Tạo ticket OFFERED cho một ca: tier 1 nếu có Sale phù hợp, ngược lại `hostId null, tier 2` (đi thẳng ZONE_POOL). */
  async offer(
    tx: Db,
    args: { viewingId: string; zoneName: string; slot: Date; excludeHostIds?: string[] },
  ) {
    const host = await this.pickHost(tx, {
      zoneName: args.zoneName,
      slot: args.slot,
      excludeHostIds: args.excludeHostIds,
      excludeViewingId: args.viewingId,
    });
    return tx.dispatchTicket.create({
      data: {
        viewingId: args.viewingId,
        hostId: host ? host.id : null,
        tier: host ? 1 : 2,
        slaSeconds: 180,
        status: TicketStatus.OFFERED,
      },
    });
  }
}

/** Khoảng cách mặt cầu (mét) giữa hai toạ độ. */
export function haversineM(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R = 6_371_000;
  const rad = (d: number) => (d * Math.PI) / 180;
  const a = Math.sin(rad(lat2 - lat1) / 2) ** 2 + Math.cos(rad(lat1)) * Math.cos(rad(lat2)) * Math.sin(rad(lng2 - lng1) / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(a));
}

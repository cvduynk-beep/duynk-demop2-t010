import { Injectable, Logger, OnApplicationBootstrap, OnModuleDestroy } from '@nestjs/common';
import { Prisma, TicketStatus, ViewingStatus } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { DispatchAssignerService } from './dispatch-assigner.service';
import { ASSIGNED_SLA_S, DEFAULT_SLA_SWEEP_INTERVAL_MS, SLA_REASSIGN_MAX, SLA_TIMEOUT_REASON } from './dispatch.constants';

type Tx = Prisma.TransactionClient;
export type ReassignOutcome = 'reassigned' | 'max_rounds' | 'no_candidate' | 'raced';

const DAY_MS = 24 * 3600 * 1000;
const BATCH = 50;

/**
 * Hết SLA nhận ca 3′ (quyết định 2026-10-14, thay cho việc ca tự trôi ra pool cho mọi Sale):
 * ticket OFFERED có Sale được giao, quá 3′ chưa nhận ⇒ EXPIRED (`reject_reason = sla_timeout`) + ticket tầng 1 MỚI cho
 * Sale rảnh cùng phân khu; không có ⇒ Sale rảnh ở phân khu gần nhất. Tối đa `SLA_REASSIGN_MAX` lần; quá số lần hoặc không
 * còn ai ⇒ giữ nguyên ticket (pool như cũ: Sale trong phạm vi sau 3′, mọi Sale sau 6′).
 *
 * - Chỉ chuyển MỘT lần: ticket cũ đổi trạng thái bằng ghi có điều kiện (id + OFFERED + đúng Sale) trong cùng transaction
 *   với ticket mới và audit ⇒ nhiều instance / sweep chồng nhau không giao trùng.
 * - Khởi động lại giữa chừng: sweep chạy ngay lúc boot và quét mọi ticket quá hạn trong 24h (ca chưa tới giờ) ⇒ bắt kịp.
 * - So sánh thời gian bằng `Date` UTC ở DB; giờ VN chỉ dùng khi hiển thị.
 */
@Injectable()
export class DispatchSlaService implements OnApplicationBootstrap, OnModuleDestroy {
  private readonly logger = new Logger(DispatchSlaService.name);
  private timer?: NodeJS.Timeout;
  private sweeping = false;

  constructor(
    private readonly prisma: PrismaService,
    private readonly assigner: DispatchAssignerService,
  ) {}

  onApplicationBootstrap() {
    const ms = Number(process.env.DISPATCH_SLA_SWEEP_INTERVAL_MS ?? DEFAULT_SLA_SWEEP_INTERVAL_MS);
    if (process.env.NODE_ENV === 'test' || !Number.isFinite(ms) || ms <= 0) return;
    this.timer = setInterval(() => void this.backgroundSweep(), ms);
    this.timer.unref();
    void this.backgroundSweep();
  }

  onModuleDestroy() {
    if (this.timer) clearInterval(this.timer);
  }

  private async backgroundSweep() {
    if (this.sweeping) return;
    this.sweeping = true;
    try {
      const out = await this.sweep();
      if (out.reassigned) this.logger.log(`Giao lại ${out.reassigned} ca quá SLA 3′`);
    } catch (err) {
      this.logger.warn(`Sweep SLA điều phối lỗi: ${(err as Error).message}`);
    } finally {
      this.sweeping = false;
    }
  }

  /** Quét ticket quá SLA; trả số ca theo kết quả. */
  async sweep(now: Date = new Date()): Promise<Record<ReassignOutcome, number>> {
    const due = await this.prisma.dispatchTicket.findMany({
      where: {
        status: TicketStatus.OFFERED,
        hostId: { not: null },
        offeredAt: { lte: new Date(now.getTime() - ASSIGNED_SLA_S * 1000), gte: new Date(now.getTime() - DAY_MS) },
        viewing: { status: ViewingStatus.PENDING_CONFIRMATION, viewingSlot: { gt: now } },
      },
      select: { id: true },
      orderBy: { offeredAt: 'asc' },
      take: BATCH,
    });
    const out: Record<ReassignOutcome, number> = { reassigned: 0, max_rounds: 0, no_candidate: 0, raced: 0 };
    for (const t of due) out[await this.reassign(t.id, now)] += 1;
    return out;
  }

  async reassign(ticketId: string, now: Date = new Date()): Promise<ReassignOutcome> {
    return this.prisma.$transaction(async (tx) => {
      const t = await tx.dispatchTicket.findUnique({
        where: { id: ticketId },
        include: { viewing: { include: { unit: { include: { building: true } } } } },
      });
      if (!t || t.status !== TicketStatus.OFFERED || !t.hostId || t.viewing.status !== ViewingStatus.PENDING_CONFIRMATION) return 'raced';
      if (now.getTime() - t.offeredAt.getTime() < ASSIGNED_SLA_S * 1000) return 'raced';

      const history = await tx.dispatchTicket.findMany({
        where: { viewingId: t.viewingId },
        select: { hostId: true, status: true, rejectReason: true },
      });
      const round = history.filter((h) => h.status === TicketStatus.EXPIRED && h.rejectReason === SLA_TIMEOUT_REASON).length + 1;
      if (round > SLA_REASSIGN_MAX) return 'max_rounds';

      // Không giao lại cho người đã từng được giao / đã từ chối ca này.
      const tried = [...new Set(history.map((h) => h.hostId).filter((id): id is string => !!id))];
      const building = t.viewing.unit.building;
      const args = { slot: t.viewing.viewingSlot, excludeHostIds: tried, excludeViewingId: t.viewingId };
      const sameZone = await this.assigner.pickHost(tx, { ...args, zoneName: building.zoneName });
      const nearest = sameZone
        ? null
        : await this.assigner.pickNearestHost(tx, { ...args, lat: Number(building.lobbyLatitude), lng: Number(building.lobbyLongitude) });
      const next = sameZone ?? nearest;
      if (!next) return 'no_candidate';

      const closed = await tx.dispatchTicket.updateMany({
        where: { id: t.id, status: TicketStatus.OFFERED, hostId: t.hostId },
        data: { status: TicketStatus.EXPIRED, closedAt: now, rejectReason: SLA_TIMEOUT_REASON },
      });
      if (closed.count !== 1) throw new RaceLost();

      const created = await tx.dispatchTicket.create({
        data: { viewingId: t.viewingId, hostId: next.id, tier: 1, slaSeconds: ASSIGNED_SLA_S, status: TicketStatus.OFFERED, offeredAt: now },
      });
      await tx.auditLog.create({
        data: {
          actorId: await this.systemActorId(tx),
          actorRole: 'system',
          actionType: 'DISPATCH_REASSIGNED',
          entityName: 'viewings',
          entityId: t.viewingId,
          oldValue: { ticketId: t.id, hostId: t.hostId, offeredAt: t.offeredAt.toISOString() },
          newValue: {
            ticketId: created.id,
            hostId: next.id,
            reason: SLA_TIMEOUT_REASON,
            round,
            match: sameZone ? 'same_zone' : 'nearest_zone',
            ...(nearest ? { zone: nearest.zone, distanceM: nearest.distanceM } : {}),
          },
        },
      });
      return 'reassigned' as const;
    }).catch((err) => {
      if (err instanceof RaceLost) return 'raced' as const;
      throw err;
    });
  }

  /** Audit cần một hồ sơ thật: dùng Admin đầu tiên (như đối soát VietQR). Không có Admin ⇒ không giao lại (ném lỗi ⇒ rollback). */
  private async systemActorId(tx: Tx): Promise<string> {
    const admin = await tx.profile.findFirst({ where: { role: { code: 'ops_admin' } }, orderBy: { createdAt: 'asc' }, select: { id: true } });
    if (!admin) throw new Error('system_actor_unavailable');
    return admin.id;
  }
}

/** Người khác vừa nhận / instance khác vừa giao lại ⇒ rollback cả transaction, không coi là lỗi. */
class RaceLost extends Error {}

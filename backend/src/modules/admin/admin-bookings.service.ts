import { BadRequestException, ConflictException, Injectable, NotFoundException, UnprocessableEntityException } from '@nestjs/common';
import { HostRole, Prisma, TicketStatus, ViewingStatus } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { PhoneService } from '../auth/phone/phone.service';
import { decryptPhoneForDisplay } from '../auth/phone/phone-display';
import { inZone } from '../dispatch/ticket-tier';
import { maskHostPhone } from '../host-viewings/host-viewings.mappers';
import type { AdminActor } from './admin-fee.service';
import { DAY_MS, ictDay, ictStart } from './admin-range';

// ─── Quy tắc nghiệp vụ điều phối tay (đã chốt) ─────────────────────────────────────────────────────────────────
/** Ticket còn chờ nhận ⇒ được giao lại. ACCEPTED/CHECKED (Host đã nhận/đang dẫn) ⇒ CẤM. */
export const REASSIGNABLE_TICKET: TicketStatus[] = ['OFFERED', 'EXPIRED', 'ESCALATED'];
/** Lịch chưa tới sảnh ⇒ được giao lại. LOBBY/RECEIVING/VIEWING (Host đang đón/dẫn) và lịch đã kết thúc ⇒ CẤM. */
export const REASSIGNABLE_VIEWING: ViewingStatus[] = ['PENDING_CONFIRMATION', 'CONFIRMED'];
/** Lịch "đang xử lý" (tab mặc định). */
export const OPEN_VIEWING: ViewingStatus[] = ['PENDING_CONFIRMATION', 'CONFIRMED', 'LOBBY', 'RECEIVING', 'VIEWING', 'CLOSING'];
/** Ticket đang chiếm thời gian của Host (dùng để chặn ca trùng giờ). */
const BUSY_TICKET: TicketStatus[] = ['OFFERED', 'ACCEPTED', 'CHECKED'];
/** Ca xem 45 phút (AGENTS.md) ⇒ Host không nhận 2 ca có giờ hẹn cách nhau dưới 45 phút. */
export const OVERLAP_MINUTES = 45;
export const REASON_MIN = 5;
export const REASON_MAX = 300;
export const PAGE_SIZE_DEFAULT = 20;
export const PAGE_SIZE_MAX = 50;
const SEARCH_MAX = 50;
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export type BookingTab = 'open' | 'today' | 'all';

export interface AdminBookingRow {
  viewingId: string;
  bookingRef: string;
  slot: string;
  viewingStatus: ViewingStatus;
  createdAt: string;
  unit: { code: string; building: string; zone: string };
  tenant: { name: string | null; phoneMasked: string | null };
  ticket: {
    id: string;
    status: TicketStatus;
    tier: number;
    slaSeconds: number;
    hostId: string | null;
    hostName: string | null;
    offeredAt: string;
    acceptedAt: string | null;
    deadlineAt: string;
    secondsOverdue: number;
    isBreached: boolean;
  } | null;
  /** Mã phiên bản của ticket hiện tại — client gửi lại khi giao lại; lệch ⇒ 409 reassign_conflict. */
  version: string | null;
  canReassign: boolean;
  reassignBlockedReason: string | null;
  lastReassign: { at: string; actorName: string | null; fromHostId: string | null; toHostId: string | null; reason: string | null } | null;
}

export interface ReassignCandidate {
  hostId: string;
  name: string;
  zone: string;
  sameZone: boolean;
  openTickets: number;
}

function invalidRequest(field: string, message: string): never {
  throw new BadRequestException({ code: 'invalid_request', message, errors: { [field]: message } });
}

const iso = (d: Date | string | null | undefined) => (d ? new Date(d).toISOString() : null);

/** Mã phiên bản = các cột mà một lần giao lại / Host nhận ca sẽ làm đổi. Không cần cột version trong DB (đã chốt). */
export function ticketVersion(t: { id: string; hostId: string | null; status: string; offeredAt: Date | string }): string {
  return Buffer.from(`${t.id}|${t.hostId ?? ''}|${t.status}|${new Date(t.offeredAt).toISOString()}`).toString('base64url');
}

/** Ticket "hiện tại" của lịch = ticket mới nhất theo offeredAt (cùng quy ước với luồng điều phối). */
const latestTicket = <T extends { offeredAt: Date }>(tickets: T[]): T | null =>
  tickets.reduce<T | null>((a, t) => (!a || new Date(t.offeredAt) > new Date(a.offeredAt) ? t : a), null);

/** Lý do KHÔNG cho giao lại theo trạng thái (null = được). */
export function blockedReason(viewingStatus: string, ticket: { status: string } | null): string | null {
  if (!ticket) return 'Lịch xem chưa có ticket điều phối.';
  if (!REASSIGNABLE_VIEWING.includes(viewingStatus as ViewingStatus)) {
    return ['LOBBY', 'RECEIVING', 'VIEWING', 'CLOSING'].includes(viewingStatus)
      ? 'Host đang đón/dẫn khách, không thể giao lại.'
      : 'Lịch xem đã kết thúc hoặc bị huỷ, không thể giao lại.';
  }
  if (!REASSIGNABLE_TICKET.includes(ticket.status as TicketStatus)) return `Ticket đang ở trạng thái ${ticket.status} (Host đã nhận ca), không thể giao lại.`;
  return null;
}

interface HostForCheck {
  id: string;
  dutyStatus: string;
  roles: HostRole[];
  assignedZone: string;
  profile: { fullName: string | null; isActive: boolean } | null;
}

/** MỘT nguồn quy tắc cho Host nhận hợp lệ — dùng cho cả danh sách ứng viên lẫn lúc ghi (null = hợp lệ). */
export function targetProblem(host: HostForCheck | null, currentHostId: string | null, busyHostIds: Set<string>): string | null {
  if (!host) return 'Không tìm thấy Field Host.';
  if (!host.profile?.isActive) return 'Tài khoản Field Host đã bị khoá.';
  if (!host.roles.includes('SALE')) return 'Field Host không có vai Sale (dẫn xem).';
  if (host.dutyStatus !== 'ONLINE_AVAILABLE') return 'Field Host không ở trạng thái sẵn sàng nhận ca.';
  if (host.id === currentHostId) return 'Host mới trùng Host hiện tại.';
  if (busyHostIds.has(host.id)) return `Field Host đã có ca khác trong vòng ${OVERLAP_MINUTES} phút quanh giờ hẹn.`;
  return null;
}

const VIEWING_INCLUDE = {
  unit: { include: { building: true } },
  tenant: { select: { fullName: true } },
  tickets: { include: { host: { include: { profile: { select: { fullName: true } } } } } },
} satisfies Prisma.ViewingInclude;

type ViewingWithRelations = Prisma.ViewingGetPayload<{ include: typeof VIEWING_INCLUDE }>;

@Injectable()
export class AdminBookingsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly phones: PhoneService,
  ) {}

  // ─── Danh sách (phân trang / lọc / tìm phía server) ─────────────────────────────────────────────────────────
  async list(q: { tab?: string; q?: string; page?: string; pageSize?: string }, now: Date = new Date()) {
    const tab = (q.tab ?? 'open') as BookingTab;
    if (!['open', 'today', 'all'].includes(tab)) invalidRequest('tab', 'tab phải là open, today hoặc all.');
    const page = q.page === undefined || q.page === '' ? 1 : Number(q.page);
    if (!Number.isInteger(page) || page < 1) invalidRequest('page', 'page phải là số nguyên ≥ 1.');
    const pageSize = q.pageSize === undefined || q.pageSize === '' ? PAGE_SIZE_DEFAULT : Number(q.pageSize);
    if (!Number.isInteger(pageSize) || pageSize < 1 || pageSize > PAGE_SIZE_MAX) invalidRequest('pageSize', `pageSize phải từ 1 đến ${PAGE_SIZE_MAX}.`);
    const search = (q.q ?? '').trim();
    if (search.length > SEARCH_MAX) invalidRequest('q', `Từ khoá tối đa ${SEARCH_MAX} ký tự.`);

    const where: Prisma.ViewingWhereInput = {};
    if (tab === 'open') where.status = { in: OPEN_VIEWING };
    if (tab === 'today') {
      const start = ictStart(ictDay(now));
      where.viewingSlot = { gte: start, lt: new Date(start.getTime() + DAY_MS) };
    }
    if (search) {
      where.OR = [
        { bookingRefCode: { contains: search, mode: 'insensitive' } },
        { unit: { unitCode: { contains: search, mode: 'insensitive' } } },
      ];
    }
    const [total, viewings] = await Promise.all([
      this.prisma.viewing.count({ where }),
      this.prisma.viewing.findMany({
        where,
        include: VIEWING_INCLUDE,
        orderBy: [{ viewingSlot: tab === 'all' ? 'desc' : 'asc' }, { id: 'asc' }],
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
    ]);
    const items = await this.toRows(viewings, now);
    return { items, total, page, pageSize, tab, q: search };
  }

  // ─── Ứng viên nhận ca (đã lọc theo đúng quy tắc lúc ghi) ────────────────────────────────────────────────────
  async candidates(viewingId: string) {
    const viewing = await this.loadViewing(viewingId);
    const ticket = latestTicket(viewing.tickets);
    const blocked = blockedReason(viewing.status, ticket);
    const [hosts, busy, load] = await Promise.all([
      this.prisma.fieldHost.findMany({
        select: { id: true, dutyStatus: true, roles: true, assignedZone: true, profile: { select: { fullName: true, isActive: true } } },
        orderBy: { id: 'asc' },
      }),
      this.busyHosts(this.prisma, viewing),
      this.prisma.dispatchTicket.groupBy({ by: ['hostId'], where: { status: { in: BUSY_TICKET }, hostId: { not: null } }, _count: true }),
    ]);
    const openTickets = new Map(load.map((r) => [r.hostId as string, Number(r._count)]));
    const zone = viewing.unit.building.zoneName;
    const eligible: ReassignCandidate[] = [];
    const ineligible: Array<{ hostId: string; name: string; reason: string }> = [];
    for (const h of hosts) {
      const problem = targetProblem(h, ticket?.hostId ?? null, busy);
      const name = h.profile?.fullName ?? 'Host chưa đặt tên';
      if (problem) ineligible.push({ hostId: h.id, name, reason: problem });
      else eligible.push({ hostId: h.id, name, zone: h.assignedZone, sameZone: inZone(h.assignedZone, zone), openTickets: openTickets.get(h.id) ?? 0 });
    }
    // Cùng phân khu lên trước, rồi Host ít ca hơn.
    eligible.sort((a, b) => Number(b.sameZone) - Number(a.sameZone) || a.openTickets - b.openTickets || a.name.localeCompare(b.name));
    return {
      viewingId,
      version: ticket ? ticketVersion(ticket) : null,
      canReassign: blocked === null,
      reassignBlockedReason: blocked,
      eligible: blocked ? [] : eligible,
      ineligible,
    };
  }

  // ─── Giao lại (transaction + kiểm version + audit trong cùng transaction) ───────────────────────────────────
  async reassign(viewingId: string, dto: { hostId?: unknown; reason?: unknown; version?: unknown }, actor: AdminActor, now: Date = new Date()) {
    const hostId = typeof dto.hostId === 'string' ? dto.hostId.trim() : '';
    if (!hostId) invalidRequest('hostId', 'Chọn Field Host nhận ca.');
    const reason = typeof dto.reason === 'string' ? dto.reason.trim().replace(/\s+/g, ' ') : '';
    if (reason.length < REASON_MIN || reason.length > REASON_MAX) invalidRequest('reason', `Lý do phải từ ${REASON_MIN} đến ${REASON_MAX} ký tự.`);
    const version = typeof dto.version === 'string' ? dto.version : '';
    if (!version) invalidRequest('version', 'Thiếu phiên bản dữ liệu — tải lại danh sách rồi thử lại.');

    await this.prisma.$transaction(async (tx) => {
      const viewing = await this.loadViewing(viewingId, tx);
      const ticket = latestTicket(viewing.tickets);
      if (!ticket) throw new NotFoundException({ code: 'not_found', message: 'Không tìm thấy ticket điều phối cho lịch xem này.' });
      // Người khác đã đổi ticket kể từ lúc client tải ⇒ 409 kèm bản mới nhất (không ghi đè).
      if (ticketVersion(ticket) !== version) await this.conflict(viewing, now);
      const blocked = blockedReason(viewing.status, ticket);
      if (blocked) throw new ConflictException({ code: 'reassign_not_allowed', message: blocked });

      const host = await tx.fieldHost.findUnique({
        where: { id: hostId },
        select: { id: true, dutyStatus: true, roles: true, assignedZone: true, profile: { select: { fullName: true, isActive: true } } },
      });
      const problem = targetProblem(host, ticket.hostId, await this.busyHosts(tx, viewing));
      if (problem) throw new UnprocessableEntityException({ code: 'reassign_target_invalid', message: problem, errors: { hostId: problem } });

      // Ghi có điều kiện: chỉ đổi khi ticket còn đúng như lúc kiểm (chặn race giữa đọc và ghi).
      const res = await tx.dispatchTicket.updateMany({
        where: { id: ticket.id, hostId: ticket.hostId, status: ticket.status, offeredAt: ticket.offeredAt },
        data: { hostId, status: 'OFFERED', offeredAt: now, acceptedAt: null },
      });
      if (res.count !== 1) await this.conflict(viewing, now);

      await tx.auditLog.create({
        data: {
          actorId: actor.id,
          actorRole: actor.role,
          actionType: 'DISPATCH_REASSIGNED',
          entityName: 'DispatchTicket',
          entityId: ticket.id,
          oldValue: { hostId: ticket.hostId, status: ticket.status, tier: ticket.tier, offeredAt: iso(ticket.offeredAt) },
          newValue: { hostId, status: 'OFFERED', tier: ticket.tier, offeredAt: now.toISOString(), reason, viewingId },
        },
      });
    });
    return this.row(viewingId, now);
  }

  // ─── Nội bộ ───────────────────────────────────────────────────────────────────────────────────────────────
  private async loadViewing(viewingId: string, db: Prisma.TransactionClient | PrismaService = this.prisma): Promise<ViewingWithRelations> {
    // id không phải UUID ⇒ chắc chắn không tồn tại; kiểm trước để không đẩy lỗi kiểu dữ liệu xuống DB.
    const viewing = UUID_RE.test(viewingId) ? await db.viewing.findUnique({ where: { id: viewingId }, include: VIEWING_INCLUDE }) : null;
    if (!viewing) throw new NotFoundException({ code: 'not_found', message: 'Không tìm thấy lịch xem.' });
    return viewing;
  }

  /** Host đang có ticket bận (OFFERED/ACCEPTED/CHECKED) cho lịch KHÁC, giờ hẹn cách giờ hẹn này < 45 phút. */
  private async busyHosts(db: Prisma.TransactionClient | PrismaService, viewing: { id: string; viewingSlot: Date }): Promise<Set<string>> {
    const slot = new Date(viewing.viewingSlot).getTime();
    const win = OVERLAP_MINUTES * 60_000;
    const rows = await db.dispatchTicket.findMany({
      where: {
        status: { in: BUSY_TICKET },
        hostId: { not: null },
        viewingId: { not: viewing.id },
        viewing: { status: { in: OPEN_VIEWING }, viewingSlot: { gt: new Date(slot - win), lt: new Date(slot + win) } },
      },
      select: { hostId: true },
    });
    return new Set(rows.map((r) => r.hostId as string));
  }

  private async conflict(viewing: { id: string }, now: Date): Promise<never> {
    const latest = await this.row(viewing.id, now);
    throw new ConflictException({
      code: 'reassign_conflict',
      message: 'Lịch xem vừa được người khác thay đổi. Đã tải dữ liệu mới nhất, vui lòng kiểm tra lại.',
      errors: { latest },
    });
  }

  private async row(viewingId: string, now: Date): Promise<AdminBookingRow> {
    const viewing = await this.loadViewing(viewingId);
    return (await this.toRows([viewing], now))[0];
  }

  private async toRows(viewings: ViewingWithRelations[], now: Date): Promise<AdminBookingRow[]> {
    const current = viewings.map((v) => latestTicket(v.tickets));
    const ticketIds = current.filter((t): t is NonNullable<typeof t> => !!t).map((t) => t.id);
    const audits = ticketIds.length
      ? await this.prisma.auditLog.findMany({
          where: { actionType: 'DISPATCH_REASSIGNED', entityName: 'DispatchTicket', entityId: { in: ticketIds } },
          orderBy: { createdAt: 'desc' },
          select: { entityId: true, createdAt: true, oldValue: true, newValue: true, actor: { select: { fullName: true } } },
        })
      : [];
    const lastByTicket = new Map<string, (typeof audits)[number]>();
    for (const a of audits) if (!lastByTicket.has(a.entityId)) lastByTicket.set(a.entityId, a);

    return viewings.map((v, i) => {
      const t = current[i];
      const deadline = t ? new Date(new Date(t.offeredAt).getTime() + t.slaSeconds * 1000) : null;
      const overdue = t && deadline && t.status === 'OFFERED' ? Math.max(0, Math.floor((now.getTime() - deadline.getTime()) / 1000)) : 0;
      const blocked = blockedReason(v.status, t);
      const a = t ? lastByTicket.get(t.id) : undefined;
      const oldV = (a?.oldValue ?? {}) as Record<string, unknown>;
      const newV = (a?.newValue ?? {}) as Record<string, unknown>;
      return {
        viewingId: v.id,
        bookingRef: v.bookingRefCode,
        slot: new Date(v.viewingSlot).toISOString(),
        viewingStatus: v.status,
        createdAt: new Date(v.createdAt).toISOString(),
        unit: { code: v.unit.unitCode, building: v.unit.building.buildingCode, zone: v.unit.building.zoneName },
        tenant: {
          name: v.contactName ?? v.tenant?.fullName ?? null,
          phoneMasked: v.contactPhoneEnc ? maskHostPhone(decryptPhoneForDisplay(this.phones, v.contactPhoneEnc)) : null,
        },
        ticket: t
          ? {
              id: t.id,
              status: t.status,
              tier: t.tier,
              slaSeconds: t.slaSeconds,
              hostId: t.hostId,
              hostName: t.host?.profile?.fullName ?? null,
              offeredAt: new Date(t.offeredAt).toISOString(),
              acceptedAt: iso(t.acceptedAt),
              deadlineAt: (deadline as Date).toISOString(),
              secondsOverdue: overdue,
              isBreached: overdue > 0,
            }
          : null,
        version: t ? ticketVersion(t) : null,
        canReassign: blocked === null,
        reassignBlockedReason: blocked,
        lastReassign: a
          ? {
              at: new Date(a.createdAt).toISOString(),
              actorName: a.actor?.fullName ?? null,
              fromHostId: typeof oldV.hostId === 'string' ? oldV.hostId : null,
              toHostId: typeof newV.hostId === 'string' ? newV.hostId : null,
              reason: typeof newV.reason === 'string' ? newV.reason : null,
            }
          : null,
      };
    });
  }
}

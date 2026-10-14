import { TicketStatus, ViewingStatus } from '@prisma/client';

/** Hồ sơ 15 (01-CONTRACTS §3): điều phối 3 tầng tính LÚC ĐỌC từ `offeredAt`, không cron. */
export const ASSIGNED_SLA_S = 180;
export const ZONE_POOL_UNTIL_S = 360;
/**
 * Hết 3′ Sale được giao chưa nhận ⇒ giao lại tầng 1 (cùng phân khu, không có ⇒ phân khu gần nhất). Tối đa ngần này lần
 * giao lại, sau đó ticket nằm ở pool như cũ (quyết định 2026-10-14). Lý do ghi ở `dispatch_tickets.reject_reason`.
 */
export const SLA_REASSIGN_MAX = 2;
export const SLA_TIMEOUT_REASON = 'sla_timeout';
export const DEFAULT_SLA_SWEEP_INTERVAL_MS = 15_000;
export const MIN_GAP_MIN = 45;
export const NO_SHOW_GRACE_MIN = 15;
export const REMINDER_LEAD_MIN = 10;
export const DOOR_CODE_TTL_MIN = 10;

/** Ca xem còn "sống" (chiếm lịch Host / chiếm khung giờ của căn). */
export const LIVE_VIEWING_STATUSES: ViewingStatus[] = [
  ViewingStatus.PENDING_CONFIRMATION,
  ViewingStatus.CONFIRMED,
  ViewingStatus.LOBBY,
  ViewingStatus.RECEIVING,
  ViewingStatus.VIEWING,
  ViewingStatus.CLOSING,
];

/** Ca đã kết thúc: ticket chủ ca chuyển sang COMPLETED. */
export const ENDED_VIEWING_STATUSES: ViewingStatus[] = [
  ViewingStatus.COMPLETED,
  ViewingStatus.NO_SHOW,
  ViewingStatus.LEASED,
  ViewingStatus.CANCELLED,
  ViewingStatus.REJECTED,
];

export const LIVE_TICKET_STATUSES: TicketStatus[] = [TicketStatus.OFFERED, TicketStatus.ACCEPTED];

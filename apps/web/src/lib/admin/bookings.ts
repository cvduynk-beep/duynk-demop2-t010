import type { BookingStatus } from "@/components/booking/status";
import { api, apiErrorText, type ApiResponse } from "@/lib/apiClient";
import { invalidateApiPattern, useApiQuery, type Query } from "@/lib/query/useApiQuery";

// ─── Contract backend: GET /admin/bookings · GET /admin/bookings/:id/reassign-candidates · POST /admin/bookings/:id/reassign ──

export type BookingTab = "open" | "today" | "all";

export interface AdminBookingRow {
  viewingId: string;
  bookingRef: string;
  slot: string;
  viewingStatus: string;
  createdAt: string;
  unit: { code: string; building: string; zone: string };
  tenant: { name: string | null; phoneMasked: string | null };
  ticket: {
    id: string;
    status: string;
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
  version: string | null;
  canReassign: boolean;
  reassignBlockedReason: string | null;
  lastReassign: { at: string; actorName: string | null; fromHostId: string | null; toHostId: string | null; reason: string | null } | null;
}

export interface AdminBookingPage {
  items: AdminBookingRow[];
  total: number;
  page: number;
  pageSize: number;
  tab: BookingTab;
  q: string;
}

export interface ReassignCandidates {
  viewingId: string;
  version: string | null;
  canReassign: boolean;
  reassignBlockedReason: string | null;
  eligible: { hostId: string; name: string; zone: string; sameZone: boolean; openTickets: number }[];
  ineligible: { hostId: string; name: string; reason: string }[];
}

export const REASON_MIN = 5;
export const REASON_MAX = 300;
export const PAGE_SIZE = 20;

export interface BookingListParams {
  tab: BookingTab;
  q: string;
  page: number;
}

const qs = (p: BookingListParams) => {
  const s = new URLSearchParams({ tab: p.tab, page: String(p.page), pageSize: String(PAGE_SIZE) });
  if (p.q.trim()) s.set("q", p.q.trim());
  return s.toString();
};

export const bookingQueries = {
  list: (p: BookingListParams) => ({
    key: `admin-bookings:list:${qs(p)}`,
    fetch: () => api.get<AdminBookingPage>(`/admin/bookings?${qs(p)}`),
    errorText: (res: ApiResponse<AdminBookingPage>) => apiErrorText(res, "Không tải được danh sách lịch xem."),
  }),
  candidates: (viewingId: string) => ({
    key: `admin-bookings:candidates:${viewingId}`,
    fetch: () => api.get<ReassignCandidates>(`/admin/bookings/${encodeURIComponent(viewingId)}/reassign-candidates`),
    errorText: (res: ApiResponse<ReassignCandidates>) => apiErrorText(res, "Không tải được danh sách Field Host."),
  }),
};

/** Tự làm mới 30 giây sau mỗi lần tải xong để thấy thay đổi của Host/Admin khác (không chồng request). */
export const LIST_POLL_MS = 30_000;
export const useAdminBookings = (p: BookingListParams): Query<AdminBookingPage> => useApiQuery(bookingQueries.list(p), true, { pollMs: LIST_POLL_MS });
export const useReassignCandidates = (viewingId: string | null): Query<ReassignCandidates> =>
  useApiQuery(bookingQueries.candidates(viewingId ?? "-"), viewingId !== null);

/** Sau khi ghi: bỏ cache ⇒ danh sách, ứng viên và badge/dashboard tải lại từ server (không tự sửa state cục bộ). */
export function invalidateAfterReassign() {
  invalidateApiPattern("admin-bookings:");
  invalidateApiPattern("admin-dashboard:");
}

export const reassignBooking = (viewingId: string, body: { hostId: string; reason: string; version: string }) =>
  api.post<AdminBookingRow>(`/admin/bookings/${encodeURIComponent(viewingId)}/reassign`, body);

// ─── Kết quả ghi → hành vi UI ────────────────────────────────────────────────────────────────────────────────

export type ReassignOutcome =
  | { kind: "ok"; row: AdminBookingRow }
  /** Người khác vừa đổi: hiện dữ liệu mới nhất, bắt chọn lại. */
  | { kind: "conflict"; message: string; latest: AdminBookingRow | null }
  /** Lỗi theo field (400 invalid_request / 422 reassign_target_invalid). */
  | { kind: "field"; message: string; errors: Partial<Record<"hostId" | "reason", string>> }
  /** Trạng thái không cho giao lại (409 reassign_not_allowed) hoặc lỗi khác (401/403/404/429/5xx/mạng). */
  | { kind: "error"; message: string };

export function reassignOutcome(res: ApiResponse<AdminBookingRow>): ReassignOutcome {
  if (res.ok) return { kind: "ok", row: res.data };
  if (res.status === 409 && res.code === "reassign_conflict") {
    const latest = (res.errors?.latest as AdminBookingRow | undefined) ?? null;
    return { kind: "conflict", message: res.message ?? "Lịch xem vừa được người khác thay đổi.", latest };
  }
  const errors: Partial<Record<"hostId" | "reason", string>> = {};
  for (const k of ["hostId", "reason"] as const) if (typeof res.errors?.[k] === "string") errors[k] = res.errors[k] as string;
  if ((res.status === 400 || res.status === 422) && Object.keys(errors).length) return { kind: "field", message: res.message ?? "Thông tin chưa hợp lệ.", errors };
  if (res.status === 400 && typeof res.errors?.version === "string") return { kind: "error", message: res.errors.version as string };
  return { kind: "error", message: apiErrorText(res, "Chưa giao lại được ca xem.") };
}

/** Kiểm trước khi gửi (backend kiểm lại). null = hợp lệ. */
export function validateReassign(hostId: string, reason: string): Partial<Record<"hostId" | "reason", string>> | null {
  const e: Partial<Record<"hostId" | "reason", string>> = {};
  if (!hostId) e.hostId = "Chọn Field Host nhận ca.";
  const r = reason.trim().replace(/\s+/g, " ");
  if (r.length < REASON_MIN || r.length > REASON_MAX) e.reason = `Lý do phải từ ${REASON_MIN} đến ${REASON_MAX} ký tự.`;
  return Object.keys(e).length ? e : null;
}

// ─── Hiển thị ────────────────────────────────────────────────────────────────────────────────────────────────

/** Enum Prisma → trạng thái web (cùng quy ước tenant.mappers). */
export const webStatus = (s: string): BookingStatus => (s === "PENDING_CONFIRMATION" ? "pending" : (s.toLowerCase() as BookingStatus));

const TICKET_LABEL: Record<string, string> = {
  OFFERED: "Chờ Host nhận",
  ACCEPTED: "Host đã nhận",
  CHECKED: "Đang dẫn xem",
  COMPLETED: "Hoàn tất",
  EXPIRED: "Quá hạn, chưa ai nhận",
  ESCALATED: "Đã leo thang",
  CANCELLED: "Đã huỷ",
};
export const ticketLabel = (s: string) => TICKET_LABEL[s] ?? s;
export const TIER_LABEL: Record<number, string> = { 1: "Tầng 1 · Host gần nhất", 2: "Tầng 2 · Open Pool 500m", 3: "Tầng 3 · Area Lead" };

export const pageCount = (total: number, pageSize: number) => Math.max(1, Math.ceil(total / pageSize));

import { api, type ApiResponse } from "@/lib/apiClient";
import { useApiQuery, invalidateApiPattern, type Query } from "@/lib/query/useApiQuery";
import type { HostRoleCode } from "@/lib/auth/portals";
import { knownErrorMessage } from "@/components/auth/authApi";
import type { ZoneScope, ZoneScopeFields } from "@/lib/host/zoneScope";

/** Kiểu theo contract planning/14_2026-10-04_Sale-Auth/specs/01-CONTRACTS.md §4.3. */
export type HostDuty = "ONLINE_AVAILABLE" | "BUSY_VIEWING" | "OFF_DUTY";
export type TicketStatusKey = "OFFERED" | "ACCEPTED" | "CHECKED" | "COMPLETED" | "EXPIRED" | "ESCALATED" | "CANCELLED";

export interface HostAdminView extends ZoneScopeFields {
  id: string;
  profileId: string;
  email: string | null;
  fullName: string | null;
  phone: string | null;
  isPhoneVerified: boolean;
  assignedZone: string;
  roles: HostRoleCode[];
  dutyStatus: HostDuty;
  rating: number;
  isActive: boolean;
  hasPassword: boolean;
  /** Gửi lại khi lưu phạm vi; lệch ⇒ 409 `zone_scope_conflict`. */
  zoneScopeVersion: string;
  lastLoginAt: string | null;
  createdAt: string;
  stats: HostStats;
}

/** Số liệu vận hành từ backend (`FieldHostsService.statsFor`). */
export interface HostStats {
  completedViewings: number;
  /** Ca đang chạy; khác 0 thì backend chặn khoá tài khoản. */
  openTickets: number;
  deals: number;
  avgAcceptSeconds: number | null;
  noShowRate: number | null;
  weekEarnings: number;
}

/** SLA nhận ticket 3 phút (AGENTS.md — điểm nghẽn vận hành #5). */
export const ACCEPT_SLA_SECONDS = 180;
export const mmss = (sec: number) => `${Math.floor(sec / 60)}′${String(sec % 60).padStart(2, "0")}″`;

export interface HostAdminDetail extends HostAdminView {
  ticketStats: Record<TicketStatusKey, number>;
}

export interface HostFilters {
  q?: string;
  role?: "sale" | "inspector" | "both";
  zone?: string;
  active?: boolean;
}

export interface CreateHostInput {
  email: string;
  fullName: string;
  assignedZone: string;
  roles: HostRoleCode[];
  password?: string;
}

export interface UpdateHostInput {
  fullName?: string;
  assignedZone?: string;
  roles?: HostRoleCode[];
  password?: string;
  isActive?: boolean;
}

/** `PUT /admin/field-hosts/:id/zone-scope` — phạm vi nhận ca pool + xem. */
export interface UpdateZoneScopeInput {
  zoneScope: ZoneScope;
  /** Phân khu THÊM ngoài phân khu chính. */
  managedZones: string[];
  version: string;
}

const BASE = "/admin/field-hosts";

/** Dựng query string bộ lọc; tham số rỗng/`undefined` bị bỏ. */
export function hostFilterQuery(f: HostFilters = {}): string {
  const p = new URLSearchParams();
  if (f.q?.trim()) p.set("q", f.q.trim());
  if (f.role) p.set("role", f.role);
  if (f.zone) p.set("zone", f.zone);
  if (f.active !== undefined) p.set("active", String(f.active));
  const s = p.toString();
  return s ? `?${s}` : "";
}

export const adminHostsApi = {
  list: (f?: HostFilters) => api.get<HostAdminView[]>(`${BASE}${hostFilterQuery(f)}`),
  zones: () => api.get<string[]>(`${BASE}/zones`),
  get: (id: string) => api.get<HostAdminDetail>(`${BASE}/${encodeURIComponent(id)}`),
  create: (dto: CreateHostInput) => api.post<HostAdminDetail>(BASE, dto),
  update: (id: string, dto: UpdateHostInput) => api.patch<HostAdminDetail>(`${BASE}/${encodeURIComponent(id)}`, dto),
  deactivate: (id: string) => api.delete<HostAdminDetail>(`${BASE}/${encodeURIComponent(id)}`),
  updateZoneScope: (id: string, dto: UpdateZoneScopeInput) =>
    api.put<HostAdminDetail & { changed: boolean }>(`${BASE}/${encodeURIComponent(id)}/zone-scope`, dto),
};

/** Sau mọi thay đổi: bỏ cache danh sách/hồ sơ Host để màn đang mở tải lại. */
export const invalidateHosts = () => invalidateApiPattern("admin-host");

const fail = (res: ApiResponse<unknown>) =>
  knownErrorMessage(res.code, res.status === 0 ? "Không kết nối được máy chủ." : res.message || "Có lỗi xảy ra. Thử lại.");

export const useHostList = (f: HostFilters): Query<HostAdminView[]> =>
  useApiQuery<HostAdminView[]>({
    key: `admin-hosts:${hostFilterQuery(f)}`,
    fetch: () => adminHostsApi.list(f),
    errorText: fail,
  });

export const useHostZones = (): Query<string[]> =>
  useApiQuery<string[]>({ key: "admin-host-zones", fetch: adminHostsApi.zones, errorText: fail });

export const useHost = (id: string): Query<HostAdminDetail> =>
  useApiQuery<HostAdminDetail>({ key: `admin-host:${id}`, fetch: () => adminHostsApi.get(id), errorText: fail });

export { fail as hostErrorText };

// ─── Vai Host (hồ sơ 18: chỉ 2 tập {sale} / {sale, inspector}; B5) ───────────────────────────

export type HostRoleChoice = "sale" | "sale_inspector";

export const ROLE_CHOICE_LABEL: Record<HostRoleChoice, string> = { sale: "Sale", sale_inspector: "Sale + Thẩm định" };

/** Lựa chọn radio → `roles` gửi backend. */
export const rolesOfChoice = (c: HostRoleChoice): HostRoleCode[] => (c === "sale" ? ["sale"] : ["sale", "inspector"]);

/** `roles` hiện có → lựa chọn radio. Host cũ chỉ có inspector (chưa chạy script sửa vai) được coi là "Sale + Thẩm định". */
export const choiceOfRoles = (roles: readonly HostRoleCode[]): HostRoleChoice => (roles.includes("inspector") ? "sale_inspector" : "sale");

/** Nhãn hiển thị vai của một Host (một nhãn duy nhất, không tách badge). */
export const hostRoleLabel = (roles: readonly HostRoleCode[]): string => ROLE_CHOICE_LABEL[choiceOfRoles(roles)];

// ─── Trạng thái hiển thị (gộp khoá tài khoản + ca trực) ──────────────────────────────────────

export type HostDisplayStatus = "active" | "busy" | "off_duty" | "suspended";

export const hostDisplayStatus = (h: Pick<HostAdminView, "isActive" | "dutyStatus">): HostDisplayStatus =>
  !h.isActive ? "suspended" : h.dutyStatus === "ONLINE_AVAILABLE" ? "active" : h.dutyStatus === "BUSY_VIEWING" ? "busy" : "off_duty";

export const HOST_STATUS_META: Record<HostDisplayStatus, { label: string; badge: string; tone: "ok" | "warn" | "neutral" | "danger" }> = {
  active: { label: "Đang trực", badge: "badge-kelp", tone: "ok" },
  busy: { label: "Đang bận", badge: "badge-amber-soft", tone: "warn" },
  off_duty: { label: "Nghỉ ca", badge: "badge-plain", tone: "neutral" },
  suspended: { label: "Tạm đóng", badge: "badge-plain", tone: "danger" },
};

/** Khoá / mở khoá tài khoản Host (khoá bị chặn 409 khi Host còn ca đang chạy). */
export const setHostActive = (id: string, active: boolean) =>
  active ? adminHostsApi.update(id, { isActive: true }) : adminHostsApi.deactivate(id);

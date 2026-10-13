import { api, apiErrorText, type ApiResponse } from "@/lib/apiClient";
import type { ConsignmentStatus, LayoutKind, LockKind } from "@/lib/landlord/types";
import { invalidateApiPattern, useApiQuery, type Query } from "@/lib/query/useApiQuery";

// ─── Contract backend (AdminInventoryService): rổ hàng · hồ sơ ký gửi · thoát ủy quyền ──────────────────────────

export type UnitStatusApi = "AVAILABLE" | "HOLDING" | "RENTED" | "UNLISTED" | "MAINTENANCE";
export type MandateStatusApi = "PENDING_INSPECTION" | "ACTIVE" | "EXIT_REQUESTED" | "TERMINATED" | "EXPIRED" | "NONE";
export type DoorLockApi = "ELECTRONIC_PIN" | "PHYSICAL_KEY";

/** GET /admin/exclusive-inventory */
export interface InventoryRow {
  id: string;
  unitCode: string;
  building: string;
  zone: string;
  layout: string;
  carpetAreaM2: number;
  baseRentPrice: number;
  status: UnitStatusApi;
  landlordName: string | null;
  floorNumber: number;
  doorNumber: string | null;
  doorLockType: DoorLockApi;
  isVerified: boolean;
  /** Phí quản lý BQL theo m² (đ/m²/tháng). */
  managementFee: number;
  createdAt: string;
  mandateStatus: MandateStatusApi;
  exitCountdownDays: number | null;
  mandateId: string | null;
  exitRequestedAt: string | null;
  exitEffectiveAt: string | null;
  canTerminate: boolean;
  terminateBlockedReason: "MANDATE_NOT_EXIT_REQUESTED" | "UNIT_HOLDING" | "EXIT_NOTICE_NOT_ELAPSED" | null;
}

/** GET /admin/exclusive-inventory/:id */
export interface InventoryDetail {
  id: string;
  unitCode: string;
  building: string;
  zone: string;
  floorNumber: number;
  doorNumber: string | null;
  layout: string;
  carpetAreaM2: number;
  baseRentPrice: number;
  managementFee: number;
  marketAvgPrice: number;
  furnishing: "FULL" | "BASIC" | "EMPTY";
  /** Cùng công thức AI Matchmaker, tính cho hộ tham chiếu (mặc định 1 xe máy · 2 người). */
  allInCost: {
    rent: number;
    managementFee: number;
    parkingFee: number;
    utilityCost: number;
    total: number;
    household: { motorbikes: number; cars: number; occupants: number };
    /** true = phí gửi xe là biểu phí tại tòa Host xác minh lúc thẩm định; false = đơn giá chung. */
    feeVerified: boolean;
  };
  /** Field Host phụ trách phân khu (đang hoạt động); null khi phân khu chưa có Host. */
  host: { id: string; name: string | null } | null;
  status: UnitStatusApi;
  isVerified: boolean;
  doorLockType: DoorLockApi;
  holdHours: number;
  holdHoursOverride: number | null;
  defaultHoldHours: number;
  canEditHoldHours: boolean;
  landlord: { id: string; fullName: string | null; email: string | null } | null;
  media: { id: string; url: string; category: string; verifiedAt: string }[];
  mandate: {
    id: string;
    contractNumber: string;
    status: MandateStatusApi;
    signedAt: string | null;
    exitRequestedAt: string | null;
    exitEffectiveAt: string | null;
    exitCountdownDays: number | null;
    canTerminate: boolean;
  } | null;
}

/** GET /admin/consignments[/:id] — không có tài khoản nhận tiền / Giá sàn (chỉ chủ nhà xem). */
export interface AdminConsignment {
  id: string;
  unitId: string;
  unitCode: string;
  contractNumber: string;
  mandateStatus: MandateStatusApi;
  status: ConsignmentStatus;
  building: string;
  zone: string;
  floor: number;
  door: string;
  layoutKind: LayoutKind;
  areaM2: number;
  askRent: number;
  suggestedDeposit: number;
  furnished: boolean;
  locks: LockKind[];
  note: string | null;
  allowFastClose: boolean;
  landlord: { id: string; fullName: string | null } | null;
  createdAt: string;
  signedAt: string | null;
  ownershipWarrantedAt: string | null;
  inspectDueAt: string | null;
  hostId: string | null;
  hostName: string | null;
  hostAcceptedAt: string | null;
  /** Phiếu thẩm định (cấu trúc InspectionReport của module Host); null khi Host chưa nộp. */
  report: unknown;
  reportHostName: string | null;
  decidedAt: string | null;
  decidedBy: string | null;
  decisionNote: string | null;
}

export const HOLD_HOURS_MIN = 12;
export const HOLD_HOURS_MAX = 72;
export const REJECT_NOTE_MIN = 5;

/** Link chi tiết hồ sơ ký gửi dùng chung route `/admin/inventory/[id]` với căn — tiền tố tách hai loại. */
export const CONSIGN_PREFIX = "consign-";
export const consignmentHref = (mandateId: string) => `/admin/inventory/${CONSIGN_PREFIX}${mandateId}`;

const text = (fallback: string) => (res: ApiResponse<unknown>) => apiErrorText(res, fallback);

export const inventoryQueries = {
  list: () => ({
    key: "admin-inventory:list",
    fetch: () => api.get<InventoryRow[]>("/admin/exclusive-inventory"),
    errorText: text("Không tải được rổ hàng."),
  }),
  detail: (id: string) => ({
    key: `admin-inventory:unit:${id}`,
    fetch: () => api.get<InventoryDetail>(`/admin/exclusive-inventory/${encodeURIComponent(id)}`),
    errorText: text("Không tải được thông tin căn hộ."),
  }),
  consignments: () => ({
    key: "admin-inventory:consignments",
    fetch: () => api.get<AdminConsignment[]>("/admin/consignments"),
    errorText: text("Không tải được hồ sơ ký gửi."),
  }),
  consignment: (id: string) => ({
    key: `admin-inventory:consignment:${id}`,
    fetch: () => api.get<AdminConsignment>(`/admin/consignments/${encodeURIComponent(id)}`),
    errorText: text("Không tải được hồ sơ ký gửi."),
  }),
};

export const useInventory = (): Query<InventoryRow[]> => useApiQuery(inventoryQueries.list());
export const useInventoryDetail = (id: string): Query<InventoryDetail> => useApiQuery(inventoryQueries.detail(id));
export const useConsignments = (): Query<AdminConsignment[]> => useApiQuery(inventoryQueries.consignments());
export const useConsignment = (id: string): Query<AdminConsignment> => useApiQuery(inventoryQueries.consignment(id));

/** Sau mọi thao tác ghi: rổ hàng, hồ sơ và badge dashboard tải lại từ server. */
export function invalidateInventory() {
  invalidateApiPattern("admin-inventory:");
  invalidateApiPattern("admin-dashboard:");
}

export const inventoryApi = {
  setHoldHours: (unitId: string, hours: number | null, reason: string) =>
    api.post<{ success: boolean; holdHours: number }>(`/admin/exclusive-inventory/${encodeURIComponent(unitId)}/hold-hours`, { hours, reason }),
  terminateMandate: (mandateId: string, reason: string) =>
    api.post<{ mandateId: string; status: string }>(`/admin/mandates/${encodeURIComponent(mandateId)}/terminate`, { reason }),
  approve: (mandateId: string, note?: string) =>
    api.post<unknown>(`/admin/consignments/${encodeURIComponent(mandateId)}/approve`, note ? { note } : {}),
  reject: (mandateId: string, note: string) =>
    api.post<unknown>(`/admin/consignments/${encodeURIComponent(mandateId)}/reject`, { note }),
};

// ─── Hiển thị ────────────────────────────────────────────────────────────────────────────────────────────────

const LAYOUT_KIND: Record<string, LayoutKind> = {
  STUDIO: "Studio",
  ONE_BED_PLUS: "1PN",
  TWO_BED_ONE_BATH: "2PN",
  TWO_BED_TWO_BATH: "2PN",
  THREE_BED: "3PN",
};
export const layoutKindOf = (layout: string): LayoutKind => LAYOUT_KIND[layout] ?? "2PN";

export const UNIT_STATUS_LABEL: Record<UnitStatusApi, { label: string; badge: string; tone: "ok" | "warn" | "neutral" | "danger" }> = {
  AVAILABLE: { label: "Còn trống", badge: "badge-kelp", tone: "ok" },
  HOLDING: { label: "Đang giữ căn", badge: "badge-amber-soft", tone: "warn" },
  RENTED: { label: "Đã cho thuê", badge: "badge-ink", tone: "neutral" },
  UNLISTED: { label: "Chưa niêm yết", badge: "badge-plain", tone: "neutral" },
  MAINTENANCE: { label: "Bảo trì", badge: "badge-coral-soft", tone: "danger" },
};

type UnitStatusMeta = (typeof UNIT_STATUS_LABEL)[UnitStatusApi];

/**
 * Nhãn trạng thái căn cho Admin. `UNLISTED` chỉ nghĩa là "khách thuê không thấy" — tách nghĩa theo ủy quyền:
 * đang chờ thẩm định (căn mới ký gửi) ≠ đã chấm dứt/hết hạn ủy quyền (ngừng niêm yết thật).
 */
export function unitStatusMeta(status: UnitStatusApi, mandateStatus: MandateStatusApi | null | undefined): UnitStatusMeta {
  if (status !== "UNLISTED") return UNIT_STATUS_LABEL[status];
  if (mandateStatus === "PENDING_INSPECTION") return { label: "Chờ thẩm định", badge: "badge-amber-soft", tone: "warn" };
  if (mandateStatus === "TERMINATED" || mandateStatus === "EXPIRED") return { label: "Ngừng niêm yết", badge: "badge-plain", tone: "neutral" };
  return UNIT_STATUS_LABEL.UNLISTED;
}

export const MANDATE_STATUS_LABEL: Record<MandateStatusApi, string> = {
  PENDING_INSPECTION: "Chờ thẩm định",
  ACTIVE: "Đang hiệu lực",
  EXIT_REQUESTED: "Đang thoát (báo trước 15 ngày)",
  TERMINATED: "Đã chấm dứt",
  EXPIRED: "Hết hạn",
  NONE: "Chưa ký ủy quyền",
};

export const TERMINATE_BLOCKED_LABEL: Record<NonNullable<InventoryRow["terminateBlockedReason"]>, string> = {
  MANDATE_NOT_EXIT_REQUESTED: "Chủ nhà chưa báo thoát ủy quyền.",
  UNIT_HOLDING: "Căn đang giữ chỗ (có cọc), chưa chấm dứt được.",
  EXIT_NOTICE_NOT_ELAPSED: "Chưa đủ 15 ngày báo trước.",
};

export const FURNISHING_LABEL: Record<InventoryDetail["furnishing"], string> = {
  FULL: "Full nội thất",
  BASIC: "Nội thất cơ bản",
  EMPTY: "Nhà trống",
};

export const lockLabel = (lock: DoorLockApi) => (lock === "PHYSICAL_KEY" ? "Chìa cơ" : "Điện tử");

/** "S1.02 · Tầng 7 · Căn 01" từ dữ liệu căn backend. */
export function unitTitle(u: { building: string; floorNumber: number; doorNumber: string | null; unitCode: string }) {
  return `${u.building} · Tầng ${u.floorNumber} · Căn ${u.doorNumber ?? doorFromCode(u.unitCode, u.floorNumber)}`;
}

/** Cùng quy tắc với backend `doorFromCode`: `VHOP-S1.02-0701`, tầng 7 ⇒ `01`. */
function doorFromCode(unitCode: string, floor: number): string {
  const tail = unitCode.split("-").pop() ?? unitCode;
  for (const prefix of [String(floor).padStart(2, "0"), String(floor)]) {
    if (tail.startsWith(prefix) && tail.length > prefix.length) return tail.slice(prefix.length);
  }
  return tail;
}

/** Hạn thẩm định 48h đã qua mà Host chưa nộp phiếu. */
export const isInspectOverdue = (c: Pick<AdminConsignment, "status" | "inspectDueAt">, now: number) =>
  (c.status === "awaiting_host" || c.status === "inspecting") && !!c.inspectDueAt && Date.parse(c.inspectDueAt) < now;

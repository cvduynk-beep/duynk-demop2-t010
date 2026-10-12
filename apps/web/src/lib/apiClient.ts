/**
 * VinStay AI - Typed API Client for Frontend (calls /api/v1/* proxied to NestJS Backend)
 */

import type { InspectionReport } from "@/lib/mock/types";

const API_BASE = "/api/v1";

export interface ApiResponse<T> {
  ok: boolean;
  status: number;
  data: T;
  message?: string;
  code?: string;
}

function getClientPortal(): string | undefined {
  if (typeof window === "undefined") return undefined;
  const p = window.location.pathname;
  if (p.startsWith("/host")) return "host";
  if (p.startsWith("/landlord")) return "landlord";
  if (p.startsWith("/admin")) return "admin";
  if (p.startsWith("/account") || p.startsWith("/booking")) return "tenant";
  return undefined;
}

async function request<T>(
  endpoint: string,
  options: RequestInit = {}
): Promise<ApiResponse<T>> {
  try {
    const url = `${API_BASE}${endpoint.startsWith("/") ? endpoint : `/${endpoint}`}`;
    // FormData: để trình duyệt tự đặt Content-Type (kèm boundary); đặt tay sẽ làm hỏng multipart.
    const isForm = typeof FormData !== "undefined" && options.body instanceof FormData;
    const portal = getClientPortal();
    const headers = {
      ...(isForm ? {} : { "Content-Type": "application/json" }),
      ...(portal ? { "x-portal": portal } : {}),
      ...(options.headers || {}),
    };

    const res = await fetch(url, {
      ...options,
      credentials: "same-origin",
      headers,
    });

    const body = await res.json().catch(() => ({}));

    // NestJS response envelope or raw object
    const envelope: Record<string, unknown> = body && typeof body === "object" ? (body as Record<string, unknown>) : {};
    const data = "data" in envelope ? envelope.data : body;
    const message = typeof envelope.message === "string" ? envelope.message : undefined;
    const code = typeof envelope.code === "string" ? envelope.code : undefined;

    return {
      ok: res.ok,
      status: res.status,
      data: (res.ok ? data : data || {}) as T,
      message,
      code,
    };
  } catch (err: unknown) {
    return {
      ok: false,
      status: 0,
      data: {} as T,
      message: (err instanceof Error && err.message) || "Lỗi kết nối máy chủ",
    };
  }
}

export const api = {
  get: <T>(endpoint: string) => request<T>(endpoint, { method: "GET" }),
  post: <T>(endpoint: string, body?: unknown) =>
    request<T>(endpoint, { method: "POST", body: JSON.stringify(body ?? {}) }),
  patch: <T>(endpoint: string, body?: unknown) =>
    request<T>(endpoint, { method: "PATCH", body: JSON.stringify(body ?? {}) }),
  postForm: <T>(endpoint: string, form: FormData) => request<T>(endpoint, { method: "POST", body: form }),
  put: <T>(endpoint: string, body?: unknown) =>
    request<T>(endpoint, { method: "PUT", body: JSON.stringify(body ?? {}) }),
  delete: <T>(endpoint: string) => request<T>(endpoint, { method: "DELETE" }),
};

/* ── Specific Domain Endpoints ── */

/**
 * Kiểu trả về của các endpoint mà UI đang đọc trường. Chỉ khai các trường FE dùng (đều optional vì dữ liệu cũ có thể
 * thiếu); endpoint UI không đọc trường nào để `unknown`.
 */
export interface ApiViewing {
  id: string;
  bookingRefCode?: string | null;
  unitId?: string | null;
  unit?: { id: string } | null;
  tenant?: { fullName?: string | null; phoneHash?: string | null } | null;
  host?: { id: string } | null;
  tickets?: { hostId?: string | null }[];
  viewingSlot?: string | null;
  status?: string;
  createdAt?: string;
  lobbyCheckInAt?: string | null;
}

export interface ApiDispatchTicket {
  id: string;
  hostId?: string | null;
  status?: string;
  tier?: number;
  offeredAt?: string | null;
  viewing?: ApiViewing | null;
}

/** Một hồ sơ ký gửi như `GET /host/inspections` trả về — chỉ các trường UI đọc. */
export interface ApiInspectionItem {
  /** Backend luôn trả `consignmentId`; `id` chỉ có ở dữ liệu cũ. */
  consignmentId: string;
  id?: string;
  unitId?: string;
  unitCode?: string;
  code?: string;
  building: string;
  floor: number;
  layout?: string;
  carpetAreaM2?: number;
  askRent?: number;
  status?: string;
  createdAt?: string;
  hostId?: string | null;
  landlordId?: string;
  landlordName?: string;
  note?: string | null;
  report?: Partial<InspectionReport> | null;
}

/** `GET /me/profile` — hồ sơ của chính người gọi. `phone` dạng 0xxx (null = chưa gắn SĐT). */
export interface ApiProfile {
  id?: string;
  email?: string | null;
  fullName?: string | null;
  phone?: string | null;
  isPhoneVerified?: boolean;
}

export const propertyApi = {
  getBuildings: () =>
    api.get<unknown[]>("/properties/buildings"),
  getUnits: (params?: {
    zone?: string;
    layoutType?: string;
    minPrice?: number;
    maxPrice?: number;
    motorbikes?: number;
    cars?: number;
    occupants?: number;
  }) => {
    const qs = new URLSearchParams();
    if (params?.zone) qs.set("zone", params.zone);
    if (params?.layoutType) qs.set("layoutType", params.layoutType);
    if (params?.minPrice) qs.set("minPrice", params.minPrice.toString());
    if (params?.maxPrice) qs.set("maxPrice", params.maxPrice.toString());
    if (params?.motorbikes !== undefined) qs.set("motorbikes", params.motorbikes.toString());
    if (params?.cars !== undefined) qs.set("cars", params.cars.toString());
    if (params?.occupants !== undefined) qs.set("occupants", params.occupants.toString());
    const qStr = qs.toString();
    return api.get<unknown[]>(`/properties/units${qStr ? `?${qStr}` : ""}`);
  },
  getUnitById: (id: string, params?: { motorbikes?: number; cars?: number; occupants?: number }) => {
    const qs = new URLSearchParams();
    if (params?.motorbikes !== undefined) qs.set("motorbikes", params.motorbikes.toString());
    if (params?.cars !== undefined) qs.set("cars", params.cars.toString());
    if (params?.occupants !== undefined) qs.set("occupants", params.occupants.toString());
    const qStr = qs.toString();
    return api.get<unknown>(`/properties/units/${id}${qStr ? `?${qStr}` : ""}`);
  },
};

export const bookingApi = {
  requestOtp: (dto: { phone: string; fullName?: string }) =>
    api.post<{ message: string; phone: string; expiresInSeconds: number; testHint?: string }>("/bookings/request-otp", dto),
  confirm: (dto: { phone: string; otp: string; unitId: string; viewingSlot: string }) =>
    api.post<unknown>("/bookings/confirm", dto),
  create: (dto: { unitId: string; slot: string; name: string; phone: string; persons?: number; note?: string }) =>
    api.post<unknown>("/bookings", dto),
  getById: (id: string) =>
    api.get<ApiViewing>(`/bookings/${id}`),
  getByRef: (ref: string) =>
    api.get<ApiViewing>(`/bookings/by-ref/${ref}`),
  lobbyCheckIn: (id: string) =>
    api.post<{ message: string; lobbyCheckInAt: string; instruction: string }>(`/bookings/${id}/lobby-checkin`),
  cancel: (id: string, reason: string) =>
    api.post<{ success: boolean; message: string; status: string }>(`/bookings/${id}/cancel`, { reason }),
  reschedule: (id: string, slot: string) =>
    api.post<{ success: boolean; message: string; newViewingSlot: string }>(`/bookings/${id}/reschedule`, { slot }),
  rate: (id: string, stars: number, comment?: string) =>
    api.post<{ success: boolean; message: string }>(`/bookings/${id}/rating`, { stars, comment }),
};

export const dispatchApi = {
  getTickets: (hostId?: string) =>
    api.get<ApiDispatchTicket[]>(hostId ? `/dispatch/tickets?hostId=${encodeURIComponent(hostId)}` : "/dispatch/tickets"),
  acceptTicket: (ticketId: string, hostId?: string) =>
    api.post<unknown>(`/dispatch/tickets/${encodeURIComponent(ticketId)}/accept`, { hostId }),
  rejectTicket: (ticketId: string, reason?: string) =>
    api.post<unknown>(`/dispatch/tickets/${encodeURIComponent(ticketId)}/reject`, { reason }),
  claimTicket: (ticketId: string, hostId?: string) =>
    api.post<unknown>(`/dispatch/tickets/${encodeURIComponent(ticketId)}/claim`, { hostId }),
  swipeElevatorRfid: (ticketId: string) =>
    api.post<unknown>(`/dispatch/tickets/${encodeURIComponent(ticketId)}/elevator-rfid`),
  revealDoorKey: (ticketId: string) =>
    api.post<unknown>(`/dispatch/tickets/${encodeURIComponent(ticketId)}/reveal-key`),
  emergency: (ticketId: string, reason: string) =>
    api.post<unknown>(`/dispatch/tickets/${encodeURIComponent(ticketId)}/emergency`, { reason }),
  noShow: (ticketId: string, note?: string) =>
    api.post<unknown>(`/dispatch/tickets/${encodeURIComponent(ticketId)}/no-show`, { note }),
  notInterested: (ticketId: string, feedback?: string) =>
    api.post<unknown>(`/dispatch/tickets/${encodeURIComponent(ticketId)}/not-interested`, { feedback }),
};

export const depositApi = {
  generateVietQr: (dto: { viewingId: string; unitId?: string; hostId?: string; amount?: number }) =>
    api.post<unknown>("/deposits/generate-vietqr", dto),
  getStatus: (id: string) =>
    api.get<unknown>(`/deposits/${id}`),
  webhook: (dto: { depositCode: string; amount: number; bankRefNumber: string }) =>
    api.post<unknown>("/deposits/webhook-vietqr", dto),
  uploadHostReceipt: (depositId: string, receiptUrl: string) =>
    api.post<unknown>(`/deposits/${depositId}/host-receipt`, { receiptUrl }),
};

export const identityApi = {
  verifyEkyc: (dto: {
    depositId: string;
    consentVersion: string;
    hasConsent: boolean;
    idCardFrontUrl?: string;
    idCardBackUrl?: string;
  }) => api.post<unknown>("/identity/ekyc/verify", dto),
  getResult: (depositId: string) =>
    api.get<unknown>(`/identity/${depositId}`),
};

export const contractApi = {
  signDepositAgreement: (dto: { depositId: string; signatureSvg: string; otp: string }) =>
    api.post<unknown>("/contracts/holding-agreement/sign", dto),
  getEvidencePackage: (id: string) =>
    api.get<unknown>(`/contracts/${id}/evidence-package`),
};

export const accountApi = {
  getProfile: () =>
    api.get<ApiProfile>("/me/profile"),
  updateProfile: (dto: { fullName?: string; email?: string; phone?: string }) =>
    api.patch<unknown>("/me/profile", dto),
  getBookings: () =>
    api.get<unknown[]>("/me/bookings"),
  getContracts: () =>
    api.get<unknown[]>("/me/contracts"),
  getFavorites: () =>
    api.get<unknown[]>("/me/favorites"),
  addFavorite: (unitId: string) =>
    api.put<{ success: boolean; unitId: string; saved: boolean }>(`/me/favorites/${unitId}`),
  removeFavorite: (unitId: string) =>
    api.delete<{ success: boolean; unitId: string; saved: boolean }>(`/me/favorites/${unitId}`),
  getNotifications: () =>
    api.get<unknown[]>("/me/notifications"),
};

export const adminApi = {
  getBiFunnel: () =>
    api.get<{
      funnel: {
        stages: { stage: string; count: number; dropRate: string }[];
        noShowRate: string;
        avgDecisionTimeMinutes: number;
      };
      occupancyHeatmap: {
        buildingCode: string;
        zone: string;
        total: number;
        rented: number;
        occupancyRate: string;
        alert: string;
      }[];
      portfolioStatus: {
        totalUnits: number;
        rentedUnits: number;
        holdingUnits: number;
        availableUnits: number;
      };
    }>("/admin/bi-funnel"),
  getInventory: () =>
    api.get<unknown[]>("/admin/exclusive-inventory"),
  getDispatchSla: () =>
    api.get<unknown[]>("/admin/dispatch-sla"),
  reassignBooking: (bookingId: string, hostId: string) =>
    api.post<unknown>(`/admin/bookings/${encodeURIComponent(bookingId)}/reassign`, { hostId }),
  getFieldHosts: () =>
    api.get<unknown[]>("/admin/hosts"),
  getFieldHostById: (id: string) =>
    api.get<unknown>(`/admin/hosts/${encodeURIComponent(id)}`),
  createFieldHost: (dto: unknown) =>
    api.post<unknown>("/admin/hosts", dto),
  updateFieldHost: (id: string, dto: unknown) =>
    api.patch<unknown>(`/admin/hosts/${encodeURIComponent(id)}`, dto),
  getContracts: () =>
    api.get<unknown[]>("/admin/contracts"),
  getContractById: (id: string) =>
    api.get<unknown>(`/admin/contracts/${encodeURIComponent(id)}`),
  voidHold: (depositId: string, dto: { reason: string; note: string }) =>
    api.post<unknown>(`/admin/contracts/${encodeURIComponent(depositId)}/void-hold`, dto),
  completeExit: (mandateId: string) =>
    api.post<unknown>(`/admin/contracts/${encodeURIComponent(mandateId)}/complete-exit`),
  remindRenewal: (contractId: string) =>
    api.post<unknown>(`/admin/contracts/${encodeURIComponent(contractId)}/remind-renewal`),
  getCommissionEngine: () =>
    api.get<{ configs: { id?: string; configKey: string; paramValue: number; paramUnit: string; updatedAt?: string }[] }>("/admin/commission-engine"),
  updateCommissionParam: (dto: { configKey: string; paramValue: number; reason: string }) =>
    api.post<unknown>("/admin/commission-engine/config", dto),
  getHoldPolicy: () =>
    api.get<{ defaultHours: number; byUnit: Record<string, number> }>("/admin/settings/hold-policy"),
  updateHoldPolicy: (dto: { hours: number; unitId?: string }) =>
    api.post<unknown>("/admin/settings/hold-policy", dto),
  approveConsignment: (id: string, note?: string) =>
    api.post<unknown>(`/admin/consignments/${encodeURIComponent(id)}/approve`, { note }),
  rejectConsignment: (id: string, note: string) =>
    api.post<unknown>(`/admin/consignments/${encodeURIComponent(id)}/reject`, { note }),
};

export const hostApi = {
  getEarnings: (hostId?: string) =>
    api.get<{
      hostId: string;
      fullName: string;
      rating: number;
      walletBalance: number;
      stats: {
        totalViewings: number;
        totalDeals: number;
        dealCommissionTotal: number;
        viewingFeeTotal: number;
        ratingBonus: number;
        totalEarnings: number;
      };
      currentPeriod: string;
      payouts: {
        id: string;
        amount: number;
        period: string;
        status: string;
        createdAt: string;
      }[];
    }>(hostId ? `/host/earnings?hostId=${encodeURIComponent(hostId)}` : "/host/earnings"),
  getInspections: (hostId?: string) =>
    api.get<unknown[]>(hostId ? `/host/inspections?hostId=${encodeURIComponent(hostId)}` : "/host/inspections"),
  acceptInspection: (consignmentId: string, hostId?: string) =>
    api.post<unknown>(`/host/inspections/${encodeURIComponent(consignmentId)}/accept`, { hostId }),
  submitInspectionReport: (consignmentId: string, dto: unknown) =>
    api.post<unknown>(`/host/inspections/${encodeURIComponent(consignmentId)}/report`, dto),
};


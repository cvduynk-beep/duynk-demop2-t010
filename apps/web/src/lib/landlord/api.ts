import { api, type ApiResponse } from "@/lib/apiClient";
import type { EkycSubmitPayload } from "@/components/kyc/EkycCapture";
import { EKYC_CONSENT_VERSION, type EkycScanResult } from "@/lib/tenant/types";
import type {
  PriceInsight,
  LandlordDashboard,
  LandlordVerification,
  BuildingOption,
  Consignment,
  ConsignmentPhoto,
  CreateConsignmentInput,
  DoorAuditEntry,
  ExitResult,
  Finance,
  MyProfile,
  SignOtpInfo,
  UnitDetail,
  UnitRow,
  ViewingLogEntry,
} from "./types";

const BASE = "/landlord";

export const landlordApi = {
  units: () => api.get<UnitRow[]>(`${BASE}/units`),
  unit: (id: string) => api.get<UnitDetail>(`${BASE}/units/${encodeURIComponent(id)}`),
  viewings: (id: string) => api.get<ViewingLogEntry[]>(`${BASE}/units/${encodeURIComponent(id)}/viewings`),
  doorAudit: (id: string) => api.get<DoorAuditEntry[]>(`${BASE}/units/${encodeURIComponent(id)}/audit-trail`),

  consignments: () => api.get<Consignment[]>(`${BASE}/consignments`),
  consignment: (id: string) => api.get<Consignment>(`${BASE}/consignments/${encodeURIComponent(id)}`),
  createConsignment: (input: CreateConsignmentInput) => api.post<Consignment>(`${BASE}/consignments`, input),
  /** Tải ảnh lên hồ sơ (multipart, field `files`); trả danh sách ảnh đầy đủ sau khi thêm. */
  uploadPhotos: (id: string, files: File[]) => {
    const form = new FormData();
    for (const f of files) form.append("files", f, f.name);
    return api.postForm<ConsignmentPhoto[]>(`${BASE}/consignments/${encodeURIComponent(id)}/photos`, form);
  },
  deletePhoto: (id: string, photoId: string) =>
    api.delete<ConsignmentPhoto[]>(`${BASE}/consignments/${encodeURIComponent(id)}/photos/${encodeURIComponent(photoId)}`),
  sendSignOtp: (phone?: string) => api.post<SignOtpInfo>(`${BASE}/consignments/send-otp`, phone ? { phone } : {}),

  finance: () => api.get<Finance>(`${BASE}/finance`),

  requestExit: (mandateId: string, reason: string) => api.post<ExitResult>(`${BASE}/mandates/request-exit`, { mandateId, reason }),
  cancelExit: (mandateId: string) => api.post<{ mandateId: string; status: "active" }>(`${BASE}/mandates/cancel-exit`, { mandateId }),

  priceInsights: () => api.get<PriceInsight[]>(`${BASE}/price-insights`),
  updateUnitRent: (id: string, rent: number) =>
    api.put<{ unitId: string; rent: number; previous: number; marketMedian: number | null }>(`${BASE}/units/${encodeURIComponent(id)}/rent`, { rent }),
  dashboard: () => api.get<LandlordDashboard>(`${BASE}/dashboard`),
  verification: () => api.get<LandlordVerification>(`${BASE}/verification`),
  sendPhoneOtp: (phone: string) => api.post<{ expiresInSeconds: number; devCode?: string }>("/auth/phone/send-otp", { phone }),
  verifyPhone: (phone: string, code: string) => api.post<{ verified: boolean }>("/auth/phone/verify", { phone, code }),
  scanEkyc: () => api.post<EkycScanResult>(`${BASE}/verification/ekyc/scan`, { consent: true, consentVersion: EKYC_CONSENT_VERSION }),
  submitEkyc: (payload: EkycSubmitPayload) => api.post<LandlordVerification>(`${BASE}/verification/ekyc`, payload),
  /** Thêm/đổi + xác thực tài khoản thụ hưởng (tên chủ TK phải trùng họ tên CCCD). */
  updatePayoutAccount: (body: { bankName: string; bankAccount: string; bankAccountHolder: string }) =>
    api.put<LandlordVerification>(`${BASE}/payout-account`, body),

  buildings: () => api.get<BuildingOption[]>("/properties/buildings"),
  profile: () => api.get<MyProfile>("/me/profile"),
};

/** Thông báo lỗi tiếng Việt cho người dùng: ưu tiên message của backend (đã là tiếng Việt), message dạng mảng thì ghép lại. */
export function errorText(res: Pick<ApiResponse<unknown>, "message" | "status">, fallback = "Có lỗi xảy ra, thử lại sau."): string {
  const m = res.message as unknown;
  if (Array.isArray(m)) return m.join(" ");
  if (typeof m === "string" && m) return m;
  if (res.status === 0) return "Không kết nối được máy chủ.";
  return fallback;
}

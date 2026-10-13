import { api, apiErrorText, type ApiResponse } from "@/lib/apiClient";
import type {
  CreateBookingDto,
  DepositTermsDoc,
  EkycScanResult,
  SignLeaseDto,
  SubmitEkycDto,
  TenantBooking,
  TenantContract,
  TenantHandover,
  TenantUnit,
} from "./types";

export const ERROR_MESSAGES: Record<string, string> = {
  invalid_request: "Thông tin gửi lên không hợp lệ.",
  units_upstream: "Không tải được danh sách căn từ máy chủ. Vui lòng thử lại.",
  unauthorized: "Vui lòng đăng nhập để tiếp tục.",
  forbidden: "Tài khoản không phải Khách thuê.",
  otp_required: "Vui lòng xác thực số điện thoại qua OTP.",
  action_token_invalid: "Phiên xác thực OTP đã hết hạn hoặc không hợp lệ. Vui lòng xin mã OTP mới.",
  otp_invalid: "Mã OTP không chính xác.",
  otp_not_found_or_expired: "Mã OTP đã hết hạn hoặc không tồn tại.",
  otp_locked: "Bạn đã nhập sai mã quá số lần cho phép. Vui lòng chờ rồi xin mã mới.",
  otp_cooldown: "Vui lòng đợi trước khi xin mã OTP mới.",
  otp_send_failed: "Hiện chưa gửi được mã OTP. Vui lòng thử lại sau.",
  ref_generation_failed: "Chưa cấp được mã lịch hẹn. Vui lòng bấm đặt lịch lại.",
  phone_already_registered: "Số điện thoại này đã được gắn với một tài khoản khác.",
  unit_not_found: "Không tìm thấy căn hộ hoặc căn hộ không còn khả dụng.",
  unit_not_available: "Căn hộ hiện không khả dụng để đặt lịch hoặc giữ chỗ.",
  slot_invalid: "Khung giờ xem phòng không hợp lệ (phải trước ít nhất 30 phút và trong 14 ngày).",
  slot_taken: "Khung giờ này vừa có người đặt xem phòng. Vui lòng chọn khung giờ khác.",
  booking_not_found: "Không tìm thấy lịch hẹn trong tài khoản của bạn.",
  bad_status: "Trạng thái lịch hẹn không phù hợp để thực hiện thao tác này.",
  too_late_to_modify: "Chỉ có thể đổi hoặc hủy lịch trước giờ xem tối thiểu 2 giờ.",
  already_rated: "Lịch hẹn này đã được đánh giá.",
  terms_version_stale: "Phiên bản điều khoản cọc đã được cập nhật. Vui lòng kiểm tra lại.",
  unit_already_held: "Căn hộ vừa được khách khác đặt cọc thành công (First-to-Pay Wins).",
  vietqr_not_configured: "Thanh toán VietQR chưa được cấu hình nhận và đối soát giao dịch. Vui lòng liên hệ hỗ trợ.",
  no_kyc: "Cần xác minh CCCD (eKYC) trước khi ký hợp đồng thuê.",
  lease_already_signed: "Lịch hẹn này đã có hợp đồng thuê.",
  signature_required: "Vui lòng ký tay vào ô chữ ký trước khi xác nhận.",
  floor_rent_invalid: "Giá sàn phải từ 3.000.000đ và thấp hơn giá chào thuê.",
  rent_above_ceiling: "Giá thuê vượt trần cho loại căn này.",
  hold_expired: "Thời hạn giữ chỗ của căn hộ đã hết hiệu lực.",
  ekyc_already_done: "Thông tin eKYC của lịch hẹn này đã được xác thực trước đó.",
  scan_expired: "Phiên quét CCCD đã hết hạn (tối đa 15 phút). Vui lòng quét lại.",
  kyc_fields_invalid: "Thông tin CCCD không hợp lệ (tuổi từ 18, số định danh 12 chữ số).",
  kyc_confirmation_required: "Vui lòng xác nhận tính chính xác của các trường thông tin.",
  lease_terms_invalid: "Điều khoản thuê không hợp lệ theo quy định căn hộ.",
  pdf_pending: "Hợp đồng PDF đang được tạo. Vui lòng bấm Thử lại sau giây lát.",
  not_found: "Không tìm thấy trang hoặc tính năng không khả dụng.",
};

const fmtWait = (sec: number) => (sec >= 90 ? `${Math.ceil(sec / 60)} phút` : `${Math.max(1, Math.round(sec))} giây`);

/** Thời gian chờ (giây) server trả kèm `otp_cooldown` / `otp_locked`; không có ⇒ undefined (không đoán). */
export function retryAfterSeconds(res: ApiResponse<unknown>): number | undefined {
  const v = res.errors?.retryAfterSeconds;
  return typeof v === "number" && v > 0 ? v : undefined;
}

/** Thông báo OTP dùng SỐ LIỆU THẬT của server (thời gian chờ, số lần thử còn lại) thay vì câu ghi cứng. */
export function otpErrorText(res: ApiResponse<unknown>): string {
  const wait = retryAfterSeconds(res);
  if (res.code === "otp_invalid") {
    const left = res.errors?.attemptsRemaining;
    return typeof left === "number" ? `Mã OTP không chính xác. Bạn còn ${left} lần thử.` : ERROR_MESSAGES.otp_invalid;
  }
  if (res.code === "otp_locked") return wait ? `Bạn đã nhập sai quá số lần cho phép. Thử lại sau ${fmtWait(wait)}.` : ERROR_MESSAGES.otp_locked;
  if (res.code === "otp_cooldown") return wait ? `Vui lòng đợi ${fmtWait(wait)} trước khi xin mã OTP mới.` : ERROR_MESSAGES.otp_cooldown;
  return errorText(res);
}

export function errorText(
  codeOrRes?: string | ApiResponse<unknown> | null,
  fallback = "Đã có lỗi xảy ra. Vui lòng thử lại sau.",
): string {
  if (!codeOrRes) return fallback;
  if (typeof codeOrRes === "string") {
    return ERROR_MESSAGES[codeOrRes] || fallback;
  }
  const code = codeOrRes.code;
  if (code && ERROR_MESSAGES[code]) {
    return ERROR_MESSAGES[code];
  }
  return apiErrorText(codeOrRes, fallback);
}

export interface OtpSent {
  expiresInSeconds: number;
  /** Số giây tối thiểu trước khi được xin mã mới (khớp `otp_cooldown` của server). */
  resendInSeconds: number;
  /** Chỉ có khi backend chạy `OTP_PROVIDER=mock` (Zalo giả lập, dev/staging nội bộ). Kênh thật không bao giờ trả mã. */
  devOtp?: string;
}

/** Danh mục kèm nguồn: `mock` CHỈ xuất hiện khi server bật fallback có cờ (không bao giờ ở production). */
export interface CatalogPayload {
  units: TenantUnit[];
  source: "api" | "mock";
}

export interface UnitFilter {
  zone?: string;
  layout?: string;
  maxRent?: number;
  q?: string;
}

export const tenantApi = {
  // A1: Catalog công khai
  // Đi qua route Next `/api/catalog/units` (data-source server, cờ fallback chỉ đọc ở server) — không gọi thẳng backend.
  units: (filter?: UnitFilter): Promise<ApiResponse<CatalogPayload>> => {
    const params = new URLSearchParams();
    if (filter?.zone) params.set("zone", filter.zone);
    if (filter?.layout) params.set("layout", filter.layout);
    if (filter?.maxRent) params.set("maxRent", String(filter.maxRent));
    if (filter?.q) params.set("q", filter.q);
    const qs = params.toString();
    return api.get<CatalogPayload>(`/api/catalog/units${qs ? `?${qs}` : ""}`);
  },

  // A2: Chi tiết căn hộ theo mã code
  unit: (code: string): Promise<ApiResponse<TenantUnit>> => {
    return api.get<TenantUnit>(`/properties/units/${encodeURIComponent(code)}`);
  },

  // A3: Khung giờ bận
  busySlots: (code: string, from?: string, to?: string): Promise<ApiResponse<{ slots: string[] }>> => {
    const params = new URLSearchParams();
    if (from) params.set("from", from);
    if (to) params.set("to", to);
    const qs = params.toString();
    return api.get<{ slots: string[] }>(`/properties/units/${encodeURIComponent(code)}/busy-slots${qs ? `?${qs}` : ""}`);
  },

  // A4: Gửi mã OTP xác thực SĐT
  // Kênh thật: response KHÔNG chứa mã. Chỉ backend `OTP_PROVIDER=mock` mới trả thêm `devOtp`.
  sendOtp: (phone: string, purpose = "TENANT_VIEWING"): Promise<ApiResponse<OtpSent>> => {
    return api.post<OtpSent>("/auth/otp/send", { phone, purpose });
  },

  // A5: Xác thực OTP lấy actionToken
  verifyOtp: (
    phone: string,
    code: string,
    purpose = "TENANT_VIEWING",
  ): Promise<ApiResponse<{ actionToken: string; expiresInSeconds: number }>> => {
    return api.post<{ actionToken: string; expiresInSeconds: number }>("/auth/otp/verify", { phone, code, purpose });
  },

  // A6: Đặt lịch xem phòng
  createBooking: (dto: CreateBookingDto): Promise<ApiResponse<TenantBooking>> => {
    return api.post<TenantBooking>("/bookings", dto);
  },

  // A7: Danh sách lịch xem của tôi
  myBookings: (): Promise<ApiResponse<TenantBooking[]>> => {
    return api.get<TenantBooking[]>("/me/bookings");
  },

  // A8: Chi tiết lịch xem theo mã ref
  bookingByRef: (ref: string): Promise<ApiResponse<TenantBooking>> => {
    return api.get<TenantBooking>(`/bookings/${encodeURIComponent(ref)}`);
  },

  // A9: Hủy lịch hẹn
  cancelBooking: (ref: string, reason: string): Promise<ApiResponse<TenantBooking>> => {
    return api.post<TenantBooking>(`/bookings/${encodeURIComponent(ref)}/cancel`, { reason });
  },

  // A10: Đổi khung giờ
  rescheduleBooking: (ref: string, slot: string): Promise<ApiResponse<TenantBooking>> => {
    return api.post<TenantBooking>(`/bookings/${encodeURIComponent(ref)}/reschedule`, { slot });
  },

  // A11: Báo trễ 10 phút
  requestLate: (ref: string): Promise<ApiResponse<TenantBooking>> => {
    return api.post<TenantBooking>(`/bookings/${encodeURIComponent(ref)}/late`);
  },

  // A12: Check-in sảnh 1-chạm
  lobbyCheckIn: (ref: string): Promise<ApiResponse<TenantBooking>> => {
    return api.post<TenantBooking>(`/bookings/${encodeURIComponent(ref)}/lobby-checkin`);
  },

  // A13: Đánh giá chất lượng Host
  rateBooking: (ref: string, stars: number): Promise<ApiResponse<TenantBooking>> => {
    return api.post<TenantBooking>(`/bookings/${encodeURIComponent(ref)}/rating`, { stars });
  },

  // A14: Điều khoản cọc
  depositTerms: (unitCode?: string): Promise<ApiResponse<DepositTermsDoc>> => {
    return api.get<DepositTermsDoc>(`/legal/deposit-terms${unitCode ? `?unitCode=${encodeURIComponent(unitCode)}` : ""}`);
  },

  // A15: Chấp thuận điều khoản cọc & lấy thông tin VietQR
  acceptDeposit: (ref: string, termsVersion: string): Promise<ApiResponse<TenantBooking>> => {
    return api.post<TenantBooking>(`/bookings/${encodeURIComponent(ref)}/deposit`, { acceptTerms: true, termsVersion });
  },

  // DEMO (xoá khi có webhook thật): giả lập ngân hàng báo có cọc
  demoPayDeposit: (ref: string): Promise<ApiResponse<{ outcome: string }>> => {
    return api.post<{ outcome: string }>(`/bookings/${encodeURIComponent(ref)}/deposit/demo-pay`);
  },

  // A17: Quét CCCD — MÔ PHỎNG OCR ở backend (EkycSimulator) cho tới khi tích hợp FPT.AI.
  scanEkyc: (ref: string, consentVersion: string): Promise<ApiResponse<EkycScanResult>> => {
    return api.post<EkycScanResult>(`/bookings/${encodeURIComponent(ref)}/ekyc/scan`, { consent: true, consentVersion });
  },

  // A18: Lưu thông tin CCCD đã xác nhận (chưa lập hợp đồng)
  submitEkyc: (ref: string, dto: SubmitEkycDto): Promise<ApiResponse<{ booking: TenantBooking }>> => {
    return api.post<{ booking: TenantBooking }>(`/bookings/${encodeURIComponent(ref)}/ekyc`, dto);
  },

  // A18b: Ký Hợp đồng thuê chính thức (nghi thức ký OTP/TSA mô phỏng; Contract/SignedDocument ghi DB thật)
  signLease: (dto: SignLeaseDto): Promise<ApiResponse<{ booking: TenantBooking; contract: TenantContract }>> => {
    return api.post<{ booking: TenantBooking; contract: TenantContract }>("/contracts/lease/sign", dto);
  },

  // A19: Hợp đồng của tôi
  myContracts: (): Promise<ApiResponse<TenantContract[]>> => {
    return api.get<TenantContract[]>("/me/contracts");
  },

  // Biên bản bàn giao số của hợp đồng (chỉ chủ hợp đồng xem được; người khác ⇒ 403)
  handovers: (contractId: string): Promise<ApiResponse<TenantHandover[]>> => {
    return api.get<TenantHandover[]>(`/handovers/contracts/${encodeURIComponent(contractId)}`);
  },

  // A20: Tải file PDF hợp đồng
  contractPdfUrl: (contractId: string): string => {
    return `/api/v1/me/contracts/${encodeURIComponent(contractId)}/pdf`;
  },

  // Yêu thích: lưu theo tài khoản trong DB (căn đã lưu trả về đúng DTO TenantUnit như catalog)
  favorites: (): Promise<ApiResponse<TenantUnit[]>> => {
    return api.get<TenantUnit[]>("/me/favorites");
  },
  addFavorite: (code: string): Promise<ApiResponse<{ unitId: string; saved: boolean }>> => {
    return api.put<{ unitId: string; saved: boolean }>(`/me/favorites/${encodeURIComponent(code)}`);
  },
  removeFavorite: (code: string): Promise<ApiResponse<{ unitId: string; saved: boolean }>> => {
    return api.delete<{ unitId: string; saved: boolean }>(`/me/favorites/${encodeURIComponent(code)}`);
  },

};

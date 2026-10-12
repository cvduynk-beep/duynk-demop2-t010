/** Kiểu dữ liệu trả về từ `/api/v1/landlord/*` — khớp backend/src/modules/landlord (landlord-*.service.ts). */

export type UnitStatus = "available" | "viewing" | "holding" | "rented" | "unlisted" | "maintenance";
export type MandateStatus = "pending_inspection" | "active" | "exiting" | "ended";
export type LayoutKind = "Studio" | "1PN" | "2PN" | "3PN";
export type LockKind = "smart" | "physical";
export type LeaseTermPref = "flexible" | "long" | "mid" | "fixed";
export type ConsignmentStatus = "awaiting_host" | "inspecting" | "reviewing" | "awaiting_landlord" | "approved" | "rejected";

export interface MandateSummary {
  id: string;
  status: MandateStatus;
  signedAt: string | null;
  exitRequestedAt: string | null;
  exitEffectiveAt: string | null;
}

export interface UnitRow {
  id: string;
  unitCode: string;
  building: string;
  zone: string;
  floor: number;
  layout: string;
  layoutKind: LayoutKind;
  carpetAreaM2: number;
  baseRentPrice: number;
  rent: number;
  status: UnitStatus;
  isVerified: boolean;
  lock: LockKind;
  thumbnailUrl: string | null;
  holdExpiresAt: string | null;
  totalViewings: number;
  /** null = căn chưa có bản ghi ủy quyền trong hệ thống. */
  mandate: MandateSummary | null;
}

export interface UnitDetail {
  id: string;
  unitCode: string;
  building: string;
  zone: string;
  floor: number;
  layout: string;
  layoutKind: LayoutKind;
  carpetAreaM2: number;
  status: UnitStatus;
  isVerified: boolean;
  lock: LockKind;
  media: { url: string; category: string; verifiedAt: string }[];
  baseRentPrice: number;
  rent: number;
  allInCost: { rent: number; managementFee: number; parkingFeeEstimate: number; utilityCostEstimate: number; total: number };
  totalViewings: number;
  host: { id: string; name: string | null } | null;
  mandate: (MandateSummary & { contractNumber: string; renewsAt: string | null }) | null;
  holding: { amount: number; paidAt: string | null; expiresAt: string | null } | null;
  lease: {
    contractNumber: string;
    tenantName: string | null;
    startDate: string;
    endDate: string;
    months: number;
    rent: number;
    serviceFee: number;
    landlordNet: number;
    securityDeposit: number;
  } | null;
  /** Nhật ký xem phòng và nhật ký mở cửa đi kèm trong cùng một response (trang chi tiết cần cả ba). */
  viewings: ViewingLogEntry[];
  doorAudit: DoorAuditEntry[];
}

export type ViewingOutcome = "scheduled" | "in_progress" | "deposit" | "not_decided" | "no_show" | "cancelled";

export interface ViewingLogEntry {
  id: string;
  bookingRef: string;
  slot: string;
  lobbyCheckInAt: string | null;
  completedAt: string | null;
  durationMin: number | null;
  outcome: ViewingOutcome;
  cancelReason: string | null;
  tenantName: string | null;
  tenantPhoneMasked: string | null;
  host: { id: string; name: string | null } | null;
}

export interface DoorAuditEntry {
  id: string;
  at: string;
  actorName: string | null;
  actorRole: string;
  revealedAt: string;
  expiresAt: string | null;
}

/** Ảnh tham khảo chủ nhà đính kèm hồ sơ. `url` là link ký có hạn 1 giờ (null nếu ký lỗi). Không phải ảnh Verified. */
export interface ConsignmentPhoto {
  id: string;
  name: string;
  size: number;
  uploadedAt: string;
  url: string | null;
}

/** Đề xuất giá/cọc bảo đảm của Inspector, chờ chủ nhà đồng ý (stage `awaiting_landlord`). */
export interface PricingProposal {
  rent: number;
  securityDeposit: number;
  reason: string | null;
  proposedAt: string;
  original: { rent: number; securityDeposit: number };
}

export interface PricingDecisionResult {
  stage: "approved" | "rejected";
  unitCode: string;
  listedAt: string | null;
  rent?: number;
  securityDeposit?: number;
}

export interface Consignment {
  id: string;
  unitId: string;
  unitCode: string;
  contractNumber: string;
  status: ConsignmentStatus;
  building: string;
  zone: string;
  floor: number;
  door: string | null;
  layout: string;
  layoutKind: LayoutKind;
  areaM2: number;
  askRent: number;
  suggestedDeposit: number;
  leaseTerm: LeaseTermPref | null;
  furnished: boolean | null;
  locks: LockKind[];
  note: string | null;
  photoCount: number;
  /** Chỉ có ở `GET /landlord/consignments/:id` (danh sách chỉ có `photoCount`). */
  photos?: ConsignmentPhoto[];
  allowFastClose?: boolean;
  floorRent?: number | null;
  createdAt: string;
  signedAt: string | null;
  ownershipWarrantedAt: string | null;
  inspectDueAt: string | null;
  hostId: string | null;
  hostAcceptedAt: string | null;
  /** Báo cáo thẩm định do Field Host nộp (cấu trúc do module Host quy định; null khi chưa có). */
  report: unknown;
  decidedAt: string | null;
  decidedBy: string | null;
  decisionNote: string | null;
  payout?: BankPayoutAccount | null;
  /** Khác null chỉ khi Inspector đề xuất giá khác bản chủ khai và đang chờ chủ nhà quyết. */
  pricingProposal?: PricingProposal | null;
}

export interface CreateConsignmentInput {
  building: string;
  floor: number;
  door: string;
  layout: LayoutKind;
  areaM2: number;
  askRent: number;
  suggestedDeposit: number;
  leaseTerm: LeaseTermPref;
  furnished: boolean;
  locks: LockKind[];
  allowFastClose?: boolean;
  floorRent?: number;
  doorCode?: string;
  bankName?: string;
  bankAccount?: string;
  bankAccountHolder?: string;
  saveAsDefaultPayout?: boolean;
  items?: string[];
  note?: string;
  /** Cam kết quyền sở hữu (Điều 2) — bắt buộc true; tạo hồ sơ = ký ủy quyền. */
  ownershipWarranted: boolean;
  /** OTP Zalo 4 số — bỏ trống khi ký bằng số đã xác thực của tài khoản. */
  otp?: string;
  phone?: string;
}

export interface SignOtpInfo {
  /** false = ký bằng số đã xác thực của tài khoản, không gửi mã. */
  otpRequired: boolean;
  maskedPhone: string | null;
  expiresInSeconds: number;
  /** Thời gian chờ tối thiểu trước khi xin mã mới. Response không bao giờ chứa mã OTP. */
  resendInSeconds?: number;
}

export interface ExitResult {
  mandateId: string;
  unitId: string;
  status: "exiting";
  exitRequestedAt: string;
  exitEffectiveAt: string;
  countdownDays: number;
}

export interface FinanceMonth {
  month: string;
  label: string;
  gross: number;
  fee: number;
  /** 50% cọc giữ chỗ khách bỏ trong tháng (legal/02 Điều 6.1), đã cộng vào `net`, không trừ phí. */
  forfeit: number;
  net: number;
}

export interface FinanceUnitRow {
  unitId: string;
  unitCode: string;
  building: string;
  status: UnitStatus;
  rent: number;
  fee: number;
  net: number;
  escrow: number;
}

/** Một khoản cọc giữ chỗ khách bỏ: chủ nhà nhận `share` (50%). */
export interface FinanceForfeit {
  depositId: string;
  unitId: string;
  unitCode: string;
  depositAmount: number;
  share: number;
  paidAt: string | null;
  expiredAt: string | null;
}

export interface Finance {
  serviceFeePercent: number;
  /** `default` = Admin chưa cấu hình, đang dùng mức tạm. */
  feeSource: "config" | "default";
  thisMonth: { gross: number; fee: number; forfeit: number; net: number };
  totalNet6Months: number;
  escrowTotal: number;
  history: FinanceMonth[];
  perUnit: FinanceUnitRow[];
  /** 6 tháng gần nhất, mới nhất trước. */
  forfeits: FinanceForfeit[];
}

export interface BuildingOption {
  id: string;
  buildingCode: string;
  zoneName: string;
  totalFloors: number;
}

/** Tài khoản thụ hưởng đã lưu ở backend — số TK chỉ có dạng che, không bao giờ trả đầy đủ. */
export interface BankPayoutAccount {
  bankName: string;
  bankAccountMasked: string;
  bankAccountHolder: string;
}

export interface MyProfile {
  id: string;
  fullName: string | null;
  email: string | null;
  isPhoneVerified: boolean;
  /** SĐT của chính chủ (0xxxxxxxxx) — chỉ trả cho chính người đăng nhập. */
  phone?: string | null;
  createdAt: string;
  payoutAccount?: BankPayoutAccount | null;
}

export type VerificationStep = "phone" | "identity" | "payout";

/** Trạng thái xác thực chủ nhà — đủ 3 bước (`ready`) mới được ký gửi. */
export interface LandlordVerification {
  phone: { verified: boolean; maskedPhone: string | null };
  identity: { verified: boolean; fullName: string | null; idNumberMasked: string | null; address: string | null; verifiedAt: string | null };
  payout: { verified: boolean; account: BankPayoutAccount | null; verifiedAt: string | null };
  /** Bước còn thiếu theo thứ tự làm. */
  missing: VerificationStep[];
  ready: boolean;
}

export type ActivityKind = "viewing_booked" | "viewing_done" | "no_show" | "deposit_paid" | "deposit_forfeited" | "lease_signed";

/** Một sự kiện trên căn của chủ nhà (30 ngày gần nhất) — không có thông tin khách. */
export interface LandlordActivity {
  id: string;
  at: string;
  kind: ActivityKind;
  unitId: string;
  unitCode: string;
  tone: "info" | "success" | "warning";
  title: string;
  body: string;
}

export interface LandlordDashboard {
  activity: LandlordActivity[];
}

/** Gợi ý giá (AI Dynamic Deal) cho căn đang trống — xem `LandlordPriceInsightService`. */
export interface PriceInsight {
  unitId: string;
  unitCode: string;
  layoutKind: LayoutKind;
  zone: string;
  scope: "zone" | "park";
  comps: number;
  currentRent: number;
  marketMedian: number;
  suggestedRent: number;
  dealBadge: boolean;
  savingPercent: number;
  daysVacant: number;
  viewings30d: number;
  viewingsNoDeposit: number;
  noShows: number;
  vacancyLossPerMonth: number;
  floorLimited: boolean;
}

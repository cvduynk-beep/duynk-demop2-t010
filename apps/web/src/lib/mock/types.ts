import type { Household, PaymentCycle } from "./cost";
import type { Furnishing, HostRole, HostStatus, ItemKey, LayoutKind, LeaseTermPref, LockType, PassportItem, UnitStatus, ZoneId } from "./units";
export { PASSPORT_ITEMS, type PassportItem } from "./units";

export interface HoldPolicy {
  defaultHours: number;               // 12..72, số nguyên
  byUnit: Record<string, number>;     // unitId → giờ (12..72); không có key ⇒ dùng defaultHours
}

export interface HoldAudit {
  id: string;
  at: string;
  by: string;
  unitId: string | null;              // null = đổi mặc định toàn nền tảng
  from: number | null;                // null = trước đó chưa có override
  to: number | null;                  // null = gỡ override về mặc định
}

// ─── Lịch xem nhà ───────────────────────────────────────────────────────────────────────────

export type DispatchTier = "top" | "zone_pool" | "wide_pool";

export interface BookingDispatch {
  state: "assigned" | "open";
  tier: DispatchTier;
  offeredTo: string[];
  openedAt: string;
  claimedAt?: string;
  escalated?: boolean;
}

/**
 * Vòng đời một lịch xem (PRD §3.2–3.4):
 * pending → confirmed → lobby → receiving → viewing → closing → holding → leased
 * Nhánh phụ: completed (xem xong, chưa thuê), no_show, cancelled, rejected.
 */
export type BookingStatus =
  | "pending"
  | "confirmed"
  | "lobby"
  | "receiving"
  | "viewing"
  | "closing"
  | "holding"
  | "leased"
  | "completed"
  | "no_show"
  | "cancelled"
  | "rejected";

export interface IdCardData {
  fullName: string;
  idNumber: string;
  dob: string;
  issuedDate?: string;
  issueDate?: string;
  gender?: string;
  homeTown?: string;
  address: string;
  frontUrl?: string;
  backUrl?: string;
  selfieUrl?: string;
  /** Độ tin cậy OCR từng trường (0–1). < 0.85 → bắt đối chiếu tay. Hoặc số điểm chung. */
  confidence: number | { fullName: number; idNumber: number; issuedDate: number; address: number };
  manuallyEdited?: boolean;
  /** Điểm khớp khuôn mặt giữa ảnh chân dung và ảnh trên CCCD (0–1). */
  faceMatch?: number;
  consentAt?: string;
  verifiedAt: string;
  mismatch?: ("fullName" | "idNumber")[]; // + Đ4
}

export interface DepositInfo {
  amount: number;
  /** Nội dung chuyển khoản: COC [Mã căn] [SĐT]. */
  content: string;
  qrRef: string;
  createdAt: string;
  paidAt?: string;
  /** Hết hạn giữ chỗ: paidAt + holdHours giờ. */
  expiresAt?: string;
  method?: "webhook" | "host_receipt";
  /** Host tải UNC lên khi webhook chậm — giữ tạm 30 phút. */
  tempHoldUntil?: string;
  holdHours?: number;                 // MỚI — chụp lúc báo có; expiresAt = paidAt + holdHours*HOUR_MS
  voided?: {                          // MỚI — Admin huỷ cọc (legal/02 Điều 6.2–6.3)
    at: string;
    by: string;
    reason: "landlord_breach" | "force_majeure";
    note: string;                     // 5..200 ký tự
  };
}

export interface Occupant { fullName: string; idOrDob: string; phone?: string }
export interface RefundAccount { bankName: string; accountNo: string; holderName: string }
export interface FirstPayment {
  rent: number;                       // unit.rent * paymentCycle
  depositTopUp: number;               // securityDeposit - deposit.amount (≥ 0)
  total: number;                      // rent + depositTopUp
  content: string;                    // "VSA <unit.code> THANH TOAN TIEN THUE KY 1"
  paidAt?: string;
}

export interface Booking {
  id: string;
  ref: string;
  unitId: string;
  hostId: string;
  tenant: { name: string; phone: string; persons: number; note?: string };
  slot: string;
  status: BookingStatus;
  createdAt: string;
  confirmedAt?: string;
  /** Khách bấm "Đang trên đường - xin trễ 10p". */
  lateRequested?: boolean;
  lobbyAt?: string;
  receivingAt?: string;
  viewingAt?: string;
  viewEndedAt?: string; // + lúc Host kết thúc buổi xem (khách chốt / chưa quyết định)
  doorCode?: string;
  doorCodeExpiresAt?: string;
  depositConsentAt?: string; // + khách tick điều khoản cọc trước khi hiện QR
  deposit?: DepositInfo;
  kyc?: IdCardData;
  dispatch?: BookingDispatch;
  lease?: {
    signedAt: string;
    startDate: string;
    months: number;
    rent: number;
    docId: string;
    signature?: string; // +
    renewalRemindedAt?: string;
    occupants: Occupant[];              // MỚI, 0..OCCUPANTS_MAX
    refundAccount: RefundAccount;       // MỚI
    paymentCycle: PaymentCycle;         // MỚI
    securityDeposit: number;            // MỚI = unit.rent (đã gồm 2tr chuyển đổi)
    firstPayment: FirstPayment;         // MỚI
  };
  closedReason?: string;
  rating?: number;
  reminderSentAt?: string;
  /** Mã ca xem trước nếu đây là ca xem nối tiếp tại chỗ (Chain viewing / cross-sell). */
  chainedFromBookingId?: string;
}

// ─── Thông báo (Zalo / push) ─────────────────────────────────────────────────────────────────

export type NoticeAudience = "tenant" | "landlord" | "host" | "admin";

export interface NoticeAction {
  id: "arrived" | "late" | "reschedule";
  label: string;
  /** Đã bấm — nút chuyển sang trạng thái đã phản hồi. */
  doneAt?: string;
}

export interface Notice {
  id: string;
  at: string;
  channel: "zalo" | "push" | "system";
  audience: NoticeAudience;
  /** tenant: SĐT chuẩn hoá · landlord: landlordId · host: hostId · admin: bỏ trống. */
  toKey?: string;
  title: string;
  body: string;
  bookingId?: string;
  unitId?: string;
  tone?: "info" | "success" | "warning" | "alert";
  actions?: NoticeAction[];
}

// ─── Ký gửi / uỷ quyền ────────────────────────────────────────────────────────────────────────

export interface Mandate {
  unitId: string;
  status: "active" | "exiting" | "ended";
  signedAt: string;
  exitRequestedAt?: string;
  exitEffectiveAt?: string;
  endedAt?: string;   // ISO — lúc Admin hoàn tất thoát uỷ quyền
  endedBy?: string;   // tên Admin
  termMonths?: number; // MỚI; thiếu ⇒ MANDATE_TERM_MONTHS
}

export type ConsignmentStatus =
  | "draft"          // đã đăng ký, chưa ký OTP ủy quyền
  | "awaiting_host"  // đã ký, ticket đã gán Host phân khu, Host chưa nhận
  | "inspecting"     // Host đã nhận, đang kiểm tra thực tế
  | "reviewing"      // Host đã nộp báo cáo, chờ Admin chốt
  | "approved"       // Admin duyệt — ký gửi hiệu lực
  | "rejected";      // Admin không duyệt (kèm note)

// Thẩm định (Đ11)
export type InventoryGroup = "I" | "II" | "III" | "IV" | "V" | "VI" | "VII" | "VIII";
export type Liability = "misuse" | "wear_or_misuse"; // “Hỏng do lỗi dùng” | “Hao mòn / Lỗi dùng”

export interface InventoryLine {
  code: string; // "1".."32" cho catalog, "X1".. cho dòng Host thêm
  group: InventoryGroup;
  name: string; // tên hạng mục (catalog: nguyên văn Điều 5)
  passport: PassportItem; // nhóm 1/10 để tóm tắt
  present: boolean;
  spec?: string; // Nhãn hiệu / Model / Quy cách, ≤ 80 ký tự
  qty?: number; // ≥ 1 khi present
  condition?: number; // % độ mới, bội số 10, [0,100], bắt buộc khi present
  photoAt?: string; // ISO, bắt buộc khi present
  photoUrl?: string; // Data URL hoặc đường dẫn ảnh chụp thực tế
  note?: string; // ≤ 120
  liability: Liability;
  compensation?: number; // VNĐ, tuỳ chọn
  // ─── Mô hình kiểm soát 3 lớp (3-Tier Verification Architecture) ───
  aiValidated?: boolean;
  aiDetected?: string;
  aiConfidence?: number;
  aiStatus?: "match" | "warning" | "unclear";
  locationTag?: string;
}

export type DeclaredField = "identity" | "layout" | "areaM2" | "furnishing" | "lock";
export interface DeclaredCheck { field: DeclaredField; ok: boolean; /** bắt buộc khi ok=false, ≤80 ký tự */ actual?: string }

export interface UnitLivingFees {
  managementFeePerM2: number; // Phí quản lý (đ/m²/tháng do Host thẩm định nhập hoặc xác nhận)
  motorbikeFee: number;       // Phí gửi xe máy (đ/xe/tháng)
  carFee: number;             // Phí gửi ô tô (đ/xe/tháng)
  electricityNote?: string;   // Ghi chú tiền điện (theo biểu giá EVN Hà Nội)
  waterNote?: string;         // Ghi chú tiền nước (theo biểu giá BQL)
  otherFeesNote?: string;     // Phí tiện ích khác nếu có
  verifiedByHost?: boolean;   // Đã xác thực thực địa bởi Host
}

export interface InspectionReport {
  hostId: string;
  submittedAt: string;
  declared: DeclaredCheck[]; // đúng 5 phần tử
  inventory: InventoryLine[]; // đủ 32 dòng catalog theo thứ tự + 0..10 dòng thêm
  netAreaM2: number; // diện tích thông thuỷ Host đo, > 0 và ≤ areaM2
  furnishing: Furnishing; // nội thất thực tế: full | basic | empty
  recommendation: "approve" | "reject";
  note?: string; // ≤300 ký tự
  livingFees?: UnitLivingFees; // Biểu phí sinh hoạt thực tế do Host thẩm định nhập
  // Compatibility fields for un-refactored UI components (WP3/4/7)
  items?: { key: ItemKey; present: boolean }[];
  equipment?: { item: PassportItem; condition: number; photoAt: string; note?: string }[];
}
export type InspectionDraft = Omit<InspectionReport, "hostId" | "submittedAt" | "inventory" | "netAreaM2" | "furnishing"> & {
  inventory?: InventoryLine[];
  netAreaM2?: number;
  furnishing?: Furnishing;
  livingFees?: UnitLivingFees;
};

export interface ConsignInput {
  landlordId: string;
  building: string;
  floor: number;
  door: string;
  layout: LayoutKind;
  areaM2: number;
  askRent: number;
  suggestedDeposit?: number;
  leaseTerm?: LeaseTermPref;
  furnished?: boolean;
  locks?: LockType[];
  allowFastClose?: boolean;
  floorRent?: number;
  auditByHost?: boolean;
  doorCode?: string;
  note?: string;
  bankName?: string;
  bankAccount?: string;
  bankAccountHolder?: string;
  saveAsDefaultPayout?: boolean;
  // Compatibility fields for un-refactored UI components (WP3)
  furnishing?: Furnishing;
  lock?: LockType;
  items?: ItemKey[];
}

export interface Consignment {
  id: string;
  landlordId: string;
  building: string;
  floor: number;
  door: string;
  layout: LayoutKind;
  areaM2: number; // diện tích TIM TƯỜNG chủ nhà khai
  askRent: number; // nhãn UI "Giá thuê"
  suggestedDeposit: number; // + VNĐ
  leaseTerm: LeaseTermPref; // +
  furnished: boolean; // ~ thay furnishing: Furnishing
  locks: LockType[]; // ~ thay lock; 1–2 phần tử
  allowFastClose?: boolean;
  floorRent?: number;
  bankName?: string;
  bankAccount?: string;
  bankAccountHolder?: string;
  auditByHost: boolean;
  status: ConsignmentStatus;
  createdAt: string;
  note?: string;
  signedAt?: string; // lúc ký OTP (vào awaiting_host)
  hostId?: string; // gán lúc ký = zoneOfBuilding(building).hostId
  inspectDueAt?: string; // signedAt + 48h
  hostAcceptedAt?: string;
  report?: InspectionReport;
  decidedAt?: string;
  decidedBy?: string; // tên Admin
  ownershipWarrantedAt?: string; // MỚI — tick cam đoan Điều 2 legal/01, set trong signConsignment
  // Cơ chế Auto-Escalation & SLA 2h + Admin Override
  openPoolAt?: string; // mốc thời gian tự động mở vào Open Pool (>30p)
  slaBreached?: boolean; // mốc thời gian quá 2h chưa có host nhận (SLA Breach)
  escalatedToAreaLead?: boolean; // tự động chuyển cho Area Lead
  adminOverriddenBy?: string; // lưu vết Admin chỉ định tay
  adminOverriddenAt?: string;
  // Compatibility fields for un-refactored UI components (WP3/4/7)
  furnishing: Furnishing;
  lock: LockType;
  items: ItemKey[];
}

// ─── Cấu hình biến phí (Admin) ───────────────────────────────────────────────────────────────

export interface FeeConfig {
  baseViewingFee: number;
  dealCommission: number;
  ratingMultiplier: number;
  campaignBonus: number;
}

export interface FeeAudit {
  id: string;
  at: string;
  by: string;
  field: keyof FeeConfig;
  from: number;
  to: number;
}

// ─── OTP & chat ───────────────────────────────────────────────────────────────────────────────

export interface OtpChallenge {
  phone: string;
  code: string;
  expiresAt: number;
  purpose: "booking" | "kyc" | "agreement";
}

export interface CriteriaState {
  /** Ngân sách trần All-in / tháng (VNĐ). */
  budget?: number;
  layouts: LayoutKind[];
  zones: ZoneId[];
  buildings: string[];
  floor?: "low" | "mid" | "high";
  furnishing?: Furnishing;
  items: ItemKey[];
  pets?: boolean;
  household: Household;
  moveIn?: string;
  /** Khách ưu tiên tìm căn giá thấp nhất / tối ưu chi phí */
  sortByPrice?: boolean;
  /** Khách ưu tiên căn nội thất mới (tình trạng >= 85%) */
  preferNewFurnishing?: boolean;
  /** Khách yêu cầu gần một địa điểm / tiện ích cụ thể */
  nearLocation?: string;
}

export interface ChatMessage {
  id: string;
  role: "user" | "assistant";
  text: string;
  at: string;
  /** Tin trả lời có kết quả tìm căn. */
  resultIds?: string[];
  criteria?: CriteriaState;
}

export interface ChatState {
  messages: ChatMessage[];
  criteria: CriteriaState;
  /** Đã có ít nhất một lần tìm căn → giao diện chuyển sang chế độ kết quả. Danh sách căn luôn tính lại từ `criteria`. */
  searched: boolean;
}

// ─── State tổng ───────────────────────────────────────────────────────────────────────────────

export type DelistReason =
  | "landlord_exit"
  | "personal_use"
  | "unit_sold"
  | "maintenance"
  | "data_cleanup"
  | "other";

export interface ArchivedUnitRecord {
  unitId: string;
  archivedAt: string;
  archivedBy: string;
  reason: DelistReason;
  reasonLabel: string;
  note?: string;
}

export interface UnitOverride {
  status: UnitStatus;
  holdingUntil?: string;
}

export interface MockState {
  ready: boolean;
  seededOn: string;
  bookings: Booking[];
  notices: Notice[];
  unitState: Record<string, UnitOverride>;
  mandates: Record<string, Mandate>;
  consignments: Consignment[];
  fees: FeeConfig;
  feeAudit: FeeAudit[];
  favorites: string[];
  otp: OtpChallenge | null;
  /** Số tin khách vãng lai đã nhắn (giới hạn 1). */
  guestSent: number;
  chat: ChatState;
  /** Thông tin khách đã dùng để điền sẵn form đặt lịch. */
  tenantProfile?: { name: string; phone: string; refundAccount?: RefundAccount };
  /** Danh sách tài khoản nhận hoàn cọc đã lưu theo SĐT khách thuê. */
  savedRefundAccounts?: Record<string, RefundAccount>;
  /** Vai của Field Host khi bị Admin sửa (mặc định lấy từ HOSTS). */
  hostRoles: Record<string, HostRole[]>;
  /** Phân khu phụ trách của Field Host khi bị Admin sửa (mặc định lấy từ HOSTS). */
  hostZones: Record<string, ZoneId[]>;
  /** Trạng thái tài khoản Field Host (active, busy, off_duty, suspended) khi Admin cập nhật */
  hostStatuses: Record<string, HostStatus>;
  /** Danh sách SĐT khách thuê đã xác thực qua OTP Zalo (SPEC-P06 §2) */
  verifiedPhones: string[];
  /** Cấu hình thời hạn giữ chỗ theo giờ (SPEC-P01 §1) */
  holdPolicy: HoldPolicy;
  /** Lịch sử thay đổi thời hạn giữ chỗ (SPEC-P01 §3) */
  holdAudit: HoldAudit[];
  /** Danh sách căn hộ đã ngừng niêm yết & lưu trữ an toàn bởi Admin (Delist & Archive) */
  archivedUnits?: Record<string, ArchivedUnitRecord>;
  /** Tài khoản thụ hưởng mặc định của Chủ nhà (Smart Onboarding) */
  landlordPayoutAccount?: { bankName: string; bankAccount: string; bankAccountHolder: string; isVerified: boolean };
}

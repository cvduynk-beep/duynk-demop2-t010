export type BookingStatusWeb =
  | 'pending'
  | 'confirmed'
  | 'lobby'
  | 'receiving'
  | 'viewing'
  | 'closing'
  | 'holding'
  | 'leased'
  | 'completed'
  | 'no_show'
  | 'cancelled'
  | 'rejected';

/** Một dòng nội thất công khai của căn (có độ mới %; không có bồi thường/ảnh bằng chứng — B6). */
export interface UnitInventoryLine {
  /** Mã catalog "1".."32" — ghép ảnh minh hoạ `/inventory/<code>.jpg`. */
  code: string;
  group: "I" | "II" | "III" | "IV" | "V" | "VI" | "VII" | "VIII";
  groupLabel: string;
  name: string;
  qty: number;
  spec: string | null;
  /** "Độ mới" % do Host kiểm định ước lượng (30–98); null = chưa có. */
  conditionPct: number | null;
}

export interface TenantUnit {
  code: string;
  building: string;
  zoneName?: string;
  floor: number;
  door: string;
  layout: 'Studio' | '1PN' | '2PN' | '3PN';
  layoutLabel: string;
  bedrooms: number;
  bathrooms: number;
  areaM2: number;
  direction: string | null;
  view: string | null;
  furnishing: 'full' | 'basic' | 'empty';
  items: string[];
  rent: number;
  marketAvg: number;
  managementFee: number;
  parkingFeeEstimate: number;
  /** Biểu phí gửi xe thực tế tại tòa (Field Host xác minh); null ⇒ dùng đơn giá chung. */
  motorbikeFee?: number | null;
  carFee?: number | null;
  /** Ghi chú phí khác / tiện ích nội khu. */
  feeNote?: string | null;
  utilityCostEstimate: number;
  status: 'available' | 'holding' | 'rented';
  lock: 'smart' | 'physical';
  photos: string[];
  interest24h: number;
  petFriendly: boolean;
  minMonths: number;
  verifiedAt: string;
  holdHours: number; // 12..72 — B4
  activeViewingAt: string | null; // ca xem sớm nhất hôm nay đang CONFIRMED/LOBBY/RECEIVING/VIEWING — nhãn FOMO
  securityDeposit: number; // Tiền cọc bảo đảm: units.securityDeposit ?? baseRentPrice
  holdingDeposit: number; // Khoản cọc khách chuyển khi chốt căn (cọc v2 = Tiền cọc bảo đảm) — chỉ đọc từ API
  highlights: string[]; // ≤ 3
  inventory: UnitInventoryLine[]; // chỉ ở chi tiết căn; danh sách = []
}

export interface CreateBookingDto {
  unitCode: string;
  slot: string; // ISO, khớp SLOT_TIMES giờ VN
  contactName: string; // 2..100
  phone: string; // VN, chuẩn hoá E.164 ở backend
  partySize: number; // 1..10
  note?: string; // ≤ 300
  actionToken?: string; // bắt buộc trừ khi profile.isPhoneVerified và phone khớp profile
}

export interface TenantBooking {
  ref: string;
  status: BookingStatusWeb;
  unit: TenantUnit;
  slot: string;
  createdAt: string;
  confirmedAt?: string;
  reminderSentAt?: string;
  lateRequestedAt?: string;
  lobbyAt?: string;
  receivingAt?: string;
  viewingAt?: string;
  viewEndedAt?: string;
  closedReason?: string;
  rating?: number;
  rescheduleCount: number;
  contact: {
    name: string;
    phoneMasked: string;
    persons: number;
    note?: string;
  };
  host: {
    name: string;
    rating: number | null;
  } | null;
  canModify: boolean; // status ∈ {pending, confirmed} && slot − now ≥ 2h
  /** Lịch cọc trực tiếp trên trang căn (chốt cọc nhanh, không lịch xem, không Host). */
  direct: boolean;
  deposit?: {
    amount: number;
    transferContent: string;
    qrRef: string;
    createdAt: string;
    termsAcceptedAt: string;
    termsVersion: string;
    paidAt?: string;
    holdHours?: number;
    expiresAt?: string;
    /**
     * Có ⇒ cọc chốt nhanh: `amount` là cọc đã giảm (`baseAmount − depositDiscount`). Chu kỳ + giá thuê chọn khi ký HĐ nên
     * `cycle`/`monthlyRent` null tới lúc đó (cọc cũ trước 2026-10-15 đã có sẵn và bị khoá).
     */
    fastClose?: {
      cycle: FastCloseCycle | null;
      baseAmount: number;
      depositDiscount: number;
      monthlyRent: number | null;
      quoteExpiresAt: string | null; // tiền về sau mốc này ⇒ hoàn cọc, không giữ căn
    };
    outcome: 'awaiting_payment' | 'active' | 'expired' | 'converted' | 'refunded' | 'forfeited';
    vietqr: {
      bankId: string;
      bankName?: string;
      accountNo: string;
      accountName: string;
      qrUrl: string;
    } | null;
  };
  kyc?: {
    verifiedAt: string;
    confidenceMin: number;
    manuallyEdited: boolean;
    mismatch: string[];
  };
  contractId?: string;
}

export type FastCloseCycle = 1 | 3 | 6;

/**
 * `GET /bookings/:ref/fast-close` — báo giá chốt nhanh cho chủ lịch (giá sàn của chủ nhà không bao giờ lộ ra).
 * `stage = deposit`: đang chốt cọc (giảm cọc + xem trước giá thuê theo chu kỳ); `lease`: đã giữ căn, chọn chu kỳ khi ký HĐ.
 */
export interface FastCloseQuotes {
  eligible: boolean; // false ⇒ chủ nhà chưa ủy quyền chốt nhanh
  stage: "deposit" | "lease" | null;
  quoteHours: number; // phải chuyển cọc trong số giờ này
  rent: number;
  deposit: number;
  depositDiscount: number;
  depositAfter: number;
  quotes: {
    cycle: FastCloseCycle;
    rent: number;
    rentDiscount: number;
    rentDiscountPct: number;
  }[];
}

/** `GET /units/:code/fast-deposit` (công khai) — căn có "Chốt cọc nhanh" không; KHÔNG có giá sàn / giá thuê đã giảm. */
export interface PublicFastDeposit {
  eligible: boolean;
  holdHours: number;
  quoteHours: number;
  deposit: number;
  depositDiscount: number;
  amount: number;
}

/** `POST /bookings/fast-deposit` — cọc chốt nhanh không cần lịch xem. */
export interface FastDepositDto {
  unitCode: string;
  contactName: string;
  phone: string;
  partySize?: number;
  actionToken?: string;
  acceptTerms: true;
  acknowledgeNoViewing: true;
  termsVersion: string;
}

export interface DepositTermsDoc {
  version: string; // 'DEP-2026.10-v2'
  amount: number;
  holdHours: number;
  items: { id: string; text: string; source: string }[]; // source = "legal/02 Điều 6.1" …
  houseRules: { id: string; title: string; body: string; source: string }[];
  consentLabel: string;
}

export interface EkycScanResult {
  scanId: string; // ràng với booking, hết hạn 15 phút
  fields: {
    fullName: string;
    idNumber: string;
    dob: string; /* DD/MM/YYYY */
    issuedDate: string; /* DD/MM/YYYY */
    address: string;
  };
  confidence: Record<keyof EkycScanResult['fields'], number>;
  lowConfidenceKeys: string[]; // confidence < 0.85 ⇒ khách phải xác nhận/nhập tay
  faceMatch: number;
  /** true = OCR mô phỏng (chưa tích hợp FPT.AI). */
  simulated?: boolean;
}

/** Phiên bản đồng ý xử lý dữ liệu cá nhân khi quét CCCD — khớp `EKYC_CONSENT_VERSION` của backend. */
export const EKYC_CONSENT_VERSION = "PRIVACY-2026.10-v1";

export interface SubmitEkycDto {
  scanId: string;
  consentVersion: string;
  fields: EkycScanResult['fields']; // đã xác nhận / sửa tay
  confirmedLowConfidence: boolean; // bắt buộc true nếu lowConfidenceKeys ≠ ∅
  confirmedNameMismatch?: boolean; // bắt buộc true nếu fullName ≠ contactName (bỏ dấu, hoa)
}

/** `POST /contracts/lease/sign` — ký Hợp đồng thuê (sau eKYC, khi đang giữ chỗ). */
export interface SignLeaseDto {
  bookingRef: string;
  startDate: string; /* YYYY-MM-DD = ngày dọn vào, T0+2 … T0+30 (T0 = ngày cọc về) */
  months: number; // min_lease_months của căn .. 36
  paymentCycle: 1 | 3 | 6;
}

export interface TenantContract {
  id: string;
  contractNumber: string;
  bookingRef: string;
  unit: TenantUnit;
  status: 'active' | 'expiring' | 'ended'; // dẫn xuất từ endDate (≤ 30 ngày ⇒ expiring)
  establishedAt: string;
  startDate: string;
  endDate: string;
  months: number;
  paymentCycle: 1 | 3 | 6;
  monthlyRent: number;
  securityDeposit: number;
  convertedHolding: number;
  firstPaymentDue: {
    rent: number;
    depositTopUp: number;
    total: number;
    transferContent: string;
  };
  pdf: {
    ready: boolean;
    sha256?: string;
    sizeBytes?: number;
  };
}

/** Biên bản bàn giao số (`GET /handovers/contracts/:id`): ảnh có link ký 1 giờ (null nếu ký lỗi). */
export interface TenantHandover {
  id: string;
  handoverType: "CHECK_IN" | "CHECK_OUT";
  inspectedAt: string;
  signedByTenantAt: string | null;
  items: {
    id: string;
    itemCategory: string;
    conditionNote: string | null;
    isNormalWear: boolean;
    /** Decimal ⇒ chuỗi số. */
    deductionCost: string | number;
    photos: { key: string; takenAt?: string; url: string | null }[];
  }[];
  utilityReadings: {
    id: string;
    utilityType: "ELECTRICITY" | "WATER" | string;
    meterIndex: string | number;
    recordedAt: string;
    photoUrl: string | null;
  }[];
}

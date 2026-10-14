/**
 * Chốt nhanh (AGENTS Chủ nhà #1 "Ủy quyền AI Chốt Nhanh & Giá Sàn An Toàn") — hàm thuần, NGUỒN DUY NHẤT của công thức.
 *
 * Điều kiện: chủ nhà bật `allowFastClose` và có `floorRent` (meta hồ sơ ký gửi, không có ở bảng `units`).
 * Khách cam kết chu kỳ thanh toán + chuyển cọc trong FAST_CLOSE_QUOTE_HOURS giờ:
 *  - Giá thuê tháng giảm theo chu kỳ: 1 tháng −3,5% · 3 tháng −5,5% · 6 tháng −10%, làm tròn 50.000đ, KHÔNG thấp hơn giá sàn.
 *  - Tiền cọc bảo đảm giảm ~5% (làm tròn 50.000đ), tối thiểu 200.000đ nhưng không quá 8% cọc.
 * Không có phụ phí thuê ngắn hạn (quyết định 2026-10-14).
 */
export const FAST_CLOSE_CYCLES = [1, 3, 6] as const;
export type FastCloseCycle = (typeof FAST_CLOSE_CYCLES)[number];
export const FAST_CLOSE_RENT_DISCOUNT: Record<FastCloseCycle, number> = { 1: 0.035, 3: 0.055, 6: 0.1 };
export const FAST_CLOSE_DEPOSIT_DISCOUNT = 0.05;
export const FAST_CLOSE_DEPOSIT_DISCOUNT_MIN = 200_000;
export const FAST_CLOSE_DEPOSIT_DISCOUNT_MAX_RATIO = 0.08;
/** Ưu đãi chỉ giữ khi khách chuyển cọc trong 24 giờ (AGENTS: "chuyển cọc trong 24 giờ"). */
export const FAST_CLOSE_QUOTE_HOURS = 24;
const STEP = 50_000;

const round50k = (n: number) => Math.round(n / STEP) * STEP;

export const isFastCloseCycle = (v: unknown): v is FastCloseCycle => FAST_CLOSE_CYCLES.includes(v as FastCloseCycle);

export interface FastCloseSource {
  /** Giá chào thuê hiện tại (VNĐ/tháng). */
  rent: number;
  /** Tiền cọc bảo đảm của căn (VNĐ). */
  deposit: number;
  /** Giá sàn chốt nhanh; null = chủ nhà chưa ủy quyền ⇒ không có chốt nhanh. */
  floorRent: number | null;
}

export interface FastCloseQuote {
  cycle: FastCloseCycle;
  originalRent: number;
  rent: number;
  rentDiscount: number;
  /** % giảm thực tế sau khi kẹp giá sàn (1 chữ số). */
  rentDiscountPct: number;
  originalDeposit: number;
  deposit: number;
  depositDiscount: number;
}

/** Mức giảm tiền cọc: ~5% làm tròn 50k, ≥ 200k nhưng ≤ 8% cọc; không bao giờ vượt chính số cọc. */
export function depositDiscount(deposit: number): number {
  const target = Math.max(FAST_CLOSE_DEPOSIT_DISCOUNT_MIN, round50k(deposit * FAST_CLOSE_DEPOSIT_DISCOUNT));
  const cap = Math.floor((deposit * FAST_CLOSE_DEPOSIT_DISCOUNT_MAX_RATIO) / STEP) * STEP;
  return Math.max(0, Math.min(target, cap, deposit));
}

export function fastCloseQuote(src: FastCloseSource, cycle: FastCloseCycle): FastCloseQuote | null {
  if (src.floorRent == null || src.floorRent <= 0 || src.floorRent > src.rent) return null;
  const rent = Math.max(src.floorRent, Math.min(src.rent, round50k(src.rent * (1 - FAST_CLOSE_RENT_DISCOUNT[cycle]))));
  const dd = depositDiscount(src.deposit);
  return {
    cycle,
    originalRent: src.rent,
    rent,
    rentDiscount: src.rent - rent,
    rentDiscountPct: src.rent > 0 ? Math.round(((src.rent - rent) / src.rent) * 1000) / 10 : 0,
    originalDeposit: src.deposit,
    deposit: src.deposit - dd,
    depositDiscount: dd,
  };
}

export const fastCloseQuotes = (src: FastCloseSource): FastCloseQuote[] =>
  FAST_CLOSE_CYCLES.map((c) => fastCloseQuote(src, c)).filter((q): q is FastCloseQuote => q !== null);

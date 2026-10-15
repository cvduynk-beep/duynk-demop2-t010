/**
 * Chốt nhanh (AGENTS Chủ nhà #1 "Ủy quyền AI Chốt Nhanh & Giá Sàn An Toàn") — hàm thuần, NGUỒN DUY NHẤT của công thức.
 *
 * Điều kiện: chủ nhà bật `allowFastClose` và có `floorRent` (meta hồ sơ ký gửi, không có ở bảng `units`).
 * Hai bước (quyết định 2026-10-15, hồ sơ 20):
 *  - Lúc cọc: khách chuyển cọc trong FAST_CLOSE_QUOTE_HOURS giờ ⇒ Tiền cọc bảo đảm giảm ~5% (làm tròn 50.000đ),
 *    tối thiểu 200.000đ nhưng không quá 8% cọc. Không cần chọn chu kỳ.
 *  - Lúc ký HĐ: khách chọn chu kỳ ⇒ giá thuê tháng giảm 1 tháng −3,5% · 3 tháng −5,5% · 6 tháng −10%, làm tròn 50.000đ,
 *    KHÔNG thấp hơn giá sàn. HĐ giữ đúng chu kỳ + giá đó.
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

/** Chủ nhà đã ủy quyền và giá sàn hợp lệ (> 0, ≤ giá chào). CẤM tự suy giá sàn khi thiếu. */
export function isFastCloseEligible(src: FastCloseSource): src is FastCloseSource & { floorRent: number } {
  return src.floorRent != null && src.floorRent > 0 && src.rent > 0 && src.floorRent <= src.rent;
}

export interface FastDepositQuote {
  originalDeposit: number;
  depositDiscount: number;
  /** Số phải chuyển qua VietQR (= Tiền cọc bảo đảm sau giảm). */
  deposit: number;
}

/** Bước cọc: chỉ giảm tiền cọc. */
export function fastDepositQuote(src: FastCloseSource): FastDepositQuote | null {
  if (!isFastCloseEligible(src) || src.deposit <= 0) return null;
  const dd = depositDiscount(src.deposit);
  return { originalDeposit: src.deposit, depositDiscount: dd, deposit: src.deposit - dd };
}

export interface FastCloseRentQuote {
  cycle: FastCloseCycle;
  originalRent: number;
  rent: number;
  rentDiscount: number;
  /** % giảm thực tế sau khi kẹp giá sàn (1 chữ số). */
  rentDiscountPct: number;
}

/** Bước ký HĐ: giá thuê theo chu kỳ đã chọn, kẹp trong [giá sàn, giá chào]. */
export function fastCloseRent(src: FastCloseSource, cycle: FastCloseCycle): FastCloseRentQuote | null {
  if (!isFastCloseEligible(src)) return null;
  const rent = Math.max(src.floorRent, Math.min(src.rent, round50k(src.rent * (1 - FAST_CLOSE_RENT_DISCOUNT[cycle]))));
  return {
    cycle,
    originalRent: src.rent,
    rent,
    rentDiscount: src.rent - rent,
    rentDiscountPct: Math.round(((src.rent - rent) / src.rent) * 1000) / 10,
  };
}

/** Ghép hai bước (giữ cho test/tương thích; luồng mới gọi riêng `fastDepositQuote` và `fastCloseRent`). */
export function fastCloseQuote(src: FastCloseSource, cycle: FastCloseCycle): FastCloseQuote | null {
  const r = fastCloseRent(src, cycle);
  const d = fastDepositQuote(src);
  if (!r || !d) return null;
  return { ...r, originalDeposit: d.originalDeposit, deposit: d.deposit, depositDiscount: d.depositDiscount };
}

export const fastCloseQuotes = (src: FastCloseSource): FastCloseQuote[] =>
  FAST_CLOSE_CYCLES.map((c) => fastCloseQuote(src, c)).filter((q): q is FastCloseQuote => q !== null);

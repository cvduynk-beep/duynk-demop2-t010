/**
 * Công thức All-in Cost của VinStay AI (PRD §3.1):
 *   All-in = tiền thuê + phí quản lý (diện tích × 9.500đ) + phí gửi xe + dự toán điện nước (300k/người)
 */
export const HOLD_HOURS_DEFAULT = 48;   // chủ tịch chốt 2026-09-29 (legal/02 Điều 2.3 cho 12–72)
export const HOLD_HOURS_MIN = 12;
export const HOLD_HOURS_MAX = 72;
export const HOUR_MS = 3_600_000;
export const MANDATE_TERM_MONTHS = 12;  // legal/01 Điều 8.1–8.2
export const NON_CIRCUMVENTION_MONTHS = 6; // legal/01 Điều 6.3
export const OCCUPANTS_MAX = 5;
export const PAYMENT_CYCLES = [1, 3, 6] as const; // legal/06 Điều 3.2
export type PaymentCycle = (typeof PAYMENT_CYCLES)[number];
export const TENANT_MODIFY_LEAD_MS = 2 * 3_600_000; // + Đ13 — đổi/huỷ lịch trước ≥ 2 giờ

export const RATES = {
  mgmtPerM2: 9_500,
  motorbike: 150_000,
  car: 1_250_000,
  utilityPerPerson: 300_000,
  /** Cọc giữ chỗ chuyển 100% thành Security Deposit khi ký HĐ, KHÔNG trừ vào tiền thuê tháng đầu. */
  holdingDeposit: 2_000_000,
  /** Căn hời phân khu: rẻ hơn giá trung bình toà ≥ 10%. */
  bargainThreshold: 0.1,
} as const;

export interface Household {
  persons: number;
  motorbikes: number;
  cars: number;
}

export const DEFAULT_HOUSEHOLD: Household = { persons: 1, motorbikes: 1, cars: 0 };

export interface CostBreakdown {
  rent: number;
  mgmt: number;
  parking: number;
  utility: number;
  total: number;
}

import type { UnitLivingFees } from "./types";

export function allInCost(
  unit?: { rent?: number; areaM2?: number; livingFees?: UnitLivingFees } | null,
  hh: Household = DEFAULT_HOUSEHOLD,
): CostBreakdown {
  const rent = unit?.rent ?? 6_500_000;
  const areaM2 = unit?.areaM2 ?? 45;
  const mgmtRate = unit?.livingFees?.managementFeePerM2 ?? RATES.mgmtPerM2;
  const mgmt = Math.round(areaM2 * mgmtRate);
  const motorbikeRate = unit?.livingFees?.motorbikeFee ?? RATES.motorbike;
  const carRate = unit?.livingFees?.carFee ?? RATES.car;
  const parking = (hh.motorbikes ?? 1) * motorbikeRate + (hh.cars ?? 0) * carRate;
  const utility = (hh.persons ?? 2) * RATES.utilityPerPerson;
  return { rent, mgmt, parking, utility, total: rent + mgmt + parking + utility };
}

/** Tỷ lệ tiết kiệm so với giá trung bình toà (0.125 = rẻ hơn 12,5%). Âm nếu đắt hơn. */
export function savingsRatio(unit?: { rent?: number; marketAvg?: number } | null): number {
  if (!unit || !unit.marketAvg) return 0;
  return (unit.marketAvg - (unit.rent ?? 0)) / unit.marketAvg;
}

export const isBargain = (unit?: { rent?: number; marketAvg?: number } | null) => savingsRatio(unit) >= RATES.bargainThreshold - 1e-9;

export const savingsPct = (unit?: { rent?: number; marketAvg?: number } | null) => Math.round(savingsRatio(unit) * 100);

/**
 * Biểu phí phụ phí kỳ hạn thuê của VinStay AI:
 * - Dưới 3 tháng (ngắn hạn): +15% (bù chi phí bàn giao Hộ chiếu & rủi ro trống phòng giữa chu kỳ)
 * - 3 đến dưới 6 tháng (trung hạn ngắn): +8% (học kỳ ngắn / thực tập sinh)
 * - 6 đến dưới 12 tháng (trung hạn dài): +4% (học kỳ chính VinUni / dự án TechnoPark)
 * - Từ 12 tháng trở lên (cố định dài hạn): 100% Giá chuẩn (dòng tiền ổn định 1 năm)
 */
export const TERM_PREMIUM_RATES = {
  short: 0.15,    // < 3 tháng
  midShort: 0.08, // 3 - < 6 tháng
  midLong: 0.04,  // 6 - < 12 tháng
  long: 0.0,      // >= 12 tháng
} as const;

export function getTermPremiumRate(months: number): number {
  if (months < 3) return TERM_PREMIUM_RATES.short;
  if (months < 6) return TERM_PREMIUM_RATES.midShort;
  if (months < 12) return TERM_PREMIUM_RATES.midLong;
  return TERM_PREMIUM_RATES.long;
}

export function calculateRentForDuration(baseRent: number, months: number): number {
  if (!baseRent || baseRent <= 0) return 0;
  const premium = getTermPremiumRate(months);
  return Math.round((baseRent * (1 + premium)) / 50_000) * 50_000;
}

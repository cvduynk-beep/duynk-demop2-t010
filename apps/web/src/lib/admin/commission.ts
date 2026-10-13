import { api, apiErrorText, type ApiResponse } from "@/lib/apiClient";
import { invalidateApiPattern, useApiQuery, type Query } from "@/lib/query/useApiQuery";
import type { AdminFeeConfig, AdminPayoutStatement } from "./api";

// ─── Biến phí Field Host: tham số mà AdminPayoutService THỰC SỰ dùng để ghi thù lao ──────────────────────────
// Khoảng giá trị chép từ backend `FEE_RULES` (admin-fee.service.ts); backend vẫn kiểm lại và là nguồn chân lý.

// TẠM ẨN (2026-10-13): thù lao thẩm định và giờ cao điểm (host_inspection_fee, host_peak_hour_*) — backend vẫn đọc
// giá trị đang có trong fee_configs, chỉ là màn Admin chưa cho sửa.
export type FeeKey = "host_base_viewing_fee" | "host_deal_commission" | "host_rating_multiplier_5star" | "host_campaign_bonus";

export interface FeeField {
  key: FeeKey;
  title: string;
  help: string;
  unit: "đ" | "×";
  min: number;
  max: number;
  step: number;
  /** Thiếu khoá này thì backend không ghi được khoản thù lao tương ứng. */
  required?: boolean;
}

export const FEE_FIELDS: FeeField[] = [
  { key: "host_base_viewing_fee", title: "Thù lao dẫn khách theo lượt", help: "Trả cho mỗi ca xem phòng Host hoàn tất.", unit: "đ", min: 30_000, max: 100_000, step: 5_000, required: true },
  { key: "host_deal_commission", title: "Hoa hồng chốt cọc thành công", help: "Trả khi khách chuyển cọc giữ chỗ 2.000.000đ.", unit: "đ", min: 200_000, max: 1_000_000, step: 10_000, required: true },
  { key: "host_rating_multiplier_5star", title: "Hệ số thưởng đánh giá sao", help: "Nhân với hoa hồng cho Host từ 4,8 sao trở lên.", unit: "×", min: 1.1, max: 1.5, step: 0.05 },
  { key: "host_campaign_bonus", title: "Gói thưởng nóng theo chiến dịch", help: "Cộng thêm mỗi deal, tối đa 3 deal/tuần. Đặt 0 để tắt.", unit: "đ", min: 0, max: 1_000_000, step: 10_000 },
];

export const FEE_LABEL: Record<string, string> = Object.fromEntries(FEE_FIELDS.map((f) => [f.key, f.title]));

export function fmtFee(key: string, v: number | null): string {
  if (v === null) return "—";
  const f = FEE_FIELDS.find((x) => x.key === key);
  if (f?.unit === "×") return `×${String(v).replace(".", ",")}`;
  return `${new Intl.NumberFormat("vi-VN").format(v)}đ`;
}

export type FeeValues = Partial<Record<FeeKey, number>>;

export const feeValues = (configs: AdminFeeConfig[]): FeeValues =>
  Object.fromEntries(configs.filter((c) => FEE_FIELDS.some((f) => f.key === c.configKey)).map((c) => [c.configKey, c.paramValue])) as FeeValues;

/** Kiểm một giá trị nhập; null = hợp lệ. */
export function validateFee(f: FeeField, raw: string): string | null {
  const n = Number(raw);
  if (raw.trim() === "" || !Number.isFinite(n)) return "Nhập một số.";
  if (n < f.min || n > f.max) return `Trong khoảng ${fmtFee(f.key, f.min)} – ${fmtFee(f.key, f.max)}.`;
  return null;
}

/** Một deal của Host ≥ 4,8★: lượt dẫn + hoa hồng × hệ số sao + thưởng nóng — cùng cách AdminPayoutService ghi (ngoài giờ cao điểm). */
export function sampleDeal(v: FeeValues) {
  const viewing = v.host_base_viewing_fee ?? 0;
  const commission = v.host_deal_commission ?? 0;
  const ratingBonus = Math.round(commission * Math.max(0, (v.host_rating_multiplier_5star ?? 1) - 1));
  const campaign = v.host_campaign_bonus ?? 0;
  return { viewing, commission, ratingBonus, campaign, total: viewing + commission + ratingBonus + campaign };
}

// ─── Kỳ thanh toán (tuần ISO, giờ Việt Nam) — cùng quy tắc backend `isoWeekPeriod` ─────────────────────────

const ICT_OFFSET_MS = 7 * 3_600_000;

export function isoWeekPeriod(date: Date): string {
  const local = new Date(date.getTime() + ICT_OFFSET_MS);
  const d = new Date(Date.UTC(local.getUTCFullYear(), local.getUTCMonth(), local.getUTCDate()));
  const day = d.getUTCDay() || 7;
  d.setUTCDate(d.getUTCDate() + 4 - day);
  const yearStart = Date.UTC(d.getUTCFullYear(), 0, 1);
  const week = Math.ceil(((d.getTime() - yearStart) / 86_400_000 + 1) / 7);
  return `${d.getUTCFullYear()}-W${String(week).padStart(2, "0")}`;
}

/** Tuần hiện tại và `count − 1` tuần trước đó, mới nhất trước. */
export const recentPeriods = (now: number, count = 6): string[] =>
  Array.from({ length: count }, (_, i) => isoWeekPeriod(new Date(now - i * 7 * 86_400_000)));

// ─── Truy vấn & thao tác ────────────────────────────────────────────────────────────────────────────────────

export const usePayoutStatement = (period: string): Query<AdminPayoutStatement> =>
  useApiQuery({
    key: `admin-payouts:${period}`,
    fetch: () => api.get<AdminPayoutStatement>(`/admin/payouts?period=${encodeURIComponent(period)}`),
    errorText: (res: ApiResponse<AdminPayoutStatement>) => apiErrorText(res, "Không tải được bảng kê thù lao."),
  });

export const payoutCsvHref = (period: string) => `/api/v1/admin/payouts.csv?period=${encodeURIComponent(period)}`;

export const saveFee = (configKey: FeeKey, paramValue: number, reason: string) =>
  api.post<{ success: boolean }>("/admin/commission-engine/config", { configKey, paramValue, reason });

export const sweepPayouts = () =>
  api.post<{ viewingsScanned: number; depositsScanned: number; inspectionsScanned: number; created: number; skipped: number }>("/admin/payouts/sweep");

export function invalidateCommission() {
  invalidateApiPattern("admin-commission");
  invalidateApiPattern("admin-payouts");
  invalidateApiPattern("host-earnings");
}

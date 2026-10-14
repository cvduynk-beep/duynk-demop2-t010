import { vnd } from "@/lib/format";
import type { EarningsStats, HostEarnings } from "@/lib/admin/api";

/** "2026-W41" → "Tuần 41 / 2026"; chuỗi khác giữ nguyên. */
export function periodLabel(period: string | null | undefined): string {
  const m = /^(\d{4})-W(\d{2})$/.exec(period ?? "");
  return m ? `Tuần ${Number(m[2])} / ${m[1]}` : (period ?? "—");
}

const num = (v: number) => String(v).replace(".", ",");

/** Trạng thái cọc của một deal, cùng nhãn với luồng đặt lịch của khách. */
export const DEAL_STATUS: Record<string, { label: string; badge: string }> = {
  PAID_HOLDING: { label: "Đã cọc chốt căn", badge: "badge-kelp" },
  CONVERTED_TO_CONTRACT: { label: "Đã ký hợp đồng thuê", badge: "badge-kelp" },
  REFUNDED: { label: "Đã hoàn cọc", badge: "badge-neutral" },
  FORFEITED: { label: "Khách bỏ cọc", badge: "badge-neutral" },
};

export interface FormulaLine {
  key: string;
  label: string;
  formula: string;
  amount: number;
}

/**
 * Dựng "Cách tính thù lao" như bản mock: số lượng × đơn giá đang cấu hình, còn số tiền bên phải là tổng THẬT đã ghi sổ.
 * Hai bên lệch nhau khi có ca giờ vàng hoặc Admin đã đổi mức phí sau lúc ghi nhận ⇒ nói rõ thay vì để Host tự đoán.
 */
export function formulaLines(stats: EarningsStats, fees: HostEarnings["fees"], isInspector: boolean): FormulaLine[] {
  const unset = "Admin chưa cấu hình mức phí";
  const drift = (count: number, unitFee: number | null, total: number, peak?: boolean) => {
    if (unitFee == null || count * unitFee === total) return "";
    return peak && fees.peakMultiplier ? ` · gồm ca giờ vàng ×${num(fees.peakMultiplier)}` : " · theo mức phí lúc ghi nhận";
  };
  const lines: FormulaLine[] = [
    {
      key: "viewing",
      label: "Thù lao dẫn khách",
      formula:
        fees.baseViewingFee == null
          ? unset
          : `${stats.totalViewings} lượt × ${vnd(fees.baseViewingFee)}đ${drift(stats.totalViewings, fees.baseViewingFee, stats.viewingFeeTotal, true)}`,
      amount: stats.viewingFeeTotal,
    },
    {
      key: "deal",
      label: "Hoa hồng chốt cọc",
      formula:
        fees.dealCommission == null
          ? unset
          : `${stats.totalDeals} deal × ${vnd(fees.dealCommission)}đ${drift(stats.totalDeals, fees.dealCommission, stats.dealCommissionTotal)}`,
      amount: stats.dealCommissionTotal,
    },
    {
      key: "rating",
      label: "Thưởng đánh giá",
      formula:
        fees.ratingMultiplier == null || fees.dealCommission == null
          ? "Chưa bật hệ số thưởng đánh giá"
          : `${stats.ratingBonusCount} deal × ${vnd(fees.dealCommission)}đ × ${num(Math.round((fees.ratingMultiplier - 1) * 100) / 100)} (hệ số ×${num(fees.ratingMultiplier)} khi đạt ≥ ${num(fees.ratingMinAvg)}★)`,
      amount: stats.ratingBonus,
    },
    {
      key: "campaign",
      label: "Thưởng nóng chiến dịch",
      formula:
        fees.campaignBonus == null || fees.campaignBonus <= 0
          ? "Hiện không có chiến dịch"
          : `${stats.campaignBonusCount} deal × ${vnd(fees.campaignBonus)}đ (tối đa ${fees.campaignMaxDealsPerWeek} deal/tuần)`,
      amount: stats.campaignBonus,
    },
  ];
  if (isInspector) {
    lines.push({
      key: "inspection",
      label: "Thù lao thẩm định ký gửi",
      formula:
        fees.inspectionFee == null
          ? unset
          : `${stats.totalInspections} hồ sơ × ${vnd(fees.inspectionFee)}đ${drift(stats.totalInspections, fees.inspectionFee, stats.inspectionFeeTotal)}`,
      amount: stats.inspectionFeeTotal,
    });
  }
  return lines;
}

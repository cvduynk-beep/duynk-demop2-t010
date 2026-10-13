import { describe, expect, it } from "vitest";
import type { EarningsStats, HostEarnings } from "@/lib/admin/api";
import { DEAL_STATUS, formulaLines, periodLabel } from "@/lib/host/earnings";

const fees: HostEarnings["fees"] = {
  baseViewingFee: 50000,
  dealCommission: 400000,
  ratingMultiplier: 1.2,
  ratingMinAvg: 4.8,
  campaignBonus: 200000,
  campaignMaxDealsPerWeek: 3,
  inspectionFee: 150000,
  peakMultiplier: 1.5,
  peakStart: 18,
  peakEnd: 21,
};

const stats = (over: Partial<EarningsStats> = {}): EarningsStats => ({
  totalViewings: 2,
  viewingFeeTotal: 100000,
  totalDeals: 1,
  dealCommissionTotal: 400000,
  ratingBonusCount: 1,
  ratingBonus: 80000,
  campaignBonusCount: 1,
  campaignBonus: 200000,
  totalInspections: 0,
  inspectionFeeTotal: 0,
  totalEarnings: 780000,
  ...over,
});

const byKey = (lines: ReturnType<typeof formulaLines>) => Object.fromEntries(lines.map((l) => [l.key, l]));

describe("periodLabel", () => {
  it("đổi tuần ISO sang tiếng Việt", () => {
    expect(periodLabel("2026-W41")).toBe("Tuần 41 / 2026");
    expect(periodLabel("2026-W05")).toBe("Tuần 5 / 2026");
    expect(periodLabel(null)).toBe("—");
  });
});

describe("formulaLines — cách tính như bản mock", () => {
  it("số lượng × đơn giá, số tiền là tổng thật", () => {
    const l = byKey(formulaLines(stats(), fees, false));
    expect(l.viewing.formula).toBe("2 lượt × 50.000đ");
    expect(l.deal.formula).toBe("1 deal × 400.000đ");
    expect(l.rating.formula).toContain("× 0,2 (hệ số ×1,2 khi đạt ≥ 4,8★)");
    expect(l.campaign.formula).toBe("1 deal × 200.000đ (tối đa 3 deal/tuần)");
    expect(l.inspection).toBeUndefined();
  });

  it("lệch do giờ vàng thì nói rõ", () => {
    const l = byKey(formulaLines(stats({ viewingFeeTotal: 125000 }), fees, false));
    expect(l.viewing.formula).toContain("gồm ca giờ vàng ×1,5");
    expect(l.viewing.amount).toBe(125000);
  });

  it("thiếu cấu hình thì báo chưa cấu hình, Thẩm định chỉ hiện cho inspector", () => {
    const l = byKey(formulaLines(stats(), { ...fees, baseViewingFee: null, campaignBonus: 0 }, true));
    expect(l.viewing.formula).toBe("Admin chưa cấu hình mức phí");
    expect(l.campaign.formula).toBe("Hiện không có chiến dịch");
    expect(l.inspection.formula).toBe("0 hồ sơ × 150.000đ");
  });
});

describe("DEAL_STATUS", () => {
  it("dùng đúng nhãn như bản mock", () => {
    expect(DEAL_STATUS.PAID_HOLDING.label).toBe("Đã cọc giữ chỗ");
    expect(DEAL_STATUS.CONVERTED_TO_CONTRACT.label).toBe("Đã ký hợp đồng thuê");
  });
});

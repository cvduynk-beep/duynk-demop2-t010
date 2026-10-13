import { describe, expect, it } from "vitest";
import { FEE_FIELDS, feeValues, fmtFee, isoWeekPeriod, recentPeriods, sampleDeal, validateFee } from "@/lib/admin/commission";

const field = (k: string) => FEE_FIELDS.find((f) => f.key === k)!;

describe("lib/admin/commission", () => {
  it("4 tham số chính; thưởng nóng ghi đúng khoá host_campaign_bonus (không map nhầm sang giờ cao điểm)", () => {
    expect(FEE_FIELDS.map((f) => f.key)).toEqual(["host_base_viewing_fee", "host_deal_commission", "host_rating_multiplier_5star", "host_campaign_bonus"]);
    expect(field("host_campaign_bonus").unit).toBe("đ");
  });

  it("feeValues bỏ khoá lạ trong fee_configs", () => {
    const v = feeValues([
      { id: "1", configKey: "host_deal_commission", paramValue: 450_000, paramUnit: "VND/cọc", updatedAt: "" },
      { id: "2", configKey: "mgmt_fee_per_m2", paramValue: 9_500, paramUnit: "đ/m2", updatedAt: "" },
    ]);
    expect(v).toEqual({ host_deal_commission: 450_000 });
  });

  it("validateFee theo khoảng FEE_RULES của backend", () => {
    expect(validateFee(field("host_deal_commission"), "450000")).toBeNull();
    expect(validateFee(field("host_deal_commission"), "100000")).not.toBeNull();
    expect(validateFee(field("host_campaign_bonus"), "0")).toBeNull();
    expect(validateFee(field("host_campaign_bonus"), "")).not.toBeNull();
  });

  it("sampleDeal: lượt dẫn + hoa hồng + hoa hồng × (hệ số − 1) + thưởng nóng", () => {
    const d = sampleDeal({ host_base_viewing_fee: 50_000, host_deal_commission: 400_000, host_rating_multiplier_5star: 1.2, host_campaign_bonus: 100_000 });
    expect(d).toEqual({ viewing: 50_000, commission: 400_000, ratingBonus: 80_000, campaign: 100_000, total: 630_000 });
  });

  it("isoWeekPeriod theo giờ Việt Nam (khớp backend)", () => {
    expect(isoWeekPeriod(new Date("2026-10-13T00:00:00Z"))).toBe("2026-W42");
    // 23:30 UTC Chủ nhật = 06:30 thứ Hai giờ VN ⇒ đã sang tuần mới
    expect(isoWeekPeriod(new Date("2026-10-11T23:30:00Z"))).toBe("2026-W42");
    expect(isoWeekPeriod(new Date("2026-10-11T16:00:00Z"))).toBe("2026-W41");
    expect(recentPeriods(Date.parse("2026-10-13T00:00:00Z"), 3)).toEqual(["2026-W42", "2026-W41", "2026-W40"]);
  });

  it("fmtFee", () => {
    expect(fmtFee("host_rating_multiplier_5star", 1.2)).toBe("×1,2");
    expect(fmtFee("host_deal_commission", null)).toBe("—");
  });
});

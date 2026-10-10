import { describe, expect, it } from "vitest";
import { getBuildingKnowledge, getUnitLivingInsights } from "@/lib/property/livingIntelligence";
import { unitById } from "@/lib/mock/units";

describe("livingIntelligence - Building & Living Experience Engine", () => {
  it("1. Lấy dữ liệu cự ly thực tế chính xác cho từng tòa", () => {
    // Tòa S1.08: Sapphire 1
    const s108 = getBuildingKnowledge("S1.08", "sapphire1");
    expect(s108.vinUni.distanceM).toBe(800);
    expect(s108.vinBusStation.distanceM).toBe(20);
    expect(s108.parking.motorbike).toContain("Hầm");
    expect(s108.parking.car).toContain("Nhà để xe nổi");

    // Tòa S2.15: Sát cổng VinUni
    const s215 = getBuildingKnowledge("S2.15", "sapphire2");
    expect(s215.vinUni.distanceM).toBe(400);
    expect(s215.vinUni.walkMin).toBe(4);

    // Tòa S2.03: Sát tháp TechnoPark
    const s203 = getBuildingKnowledge("S2.03", "sapphire2");
    expect(s203.technoPark.distanceM).toBe(250);
    expect(s203.technoPark.walkMin).toBe(3);
  });

  it("2. Phân tích thông minh không gian sống theo layout và tầng cao", () => {
    const unit1PNPlus = unitById("s1-08-26-2614");
    if (unit1PNPlus) {
      const insights = getUnitLivingInsights(unit1PNPlus);
      // Layout 1PN+ có highlight góc +1
      expect(insights.layoutInsight.badge).toContain("Góc +1");
      expect(insights.layoutInsight.plusOneHighlight).toBeDefined();

      // Tầng 26 là tầng cao
      expect(insights.floorInsight.level).toBe("high");
      expect(insights.floorInsight.title).toContain("Tầng 26");

      // Hướng Đông Nam
      expect(insights.directionInsight.description).toContain("mát");

      // Đối tượng phù hợp có VinUni
      expect(insights.bestFor.some((item) => item.includes("VinUni"))).toBe(true);
    }
  });

  it("3. Nhận diện ngữ cảnh tìm kiếm khi khách tìm gần VinUni", () => {
    const unit = unitById("s1-08-26-2614");
    if (unit) {
      const insights = getUnitLivingInsights(unit, {
        layouts: [],
        zones: [],
        buildings: [],
        items: [],
        household: { persons: 1, motorbikes: 1, cars: 0 },
        nearLocation: "đại học vinuni",
      });

      expect(insights.contextMatch).toBeDefined();
      expect(insights.contextMatch?.matchedTarget).toBe("Đại học VinUni");
      expect(insights.contextMatch?.headline).toContain("VinUni");
    }
  });
});

import { describe, expect, it } from "vitest";
import { mapDbUnitToFrontendUnit, parseLayoutKind } from "@/lib/property/unitAdapter";
import { UNITS } from "@/lib/mock/units";

describe("unitAdapter - Database to Frontend Mapper", () => {
  it("1. parseLayoutKind chuẩn hoá các kiểu layout Prisma", () => {
    expect(parseLayoutKind("STUDIO")).toEqual({ layout: "Studio", layoutLabel: "Studio" });
    expect(parseLayoutKind("ONE_BED_PLUS")).toEqual({ layout: "1PN", layoutLabel: "1PN+" });
    expect(parseLayoutKind("ONE_BED")).toEqual({ layout: "1PN", layoutLabel: "1 phòng ngủ" });
    expect(parseLayoutKind("TWO_BED_ONE_BATH")).toEqual({ layout: "2PN", layoutLabel: "2PN (1WC)" });
    expect(parseLayoutKind("TWO_BED_TWO_BATH")).toEqual({ layout: "2PN", layoutLabel: "2 phòng ngủ" });
    expect(parseLayoutKind("THREE_BED")).toEqual({ layout: "3PN", layoutLabel: "3 phòng ngủ" });
    expect(parseLayoutKind(undefined)).toEqual({ layout: "2PN", layoutLabel: "2 phòng ngủ" });
  });

  it("2. mapDbUnitToFrontendUnit ánh xạ chuẩn từ bản ghi Prisma DB sang Unit model", () => {
    const rawDbUnit = {
      id: "test-uuid-001",
      unitCode: "VHOP-S1.02-12A08",
      floorNumber: 12,
      layoutType: "ONE_BED_PLUS",
      carpetAreaM2: "47.0",
      baseRentPrice: "6500000",
      marketAvgPrice: "7300000",
      doorLockType: "ELECTRONIC_PIN",
      status: "AVAILABLE",
      updatedAt: "2026-10-04T10:30:21.349Z",
      building: {
        buildingCode: "S1.02",
        zoneName: "The Sapphire 1",
      },
      media: [
        { url: "https://images.unsplash.com/photo-1522708323590", order: 1 },
      ],
    };

    const unit = mapDbUnitToFrontendUnit(rawDbUnit);

    expect(unit.id).toBe("test-uuid-001");
    expect(unit.code).toBe("VHOP-S1.02-12A08");
    expect(unit.building).toBe("S1.02");
    expect(unit.zoneId).toBe("sapphire1");
    expect(unit.floor).toBe(12);
    expect(unit.door).toBe("08");
    expect(unit.layout).toBe("1PN");
    expect(unit.layoutLabel).toBe("1PN+");
    expect(unit.areaM2).toBe(47);
    expect(unit.rent).toBe(6500000);
    expect(unit.marketAvg).toBe(7300000);
    expect(unit.baseStatus).toBe("available");
    expect(unit.lock).toBe("smart");
    expect(unit.mediaUrls).toHaveLength(1);
    expect(unit.mediaUrls?.[0]).toBe("https://images.unsplash.com/photo-1522708323590");
  });

  it("3. mapDbUnitToFrontendUnit an toàn với dữ liệu thiếu hoặc null", () => {
    const brokenDbUnit = {
      id: "broken-id",
    };

    const unit = mapDbUnitToFrontendUnit(brokenDbUnit);
    expect(unit.id).toBe("broken-id");
    expect(unit.building).toBe("S1.02");
    expect(unit.zoneId).toBe("sapphire1");
    expect(unit.rent).toBe(6000000);
    expect(unit.areaM2).toBe(45);
    expect(unit.baseStatus).toBe("available");
  });
});

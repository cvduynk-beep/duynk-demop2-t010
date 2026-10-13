import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { LANDLORD_ITEMS, landlordItemLabels, landlordItemsToCodes } from "@/lib/inspection/landlordItems";

/** Tên hạng mục catalog backend theo mã — nguồn chân lý để bảng map không trỏ nhầm món. */
const CATALOG: Record<string, string> = (() => {
  const src = readFileSync(join(__dirname, "../../../../backend/src/modules/inspection/inspection.catalog.ts"), "utf8");
  const out: Record<string, string> = {};
  for (const m of src.matchAll(/code:\s*["'](\d+)["'][^}]*?name:\s*["']([^"']+)["']/g)) out[m[1]] = m[2];
  return out;
})();

describe("Tình trạng nội thất bàn giao ⇄ mã bảng kê thẩm định", () => {
  it("mọi mã map đều có trong catalog backend và đúng loại món", () => {
    const expectName: Record<string, RegExp> = {
      ac: /Điều hòa/, fridge: /Tủ lạnh/, washer: /Máy giặt/, kitchen: /Bếp|hút mùi/, heater: /nước nóng/,
      bed: /Giường|Đệm/, wardrobe: /Tủ quần áo/, sofa: /Sofa|Bàn trà/, dining: /bàn ghế ăn/, curtains: /Rèm|Giàn phơi/,
    };
    for (const item of LANDLORD_ITEMS) {
      for (const code of item.codes) {
        expect(CATALOG[code], `${item.key} → ${code}`).toBeDefined();
        expect(CATALOG[code], `${item.key} → ${code}`).toMatch(expectName[item.key]);
      }
    }
  });

  it("chủ nhà tick ac + heater ⇒ 3 mã (2 điều hoà + bình nóng lạnh), sắp xếp, không trùng", () => {
    expect(landlordItemsToCodes(["heater", "ac", "ac"])).toEqual(["17", "23", "24"]);
    expect(landlordItemsToCodes([])).toEqual([]);
    expect(landlordItemsToCodes(["unknown"])).toEqual([]);
  });

  it("mã đã khai ⇒ tên món chủ nhà hiểu (cho banner thẩm định)", () => {
    expect(landlordItemLabels(["17", "23", "24"])).toEqual(["Điều hòa Inverter", "Bình nóng lạnh"]);
    expect(landlordItemLabels(["25"])).toEqual([]);
  });
});

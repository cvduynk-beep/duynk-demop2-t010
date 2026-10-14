import { describe, expect, it } from "vitest";
import { effectiveZones, scopeSummary } from "@/lib/host/zoneScope";
import { knownErrorMessage } from "@/components/auth/authApi";

describe("Phạm vi phân khu của Host (UX, khớp backend host-scope)", () => {
  it("selected: phân khu chính luôn đứng đầu, bỏ trùng và bỏ phân khu chính trong danh sách chọn", () => {
    expect(effectiveZones("The Sapphire 1", "selected", ["The Zenpark", "The Sapphire 1", "The Zenpark"])).toEqual(["The Sapphire 1", "The Zenpark"]);
    expect(effectiveZones("The Sapphire 1", "selected", [])).toEqual(["The Sapphire 1"]);
  });

  it("all = wildcard (null), mô tả nêu rõ gồm cả phân khu mở sau", () => {
    expect(effectiveZones("The Sapphire 1", "all", ["The Zenpark"])).toBeNull();
    expect(scopeSummary(null, 6)).toContain("phân khu mở sau");
    expect(scopeSummary(["The Sapphire 1", "The Zenpark"], 6)).toBe("2/6 phân khu: The Sapphire 1, The Zenpark");
  });

  it("409 zone_scope_conflict có câu hướng dẫn tiếng Việt", () => {
    expect(knownErrorMessage("zone_scope_conflict", "x")).toContain("quản trị viên khác");
  });
});

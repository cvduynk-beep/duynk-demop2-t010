import { describe, expect, it } from "vitest";
import { hostDisplayStatus } from "@/lib/admin/hosts";
import { consignmentHref, CONSIGN_PREFIX, inventoryQueries, isInspectOverdue, layoutKindOf, unitTitle } from "@/lib/admin/inventory";

describe("lib/admin/inventory", () => {
  it("unitTitle: suy số căn từ mã căn giống backend doorFromCode", () => {
    expect(unitTitle({ building: "S1.02", floorNumber: 7, doorNumber: null, unitCode: "VHOP-S1.02-0701" })).toBe("S1.02 · Tầng 7 · Căn 01");
    expect(unitTitle({ building: "S1.02", floorNumber: 12, doorNumber: null, unitCode: "VHOP-S1.02-1208" })).toBe("S1.02 · Tầng 12 · Căn 08");
    expect(unitTitle({ building: "S2", floorNumber: 3, doorNumber: "A5", unitCode: "X-0305" })).toBe("S2 · Tầng 3 · Căn A5");
  });

  it("layoutKindOf: enum Prisma → nhãn web", () => {
    expect(layoutKindOf("STUDIO")).toBe("Studio");
    expect(layoutKindOf("TWO_BED_TWO_BATH")).toBe("2PN");
    expect(layoutKindOf("THREE_BED")).toBe("3PN");
  });

  it("isInspectOverdue: chỉ khi chưa nộp phiếu và quá hạn 48h", () => {
    const now = Date.parse("2026-10-13T10:00:00Z");
    const due = "2026-10-13T09:00:00Z";
    expect(isInspectOverdue({ status: "awaiting_host", inspectDueAt: due }, now)).toBe(true);
    expect(isInspectOverdue({ status: "inspecting", inspectDueAt: due }, now)).toBe(true);
    expect(isInspectOverdue({ status: "reviewing", inspectDueAt: due }, now)).toBe(false);
    expect(isInspectOverdue({ status: "inspecting", inspectDueAt: "2026-10-14T00:00:00Z" }, now)).toBe(false);
    expect(isInspectOverdue({ status: "inspecting", inspectDueAt: null }, now)).toBe(false);
  });

  it("hồ sơ ký gửi dùng tiền tố riêng trên route chi tiết, gọi đúng endpoint", () => {
    expect(consignmentHref("m1")).toBe(`/admin/inventory/${CONSIGN_PREFIX}m1`);
    expect(inventoryQueries.consignment("m 1").key).toBe("admin-inventory:consignment:m 1");
  });
});

describe("lib/admin/hosts — hostDisplayStatus", () => {
  it("khoá tài khoản luôn thắng trạng thái ca trực", () => {
    expect(hostDisplayStatus({ isActive: false, dutyStatus: "ONLINE_AVAILABLE" })).toBe("suspended");
    expect(hostDisplayStatus({ isActive: true, dutyStatus: "ONLINE_AVAILABLE" })).toBe("active");
    expect(hostDisplayStatus({ isActive: true, dutyStatus: "BUSY_VIEWING" })).toBe("busy");
    expect(hostDisplayStatus({ isActive: true, dutyStatus: "OFF_DUTY" })).toBe("off_duty");
  });
});

describe("lib/admin/inventory — unitStatusMeta", () => {
  it("UNLISTED tách nghĩa theo ủy quyền; trạng thái khác giữ nguyên", async () => {
    const { unitStatusMeta } = await import("@/lib/admin/inventory");
    expect(unitStatusMeta("UNLISTED", "PENDING_INSPECTION").label).toBe("Chờ thẩm định");
    expect(unitStatusMeta("UNLISTED", "TERMINATED").label).toBe("Ngừng niêm yết");
    expect(unitStatusMeta("UNLISTED", "NONE").label).toBe("Chưa niêm yết");
    expect(unitStatusMeta("HOLDING", "ACTIVE").label).toBe("Đang giữ căn");
  });
});

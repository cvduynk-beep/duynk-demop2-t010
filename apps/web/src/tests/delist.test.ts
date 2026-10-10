import { beforeEach, describe, expect, it, vi } from "vitest";

const mem = new Map<string, string>();
vi.stubGlobal("window", {
  localStorage: {
    getItem: (k: string) => mem.get(k) ?? null,
    setItem: (k: string, v: string) => void mem.set(k, v),
    removeItem: (k: string) => void mem.delete(k),
  },
  addEventListener: () => {},
});

import { adminDelistUnit, adminRelistUnit } from "@/lib/mock/actions";
import { searchUnits } from "@/lib/mock/matchmaker";
import { getMockState, resetMockState, setMockState } from "@/lib/mock/store";
import { unitStatus } from "@/lib/mock/selectors";
import { UNITS } from "@/lib/mock/units";

beforeEach(() => {
  mem.clear();
  resetMockState();
});

describe("Admin Delist & Archive Unit (Ngừng niêm yết / Lưu trữ căn hộ)", () => {
  it("Pre-flight: Chặn ngừng niêm yết nếu căn đang giữ chỗ (holding)", () => {
    const unit = UNITS[0];
    setMockState((prev) => ({
      ...prev,
      unitState: {
        ...prev.unitState,
        [unit.id]: { status: "holding", holdingUntil: new Date(Date.now() + 3600000).toISOString() },
      },
    }));

    const res = adminDelistUnit(unit.id, "landlord_exit", "Chủ nhà lấy lại nhà", "Admin Test");
    expect(res.ok).toBe(false);
    expect(res.reason).toContain("giữ chỗ");
  });

  it("Pre-flight: Chặn ngừng niêm yết nếu căn đang có hợp đồng thuê (rented)", () => {
    const unit = UNITS[0];
    setMockState((prev) => ({
      ...prev,
      unitState: {
        ...prev.unitState,
        [unit.id]: { status: "rented" },
      },
    }));

    const res = adminDelistUnit(unit.id, "personal_use", "Chủ nhà lấy lại ở", "Admin Test");
    expect(res.ok).toBe(false);
    expect(res.reason).toContain("hợp đồng thuê");
  });

  it("Pre-flight: Chặn ngừng niêm yết nếu căn đang có ca xem phòng đang mở (open booking)", () => {
    const unit = UNITS[0];
    setMockState((prev) => ({
      ...prev,
      bookings: [
        ...prev.bookings,
        {
          id: "b-test-open",
          ref: "VS-TEST",
          unitId: unit.id,
          tenant: { name: "Nguyễn Văn A", phone: "0912345678", persons: 1 },
          hostId: "H01",
          slot: new Date(Date.now() + 3600000).toISOString(),
          status: "confirmed",
          createdAt: new Date().toISOString(),
        },
      ],
    }));

    const res = adminDelistUnit(unit.id, "unit_sold", "Căn đã bán", "Admin Test");
    expect(res.ok).toBe(false);
    expect(res.reason).toContain("ca xem phòng");
  });

  it("Delist thành công: Đưa căn vào archivedUnits, ẩn khỏi searchUnits và bảo lưu hồ sơ", () => {
    const unit = UNITS.find((u) => u.baseStatus === "available")!;
    setMockState((prev) => {
      const nextUnitState = { ...prev.unitState };
      delete nextUnitState[unit.id];
      const nextArchived = { ...prev.archivedUnits };
      delete nextArchived[unit.id];
      return {
        ...prev,
        unitState: nextUnitState,
        archivedUnits: nextArchived,
        bookings: prev.bookings.filter((b) => b.unitId !== unit.id),
      };
    });

    const res = adminDelistUnit(unit.id, "landlord_exit", "Chủ nhà gửi văn bản chấm dứt ủy quyền", "Admin Test");
    expect(res.ok).toBe(true);

    const state = getMockState();
    expect(state.archivedUnits?.[unit.id]).toBeDefined();
    expect(state.archivedUnits?.[unit.id].reason).toBe("landlord_exit");
    expect(unitStatus(state, unit.id)).toBe("archived");

    const matches = searchUnits(
      { layouts: [], zones: [], buildings: [], items: [], household: { persons: 1, motorbikes: 1, cars: 0 } },
      (u) => unitStatus(state, u),
      UNITS
    );
    expect(matches.some((m) => m.unit.id === unit.id)).toBe(false);
  });

  it("Relist thành công: Hoàn tác lưu trữ, đưa căn trở lại rổ hàng", () => {
    const unit = UNITS.find((u) => u.baseStatus === "available")!;
    setMockState((prev) => ({
      ...prev,
      archivedUnits: {
        ...prev.archivedUnits,
        [unit.id]: {
          unitId: unit.id,
          archivedAt: new Date().toISOString(),
          archivedBy: "Admin Test",
          reason: "maintenance",
          reasonLabel: "Bảo trì / Sửa chữa lớn",
          note: "Sơn sửa nhà",
        },
      },
      unitState: {
        ...prev.unitState,
        [unit.id]: { status: "archived" },
      },
    }));

    const res = adminRelistUnit(unit.id, "Admin Test");
    expect(res.ok).toBe(true);

    const state = getMockState();
    expect(state.archivedUnits?.[unit.id]).toBeUndefined();
    expect(unitStatus(state, unit.id)).toBe("available");
  });
});

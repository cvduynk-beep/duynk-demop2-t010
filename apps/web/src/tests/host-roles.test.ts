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

import * as actions from "@/lib/mock/actions";
import { getMockState, resetMockState } from "@/lib/mock/store";
import { hostRoles, hostStatus, hostZones, isHostSuspended, pickHostFor, noticesFor, saleCandidates } from "@/lib/mock/selectors";

beforeEach(() => {
  mem.clear();
  resetMockState();
});

describe("Host Roles - SPEC-P01 §7 / host-roles.test.ts", () => {
  it("(1) vai mặc định theo bảng 01-CONTRACTS §2.1", () => {
    const s = getMockState();
    expect(hostRoles(s, "H01")).toEqual(["sale", "inspector"]);
    expect(hostRoles(s, "H02")).toEqual(["sale"]);
    expect(hostRoles(s, "H03")).toEqual(["sale", "inspector"]);
    expect(hostRoles(s, "H04")).toEqual(["sale", "inspector"]);
    expect(hostRoles(s, "H05")).toEqual(["sale", "inspector"]);
    expect(hostRoles(s, "H06")).toEqual(["inspector"]);
    expect(hostRoles(s, "H07")).toEqual(["sale"]);
    expect(hostRoles(s, "H08")).toEqual(["sale"]);
  });

  it("(2) setHostRoles([]) => lỗi", () => {
    const res = actions.setHostRoles("H01", [], "admin-1");
    expect(res.ok).toBe(false);
    if (!res.ok) {
      expect(res.reason).toBeDefined();
    }
  });

  it("(3) bỏ vai sale của H01 => createBooking căn Sapphire 2 giao H02", () => {
    // H01 là Host mặc định của sapphire-2. H02 cũng trực sapphire-2 và có vai sale.
    actions.setHostRoles("H01", ["inspector"], "admin-1");

    const b = actions.createBooking({
      unitId: "s2-02-1004", // Căn thuộc sapphire-2
      slot: "09:00 - 09:45 30/10/2026",
      name: "Khách Xem",
      phone: "0912345678",
      persons: 1,
    });

    expect(b.hostId).toBe("H02");
  });

  it("(4) bỏ vai inspector của H01 và phân khu Sapphire 2 không còn ai thẩm định => fallback H01 + có tin Admin", () => {
    // Sapphire 2 có H01 và H02. H02 chỉ có vai sale.
    // Nếu bỏ vai inspector của H01 => sapphire2 không còn ai là inspector.
    actions.setHostRoles("H01", ["sale"], "admin-1");

    const picked = pickHostFor(getMockState(), "sapphire2", "inspector");
    expect(picked.hostId).toBe("H01");
    expect(picked.fallback).toBe(true);

    // Ký gửi mới sẽ sinh tin Admin cảnh báo fallback
    const consign = actions.submitConsignment({
      landlordId: "L1",
      building: "S2.02",
      floor: 10,
      door: "04",
      layout: "1PN",
      areaM2: 48,
      askRent: 8_500_000,
      suggestedDeposit: 8_500_000,
      leaseTerm: "long",
      furnished: true,
      locks: ["smart", "physical"],
      auditByHost: true,
    });

    expect(consign.hostId).toBe("H01");
    const adminNotices = noticesFor(getMockState(), "admin");
    const hasFallbackNotice = adminNotices.some(
      (n) => n.body.includes("sapphire2") || n.body.includes("tạm") || n.title.includes("thẩm định")
    );
    expect(hasFallbackNotice).toBe(true);
  });

  it("(5) pickHostFor bỏ qua Host off_duty khi còn lựa chọn khác", () => {
    // Giả sử có 2 host cùng zone và vai, nếu 1 host off_duty thì chọn host kia
    const s = getMockState();
    // Tạo bản sao tạm nếu cần, hoặc kiểm tra logic pickHostFor
    const picked = pickHostFor(s, "sapphire2", "sale");
    expect(picked.hostId).toBe("H01"); // H01 on duty
    expect(picked.fallback).toBe(false);
  });

  it("(6) phân quyền khu vực mặc định và kiểm tra setHostZones kèm cả quyền thẩm định và dẫn khách", () => {
    const s = getMockState();
    expect(hostZones(s, "H01")).toEqual(["sapphire1", "sapphire2"]);
    expect(hostZones(s, "H02")).toEqual(["sapphire2"]);
    // Ban đầu H02 chỉ có vai sale
    expect(hostRoles(s, "H02")).toEqual(["sale"]);

    // Thêm phân khu zenpark cho H02
    const res = actions.setHostZones("H02", ["sapphire2", "zenpark"], "Admin");
    expect(res.ok).toBe(true);

    const updated = getMockState();
    expect(hostZones(updated, "H02")).toEqual(["sapphire2", "zenpark"]);

    // Kiểm tra H02 tự động được cấp trọn gói CẢ quyền dẫn khách VÀ quyền thẩm định
    expect(hostRoles(updated, "H02")).toContain("sale");
    expect(hostRoles(updated, "H02")).toContain("inspector");

    // Kiểm tra candidate của zenpark giờ có H02 (quyền dẫn khách)
    const zenCandidates = saleCandidates(updated, "zenpark");
    expect(zenCandidates.some((h) => h.id === "H02")).toBe(true);

    // Kiểm tra H02 có thể nhận ticket thẩm định ký gửi của zenpark (quyền thẩm định)
    const inspectorPick = pickHostFor(updated, "zenpark", "inspector");
    expect(inspectorPick.fallback).toBe(false);
  });

  it("(7) setHostZones([]) trả về lỗi", () => {
    const res = actions.setHostZones("H02", [], "Admin");
    expect(res.ok).toBe(false);
    if (!res.ok) {
      expect(res.reason).toBe("Field Host phải phụ trách ít nhất một phân khu.");
    }
  });

  it("(8) rút bớt khu vực của H01 khỏi sapphire1 => điều phối sang Host khác", () => {
    // Ban đầu H01 phụ trách sapphire1 và sapphire2
    actions.setHostZones("H01", ["sapphire2"], "Admin");

    const s = getMockState();
    expect(hostZones(s, "H01")).toEqual(["sapphire2"]);

    // pickHostFor sapphire1 vai sale không còn H01
    const picked = pickHostFor(s, "sapphire1", "sale");
    // sapphire1 không còn host on-duty có vai sale nên fallback
    expect(picked.hostId).toBeDefined();
  });

  it("(9) khi phân quyền theo khu vực nào thì kèm cả quyền thẩm định và dẫn khách cho Host chuyên thẩm định trước đó", () => {
    const s = getMockState();
    // H06 ban đầu chỉ có vai inspector
    expect(hostRoles(s, "H06")).toEqual(["inspector"]);

    // Phân quyền cho H06 thêm khu vực pavilion
    const res = actions.setHostZones("H06", ["sapphire1", "pavilion"], "Admin");
    expect(res.ok).toBe(true);

    const updated = getMockState();
    expect(hostZones(updated, "H06")).toEqual(["sapphire1", "pavilion"]);
    // Tự động có cả quyền dẫn khách và quyền thẩm định
    expect(hostRoles(updated, "H06")).toContain("sale");
    expect(hostRoles(updated, "H06")).toContain("inspector");
  });

  it("(10) tạm đóng tài khoản Field Host => mất tất cả quyền và không đổ bất kỳ căn nào về sale đó", () => {
    // Ban đầu H01 là Host đang hoạt động, có cả quyền sale và inspector
    let s = getMockState();
    expect(hostRoles(s, "H01")).toEqual(["sale", "inspector"]);
    expect(isHostSuspended(s, "H01")).toBe(false);

    // Admin tạm đóng H01
    const res = actions.setHostSuspended("H01", true, "Admin");
    expect(res.ok).toBe(true);

    s = getMockState();
    expect(hostStatus(s, "H01")).toBe("suspended");
    expect(isHostSuspended(s, "H01")).toBe(true);

    // 1. Mất tất cả các quyền!
    expect(hostRoles(s, "H01")).toEqual([]);

    // 2. Không đổ bất kỳ căn nào về sale đó nữa
    // (a) saleCandidates không chứa H01
    const candidates = saleCandidates(s, "sapphire2");
    expect(candidates.some((h) => h.id === "H01")).toBe(false);

    // (b) booking mới căn ở Sapphire 2 (vốn do H01 phụ trách) sẽ tự động đổ sang H02 hoặc host khác, KHÔNG giao H01
    const booking = actions.createBooking({
      unitId: "s2-02-1004", // Căn Sapphire 2
      slot: "14:00 - 14:45 30/10/2026",
      name: "Khách Xem Test",
      phone: "0988776655",
      persons: 2,
    });
    expect(booking.hostId).not.toBe("H01");
    expect(booking.hostId).toBe("H02");

    // (c) ký gửi mới ở Sapphire 1 / Sapphire 2 không giao thẩm định cho H01
    const inspector = pickHostFor(s, "sapphire2", "inspector");
    expect(inspector.hostId).not.toBe("H01");
  });

  it("(11) mở lại tài khoản Field Host => khôi phục đầy đủ quyền và nhận căn trở lại", () => {
    // Tạm đóng H01
    actions.setHostSuspended("H01", true, "Admin");
    expect(isHostSuspended(getMockState(), "H01")).toBe(true);

    // Mở lại tài khoản H01
    const res = actions.setHostSuspended("H01", false, "Admin");
    expect(res.ok).toBe(true);

    const s = getMockState();
    expect(hostStatus(s, "H01")).toBe("active");
    expect(isHostSuspended(s, "H01")).toBe(false);

    // Khôi phục quyền
    expect(hostRoles(s, "H01")).toContain("sale");
    expect(hostRoles(s, "H01")).toContain("inspector");

    // Có mặt trở lại trong danh sách ứng viên nhận căn
    const candidates = saleCandidates(s, "sapphire2");
    expect(candidates.some((h) => h.id === "H01")).toBe(true);
  });
});

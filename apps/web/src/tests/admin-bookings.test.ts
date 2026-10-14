import { describe, expect, it } from "vitest";
import type { ApiResponse } from "@/lib/apiClient";
import { bookingQueries, pageCount, reassignOutcome, validateReassign, webStatus, type AdminBookingRow } from "@/lib/admin/bookings";

const row = (over: Partial<AdminBookingRow> = {}): AdminBookingRow => ({
  viewingId: "v1",
  bookingRef: "VS-0001",
  slot: "2026-10-13T07:00:00Z",
  viewingStatus: "CONFIRMED",
  createdAt: "2026-10-13T02:00:00Z",
  unit: { code: "VHOP-S1.02-1208", building: "S1.02", zone: "The Sapphire 1" },
  tenant: { name: "Khách", phoneMasked: "09•• ••• 678" },
  ticket: null,
  version: "ver-1",
  canReassign: true,
  reassignBlockedReason: null,
  lastReassign: null,
  ...over,
});
const res = (over: Partial<ApiResponse<AdminBookingRow>>): ApiResponse<AdminBookingRow> => ({ ok: false, status: 500, data: {} as AdminBookingRow, ...over });

describe("admin bookings — kết quả giao lại → hành vi UI", () => {
  it("200 ⇒ ok kèm dòng đã cập nhật từ server", () => {
    const r = row({ version: "ver-2" });
    expect(reassignOutcome(res({ ok: true, status: 200, data: r }))).toEqual({ kind: "ok", row: r });
  });

  it("409 reassign_conflict ⇒ conflict kèm dữ liệu mới nhất (không coi là thành công)", () => {
    const latest = row({ version: "ver-9" });
    const out = reassignOutcome(res({ status: 409, code: "reassign_conflict", message: "Lịch xem vừa được người khác thay đổi.", errors: { latest } }));
    expect(out).toEqual({ kind: "conflict", message: "Lịch xem vừa được người khác thay đổi.", latest });
  });

  it("422 reassign_target_invalid / 400 invalid_request ⇒ lỗi theo field", () => {
    expect(reassignOutcome(res({ status: 422, code: "reassign_target_invalid", message: "x", errors: { hostId: "Field Host không ở trạng thái sẵn sàng nhận ca." } }))).toEqual({
      kind: "field",
      message: "x",
      errors: { hostId: "Field Host không ở trạng thái sẵn sàng nhận ca." },
    });
    expect(reassignOutcome(res({ status: 400, code: "invalid_request", message: "y", errors: { reason: "Lý do phải từ 5 đến 300 ký tự." } }))).toMatchObject({ kind: "field", errors: { reason: expect.any(String) } });
  });

  it("409 reassign_not_allowed, 401/403/404/429/5xx, mạng ⇒ error với câu báo thống nhất", () => {
    expect(reassignOutcome(res({ status: 409, code: "reassign_not_allowed", message: "Host đang đón/dẫn khách, không thể giao lại." }))).toEqual({ kind: "error", message: "Host đang đón/dẫn khách, không thể giao lại." });
    expect(reassignOutcome(res({ status: 403 }))).toMatchObject({ kind: "error", message: expect.stringContaining("quyền") });
    expect(reassignOutcome(res({ status: 500 }))).toMatchObject({ kind: "error", message: expect.stringContaining("sự cố") });
    expect(reassignOutcome(res({ status: 0, code: "network", message: "Không kết nối được máy chủ." }))).toEqual({ kind: "error", message: "Không kết nối được máy chủ." });
    expect(reassignOutcome(res({ status: 429 }))).toMatchObject({ kind: "error", message: expect.stringContaining("quá nhanh") });
  });
});

describe("admin bookings — kiểm form trước khi gửi", () => {
  it("bắt buộc chọn Host và lý do 5–300 ký tự (đã gom khoảng trắng)", () => {
    expect(validateReassign("h1", "Host cũ kẹt thang")).toBeNull();
    expect(validateReassign("", "Host cũ kẹt thang")).toEqual({ hostId: expect.any(String) });
    expect(validateReassign("h1", "  a   b  ")).toEqual({ reason: expect.any(String) });
    expect(validateReassign("h1", "x".repeat(301))).toEqual({ reason: expect.any(String) });
    expect(validateReassign("", "")).toEqual({ hostId: expect.any(String), reason: expect.any(String) });
  });
});

describe("admin bookings — truy vấn & hiển thị", () => {
  it("key gồm tab/tìm/trang ⇒ mỗi trang/bộ lọc là một truy vấn server riêng", () => {
    const a = bookingQueries.list({ tab: "open", q: "", page: 1 }).key;
    const b = bookingQueries.list({ tab: "open", q: "", page: 2 }).key;
    const c = bookingQueries.list({ tab: "all", q: " VS-1 ", page: 1 }).key;
    expect(new Set([a, b, c]).size).toBe(3);
    expect(c).toContain("q=VS-1");
    expect(a).toContain("pageSize=20");
  });

  it("enum lịch xem → trạng thái web; số trang tối thiểu 1", () => {
    expect(webStatus("PENDING_CONFIRMATION")).toBe("pending");
    expect(webStatus("NO_SHOW")).toBe("no_show");
    expect(webStatus("CONFIRMED")).toBe("confirmed");
    expect([pageCount(0, 20), pageCount(20, 20), pageCount(21, 20)]).toEqual([1, 1, 2]);
  });
});

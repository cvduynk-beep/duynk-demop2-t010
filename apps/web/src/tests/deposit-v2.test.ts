import { describe, expect, it } from "vitest";
import { billingStart, moveInWindow } from "@/lib/tenant/moveIn";
import { errorText } from "@/lib/tenant/api";
import type { ApiResponse } from "@/lib/apiClient";

describe("Smart Move-in — khung ngày dọn vào theo ngày cọc về (giờ VN)", () => {
  it("T0 tính theo giờ VN: 18:00Z ngày 13 đã là ngày 14 ở VN", () => {
    const w = moveInWindow(Date.parse("2026-10-13T18:00:00Z"));
    expect(w).toEqual({ depositDate: "2026-10-14", earliest: "2026-10-16", freeUntil: "2026-10-21", latest: "2026-11-13" });
  });

  it("dọn vào trong 7 ngày ⇒ tính tiền từ ngày dọn vào; muộn hơn ⇒ tính từ T0+7", () => {
    const w = moveInWindow(Date.parse("2026-10-14T03:00:00Z"));
    expect(billingStart(w, "2026-10-18")).toBe("2026-10-18");
    expect(billingStart(w, "2026-10-21")).toBe("2026-10-21");
    expect(billingStart(w, "2026-11-01")).toBe("2026-10-21");
  });
});

describe("Cọc v2 — thông báo lỗi chốt nhanh", () => {
  const res = (code: string): ApiResponse<unknown> => ({ ok: false, status: 409, data: {}, code });
  it("chủ nhà tắt ủy quyền chốt nhanh giữa chừng ⇒ câu hướng dẫn chọn cọc thường", () => {
    expect(errorText(res("fast_close_unavailable"))).toContain("cọc thường");
  });
});

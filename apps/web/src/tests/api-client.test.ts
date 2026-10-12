import { describe, expect, it } from "vitest";
import { apiErrorText, isSessionExpired } from "@/lib/apiClient";

describe("apiClient — quy tắc 401 & thông điệp lỗi thống nhất", () => {
  it("chỉ 401 `unauthorized` (hoặc không mã) ngoài /auth/* mới là hết phiên ⇒ chuyển về login", () => {
    expect(isSessionExpired("/me/bookings", 401, "unauthorized")).toBe(true);
    expect(isSessionExpired("/me/bookings", 401, undefined)).toBe(true);
  });

  it("401 nghiệp vụ và lời gọi /auth/* KHÔNG chuyển trang", () => {
    expect(isSessionExpired("/chat", 401, "LOGIN_REQUIRED")).toBe(false);
    expect(isSessionExpired("/auth/login", 401, "invalid_credentials")).toBe(false);
    expect(isSessionExpired("/auth/session", 401, undefined)).toBe(false);
    expect(isSessionExpired("/bookings", 401, "action_token_invalid")).toBe(false);
    expect(isSessionExpired("/me/bookings", 403, "forbidden")).toBe(false);
  });

  it("thông điệp theo trạng thái", () => {
    expect(apiErrorText({ status: 0, code: "timeout", message: "Máy chủ phản hồi quá lâu" })).toContain("quá lâu");
    expect(apiErrorText({ status: 403 })).toContain("không có quyền");
    expect(apiErrorText({ status: 404 })).toContain("Không tìm thấy");
    expect(apiErrorText({ status: 429 })).toContain("quá nhanh");
    expect(apiErrorText({ status: 503, message: "Prisma error at …" })).toBe("Máy chủ đang gặp sự cố, vui lòng thử lại sau.");
  });
});

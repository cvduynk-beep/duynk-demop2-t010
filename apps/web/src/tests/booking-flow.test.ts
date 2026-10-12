import { describe, expect, it } from "vitest";
import { apiErrorText, isSessionExpired, type ApiResponse } from "@/lib/apiClient";
import { errorText, otpErrorText, retryAfterSeconds } from "@/lib/tenant/api";
import { bookingZaloThread } from "@/lib/simulated/zalo";
import { sampleBooking } from "./fixtures/booking";

const res = (patch: Partial<ApiResponse<unknown>>): ApiResponse<unknown> => ({ ok: false, status: 400, data: {}, ...patch });

describe("Booking — thông báo lỗi dùng số liệu thật của server", () => {
  it("OTP sai: báo đúng số lần thử còn lại server trả", () => {
    expect(otpErrorText(res({ code: "otp_invalid", errors: { attemptsRemaining: 2 } }))).toBe("Mã OTP không chính xác. Bạn còn 2 lần thử.");
  });

  it("OTP bị khoá / gửi lại quá nhanh: thời gian chờ lấy từ retryAfterSeconds (không ghi cứng)", () => {
    expect(otpErrorText(res({ status: 429, code: "otp_locked", errors: { retryAfterSeconds: 600 } }))).toContain("10 phút");
    expect(otpErrorText(res({ status: 429, code: "otp_cooldown", errors: { retryAfterSeconds: 42 } }))).toContain("42 giây");
    expect(retryAfterSeconds(res({ code: "otp_cooldown" }))).toBeUndefined();
  });

  it("OTP hết hạn / không gửi được", () => {
    expect(otpErrorText(res({ code: "otp_not_found_or_expired" }))).toContain("hết hạn");
    expect(otpErrorText(res({ status: 503, code: "otp_send_failed" }))).toContain("chưa gửi được");
  });

  it("tạo booking: validate, trùng giờ, 5xx, lỗi mạng đều có câu thân thiện", () => {
    expect(errorText(res({ code: "slot_invalid" }))).toContain("Khung giờ");
    expect(errorText(res({ status: 409, code: "slot_taken" }))).toContain("vừa có người đặt");
    expect(errorText(res({ status: 503, code: "ref_generation_failed" }))).toContain("đặt lịch lại");
    expect(errorText(res({ status: 500, message: "Prisma P1001 …" }))).toBe("Máy chủ đang gặp sự cố, vui lòng thử lại sau.");
    expect(apiErrorText({ status: 0, code: "network", message: "Không kết nối được máy chủ." })).toContain("Không kết nối");
  });

  it("ref không tồn tại / không thuộc mình ⇒ 404 booking_not_found; không chuyển về login", () => {
    expect(errorText(res({ status: 404, code: "booking_not_found" }))).toContain("Không tìm thấy lịch hẹn");
    expect(isSessionExpired("/bookings/VS-AAAAA", 404, "booking_not_found")).toBe(false);
    expect(isSessionExpired("/bookings", 401, "action_token_invalid")).toBe(false);
    expect(isSessionExpired("/bookings", 401, "unauthorized")).toBe(true);
  });
});

describe("Zalo mô phỏng — chỉ dựng từ mốc thời gian thật, không chứa mã OTP", () => {
  it("tin nhắn chỉ có các mốc có thật trong booking", () => {
    const thread = bookingZaloThread(sampleBooking({ confirmedAt: "2026-10-12T09:00:00.000Z" }));
    expect(thread.map((n) => n.id)).toEqual(["VS-K7M2Q-created", "VS-K7M2Q-confirmed"]);
    expect(thread.every((n) => !/\b\d{4}\b là mã xác thực/.test(n.body))).toBe(true);
  });
});

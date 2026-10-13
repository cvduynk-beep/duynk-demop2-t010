import { readFileSync } from "node:fs";
import path from "node:path";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { ZaloMockOtp } from "@/components/ui/ZaloMockOtp";

const render = (code: string | null | undefined) => renderToStaticMarkup(createElement(ZaloMockOtp, { code, onFill: () => undefined }));

describe("ZaloMockOtp — chỉ hiện khi backend trả devOtp", () => {
  it("không có devOtp (kênh Zalo thật) ⇒ không render gì", () => {
    expect(render(undefined)).toBe("");
    expect(render(null)).toBe("");
    expect(render("")).toBe("");
  });

  it("có devOtp ⇒ nhãn giả lập + mã + nút Điền mã", () => {
    const html = render("0427");
    expect(html).toContain("Zalo giả lập – chỉ môi trường phát triển");
    expect(html).toContain("0427");
    expect(html).toContain("Điền mã");
  });
});

/** Quy tắc bảo mật phía client cho 4 màn OTP: không tự quyết bằng biến môi trường, không lưu mã ra ngoài state. */
describe("màn OTP — không bypass phía client", () => {
  const SRC = path.resolve(__dirname, "..");
  const FILES = [
    "components/ui/ZaloMockOtp.tsx",
    "components/booking/BookingSheet.tsx",
    "components/host/PhoneVerifyForm.tsx",
    "components/landlord/LandlordVerify.tsx",
    "components/landlord/ConsignOtpSign.tsx",
  ];

  it.each(FILES)("%s: không đọc NODE_ENV / NEXT_PUBLIC_*, không lưu mã vào localStorage/sessionStorage/cookie", (file) => {
    const src = readFileSync(path.join(SRC, file), "utf8");
    expect(src).not.toMatch(/process\.env/);
    expect(src).not.toMatch(/\b(localStorage|sessionStorage)\.|document\.cookie/);
    expect(src).not.toMatch(/devCode|OTP_ECHO|log backend/);
  });

  it("không còn mã OTP cứng hay client gọi endpoint OTP không tồn tại", () => {
    const actions = readFileSync(path.join(SRC, "lib/mock/actions.ts"), "utf8");
    const client = readFileSync(path.join(SRC, "lib/apiClient.ts"), "utf8");
    expect(actions).not.toContain('otp: "4829"');
    expect(client).not.toMatch(/request-otp|holding-agreement\/sign|bookings\/confirm/);
  });
});

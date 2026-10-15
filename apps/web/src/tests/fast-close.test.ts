import { afterEach, describe, expect, it, vi } from "vitest";
import { buildTimeline } from "@/components/booking/status";
import { errorText, tenantApi } from "@/lib/tenant/api";
import type { ApiResponse } from "@/lib/apiClient";
import { sampleBooking } from "./fixtures/booking";

/** Hồ sơ 20 — Chốt cọc nhanh: cọc không cần lịch xem, giảm cọc lúc cọc, chọn chu kỳ lúc ký HĐ. */

function stubFetch() {
  const calls: { url: string; method: string; body: unknown }[] = [];
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string, init: RequestInit = {}) => {
      calls.push({ url, method: init.method ?? "GET", body: init.body ? JSON.parse(String(init.body)) : undefined });
      return new Response(JSON.stringify({ success: true, data: { ref: "VS-FAST1" } }), { status: 200 });
    }),
  );
  return calls;
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("Chốt cọc nhanh — gọi API (số tiền luôn do server tính)", () => {
  it("cọc trực tiếp trên trang căn: POST /bookings/fast-deposit, KHÔNG gửi số tiền / chu kỳ", async () => {
    const calls = stubFetch();
    await tenantApi.createFastDeposit({
      unitCode: "VHOP-S1.02-1208",
      contactName: "Nguyễn Văn An",
      phone: "0912345678",
      acceptTerms: true,
      acknowledgeNoViewing: true,
      termsVersion: "DEP-2026.10-v3",
    });
    expect(calls).toHaveLength(1);
    expect(calls[0]).toMatchObject({ url: "/api/v1/bookings/fast-deposit", method: "POST" });
    expect(Object.keys(calls[0].body as object).sort()).toEqual(
      ["acceptTerms", "acknowledgeNoViewing", "contactName", "phone", "termsVersion", "unitCode"].sort(),
    );
  });

  it("cọc trong luồng xem phòng: chốt nhanh gửi fastClose:true, cọc thường không gửi; không còn fastCloseCycle", async () => {
    const calls = stubFetch();
    await tenantApi.acceptDeposit("VS-K7M2Q", "DEP-2026.10-v3", true);
    await tenantApi.acceptDeposit("VS-K7M2Q", "DEP-2026.10-v3");
    expect(calls.map((c) => c.body)).toEqual([
      { acceptTerms: true, termsVersion: "DEP-2026.10-v3", fastClose: true },
      { acceptTerms: true, termsVersion: "DEP-2026.10-v3" },
    ]);
  });

  it("báo giá công khai theo mã căn (mã được encode)", async () => {
    const calls = stubFetch();
    await tenantApi.publicFastDeposit("VHOP S1/02");
    expect(calls[0]).toMatchObject({ url: "/api/v1/units/VHOP%20S1%2F02/fast-deposit", method: "GET" });
  });
});

describe("Chốt cọc nhanh — tiến trình lịch", () => {
  it("lịch cọc trực tiếp: không có bước Host / sảnh / xem phòng", () => {
    const steps = buildTimeline(sampleBooking({ direct: true, status: "closing" }));
    expect(steps.map((s) => s.key)).toEqual(["sent", "deposit", "kyc", "lease"]);
    expect(steps[0].label).toBe("Chốt cọc nhanh");
  });

  it("lịch xem phòng thường giữ đủ 7 bước", () => {
    expect(buildTimeline(sampleBooking()).map((s) => s.key)).toEqual(["sent", "host", "lobby", "view", "deposit", "kyc", "lease"]);
  });

  it("bước cọc ghi đúng số đã giảm của khoản cọc", () => {
    const steps = buildTimeline(
      sampleBooking({
        direct: true,
        status: "holding",
        deposit: {
          amount: 6_000_000,
          transferContent: "COC VHOP-S1.02-1208 VS-FAST1",
          qrRef: "VQ-1",
          createdAt: "2026-10-15T01:00:00.000Z",
          termsAcceptedAt: "2026-10-15T01:00:00.000Z",
          termsVersion: "DEP-2026.10-v3",
          paidAt: "2026-10-15T02:00:00.000Z",
          outcome: "active",
          fastClose: { cycle: null, baseAmount: 6_300_000, depositDiscount: 300_000, monthlyRent: null, quoteExpiresAt: "2026-10-16T01:00:00.000Z" },
          vietqr: null,
        },
      }),
    );
    expect(steps.find((s) => s.key === "deposit")).toMatchObject({ done: true, hint: "VietQR 6.000.000đ" });
  });
});

describe("Chốt cọc nhanh — thông báo lỗi", () => {
  const res = (code: string): ApiResponse<unknown> => ({ ok: false, status: 409, data: {}, code });
  it("chủ nhà chưa/không còn ủy quyền ⇒ hướng dẫn cọc thường hoặc đặt lịch xem", () => {
    expect(errorText(res("fast_close_unavailable"))).toContain("đặt lịch xem");
  });
  it("căn chưa có cọc bảo đảm hợp lệ ⇒ liên hệ hỗ trợ", () => {
    expect(errorText(res("deposit_unavailable"))).toContain("hỗ trợ");
  });
});

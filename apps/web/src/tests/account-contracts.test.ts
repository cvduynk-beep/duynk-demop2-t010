import { describe, expect, it } from "vitest";
import { latestKyc } from "@/lib/tenant/bookings";
import { DEPOSIT_OUTCOME, depositRows } from "@/lib/tenant/contracts";
import type { TenantBooking } from "@/lib/tenant/types";
import { sampleBooking, sampleContract } from "./fixtures/booking";

const deposit = (outcome: NonNullable<TenantBooking["deposit"]>["outcome"]): TenantBooking["deposit"] => ({
  amount: 2_000_000,
  transferContent: "VSA VS-K7M2Q",
  qrRef: "q1",
  createdAt: "2026-10-12T09:00:00.000Z",
  termsAcceptedAt: "2026-10-12T09:00:00.000Z",
  termsVersion: "HOLD-2026.10-v1",
  outcome,
  vietqr: null,
});

describe("depositRows — /account/contracts ghép cọc (bookings) với hợp đồng (contracts)", () => {
  it("chỉ lịch có cọc/hợp đồng; ghép đúng theo bookingRef; giữ thứ tự server", () => {
    const rows = depositRows(
      [
        sampleBooking({ ref: "VS-NODEP", status: "pending" }),
        sampleBooking({ ref: "VS-HOLD2", status: "holding", deposit: deposit("active") }),
        sampleBooking({ ref: "VS-K7M2Q", status: "leased", deposit: deposit("converted"), contractId: "c-1" }),
      ],
      [sampleContract()],
    );
    expect(rows.map((r) => [r.key, r.contract?.id ?? null])).toEqual([
      ["VS-HOLD2", null],
      ["VS-K7M2Q", "c-1"],
    ]);
  });

  it("hợp đồng không khớp lịch nào vẫn được hiện (không mất dữ liệu)", () => {
    const rows = depositRows([], [sampleContract({ id: "c-9", bookingRef: "VS-OLD22" })]);
    expect(rows).toEqual([{ booking: null, contract: expect.objectContaining({ id: "c-9" }), key: "c-9" }]);
  });

  it("rỗng ⇒ rỗng; mọi outcome cọc của backend đều có nhãn", () => {
    expect(depositRows([], [])).toEqual([]);
    for (const o of ["awaiting_payment", "active", "expired", "converted", "refunded", "forfeited"] as const) {
      expect(DEPOSIT_OUTCOME[o].label.length).toBeGreaterThan(3);
    }
  });
});

describe("latestKyc — /account lấy eKYC từ lịch hẹn thật", () => {
  it("chọn lần xác minh mới nhất; chưa có ⇒ null", () => {
    const kyc = (verifiedAt: string) => ({ verifiedAt, confidenceMin: 0.9, manuallyEdited: false, mismatch: [] });
    expect(latestKyc([sampleBooking(), sampleBooking({ kyc: kyc("2026-10-01T00:00:00Z") }), sampleBooking({ kyc: kyc("2026-10-10T00:00:00Z") })])?.verifiedAt).toBe(
      "2026-10-10T00:00:00Z",
    );
    expect(latestKyc([sampleBooking()])).toBeNull();
  });
});

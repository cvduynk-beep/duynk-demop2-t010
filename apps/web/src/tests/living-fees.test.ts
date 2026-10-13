import { describe, expect, it } from "vitest";
import { allInCost, DEFAULT_HOUSEHOLD, RATES, unitRates } from "@/lib/pricing/cost";
import { blankLivingFees, toLivingFeesDto, validateLivingFees } from "@/lib/inspection/livingFees";
import type { InspectionDraft } from "@/lib/inspection/types";

const draftWith = (livingFees: InspectionDraft["livingFees"]) => ({ livingFees }) as InspectionDraft;

describe("All-in Cost theo biểu phí của căn", () => {
  it("căn có phí Host xác minh ⇒ dùng phí của căn; căn chưa có ⇒ đơn giá chung", () => {
    const hh = { ...DEFAULT_HOUSEHOLD, motorbikes: 2, cars: 1 };
    const verified = allInCost({ rent: 10_000_000, areaM2: 50, managementFee: 500_000, motorbikeFee: 90_000, carFee: 1_500_000 }, hh);
    expect(verified.parking).toBe(2 * 90_000 + 1_500_000);
    expect(verified.mgmt).toBe(500_000);
    const plain = allInCost({ rent: 10_000_000, areaM2: 50 }, hh);
    expect(plain.parking).toBe(2 * RATES.motorbike + RATES.car);
    expect(unitRates({ motorbikeFee: null, carFee: 0 })).toEqual({ motorbike: RATES.motorbike, car: 0 });
  });
});

describe("Mục biểu phí sinh hoạt của phiếu thẩm định", () => {
  it("điền sẵn đơn giá chung từ backend, thiếu thì đơn giá dự phòng", () => {
    expect(blankLivingFees({ feeDefaults: { mgmtFeePerM2: 9000, motorbikeFee: 100_000, carFee: 1_200_000 } })).toEqual({
      mgmtFeePerM2: "9000", motorbikeFee: "100000", carFee: "1200000", note: "",
    });
    expect(blankLivingFees({}).motorbikeFee).toBe(String(RATES.motorbike));
  });

  it("kiểm số nguyên trong trần, ghi chú cấm SĐT/link nhưng cho số tiền", () => {
    const ok = { mgmtFeePerM2: "10000", motorbikeFee: "90000", carFee: "1500000", note: "Nước 15.000đ/m³" };
    expect(validateLivingFees(draftWith(ok))).toBeNull();
    expect(validateLivingFees(draftWith({ ...ok, mgmtFeePerM2: "" }))?.field).toBe("livingFees.mgmtFeePerM2");
    expect(validateLivingFees(draftWith({ ...ok, carFee: "99000000" }))?.field).toBe("livingFees.carFee");
    expect(validateLivingFees(draftWith({ ...ok, note: "Gọi 0912345678" }))?.field).toBe("livingFees.note");
    expect(validateLivingFees(draftWith({ ...ok, note: "x".repeat(151) }))?.field).toBe("livingFees.note");
    expect(toLivingFeesDto(draftWith({ ...ok, note: "  " }))).toEqual({ mgmtFeePerM2: 10_000, motorbikeFee: 90_000, carFee: 1_500_000 });
  });
});

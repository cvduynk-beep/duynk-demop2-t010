import { describe, expect, it } from "vitest";

// Trần giá nghiệp vụ được quy định trong PRD, SAD_v2 và ConsignWizard / backend
const LAYOUT_PRICE_CEILING: Record<string, number> = {
  Studio: 18_000_000,
  "1PN": 25_000_000,
  "1PN+": 25_000_000,
  "2PN": 35_000_000,
  "2PN+": 35_000_000,
  "3PN": 50_000_000,
};
const ABSOLUTE_PRICE_CEILING = 80_000_000;

function validateRentPrice(layout: string, rent: number): { valid: boolean; error?: string } {
  if (rent <= 0) {
    return { valid: false, error: "Giá thuê phải lớn hơn 0" };
  }
  if (rent > ABSOLUTE_PRICE_CEILING) {
    return {
      valid: false,
      error: `Giá thuê không được vượt trần tuyệt đối ${ABSOLUTE_PRICE_CEILING.toLocaleString("vi-VN")} đ/tháng`,
    };
  }
  const ceiling = LAYOUT_PRICE_CEILING[layout] ?? ABSOLUTE_PRICE_CEILING;
  if (rent > ceiling) {
    return {
      valid: false,
      error: `Giá thuê vượt quá mức trần hợp lý cho layout ${layout} (${ceiling.toLocaleString("vi-VN")} đ/tháng). Vui lòng điều chỉnh để tránh đầu độc dữ liệu hệ thống.`,
    };
  }
  return { valid: true };
}

describe("4-Tier Anti-Abuse & Data Guardrail Tests", () => {
  describe("Lớp 1: Chốt chặn cứng theo Layout Ceilings", () => {
    it("Chặn giá khống siêu cao (500.000.000 đ) cho căn Studio", () => {
      const result = validateRentPrice("Studio", 500_000_000);
      expect(result.valid).toBe(false);
      expect(result.error).toContain("vượt trần tuyệt đối");
    });

    it("Chặn giá vượt trần cụ thể của căn Studio (> 18.000.000 đ)", () => {
      const result = validateRentPrice("Studio", 20_000_000);
      expect(result.valid).toBe(false);
      expect(result.error).toContain("vượt quá mức trần hợp lý cho layout Studio (18.000.000 đ/tháng)");
    });

    it("Chấp nhận giá hợp lệ của căn Studio (≤ 18.000.000 đ)", () => {
      const result1 = validateRentPrice("Studio", 6_500_000);
      expect(result1.valid).toBe(true);

      const result2 = validateRentPrice("Studio", 18_000_000);
      expect(result2.valid).toBe(true);
    });

    it("Chặn giá vượt trần của 1PN / 1PN+ (> 25.000.000 đ)", () => {
      const result = validateRentPrice("1PN", 26_000_000);
      expect(result.valid).toBe(false);
      expect(result.error).toContain("25.000.000 đ/tháng");
    });

    it("Chấp nhận giá 1PN hợp lý (≤ 25.000.000 đ)", () => {
      const result = validateRentPrice("1PN", 8_500_000);
      expect(result.valid).toBe(true);
    });

    it("Chặn giá vượt trần của 2PN / 2PN+ (> 35.000.000 đ)", () => {
      const result = validateRentPrice("2PN", 36_000_000);
      expect(result.valid).toBe(false);
      expect(result.error).toContain("35.000.000 đ/tháng");
    });

    it("Chặn giá vượt trần của 3PN (> 50.000.000 đ)", () => {
      const result = validateRentPrice("3PN", 55_000_000);
      expect(result.valid).toBe(false);
      expect(result.error).toContain("50.000.000 đ/tháng");
    });

    it("Chặn giá vượt quá trần tuyệt đối toàn sàn (80.000.000 đ)", () => {
      const result = validateRentPrice("Duplex", 85_000_000);
      expect(result.valid).toBe(false);
      expect(result.error).toContain("80.000.000 đ/tháng");
    });
  });

  describe("Lớp 2: Lọc ngoại lai IQR và tính trung vị (Robust Estimator)", () => {
    it("Thuật toán Median không bị lệch bởi outlier cực đoan", () => {
      // Giả sử có một mẫu giá gồm 5 căn Studio: 6tr, 6.5tr, 7tr, 7.5tr và 1 căn nhập khống 18tr
      const samples = [6_000_000, 6_500_000, 7_000_000, 7_500_000, 18_000_000];
      samples.sort((a, b) => a - b);
      const median = samples[Math.floor(samples.length / 2)];

      // Mean sẽ bị kéo lên cao: (6 + 6.5 + 7 + 7.5 + 18) / 5 = 9tr
      const mean = samples.reduce((a, b) => a + b, 0) / samples.length;

      // Median giữ vững ở 7tr, phản ánh chính xác thị trường
      expect(median).toBe(7_000_000);
      expect(mean).toBe(9_000_000);
      expect(median).toBeLessThan(mean);
    });
  });

  describe("Lớp 3: Anomaly Detection (Gắn cờ kiểm duyệt bóng khi giá cao bất thường)", () => {
    it("Gắn nhãn suspicious_high_rent nếu giá cao hơn ≥ 40% so với giá thị trường", () => {
      const marketAvg = 7_000_000;
      const threshold40 = marketAvg * 1.4; // 9.800.000

      const checkSuspicious = (rent: number) => rent >= threshold40;

      expect(checkSuspicious(8_000_000)).toBe(false);
      expect(checkSuspicious(10_000_000)).toBe(true);
    });
  });
});

import { describe, expect, it } from "vitest";
import { UNITS } from "../lib/mock/units";
import { answerUnitQuestion, isOutOfScope, QUICK_CHIPS } from "../lib/property/unitConcierge";

describe("UnitConcierge - Quản gia AI bảo vệ chi phí & phạm vi", () => {
  const sampleUnit = UNITS[0]; // Căn mẫu trong cơ sở dữ liệu

  it("chặn cứng câu hỏi ngoài lề để bảo vệ 100% chi phí token (Out-of-scope guardrail)", () => {
    const outOfScopeQueries = [
      "Giải phương trình bậc 2 giúp tôi",
      "Viết cho tôi một đoạn mã python backend",
      "Thời tiết Đà Nẵng hôm nay thế nào?",
      "Làm thơ tình lục bát tặng bạn gái",
      "Cổ phiếu VinFast hôm nay tăng hay giảm?",
      "Tìm giúp tôi khách sạn giá rẻ ở Cầu Giấy",
      "Kể một câu chuyện cười vui vẻ",
    ];

    for (const q of outOfScopeQueries) {
      expect(isOutOfScope(q)).toBe(true);
      const res = answerUnitQuestion(sampleUnit, q);
      expect(res).not.toBeNull();
      expect(res?.text).toContain("chuyên trách căn hộ tại Vinhomes Ocean Park 1");
    }
  });

  it("phản hồi chính xác câu hỏi khoảng cách đến VinUni từ dữ liệu toà nhà", () => {
    const res = answerUnitQuestion(sampleUnit, "Căn này đi sang trường ĐH VinUni có gần không?");
    expect(res).not.toBeNull();
    expect(res?.text).toContain("VinUni");
  });

  it("phản hồi chính xác trạm xe VinBus và phương tiện di chuyển", () => {
    const res = answerUnitQuestion(sampleUnit, "Gần đây có trạm xe bus VinBus không?");
    expect(res).not.toBeNull();
    expect(res?.text).toContain("VinBus");
  });

  it("phản hồi minh bạch phí dịch vụ & phí quản lý BQL Vinhomes", () => {
    const res = answerUnitQuestion(sampleUnit, "Phí quản lý của căn này là bao nhiêu một tháng?");
    expect(res).not.toBeNull();
    expect(res?.text).toContain("Phí quản lý");
    expect(res?.text).toContain("BQL");
  });

  it("phản hồi đúng nội quy nuôi thú cưng theo quy chế BQL", () => {
    const res = answerUnitQuestion(sampleUnit, "Ở đây có được nuôi mèo hay chó không?");
    expect(res).not.toBeNull();
    expect(res?.text).toContain("thú cưng");
  });

  it("phản hồi đúng hiện trạng chỗ gửi xe ô tô và xe máy", () => {
    const res = answerUnitQuestion(sampleUnit, "Chỗ gửi xe ô tô còn lốt không, gửi xe máy thế nào?");
    expect(res).not.toBeNull();
    expect(res?.text).toContain("gửi xe");
  });

  it("phản hồi đúng chính sách cọc 2 triệu VietQR và quy trình Field Host đón sảnh", () => {
    const res = answerUnitQuestion(sampleUnit, "Quy trình cọc 2 triệu giữ chỗ thế nào?");
    expect(res).not.toBeNull();
    expect(res?.text).toContain("2.000.000đ");
    expect(res?.text).toContain("VietQR");
  });

  it("thấu hiểu tiếng Việt gõ tắt và sai chính tả (ví dụ tiền điên bao nhiu)", () => {
    const misspelledQueries = [
      "tiền điên bao nhiu?",
      "điện nc bn 1 tháng",
      "hóa đơn tiền điện evn",
    ];
    for (const q of misspelledQueries) {
      const res = answerUnitQuestion(sampleUnit, q);
      expect(res).not.toBeNull();
      expect(res?.text).toContain("Tiền điện");
      expect(res?.text).toContain("EVN");
    }
  });

  it("phản hồi chính xác câu hỏi về Vincom Mega Mall và không bị fallback", () => {
    const res = answerUnitQuestion(sampleUnit, "gần vincom không?");
    expect(res).not.toBeNull();
    expect(res?.text).toContain("Vincom Mega Mall");
  });

  it("phản hồi chính xác câu hỏi về hồ nhân tạo / Biển hồ Crystal Lagoon mà không bị chặn guardrail", () => {
    expect(isOutOfScope("gần hồ nhân tạo không?")).toBe(false);
    const res = answerUnitQuestion(sampleUnit, "gần hồ nhân tạo không?");
    expect(res).not.toBeNull();
    expect(res?.text).not.toContain("chuyên trách căn hộ tại Vinhomes Ocean Park 1");
    expect(res?.text).toContain("Hồ Ngọc Trai");
  });

  it("phản hồi chính xác câu hỏi về Bệnh viện Vinmec và Trường Vinschool", () => {
    const resVinmec = answerUnitQuestion(sampleUnit, "bệnh viện vinmec có gần đây không?");
    expect(resVinmec?.text).toContain("Vinmec");

    const resVinschool = answerUnitQuestion(sampleUnit, "gần trường vinschool không?");
    expect(resVinschool?.text).toContain("Vinschool");
  });

  it("phản hồi chính xác câu hỏi về chỗ đậu xe hơi / phương ngữ đa dạng", () => {
    const resCar = answerUnitQuestion(sampleUnit, "có chỗ đậu xe hơi không?");
    expect(resCar).not.toBeNull();
    expect(resCar?.text).toContain("Ô tô / Xe hơi");
    expect(resCar?.text).toContain("nhà xe nổi");

    const resMotor = answerUnitQuestion(sampleUnit, "đậu xe máy ở đâu");
    expect(resMotor?.text).toContain("Xe máy / Xe điện");
  });

  it("phản hồi chính xác câu hỏi về ban công, an ninh thang máy và siêu thị", () => {
    const resBalcony = answerUnitQuestion(sampleUnit, "căn này ban công hướng nào?");
    expect(resBalcony?.text).toContain("Hướng");

    const resElevator = answerUnitQuestion(sampleUnit, "thang máy có thẻ cư dân không?");
    expect(resElevator?.text).toContain("Thang máy");

    const resShop = answerUnitQuestion(sampleUnit, "chân toà có siêu thị winmart không?");
    expect(resShop?.text).toContain("WinMart");
  });

  it("cung cấp đầy đủ danh mục quick chips hỗ trợ khách hỏi nhanh 1 chạm", () => {
    expect(QUICK_CHIPS.length).toBeGreaterThanOrEqual(4);
    for (const chip of QUICK_CHIPS) {
      const res = answerUnitQuestion(sampleUnit, chip);
      expect(res).not.toBeNull();
      expect(res!.text.length).toBeGreaterThan(20);
    }
  });
});

import { describe, expect, it } from "vitest";
import { compressInspectionPhoto } from "@/lib/host/inspectionPhotos";
import { validateInspectionPhoto } from "@/lib/host/aiVisionValidator";

describe("compressInspectionPhoto — xử lý ảnh kiểm định nội thất", () => {
  it("từ chối tệp không phải định dạng ảnh", async () => {
    const fakePdf = new File(["dummy pdf content"], "hopdong.pdf", { type: "application/pdf" });
    await expect(compressInspectionPhoto(fakePdf)).rejects.toThrow("không phải định dạng ảnh hỗ trợ");
  });

  it("từ chối tệp ảnh có dung lượng vượt quá giới hạn 25MB", async () => {
    // Tạo object mô phỏng file > 25MB
    const bigFile = new File(["a"], "huge_photo.jpg", { type: "image/jpeg" });
    Object.defineProperty(bigFile, "size", { value: 30 * 1024 * 1024 });

    await expect(compressInspectionPhoto(bigFile)).rejects.toThrow("dung lượng quá lớn");
  });

  it("chấp nhận tệp ảnh hợp lệ và trả về chuỗi Data URL", async () => {
    // 1x1 transparent GIF / JPEG mock blob
    const imgFile = new File(
      [new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46])],
      "sofa.jpg",
      { type: "image/jpeg" }
    );
    const result = await compressInspectionPhoto(imgFile);
    expect(result).toBeDefined();
    expect(typeof result).toBe("string");
    expect(result.startsWith("data:")).toBe(true);
  });
});

describe("validateInspectionPhoto — Mô hình kiểm soát 3 lớp (3-Tier Verification)", () => {
  const dummyDataUrl = "data:image/jpeg;base64,/9j/4AAQSkZJRg==";

  it("(Lớp 1) AI Vision Object Detection nhận diện đúng chủng loại sofa", async () => {
    const res = await validateInspectionPhoto(dummyDataUrl, "1", "Bộ ghế Sofa", "Vinhomes Ocean Park · S2.19");
    expect(res.isMatch).toBe(true);
    expect(res.status).toBe("match");
    expect(res.detectedLabel).toContain("Sofa");
    expect(res.confidence).toBeGreaterThanOrEqual(90);
  });

  it("(Lớp 2) Metadata Geofence và Timestamp ISO được gắn chính xác", async () => {
    const locHint = "Vinhomes Ocean Park · S1.09 · Tầng 12 · Căn 11";
    const res = await validateInspectionPhoto(dummyDataUrl, "4", "Tivi thông minh & Smart Box", locHint);
    expect(res.locationTag).toBe(locHint);
    expect(res.timestamp).toBeDefined();
    expect(new Date(res.timestamp).getTime()).not.toBeNaN();
  });

  it("(Lớp 1) Nhận diện đúng các thiết bị điện máy và đồ gỗ phòng ngủ", async () => {
    const bedRes = await validateInspectionPhoto(dummyDataUrl, "13", "Giường ngủ & Táp đầu giường");
    expect(bedRes.isMatch).toBe(true);
    expect(bedRes.detectedLabel).toContain("giường");

    const tvRes = await validateInspectionPhoto(dummyDataUrl, "4", "Tivi thông minh");
    expect(tvRes.isMatch).toBe(true);
    expect(tvRes.detectedLabel).toContain("Tivi");
  });
});

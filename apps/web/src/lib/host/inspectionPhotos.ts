/**
 * Tiện ích xử lý và nén ảnh chụp hiện trạng đồ gỗ & thiết bị (Field Host Inspection).
 * Nén trên trình duyệt canvas thành Data URL JPEG nhẹ (~50-100KB) để lưu trữ an toàn trong báo cáo.
 */
export async function compressInspectionPhoto(file: File): Promise<string> {
  if (!file.type.startsWith("image/") && !/\.(jpe?g|png|webp|heic|heif)$/i.test(file.name)) {
    throw new Error(`Tệp "${file.name}" không phải định dạng ảnh hỗ trợ (JPG, PNG, WebP).`);
  }

  if (file.size > 25 * 1024 * 1024) {
    throw new Error(`Ảnh "${file.name}" dung lượng quá lớn (>25MB). Vui lòng chọn ảnh nhẹ hơn.`);
  }

  if (typeof FileReader === "undefined") {
    const arrayBuffer = await file.arrayBuffer();
    const base64 = Buffer.from(arrayBuffer).toString("base64");
    return `data:${file.type || "image/jpeg"};base64,${base64}`;
  }

  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error("Lỗi khi đọc file ảnh."));
    reader.onload = () => {
      const result = reader.result as string;
      if (typeof window === "undefined" || typeof document === "undefined") {
        resolve(result);
        return;
      }

      const img = new Image();
      img.onerror = () => reject(new Error("Không thể giải mã hình ảnh này. Hãy thử chụp hoặc chọn lại."));
      img.onload = () => {
        try {
          const MAX_DIM = 1200;
          let width = img.width;
          let height = img.height;
          if (width > MAX_DIM || height > MAX_DIM) {
            if (width > height) {
              height = Math.max(1, Math.round((height * MAX_DIM) / width));
              width = MAX_DIM;
            } else {
              width = Math.max(1, Math.round((width * MAX_DIM) / height));
              height = MAX_DIM;
            }
          }

          const canvas = document.createElement("canvas");
          canvas.width = width;
          canvas.height = height;
          const ctx = canvas.getContext("2d");
          if (!ctx) {
            resolve(result);
            return;
          }

          // Nền trắng cho ảnh trong suốt (PNG)
          ctx.fillStyle = "#ffffff";
          ctx.fillRect(0, 0, width, height);
          ctx.drawImage(img, 0, 0, width, height);

          const dataUrl = canvas.toDataURL("image/jpeg", 0.75);
          resolve(dataUrl);
        } catch {
          resolve(result);
        }
      };
      img.src = result;
    };
    reader.readAsDataURL(file);
  });
}

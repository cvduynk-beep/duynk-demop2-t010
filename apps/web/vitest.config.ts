import { defineConfig } from "vitest/config";
import path from "node:path";

// Lịch xem/ngày "Hôm nay" tính theo giờ địa phương; sản phẩm chỉ ở Ocean Park (UTC+7) ⇒ ghim múi giờ để test
// không phụ thuộc máy chạy (runner CI chạy UTC làm lệch 1 ngày).
process.env.TZ = "Asia/Ho_Chi_Minh";

export default defineConfig({
  test: {
    environment: "node",
    include: ["src/tests/**/*.test.ts"],
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
});

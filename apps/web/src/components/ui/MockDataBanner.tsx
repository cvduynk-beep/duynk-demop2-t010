import { TriangleAlert } from "lucide-react";
import styles from "./MockDataBanner.module.css";

/**
 * Banner bắt buộc khi dữ liệu đến từ fallback có cờ (`source: "mock"`). Chỉ xuất hiện ngoài production — server không
 * bao giờ trả `mock` ở production (xem `lib/units/source.ts`).
 */
export function MockDataBanner({ detail = "Backend không phản hồi nên đang hiển thị dữ liệu mẫu." }: { detail?: string }) {
  return (
    <div className={styles.banner} role="alert" data-source="mock">
      <TriangleAlert size={18} aria-hidden />
      <div>
        <strong>Dữ liệu mẫu, chưa xếp hạng</strong>
        <span>
          {detail} Không đặt lịch hay đặt cọc trên dữ liệu này. (ALLOW_MOCK_FALLBACK đang bật — chỉ dùng cho môi trường dev.)
        </span>
      </div>
    </div>
  );
}

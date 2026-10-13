import styles from "./ZaloMockOtp.module.css";

/**
 * Zalo GIẢ LẬP: chỉ hiện khi backend chạy `OTP_PROVIDER=mock` và trả `devOtp` trong response gửi OTP. Không có mã ⇒ không
 * render gì (giao diện như kênh thật). Không đọc biến môi trường phía client; mã chỉ nằm trong state của màn đang mở.
 * "Điền mã" chỉ điền vào ô nhập — xác minh vẫn đi qua backend như khi gõ tay.
 */
export function ZaloMockOtp({ code, onFill, disabled }: { code: string | null | undefined; onFill: (code: string) => void; disabled?: boolean }) {
  if (!code) return null;
  return (
    <div className={styles.box} role="note" aria-label="Zalo giả lập">
      <span className={styles.tag}>Zalo giả lập – chỉ môi trường phát triển</span>
      <span>
        Mã OTP của bạn là <b className={`tnum ${styles.code}`}>{code}</b>
      </span>
      <button type="button" className={`btn btn-quiet btn-sm ${styles.fill}`} disabled={disabled} onClick={() => onFill(code)}>
        Điền mã
      </button>
    </div>
  );
}

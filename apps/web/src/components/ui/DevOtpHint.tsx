import styles from "./DevOtpHint.module.css";

/**
 * Ghi chú cho môi trường thử nghiệm: Zalo đang MÔ PHỎNG, mã OTP chỉ được ghi trong log backend (khi bật
 * `OTP_ECHO_DEV_CODE`) — API không bao giờ trả mã. Không hiện ở production.
 */
export function DevOtpHint() {
  if (process.env.NODE_ENV === "production") return null;
  return (
    <p className={styles.hint} role="note">
      <span className={styles.tag}>Bản thử nghiệm</span>
      <span>Zalo đang mô phỏng — mã OTP nằm trong log backend.</span>
    </p>
  );
}

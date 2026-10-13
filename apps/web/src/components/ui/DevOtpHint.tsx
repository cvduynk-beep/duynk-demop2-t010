import styles from "./DevOtpHint.module.css";

/** Ghi chú: Zalo đang MÔ PHỎNG ở mọi môi trường, mã OTP được ghi trong log backend. */
export function DevOtpHint() {
  return (
    <p className={styles.hint} role="note">
      <span className={styles.tag}>Bản thử nghiệm</span>
      <span>Zalo đang mô phỏng — mã OTP nằm trong log backend.</span>
    </p>
  );
}

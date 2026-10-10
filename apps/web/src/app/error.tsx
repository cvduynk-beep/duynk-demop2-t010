"use client";

import { useEffect } from "react";
import styles from "./not-found.module.css";

export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("[VinStay Global Error]:", error);
  }, [error]);

  return (
    <div className={styles.wrap}>
      <h1 className={styles.title}>Đã có lỗi khi tải trang</h1>
      <p className="muted">Vui lòng thử lại; nếu vẫn lỗi, tải lại toàn bộ trang.</p>
      {error?.message && (
        <div style={{ maxWidth: 520, margin: "12px auto", padding: "10px 14px", background: "rgba(225, 29, 72, 0.08)", border: "1px solid rgba(225, 29, 72, 0.2)", borderRadius: 8, fontSize: 13, color: "#be123c", textAlign: "left", wordBreak: "break-word" }}>
          <b>Chi tiết lỗi:</b> {error.message}
        </div>
      )}
      <button type="button" className="btn btn-primary" onClick={() => reset()}>
        Thử lại
      </button>
    </div>
  );
}

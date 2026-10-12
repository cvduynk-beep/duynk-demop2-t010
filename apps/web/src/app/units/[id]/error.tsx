"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { startTransition, useEffect } from "react";
import styles from "../../not-found.module.css";

/** Backend không trả được căn (5xx / timeout / mạng): báo lỗi thật + thử lại; không hiện dữ liệu thay thế. */
export default function UnitError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  const router = useRouter();
  // Lỗi đến từ Server Component ⇒ phải refresh để server gọi lại backend, rồi mới reset boundary.
  const retry = () =>
    startTransition(() => {
      router.refresh();
      reset();
    });
  useEffect(() => {
    console.error("[units/:id] tải căn lỗi:", error.message);
  }, [error]);

  return (
    <div className={styles.wrap} role="alert">
      <h1 className={styles.title}>Chưa tải được thông tin căn hộ</h1>
      <p className="muted">Máy chủ đang không phản hồi. Bạn thử lại sau ít giây nhé.</p>
      <div style={{ display: "flex", gap: 8, justifyContent: "center" }}>
        <button type="button" className="btn btn-primary" onClick={retry}>
          Thử lại
        </button>
        <Link href="/units" className="btn btn-quiet">
          Về danh sách căn
        </Link>
      </div>
    </div>
  );
}

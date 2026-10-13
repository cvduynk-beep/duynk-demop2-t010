"use client";

import type { ReactNode } from "react";
import type { Query } from "@/lib/query/useApiQuery";
import styles from "./Admin.module.css";

/** Khung tải/lỗi/dữ liệu chung cho các màn Admin gọi backend (cùng kiểu với AdminBookings). */
export function AdminQuery<T>({
  query,
  title,
  height = 360,
  children,
}: {
  query: Query<T>;
  /** Tiêu đề khối lỗi, vd "Không tải được rổ hàng". */
  title: string;
  height?: number;
  children: (data: T) => ReactNode;
}) {
  const { state, reload } = query;
  if (state.status === "loading") {
    return <div className="skeleton" style={{ height, borderRadius: 16 }} aria-busy="true" aria-label="Đang tải" />;
  }
  if (state.status === "error") {
    return (
      <div className={`card ${styles.widgetError}`} role="alert">
        <b>{title}</b>
        <p className="small">{state.message}</p>
        <button type="button" className="btn btn-quiet btn-sm" onClick={reload}>
          Thử lại
        </button>
      </div>
    );
  }
  return <>{children(state.data)}</>;
}

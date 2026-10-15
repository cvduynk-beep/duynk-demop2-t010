"use client";

import Link from "next/link";
import { ArrowLeft, ExternalLink } from "lucide-react";
import { UnitDetail } from "@/components/unit/UnitDetail";
import { useApiQuery } from "@/lib/query/useApiQuery";
import { toUnit, type UnitWithExtras } from "@/lib/tenant/adapters";
import { tenantQueries } from "@/lib/tenant/queries";
import { vnd } from "@/lib/format";
import { unitAddress } from "@/lib/units";
import styles from "./ResultsPanel.module.css";

interface UnitPreviewProps {
  code: string;
  /** Khách bấm "Đặt lịch xem" trên thẻ ⇒ mở luôn khung đặt lịch. */
  book: boolean;
  /** Căn từ danh sách (đã có ảnh, giá) để hiện ngay trong lúc tải chi tiết (bảng kê nội thất chỉ có ở chi tiết). */
  fallback: UnitWithExtras | null;
  onBack: () => void;
}

/** Chi tiết căn NGAY TRONG khung kết quả cạnh chat — khách vẫn chat bên trái, không rời trang. */
export function UnitPreview({ code, book, fallback, onBack }: UnitPreviewProps) {
  const query = useApiQuery(tenantQueries.unit(code));
  const unit = query.state.status === "ready" ? toUnit(query.state.data) : fallback;

  return (
    <div className={styles.preview}>
      <div className={styles.previewBar}>
        <button type="button" className={styles.previewBack} onClick={onBack} aria-label="Quay lại danh sách căn">
          <ArrowLeft size={17} />
        </button>
        <div className={styles.previewTitle}>
          <span className={styles.previewEyebrow}>Kết quả tìm căn</span>
          <b>{unit ? unitAddress(unit) : code}</b>
        </div>
        {unit && (
          <span className={styles.previewPrice}>
            <b className="num">{vnd(unit.rent)}đ</b>
            <span>/tháng</span>
          </span>
        )}
        <Link href={`/units/${encodeURIComponent(code)}`} className={styles.previewFull} title="Mở trang chi tiết đầy đủ">
          <ExternalLink size={15} />
          <span>Trang đầy đủ</span>
        </Link>
      </div>
      {unit ? (
        // key theo căn + ý định đặt lịch ⇒ đổi căn thì khung đặt lịch / cọc nhanh của căn trước không mở nhầm.
        <UnitDetail key={`${code}:${book}`} unit={unit} autoOpenBooking={book} embedded />
      ) : query.state.status === "error" ? (
        <div className={`card ${styles.previewState}`} role="alert" style={{ padding: 24 }}>
          <p style={{ margin: "0 0 12px" }}>{query.state.message}</p>
          <button type="button" className="btn btn-quiet btn-sm" onClick={query.reload}>
            Thử lại
          </button>
        </div>
      ) : (
        <div className={styles.previewState} aria-busy="true" aria-label="Đang tải chi tiết căn">
          <div className="skeleton" style={{ height: 300, borderRadius: 18 }} />
          <div className="skeleton" style={{ height: 96, borderRadius: 18, marginTop: 12 }} />
          <div className="skeleton" style={{ height: 180, borderRadius: 18, marginTop: 12 }} />
        </div>
      )}
    </div>
  );
}

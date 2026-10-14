import type { Metadata } from "next";
import { Suspense } from "react";
import { AdminReports } from "@/components/admin/AdminReports";

export const metadata: Metadata = {
  title: "Báo cáo & KPI — Quản trị",
  description: "Hiệu suất Field Host, giao dịch cọc & hợp đồng, thu nhập Host — số liệu thật từ cơ sở dữ liệu",
};

export default function AdminReportsPage() {
  // Bộ lọc nằm trên URL (useSearchParams) ⇒ cần Suspense khi prerender.
  return (
    <Suspense fallback={<div className="skeleton" style={{ height: 480, borderRadius: 16 }} aria-busy="true" aria-label="Đang tải báo cáo" />}>
      <AdminReports />
    </Suspense>
  );
}

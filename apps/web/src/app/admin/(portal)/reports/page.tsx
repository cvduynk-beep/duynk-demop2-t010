import type { Metadata } from "next";
import { AdminReports } from "@/components/admin/AdminReports";

export const metadata: Metadata = {
  title: "Báo cáo & Phân tích Đa chiều — Quản trị",
  description: "Trích xuất báo cáo doanh số, KPI Sale, AI Lead Scoring và ROI chiến dịch tiếp thị",
};

export default function AdminReportsPage() {
  return <AdminReports />;
}

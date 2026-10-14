import type { Metadata } from "next";
import { AdminInventoryDetail } from "@/components/admin/AdminInventoryDetail";

export const metadata: Metadata = { title: "Căn hộ và ký gửi — Quản trị" };

/** Id là id/mã căn (rổ hàng) hoặc `consign-<mandateId>` (hồ sơ ký gửi); dữ liệu tải phía client theo phiên Admin. */
export default async function AdminInventoryDetailPage({ params }: { params: Promise<{ id: string }> }) {
  return <AdminInventoryDetail id={(await params).id} />;
}

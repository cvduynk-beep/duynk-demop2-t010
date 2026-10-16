import type { Metadata } from "next";
import { AdminSupport } from "@/components/admin/AdminSupport";

export const metadata: Metadata = { title: "Yêu cầu hỗ trợ — Quản trị" };

export default function AdminSupportPage() {
  return <AdminSupport />;
}

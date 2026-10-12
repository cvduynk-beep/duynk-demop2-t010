import type { Metadata } from "next";
import { ConsignWizard } from "@/components/landlord/ConsignWizard";

export const metadata: Metadata = { title: "Ký gửi căn hộ — Chủ nhà" };

export default function ConsignPage() {
  return <ConsignWizard />;
}

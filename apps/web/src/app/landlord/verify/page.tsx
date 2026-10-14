import type { Metadata } from "next";
import { LandlordVerify } from "@/components/landlord/LandlordVerify";

export const metadata: Metadata = { title: "Xác thực tài khoản — Chủ nhà" };

export default function LandlordVerifyPage() {
  return <LandlordVerify />;
}

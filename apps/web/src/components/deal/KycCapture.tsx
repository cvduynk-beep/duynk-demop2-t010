"use client";

import { EkycCapture } from "@/components/kyc/EkycCapture";
import { tenantApi } from "@/lib/tenant/api";
import { EKYC_CONSENT_VERSION, type TenantBooking } from "@/lib/tenant/types";

interface KycCaptureProps {
  booking: TenantBooking;
  onDone: (booking: TenantBooking) => void;
}

/**
 * Xác minh CCCD (eKYC) của khách thuê khi lập Hợp đồng thuê (lịch đang giữ chỗ).
 * MÔ PHỎNG: bước bóc tách do backend giả lập OCR (`POST /bookings/:ref/ekyc/scan`, chưa tích hợp FPT.AI) — ảnh chụp
 * chỉ hiển thị trên máy, không gửi đi. Thông tin khách xác nhận được backend kiểm tra và lưu mã hoá AES-256 (thật).
 */
export function KycCapture({ booking, onDone }: KycCaptureProps) {
  return (
    <EkycCapture
      title="Xác minh CCCD & Khuôn mặt (eKYC)"
      description="Hệ thống AI bóc tách thông tin tự động trong 3 giây và đối chiếu với thông tin đặt lịch để chuẩn bị ký Hợp đồng thuê."
      consentText="Tôi đồng ý cho VinStay AI xử lý hình ảnh CCCD để làm thủ tục hợp đồng thuê và đăng ký tạm trú, bảo mật AES-256 theo Nghị định 13/2023/NĐ-CP."
      expectedName={booking.contact.name}
      expectedNameLabel="Lúc đặt lịch"
      scan={() => tenantApi.scanEkyc(booking.ref, EKYC_CONSENT_VERSION)}
      submit={(payload) => tenantApi.submitEkyc(booking.ref, payload)}
      onDone={(res) => onDone(res.booking)}
    />
  );
}

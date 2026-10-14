import { OtpChannel, OtpPurpose } from '@prisma/client';

/**
 * Kênh gửi OTP, chọn bằng `OTP_PROVIDER` (xem `otp-sender.factory.ts`). OtpService chỉ biết interface này:
 * đổi `mock` ↔ `zalo` không đụng logic sinh mã / hash / TTL / giới hạn thử.
 */
export type OtpProvider = 'zalo' | 'mock';

export const OTP_SENDER = Symbol('OTP_SENDER');

export interface OtpMessage {
  /** E.164 đã chuẩn hóa. */
  phone: string;
  code: string;
  purpose: OtpPurpose;
  expiresAt: Date;
}

export interface OtpDelivery {
  /** Kênh thực sự đã gửi (ghi vào `otp_codes.channel`). */
  channel: OtpChannel;
  /** CHỈ `MockZaloOtpSender` trả trường này để FE hiển thị lại. Kênh thật không bao giờ có. */
  devOtp?: string;
}

export interface OtpSender {
  readonly provider: OtpProvider;
  /** Không gửi được ⇒ throw (OtpService đổi thành 502 `otp_send_failed`), KHÔNG giả vờ thành công. */
  send(message: OtpMessage): Promise<OtpDelivery>;
}

/** 0912345678 → "+8491*****" — đủ để đối chiếu log, không lộ số. */
export const maskForLog = (phone: string) => `${phone.slice(0, 5)}*****`;

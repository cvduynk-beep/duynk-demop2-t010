import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { OtpChannel } from '@prisma/client';
import { maskForLog, OtpDelivery, OtpMessage, OtpSender } from './otp-sender';

/**
 * Zalo GIẢ LẬP cho dev / staging nội bộ (`OTP_PROVIDER=mock`): không gửi gì ra ngoài, trả lại mã để endpoint gửi OTP
 * đưa vào `devOtp` cho FE hiển thị. Chỉ thay KÊNH GỬI: mã vẫn ngẫu nhiên, lưu hash, có TTL / giới hạn thử như thật.
 * Factory đã chặn production lúc khởi động; ở đây chặn thêm một lần nữa phòng khi bị khởi tạo ngoài factory.
 */
@Injectable()
export class MockZaloOtpSender implements OtpSender {
  readonly provider = 'mock' as const;
  private readonly logger = new Logger('MOCK-ZALO');

  constructor(private readonly config: ConfigService) {}

  async send({ phone, code, purpose, expiresAt }: OtpMessage): Promise<OtpDelivery> {
    if (this.config.get('NODE_ENV') === 'production') {
      throw new Error('MockZaloOtpSender bị cấm khi NODE_ENV=production.');
    }
    this.logger.warn(`[MOCK-ZALO] OTP ${purpose} cho ${maskForLog(phone)}: ${code} (hết hạn ${expiresAt.toISOString()}, không gửi tin nhắn thật)`);
    return { channel: OtpChannel.ZALO, devOtp: code };
  }
}

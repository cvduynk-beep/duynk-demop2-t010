import { Injectable, Logger } from '@nestjs/common';

/** Zalo mô phỏng: chỉ ghi mã ra log backend, không gửi tin nhắn thật. Kênh gửi OTP duy nhất của hệ thống. */
@Injectable()
export class ConsoleOtpSender {
  private readonly logger = new Logger(ConsoleOtpSender.name);

  async send(phone: string, code: string): Promise<void> {
    this.logger.warn(`[DEV] OTP cho ${phone.slice(0, 5)}*****: ${code} (không gửi tin nhắn thật)`);
  }
}

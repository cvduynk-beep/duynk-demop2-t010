import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { OtpChannel } from '@prisma/client';
import { OtpDelivery, OtpMessage, OtpSender } from './otp-sender';
import { SmsFallbackSender } from './sms-fallback.sender';

/**
 * Kênh THẬT (`OTP_PROVIDER=zalo`, mặc định): Zalo ZNS, lỗi thì thử SMS dự phòng; cả hai lỗi ⇒ throw (API trả 502).
 * Không bao giờ trả `devOtp`.
 *
 * Trạng thái: CHƯA TÍCH HỢP — chưa có OA / template ZNS duyệt. Thiếu cấu hình ⇒ throw "chưa cấu hình";
 * đủ cấu hình nhưng chưa viết lời gọi API ⇒ throw "chưa tích hợp". Không có nhánh giả vờ gửi thành công.
 */
@Injectable()
export class ZaloOtpSender implements OtpSender {
  readonly provider = 'zalo' as const;
  private readonly logger = new Logger(ZaloOtpSender.name);
  private readonly oaId?: string;
  private readonly accessToken?: string;
  private readonly templateId?: string;

  constructor(
    config: ConfigService,
    private readonly sms: SmsFallbackSender,
  ) {
    this.oaId = config.get<string>('ZALO_OA_ID') || undefined;
    this.accessToken = config.get<string>('ZALO_ACCESS_TOKEN') || undefined;
    this.templateId = config.get<string>('ZALO_ZNS_OTP_TEMPLATE_ID') || undefined;
  }

  async send(message: OtpMessage): Promise<OtpDelivery> {
    try {
      await this.sendZns(message);
      return { channel: OtpChannel.ZALO };
    } catch (err) {
      this.logger.debug(`Zalo ZNS không gửi được: ${(err as Error).message}`);
    }
    await this.sms.send(message);
    return { channel: OtpChannel.SMS };
  }

  private async sendZns(_message: OtpMessage): Promise<void> {
    const missing = [
      ['ZALO_OA_ID', this.oaId],
      ['ZALO_ACCESS_TOKEN', this.accessToken],
      ['ZALO_ZNS_OTP_TEMPLATE_ID', this.templateId],
    ].filter(([, v]) => !v).map(([k]) => k);
    if (missing.length) throw new Error(`Zalo ZNS chưa cấu hình: thiếu ${missing.join(', ')}.`);

    // TODO(zalo-zns): gọi API gửi tin ZNS theo template OTP đã được Zalo duyệt, ví dụ
    //   POST https://business.openapi.zalo.me/message/template
    //   header  access_token: <ZALO_ACCESS_TOKEN>   (token OA hết hạn ⇒ cần luồng refresh token)
    //   body    { phone: "84912345678", template_id: <ZALO_ZNS_OTP_TEMPLATE_ID>,
    //             template_data: { otp: <code> }, tracking_id: <id không chứa mã> }
    //   Thành công khi `error === 0`; còn lại throw để rơi sang SMS. Tên tham số trong `template_data` phụ thuộc mẫu đã duyệt.
    //   KHÔNG log `code` hay access token.
    throw new Error('Zalo ZNS chưa được tích hợp (TODO zalo-zns).');
  }
}

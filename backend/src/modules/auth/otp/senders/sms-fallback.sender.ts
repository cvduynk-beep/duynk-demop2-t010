import { Injectable } from '@nestjs/common';
import { OtpMessage } from './otp-sender';

/** SMS dự phòng khi Zalo lỗi (dùng bên trong `ZaloOtpSender`). Chưa chọn nhà cung cấp (vd. eSMS.vn) nên luôn throw. */
@Injectable()
export class SmsFallbackSender {
  async send(_message: OtpMessage): Promise<void> {
    throw new Error('SmsFallbackSender not implemented: no SMS provider configured yet.');
  }
}

import { Body, Controller, HttpCode, Post, Req, UseGuards } from '@nestjs/common';
import { OtpPurpose } from '@prisma/client';
import { ApiCookieAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Throttle, ThrottlerGuard } from '@nestjs/throttler';
import type { Request } from 'express';
import { CurrentUser } from '../../../common/decorators/current-user.decorator';
import { Public } from '../../../common/decorators/public.decorator';
import { Roles } from '../../../common/decorators/roles.decorator';
import { authError } from '../auth.errors';
import { requestContext } from '../auth.controller';
import { SendOtpDto, SendPhoneOtpDto, VerifyOtpDto, VerifyPhoneDto } from '../dto/auth.dto';
import { PhoneService } from '../phone/phone.service';
import { AuthenticatedUser } from '../session/authenticated-user';
import { ACTION_TOKEN_TTL_SECONDS, ActionTokenService } from './action-token.service';
import { OtpService } from './otp.service';
import { PhoneVerificationService } from './phone-verification.service';

const perMinute = (limit: number) => ({ default: { limit, ttl: 60_000 } });

export const OTP_SEND_DESCRIPTION =
  'Mỗi SĐT+mục đích chỉ được gửi lại sau OTP_RESEND_SECONDS. Response `{expiresInSeconds, resendInSeconds}`. ' +
  'Kênh chọn bằng OTP_PROVIDER: `zalo` (mặc định) gửi Zalo ZNS → SMS, response KHÔNG có mã, chưa cấu hình ⇒ 502 otp_send_failed; ' +
  '`mock` (chỉ dev/staging nội bộ, bị cấm khi NODE_ENV=production) không gửi gì ra ngoài và trả thêm `devOtp` để giao diện hiển thị.';

/** OTP chỉ để chứng minh SĐT là thật — KHÔNG phải phương thức đăng nhập. */
@ApiTags('0. Xác thực & Phân quyền (Auth)')
@Controller('auth')
@UseGuards(ThrottlerGuard)
export class OtpController {
  constructor(
    private readonly otp: OtpService,
    private readonly actionTokens: ActionTokenService,
    private readonly phones: PhoneService,
    private readonly phoneVerification: PhoneVerificationService,
  ) {}

  private normalizedPhone(raw: string): string {
    const phone = this.phones.normalize(raw);
    if (!phone) throw authError('invalid_phone');
    return phone;
  }

  @Public()
  @Post('otp/send')
  @HttpCode(200)
  @Throttle(perMinute(5))
  @ApiOperation({
    summary: 'Gửi OTP 4 số qua Zalo (dự phòng SMS; giả lập khi OTP_PROVIDER=mock) để xác thực SĐT',
    description: OTP_SEND_DESCRIPTION,
  })
  async send(@Body() dto: SendOtpDto, @Req() req: Request) {
    const phone = this.normalizedPhone(dto.phone);
    const sent = await this.otp.send({ phone, purpose: dto.purpose, ...requestContext(req) });
    return { expiresInSeconds: this.otp.expiresInSeconds, resendInSeconds: this.otp.resendInSeconds, ...sent };
  }

  @Public()
  @Post('otp/verify')
  @HttpCode(200)
  @Throttle(perMinute(10))
  @ApiOperation({
    summary: 'Khách thuê xác thực OTP → nhận action token dùng một lần (không có tài khoản/phiên)',
    description: 'Chỉ cho mục đích TENANT_VIEWING / TENANT_DEPOSIT_SIGN. PHONE_VERIFY xác thực ở `POST /auth/phone/verify`.',
  })
  async verify(@Body() dto: VerifyOtpDto, @Req() req: Request) {
    const phone = this.normalizedPhone(dto.phone);
    const verified = await this.otp.verify({ phone, purpose: dto.purpose, code: dto.code, ...requestContext(req) });
    const actionToken = this.actionTokens.issue({ phone, purpose: dto.purpose, otpId: verified.id });
    return { actionToken, expiresInSeconds: ACTION_TOKEN_TTL_SECONDS };
  }

  @Roles('landlord', 'field_host')
  @Post('phone/send-otp')
  @HttpCode(200)
  @Throttle(perMinute(5))
  @ApiCookieAuth('session-cookie')
  @ApiOperation({
    summary: 'Chủ nhà / Field Host xin OTP để xác thực SĐT của mình (PHONE_VERIFY)',
    description: 'Khác `POST /auth/otp/send`: số đang thuộc tài khoản khác ⇒ 409 `phone_already_registered` NGAY, chưa gửi mã. Sau đó gọi `POST /auth/phone/verify`. ' + OTP_SEND_DESCRIPTION,
  })
  async sendPhoneOtp(@CurrentUser() user: AuthenticatedUser, @Body() dto: SendPhoneOtpDto, @Req() req: Request) {
    const phone = this.normalizedPhone(dto.phone);
    await this.phoneVerification.assertAvailable(user.id, phone);
    const sent = await this.otp.send({ phone, purpose: OtpPurpose.PHONE_VERIFY, ...requestContext(req) });
    return { expiresInSeconds: this.otp.expiresInSeconds, resendInSeconds: this.otp.resendInSeconds, ...sent };
  }

  @Roles('landlord', 'field_host')
  @Post('phone/verify')
  @HttpCode(200)
  @Throttle(perMinute(10))
  @ApiCookieAuth('session-cookie')
  @ApiOperation({
    summary: 'Chủ nhà / Field Host xác thực SĐT của mình bằng OTP (mục đích PHONE_VERIFY)',
    description: 'Gọi `POST /auth/phone/send-otp` trước. OTP đúng thì SĐT được gắn vào hồ sơ.',
  })
  async verifyPhone(@CurrentUser() user: AuthenticatedUser, @Body() dto: VerifyPhoneDto, @Req() req: Request) {
    const phone = this.normalizedPhone(dto.phone);
    await this.phoneVerification.verifyAndBind(user.id, phone, dto.code, requestContext(req));
    return { verified: true };
  }
}

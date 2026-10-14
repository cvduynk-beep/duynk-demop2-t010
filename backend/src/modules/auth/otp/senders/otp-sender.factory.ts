import { FactoryProvider, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { MockZaloOtpSender } from './mock-zalo-otp.sender';
import { OTP_SENDER, OtpProvider, OtpSender } from './otp-sender';
import { ZaloOtpSender } from './zalo-otp.sender';

const PROVIDERS: readonly OtpProvider[] = ['zalo', 'mock'];

/**
 * `OTP_PROVIDER` → provider. Trống ⇒ `zalo` (KHÔNG mặc định mock). Giá trị lạ hoặc `mock` + `NODE_ENV=production`
 * ⇒ throw: provider được dựng lúc khởi động nên backend từ chối chạy, không chỉ log cảnh báo.
 */
export function resolveOtpProvider(env: { OTP_PROVIDER?: string; NODE_ENV?: string }): OtpProvider {
  const raw = (env.OTP_PROVIDER ?? '').trim().toLowerCase() || 'zalo';
  if (!PROVIDERS.includes(raw as OtpProvider)) {
    throw new Error(`OTP_PROVIDER="${raw}" không hợp lệ: chỉ nhận ${PROVIDERS.join(' | ')}.`);
  }
  if (raw === 'mock' && env.NODE_ENV === 'production') {
    throw new Error('OTP_PROVIDER=mock bị cấm khi NODE_ENV=production (mock trả mã OTP trong response). Dùng OTP_PROVIDER=zalo.');
  }
  return raw as OtpProvider;
}

export const otpSenderProvider: FactoryProvider<OtpSender> = {
  provide: OTP_SENDER,
  inject: [ConfigService, ZaloOtpSender, MockZaloOtpSender],
  useFactory: (config: ConfigService, zalo: ZaloOtpSender, mock: MockZaloOtpSender) => {
    const provider = resolveOtpProvider({ OTP_PROVIDER: config.get('OTP_PROVIDER'), NODE_ENV: config.get('NODE_ENV') });
    const logger = new Logger('OtpSender');
    if (config.get('OTP_ECHO_DEV_CODE')) {
      logger.warn('OTP_ECHO_DEV_CODE đã bỏ và không còn tác dụng; dùng OTP_PROVIDER=mock (chỉ dev/staging nội bộ).');
    }
    if (provider === 'mock') logger.warn('[MOCK-ZALO] OTP_PROVIDER=mock: không gửi Zalo thật, mã OTP trả về trong `devOtp`.');
    return provider === 'mock' ? mock : zalo;
  },
};

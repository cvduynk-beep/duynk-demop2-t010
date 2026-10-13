import { Logger } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { Test } from '@nestjs/testing';
import { MockZaloOtpSender } from './mock-zalo-otp.sender';
import { OTP_SENDER, OtpSender } from './otp-sender';
import { otpSenderProvider, resolveOtpProvider } from './otp-sender.factory';
import { SmsFallbackSender } from './sms-fallback.sender';
import { ZaloOtpSender } from './zalo-otp.sender';

describe('resolveOtpProvider (OTP_PROVIDER)', () => {
  it('trống / không đặt ⇒ zalo (KHÔNG mặc định mock)', () => {
    expect(resolveOtpProvider({})).toBe('zalo');
    expect(resolveOtpProvider({ OTP_PROVIDER: '  ' })).toBe('zalo');
    expect(resolveOtpProvider({ NODE_ENV: 'production' })).toBe('zalo');
  });

  it('mock ngoài production ⇒ mock; không phân biệt hoa thường', () => {
    expect(resolveOtpProvider({ OTP_PROVIDER: 'mock', NODE_ENV: 'development' })).toBe('mock');
    expect(resolveOtpProvider({ OTP_PROVIDER: 'MOCK', NODE_ENV: 'staging' })).toBe('mock');
    expect(resolveOtpProvider({ OTP_PROVIDER: 'zalo', NODE_ENV: 'production' })).toBe('zalo');
  });

  it('mock + NODE_ENV=production ⇒ throw', () => {
    expect(() => resolveOtpProvider({ OTP_PROVIDER: 'mock', NODE_ENV: 'production' })).toThrow(/bị cấm khi NODE_ENV=production/);
  });

  it('giá trị lạ ⇒ throw (không âm thầm rơi về kênh nào)', () => {
    expect(() => resolveOtpProvider({ OTP_PROVIDER: 'console' })).toThrow(/không hợp lệ/);
    expect(() => resolveOtpProvider({ OTP_PROVIDER: 'true' })).toThrow(/không hợp lệ/);
  });
});

/**
 * Dựng provider qua DI thật của Nest (như lúc backend khởi động). ConfigService thật ưu tiên `process.env` nên đặt biến
 * thẳng vào `process.env` rồi khôi phục.
 */
describe('otpSenderProvider (DI lúc khởi động)', () => {
  const KEYS = ['OTP_PROVIDER', 'NODE_ENV', 'OTP_ECHO_DEV_CODE'] as const;
  let saved: Record<string, string | undefined>;
  beforeEach(() => {
    saved = Object.fromEntries(KEYS.map((k) => [k, process.env[k]]));
    jest.spyOn(Logger.prototype, 'warn').mockImplementation(() => undefined);
  });
  afterEach(() => {
    for (const k of KEYS) {
      if (saved[k] === undefined) delete process.env[k];
      else process.env[k] = saved[k];
    }
    jest.restoreAllMocks();
  });

  const boot = async (env: Partial<Record<(typeof KEYS)[number], string>>) => {
    for (const k of KEYS) {
      if (env[k] === undefined) delete process.env[k];
      else process.env[k] = env[k];
    }
    const moduleRef = await Test.createTestingModule({
      imports: [ConfigModule.forRoot({ ignoreEnvFile: true })],
      providers: [ZaloOtpSender, SmsFallbackSender, MockZaloOtpSender, otpSenderProvider],
    }).compile();
    return moduleRef.get<OtpSender>(OTP_SENDER);
  };

  it('production + OTP_PROVIDER=mock ⇒ module KHÔNG khởi tạo được (backend từ chối chạy)', async () => {
    await expect(boot({ NODE_ENV: 'production', OTP_PROVIDER: 'mock' })).rejects.toThrow(/OTP_PROVIDER=mock bị cấm/);
  });

  it('OTP_PROVIDER lạ ⇒ không khởi tạo được', async () => {
    await expect(boot({ NODE_ENV: 'development', OTP_PROVIDER: 'sms' })).rejects.toThrow(/không hợp lệ/);
  });

  it('dev + mock ⇒ MockZaloOtpSender; production mặc định ⇒ ZaloOtpSender', async () => {
    expect(await boot({ NODE_ENV: 'development', OTP_PROVIDER: 'mock' })).toBeInstanceOf(MockZaloOtpSender);
    expect(await boot({ NODE_ENV: 'production' })).toBeInstanceOf(ZaloOtpSender);
  });

  it('cờ cũ OTP_ECHO_DEV_CODE không còn bật được chế độ giả lập', async () => {
    expect(await boot({ NODE_ENV: 'development', OTP_ECHO_DEV_CODE: 'true' })).toBeInstanceOf(ZaloOtpSender);
    expect(Logger.prototype.warn).toHaveBeenCalledWith(expect.stringContaining('OTP_ECHO_DEV_CODE đã bỏ'));
  });
});

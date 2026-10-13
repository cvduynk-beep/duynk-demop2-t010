import { Logger } from '@nestjs/common';
import { OtpChannel, OtpPurpose } from '@prisma/client';
import { AuthAuditService } from '../auth-audit.service';
import { AuthException } from '../auth.errors';
import { PhoneService } from '../phone/phone.service';
import { fakeConfig } from '../testing/fake-config';
import { createFakePrisma } from '../testing/fake-prisma';
import { containsValue } from '../testing/contains-value';
import { ActionTokenService } from './action-token.service';
import { OtpService } from './otp.service';
import { MockZaloOtpSender } from './senders/mock-zalo-otp.sender';
import { OtpSender } from './senders/otp-sender';
import { SmsFallbackSender } from './senders/sms-fallback.sender';
import { ZaloOtpSender } from './senders/zalo-otp.sender';

const PHONE = '+84912345678';

/** Ghi lại mọi dòng log (mọi mức) để kiểm mã OTP KHÔNG lọt ra log ngoài chế độ mock. */
function captureLogs() {
  const lines: string[] = [];
  for (const level of ['log', 'warn', 'debug', 'error', 'verbose'] as const) {
    jest.spyOn(Logger.prototype, level).mockImplementation((msg: unknown) => {
      lines.push(String(msg));
    });
  }
  return lines;
}

/**
 * `provider` = sender thật được nối vào OtpService: `mock` (MockZaloOtpSender) hoặc `zalo` (ZaloOtpSender, mặc định chưa
 * cấu hình ⇒ throw). Có thể truyền sender tự chế để kiểm chốt chặn.
 */
function setup(env: Record<string, string> = {}, provider: 'mock' | 'zalo' | OtpSender = 'mock') {
  const prisma = createFakePrisma();
  const config = fakeConfig({
    AES_SECRET_KEY: 'a-test-master-secret-of-32-chars!!',
    OTP_RESEND_SECONDS: '0',
    ...env,
  });
  const phones = new PhoneService(config);
  const audit = new AuthAuditService(prisma as any);
  const sms = new SmsFallbackSender();
  const zalo = new ZaloOtpSender(config, sms);
  const sender: OtpSender = provider === 'mock' ? new MockZaloOtpSender(config) : provider === 'zalo' ? zalo : provider;
  const delivered = jest.spyOn(sender, 'send');
  const otp = new OtpService(prisma as any, phones, audit, sender, config);
  const actionTokens = new ActionTokenService(config, otp);
  /** Chế độ mock: mã lấy từ `devOtp` của kết quả — đúng cách giao diện dùng. */
  const sendCode = async (phone = PHONE, purpose: OtpPurpose = OtpPurpose.TENANT_VIEWING) => {
    const result = await otp.send({ phone, purpose });
    expect(result.devOtp).toMatch(/^\d{4}$/);
    return result.devOtp!;
  };
  return { prisma, otp, phones, actionTokens, sendCode, delivered, zalo, sms };
}

afterEach(() => jest.restoreAllMocks());

const errorCode = async (promise: Promise<unknown>) => {
  try {
    await promise;
  } catch (err) {
    return err instanceof AuthException ? err.code : `unexpected:${(err as Error).message}`;
  }
  return 'no-error';
};

describe('OtpService', () => {
  describe('send — OTP_PROVIDER=mock', () => {
    it('trả `devOtp` đúng bằng mã đã gửi; DB chỉ lưu hash (không lưu mã, không lưu SĐT plaintext), TTL 5 phút', async () => {
      const { prisma, sendCode, delivered } = setup();
      const devOtp = await sendCode();

      expect(delivered.mock.calls[0][0]).toMatchObject({ phone: PHONE, code: devOtp, purpose: 'TENANT_VIEWING', expiresAt: expect.any(Date) });
      const row = prisma.otpCode.rows[0];
      expect(containsValue(row, devOtp)).toBe(false); // không có trường nào lưu mã dạng rõ
      expect(row.codeHash).toMatch(/^[0-9a-f]{64}$/);
      expect(JSON.stringify(row)).not.toContain('84912345678');
      expect(row.status).toBe('PENDING');
      expect(row.expiresAt.getTime() - Date.now()).toBeLessThanOrEqual(300_000);
    });

    it('mã trong `devOtp` xác minh được qua verify thật', async () => {
      const { otp, sendCode } = setup();
      const devOtp = await sendCode();
      expect((await otp.verify({ phone: PHONE, purpose: OtpPurpose.TENANT_VIEWING, code: devOtp })).status).toBe('VERIFIED');
    });

    it('không có mã cố định: OTP_DEV_CODE bị bỏ qua, mã luôn ngẫu nhiên 4 số', async () => {
      const { sendCode } = setup({ OTP_DEV_CODE: '4829' });
      const codes = new Set<string>();
      for (let i = 0; i < 12; i++) codes.add(await sendCode('+849123456' + String(10 + i)));
      expect([...codes].every((c) => /^\d{4}$/.test(c))).toBe(true);
      expect(codes.size).toBeGreaterThan(1);
    });

    it('log có nhãn [MOCK-ZALO], SĐT đã che', async () => {
      const logs = captureLogs();
      const { sendCode } = setup();
      const devOtp = await sendCode();
      const line = logs.find((l) => l.includes(`: ${devOtp} `));
      expect(line).toContain('[MOCK-ZALO]');
      expect(line).not.toContain('912345678');
    });

    it('MockZaloOtpSender tự chặn khi NODE_ENV=production (phòng khi bị nối ngoài factory) ⇒ 502, không tạo mã, không log mã', async () => {
      const logs = captureLogs();
      const { prisma, otp, delivered } = setup({ NODE_ENV: 'production' });
      expect(await errorCode(otp.send({ phone: PHONE, purpose: OtpPurpose.TENANT_VIEWING }))).toBe('otp_send_failed');
      expect(prisma.otpCode.rows).toHaveLength(0);
      const code = delivered.mock.calls[0][0].code;
      expect(logs.some((l) => l.includes(code))).toBe(false);
    });

    it('chặn gửi lại trong thời gian chờ', async () => {
      const { otp } = setup({ OTP_RESEND_SECONDS: '60' });
      await otp.send({ phone: PHONE, purpose: OtpPurpose.TENANT_VIEWING });
      expect(await errorCode(otp.send({ phone: PHONE, purpose: OtpPurpose.TENANT_VIEWING }))).toBe('otp_cooldown');
    });

    it('gửi lại: mã mới vô hiệu mã cũ chưa dùng', async () => {
      const { prisma, otp, sendCode } = setup();
      const first = await sendCode();
      const second = await sendCode();

      const pending = prisma.otpCode.rows.filter((r: any) => r.status === 'PENDING');
      expect(pending).toHaveLength(1);
      expect(await errorCode(otp.verify({ phone: PHONE, purpose: OtpPurpose.TENANT_VIEWING, code: first })))
        .toBe(first === second ? 'no-error' : 'otp_invalid');
    });
  });

  describe('send — OTP_PROVIDER=zalo (kênh thật)', () => {
    it('chưa cấu hình Zalo/SMS ⇒ 502 otp_send_failed, không tạo mã, không log mã', async () => {
      const logs = captureLogs();
      const { prisma, otp, delivered } = setup({}, 'zalo');
      expect(await errorCode(otp.send({ phone: PHONE, purpose: OtpPurpose.TENANT_VIEWING }))).toBe('otp_send_failed');
      expect(prisma.otpCode.rows).toHaveLength(0);
      const code = delivered.mock.calls[0][0].code;
      expect(logs.some((l) => l.includes(code))).toBe(false);
      expect(logs.join('\n')).toContain('chưa cấu hình: thiếu ZALO_OA_ID, ZALO_ACCESS_TOKEN, ZALO_ZNS_OTP_TEMPLATE_ID');
    });

    it('đủ cấu hình nhưng chưa tích hợp API ⇒ vẫn 502 (không giả vờ gửi thành công)', async () => {
      const { otp } = setup({ ZALO_OA_ID: 'oa', ZALO_ACCESS_TOKEN: 'tok', ZALO_ZNS_OTP_TEMPLATE_ID: 'tpl' }, 'zalo');
      expect(await errorCode(otp.send({ phone: PHONE, purpose: OtpPurpose.TENANT_VIEWING }))).toBe('otp_send_failed');
    });

    it('ZNS gửi được ⇒ kết quả KHÔNG có mã, kênh ZALO; ZNS lỗi ⇒ SMS dự phòng, kênh SMS', async () => {
      const { prisma, otp, zalo, sms } = setup({}, 'zalo');
      const zns = jest.spyOn(zalo as any, 'sendZns').mockResolvedValue(undefined);
      expect(await otp.send({ phone: PHONE, purpose: OtpPurpose.TENANT_VIEWING })).toEqual({});
      expect(prisma.otpCode.rows[0].channel).toBe(OtpChannel.ZALO);

      zns.mockRejectedValue(new Error('zns down'));
      jest.spyOn(sms, 'send').mockResolvedValue(undefined);
      expect(await otp.send({ phone: '+84900000001', purpose: OtpPurpose.TENANT_VIEWING })).toEqual({});
      expect(prisma.otpCode.rows[1].channel).toBe(OtpChannel.SMS);
    });

    it('chốt chặn: sender không phải mock mà lỡ trả devOtp ⇒ OtpService vẫn bỏ mã khỏi kết quả', async () => {
      const leaky: OtpSender = { provider: 'zalo', send: async (m) => ({ channel: OtpChannel.ZALO, devOtp: m.code }) };
      const { otp } = setup({}, leaky);
      expect(await otp.send({ phone: PHONE, purpose: OtpPurpose.TENANT_VIEWING })).toEqual({});
    });
  });

  describe('verify', () => {
    it('mã đúng → VERIFIED', async () => {
      const { otp, sendCode } = setup();
      const devCode = await sendCode();
      const row = await otp.verify({ phone: PHONE, purpose: OtpPurpose.TENANT_VIEWING, code: devCode });
      expect(row.status).toBe('VERIFIED');
    });

    it('mã sai báo số lần còn lại, sai đủ số lần thì khóa (kể cả nhập đúng sau đó)', async () => {
      const { otp, sendCode } = setup();
      const devCode = await sendCode();
      const wrong = devCode === '0000' ? '1111' : '0000';
      const verify = (code: string) => otp.verify({ phone: PHONE, purpose: OtpPurpose.TENANT_VIEWING, code });

      const err1 = await verify(wrong).catch((e) => e);
      expect(err1.code).toBe('otp_invalid');
      expect(err1.getResponse().errors.attemptsRemaining).toBe(2);
      expect((await verify(wrong).catch((e) => e)).getResponse().errors.attemptsRemaining).toBe(1);
      expect(await errorCode(verify(wrong))).toBe('otp_locked');
      expect(await errorCode(verify(devCode))).toBe('otp_locked');
    });

    it('bị khóa thì không gửi được mã mới cho tới khi hết khóa', async () => {
      const { otp, sendCode } = setup();
      const devCode = await sendCode();
      const wrong = devCode === '0000' ? '1111' : '0000';
      for (let i = 0; i < 3; i++) await otp.verify({ phone: PHONE, purpose: OtpPurpose.TENANT_VIEWING, code: wrong }).catch(() => undefined);
      expect(await errorCode(otp.send({ phone: PHONE, purpose: OtpPurpose.TENANT_VIEWING }))).toBe('otp_locked');
    });

    it('đoán song song không vượt quá số lần thử cho phép', async () => {
      const { otp, sendCode } = setup();
      const devCode = await sendCode();
      const wrong = devCode === '0000' ? '1111' : '0000';

      const results = await Promise.all(
        Array.from({ length: 12 }, () => errorCode(otp.verify({ phone: PHONE, purpose: OtpPurpose.TENANT_VIEWING, code: wrong }))),
      );
      expect(results.filter((r) => r === 'otp_invalid')).toHaveLength(2); // lần 1, 2
      expect(results.filter((r) => r === 'otp_locked')).toHaveLength(10); // lần 3 (khóa) và mọi lần sau
    });

    it('mã hết hạn hoặc không tồn tại → otp_not_found_or_expired', async () => {
      const { prisma, otp, sendCode } = setup();
      expect(await errorCode(otp.verify({ phone: PHONE, purpose: OtpPurpose.TENANT_VIEWING, code: '1234' }))).toBe('otp_not_found_or_expired');

      const devCode = await sendCode();
      prisma.otpCode.rows[0].expiresAt = new Date(Date.now() - 1000);
      expect(await errorCode(otp.verify({ phone: PHONE, purpose: OtpPurpose.TENANT_VIEWING, code: devCode }))).toBe('otp_not_found_or_expired');
    });

    it('mã của SĐT/mục đích khác không dùng được', async () => {
      const { otp, sendCode } = setup();
      const devCode = await sendCode();
      expect(await errorCode(otp.verify({ phone: '+84900000000', purpose: OtpPurpose.TENANT_VIEWING, code: devCode }))).toBe('otp_not_found_or_expired');
      expect(await errorCode(otp.verify({ phone: PHONE, purpose: OtpPurpose.PHONE_VERIFY, code: devCode }))).toBe('otp_not_found_or_expired');
    });
  });

  it('consume chỉ thành công đúng một lần', async () => {
    const { otp, sendCode } = setup();
    const devCode = await sendCode();
    const row = await otp.verify({ phone: PHONE, purpose: OtpPurpose.TENANT_VIEWING, code: devCode });
    expect(await otp.consume(row.id)).toBe(true);
    expect(await otp.consume(row.id)).toBe(false);
  });

  describe('ActionTokenService (dùng một lần, lưu ở DB)', () => {
    it('redeem đúng một lần', async () => {
      const { otp, actionTokens, sendCode } = setup();
      const devCode = await sendCode();
      const verified = await otp.verify({ phone: PHONE, purpose: OtpPurpose.TENANT_VIEWING, code: devCode });

      const token = actionTokens.issue({ phone: PHONE, purpose: 'TENANT_VIEWING', otpId: verified.id });
      expect(await actionTokens.redeem(token, 'TENANT_VIEWING')).toMatchObject({ phone: PHONE, jti: verified.id });
      expect(await errorCode(actionTokens.redeem(token, 'TENANT_VIEWING'))).toBe('action_token_invalid');
    });

    it('từ chối sai mục đích và token giả', async () => {
      const { otp, actionTokens, sendCode } = setup();
      const devCode = await sendCode();
      const verified = await otp.verify({ phone: PHONE, purpose: OtpPurpose.TENANT_VIEWING, code: devCode });
      const token = actionTokens.issue({ phone: PHONE, purpose: 'TENANT_VIEWING', otpId: verified.id });

      expect(await errorCode(actionTokens.redeem(token, 'TENANT_DEPOSIT_SIGN'))).toBe('action_token_invalid');
      expect(await errorCode(actionTokens.redeem('forged.token', 'TENANT_VIEWING'))).toBe('action_token_invalid');
    });
  });
});

import { Inject, Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { OtpCode, OtpPurpose, OtpStatus } from '@prisma/client';
import { PrismaService } from '../../../prisma/prisma.service';
import { AuthAuditService } from '../auth-audit.service';
import { authError } from '../auth.errors';
import { PhoneService } from '../phone/phone.service';
import { deriveKey, resolveMasterSecret } from '../secrets';
import { generateOtpCode, hashOtpCode, otpHashesEqual } from './otp-crypto';
import { OTP_SENDER, OtpDelivery, OtpMessage, OtpSender } from './senders/otp-sender';

export interface OtpRequestContext {
  ipAddress?: string;
  userAgent?: string;
}

/** `devOtp` chỉ có khi `OTP_PROVIDER=mock` (dev/staging nội bộ); kênh thật ⇒ object rỗng. */
export interface OtpSendResult {
  devOtp?: string;
}

const secondsUntil = (date: Date) => Math.max(1, Math.ceil((date.getTime() - Date.now()) / 1000));

/**
 * Vòng đời OTP: sinh mã ngẫu nhiên, lưu hash, gửi qua `OtpSender` (chọn bằng `OTP_PROVIDER`); xác thực có giới hạn thử
 * và khóa. TTL / số lần thử / thời gian khóa nằm ở đây nên đổi provider `mock` ↔ `zalo` không đổi các quy tắc này.
 */
@Injectable()
export class OtpService {
  private readonly logger = new Logger(OtpService.name);
  private readonly pepper: Buffer;
  private readonly ttlSeconds: number;
  private readonly maxAttempts: number;
  private readonly lockoutSeconds: number;
  private readonly resendSeconds: number;

  constructor(
    private readonly prisma: PrismaService,
    private readonly phones: PhoneService,
    private readonly audit: AuthAuditService,
    @Inject(OTP_SENDER) private readonly sender: OtpSender,
    config: ConfigService,
  ) {
    this.pepper = deriveKey(resolveMasterSecret(config, config.get('NODE_ENV')), 'otp:pepper');
    this.ttlSeconds = Number(config.get('OTP_TTL_SECONDS') ?? 300);
    this.maxAttempts = Number(config.get('OTP_MAX_ATTEMPTS') ?? 3);
    this.lockoutSeconds = Number(config.get('OTP_LOCKOUT_SECONDS') ?? 600);
    this.resendSeconds = Number(config.get('OTP_RESEND_SECONDS') ?? 60);
  }

  get expiresInSeconds(): number {
    return this.ttlSeconds;
  }

  /** Thời gian chờ tối thiểu trước khi được gửi lại mã (FE dùng để đếm ngược, khớp `otp_cooldown`). */
  get resendInSeconds(): number {
    return this.resendSeconds;
  }

  /** `phone` phải là E.164 đã chuẩn hóa. Chỉ trả mã (`devOtp`) khi provider là mock. */
  async send(params: { phone: string; purpose: OtpPurpose } & OtpRequestContext): Promise<OtpSendResult> {
    const { phone, purpose, ipAddress, userAgent } = params;
    const phoneHash = this.phones.hash(phone);

    const latest = await this.prisma.otpCode.findFirst({
      where: { phoneHash, purpose },
      orderBy: { createdAt: 'desc' },
    });
    if (latest?.lockedUntil && latest.lockedUntil > new Date()) {
      throw authError('otp_locked', { retryAfterSeconds: secondsUntil(latest.lockedUntil) });
    }
    if (latest) {
      const nextAllowedAt = new Date(latest.createdAt.getTime() + this.resendSeconds * 1000);
      if (nextAllowedAt > new Date()) {
        throw authError('otp_cooldown', { retryAfterSeconds: secondsUntil(nextAllowedAt) });
      }
    }

    const code = generateOtpCode();
    const expiresAt = new Date(Date.now() + this.ttlSeconds * 1000);
    const { channel, devOtp } = await this.deliver({ phone, code, purpose, expiresAt });

    await this.prisma.$transaction([
      // Chỉ mã mới nhất được dùng: vô hiệu các mã cũ chưa xác thực.
      this.prisma.otpCode.updateMany({
        where: { phoneHash, purpose, status: OtpStatus.PENDING },
        data: { status: OtpStatus.CONSUMED, consumedAt: new Date() },
      }),
      this.prisma.otpCode.create({
        data: {
          phoneHash,
          purpose,
          codeHash: hashOtpCode(code, this.pepper),
          channel,
          status: OtpStatus.PENDING,
          expiresAt,
          ipAddress: ipAddress?.slice(0, 45),
          userAgent,
        },
      }),
    ]);
    await this.audit.record('otp_sent', { phoneHash, ipAddress, userAgent, metadata: { purpose, channel, provider: this.sender.provider } });
    // Chốt chặn thứ hai: dù sender nào trả `devOtp`, chỉ provider mock mới được đưa mã ra ngoài.
    return this.sender.provider === 'mock' && devOtp ? { devOtp } : {};
  }

  /**
   * Xác thực mã cho (phone, purpose). Thành công → hàng chuyển VERIFIED và được trả về; người gọi
   * quyết định tiếp (consume ngay, hoặc phát action token). Sai → tăng bộ đếm, tới giới hạn thì khóa.
   *
   * Bộ đếm được tăng NGUYÊN TỬ *trước* khi so mã: nếu đọc-so-ghi thì gửi song song hàng nghìn
   * lần đoán sẽ vượt giới hạn (mã chỉ có 4 chữ số).
   */
  async verify(params: { phone: string; purpose: OtpPurpose; code: string } & OtpRequestContext): Promise<OtpCode> {
    const { phone, purpose, code, ipAddress, userAgent } = params;
    const phoneHash = this.phones.hash(phone);

    const otp = await this.prisma.otpCode.findFirst({
      where: { phoneHash, purpose, status: OtpStatus.PENDING },
      orderBy: { createdAt: 'desc' },
    });
    if (!otp || otp.expiresAt < new Date()) throw authError('otp_not_found_or_expired');
    if (otp.lockedUntil && otp.lockedUntil > new Date()) {
      throw authError('otp_locked', { retryAfterSeconds: secondsUntil(otp.lockedUntil) });
    }

    const { attemptCount } = await this.prisma.otpCode.update({
      where: { id: otp.id },
      data: { attemptCount: { increment: 1 } },
      select: { attemptCount: true },
    });

    if (attemptCount > this.maxAttempts) {
      throw authError('otp_locked', { retryAfterSeconds: this.lockoutSeconds });
    }

    if (!otpHashesEqual(hashOtpCode(code, this.pepper), otp.codeHash)) {
      await this.audit.record('otp_verify_failed', { phoneHash, ipAddress, userAgent, metadata: { purpose } });
      if (attemptCount >= this.maxAttempts) {
        await this.prisma.otpCode.update({
          where: { id: otp.id },
          data: { lockedUntil: new Date(Date.now() + this.lockoutSeconds * 1000) },
        });
        throw authError('otp_locked', { retryAfterSeconds: this.lockoutSeconds });
      }
      throw authError('otp_invalid', { attemptsRemaining: this.maxAttempts - attemptCount });
    }

    // Chỉ một request được chuyển PENDING → VERIFIED (chặn dùng lại cùng một mã song song).
    const claimed = await this.prisma.otpCode.updateMany({
      where: { id: otp.id, status: OtpStatus.PENDING },
      data: { status: OtpStatus.VERIFIED, verifiedAt: new Date() },
    });
    if (claimed.count !== 1) throw authError('otp_not_found_or_expired');

    await this.audit.record('otp_verified', { phoneHash, ipAddress, userAgent, metadata: { purpose } });
    return { ...otp, status: OtpStatus.VERIFIED, verifiedAt: new Date(), attemptCount };
  }

  /** VERIFIED → CONSUMED, nguyên tử. Trả true nếu chính lời gọi này là bên tiêu thụ mã. */
  async consume(id: string): Promise<boolean> {
    const result = await this.prisma.otpCode.updateMany({
      where: { id, status: OtpStatus.VERIFIED },
      data: { status: OtpStatus.CONSUMED, consumedAt: new Date() },
    });
    return result.count === 1;
  }

  private async deliver(message: OtpMessage): Promise<OtpDelivery> {
    try {
      return await this.sender.send(message);
    } catch (err) {
      this.logger.warn(`Không gửi được OTP qua provider ${this.sender.provider}: ${(err as Error).message}`);
      throw authError('otp_send_failed');
    }
  }
}

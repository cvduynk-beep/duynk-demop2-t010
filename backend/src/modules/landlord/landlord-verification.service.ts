import { ConflictException, ForbiddenException, Injectable, Logger, UnprocessableEntityException } from '@nestjs/common';
import { IdentityStatus } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { PhoneService } from '../auth/phone/phone.service';
import { EkycSimulator, EKYC_CONSENT_VERSION } from '../identity/ekyc.simulator';
import { ageOn, normalizeName, parseVnDate } from '../identity/identity.service';
import { EkycScanResult } from '../tenant/tenant.types';
import { PAYOUT_ACCOUNT_PATTERN, PayoutAccountView, maskBankAccount, toPayoutView } from '../../common/payout/payout-account';
import { LandlordEkycSubmitDto, UpdatePayoutAccountDto } from './dto/landlord.dto';
import { maskPhone } from './landlord.mappers';

type KycFields = EkycScanResult['fields'];
export type VerificationStep = 'phone' | 'identity' | 'payout';

export interface LandlordVerification {
  phone: { verified: boolean; maskedPhone: string | null };
  identity: { verified: boolean; fullName: string | null; idNumberMasked: string | null; address: string | null; verifiedAt: Date | null };
  payout: { verified: boolean; account: PayoutAccountView | null; verifiedAt: Date | null };
  /** Các bước còn thiếu theo đúng thứ tự làm; rỗng = được ký gửi. */
  missing: VerificationStep[];
  ready: boolean;
}

/** Token quét eKYC của chủ nhà gắn với `landlord:<id>` (khác khoá lịch hẹn của khách thuê) để không dùng chéo được. */
const scanSubject = (landlordId: string) => `landlord:${landlordId}`;

/**
 * Xác thực chủ nhà trước khi được ký gửi: (1) SĐT qua OTP Zalo (`/auth/phone/*`), (2) eKYC CCCD — lấy họ tên + địa chỉ
 * thường trú (OCR MÔ PHỎNG như luồng khách thuê, lưu mã hoá AES vào `identity_verifications` với `deposit_id` null),
 * (3) tài khoản ngân hàng — tên chủ TK phải trùng họ tên eKYC (MÔ PHỎNG tra cứu tên Napas247), đặt `payout_verified_at`.
 */
@Injectable()
export class LandlordVerificationService {
  private readonly logger = new Logger(LandlordVerificationService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly phones: PhoneService,
    private readonly audit: AuditService,
  ) {}

  private async latestKyc(landlordId: string) {
    return this.prisma.identityVerification.findFirst({
      where: { tenantId: landlordId, depositId: null, status: IdentityStatus.VERIFIED },
      orderBy: { verifiedAt: 'desc' },
      select: { verifiedDataRef: true, verifiedAt: true },
    });
  }

  private decryptKyc(ref: string | null | undefined): KycFields | null {
    if (!ref) return null;
    try {
      return JSON.parse(this.phones.decrypt(ref)) as KycFields;
    } catch {
      return null;
    }
  }

  async status(landlordId: string): Promise<LandlordVerification> {
    const [profile, kyc] = await Promise.all([
      this.prisma.profile.findUnique({
        where: { id: landlordId },
        select: {
          phoneEnc: true,
          isPhoneVerified: true,
          payoutBankName: true,
          payoutAccountEnc: true,
          payoutAccountHolder: true,
          payoutVerifiedAt: true,
        },
      }),
      this.latestKyc(landlordId),
    ]);
    let phone: string | null = null;
    try {
      phone = profile?.phoneEnc ? this.phones.decrypt(profile.phoneEnc) : null;
    } catch {
      phone = null;
    }
    const fields = this.decryptKyc(kyc?.verifiedDataRef);
    const account = toPayoutView(
      { bankName: profile?.payoutBankName, accountEnc: profile?.payoutAccountEnc, holder: profile?.payoutAccountHolder },
      (e) => this.phones.decrypt(e),
    );

    const phoneOk = !!profile?.isPhoneVerified;
    const identityOk = !!fields;
    const payoutOk = !!(account && profile?.payoutVerifiedAt);
    const missing: VerificationStep[] = [];
    if (!phoneOk) missing.push('phone');
    if (!identityOk) missing.push('identity');
    if (!payoutOk) missing.push('payout');
    return {
      phone: { verified: phoneOk, maskedPhone: phoneOk ? maskPhone(phone) : null },
      identity: {
        verified: identityOk,
        fullName: fields?.fullName ?? null,
        idNumberMasked: fields ? `${fields.idNumber.slice(0, 3)}******${fields.idNumber.slice(-3)}` : null,
        address: fields?.address ?? null,
        verifiedAt: kyc?.verifiedAt ?? null,
      },
      payout: { verified: payoutOk, account, verifiedAt: profile?.payoutVerifiedAt ?? null },
      missing,
      ready: missing.length === 0,
    };
  }

  /** Chặn ký gửi khi chưa đủ 3 bước — 403 `landlord_not_verified` kèm danh sách bước còn thiếu. */
  async assertReady(landlordId: string): Promise<LandlordVerification> {
    const s = await this.status(landlordId);
    if (!s.ready) {
      throw new ForbiddenException({
        message: 'Vui lòng hoàn tất xác thực tài khoản (SĐT, CCCD, ngân hàng) trước khi ký gửi.',
        code: 'landlord_not_verified',
        missing: s.missing,
      });
    }
    return s;
  }

  async scan(landlordId: string, consent: boolean, consentVersion: string): Promise<EkycScanResult> {
    if (consent !== true || consentVersion !== EKYC_CONSENT_VERSION) {
      throw new ConflictException({ message: 'Phiên bản chấp thuận dữ liệu cá nhân đã cũ, vui lòng cập nhật.', code: 'terms_version_stale' });
    }
    const profile = await this.prisma.profile.findUnique({ where: { id: landlordId }, select: { fullName: true, phoneEnc: true } });
    let phone: string | undefined;
    try {
      phone = profile?.phoneEnc ? this.phones.decrypt(profile.phoneEnc) : undefined;
    } catch {
      phone = undefined;
    }
    const data = EkycSimulator.scan(profile?.fullName ?? undefined, phone);
    return { scanId: EkycSimulator.createScanToken(scanSubject(landlordId), data, consentVersion), ...data };
  }

  async submit(landlordId: string, dto: LandlordEkycSubmitDto): Promise<LandlordVerification> {
    const token = EkycSimulator.verifyScanToken(dto.scanId);
    if (!token || token.viewingId !== scanSubject(landlordId)) {
      throw new UnprocessableEntityException({ message: 'Mã phiên quét eKYC đã hết hạn (15 phút) hoặc không hợp lệ.', code: 'scan_expired' });
    }
    if (dto.consentVersion !== token.consentVersion || token.consentVersion !== EKYC_CONSENT_VERSION) {
      throw new ConflictException({ message: 'Phiên bản đồng ý xử lý dữ liệu cá nhân không còn hiệu lực. Vui lòng quét lại.', code: 'terms_version_stale' });
    }
    const now = new Date();
    const fields: KycFields = {
      fullName: dto.fields.fullName.trim().toUpperCase(),
      idNumber: dto.fields.idNumber.trim(),
      dob: dto.fields.dob.trim(),
      issuedDate: dto.fields.issuedDate.trim(),
      address: dto.fields.address.trim(),
    };
    const invalid: string[] = [];
    if (fields.fullName.length < 2 || fields.fullName.length > 100) invalid.push('fullName');
    if (!/^\d{12}$/.test(fields.idNumber)) invalid.push('idNumber');
    const dob = parseVnDate(fields.dob);
    if (!dob || ageOn(dob, now) < 18) invalid.push('dob');
    const issued = parseVnDate(fields.issuedDate);
    if (!issued || issued > now) invalid.push('issuedDate');
    if (fields.address.length < 3) invalid.push('address');
    if (invalid.length) {
      throw new UnprocessableEntityException({ message: 'Dữ liệu CCCD không hợp lệ.', code: 'kyc_fields_invalid', fields: invalid });
    }
    if (token.lowConfidenceKeys.length > 0 && !dto.confirmedLowConfidence) {
      throw new UnprocessableEntityException({ message: 'Vui lòng xác nhận các trường thông tin có độ tin cậy thấp.', code: 'kyc_confirmation_required' });
    }

    const profile = await this.prisma.profile.findUnique({ where: { id: landlordId }, select: { payoutAccountHolder: true } });
    // Đổi CCCD (họ tên khác) ⇒ tài khoản ngân hàng đã xác thực theo tên cũ không còn đúng chính chủ ⇒ phải xác thực lại.
    const payoutStale = !!profile?.payoutAccountHolder && normalizeName(profile.payoutAccountHolder) !== normalizeName(fields.fullName);

    await this.prisma.$transaction(async (tx) => {
      await tx.identityVerification.create({
        data: {
          tenantId: landlordId,
          providerName: 'SIMULATED',
          providerRefId: token.jti,
          confidenceScore: Math.min(...Object.values(token.confidence)),
          fieldConfidence: token.confidence,
          faceMatchScore: token.faceMatch,
          manuallyEdited: JSON.stringify(fields) !== JSON.stringify(token.fields),
          c06Confirmed: true,
          status: IdentityStatus.VERIFIED,
          verifiedDataRef: this.phones.encrypt(JSON.stringify(fields)),
          consentAt: new Date(token.consentAt),
          consentVersion: token.consentVersion,
          verifiedAt: now,
          rawDataPurgeAt: now,
          rawDataPurgedAt: now,
        },
      });
      await tx.profile.update({
        where: { id: landlordId },
        data: { fullName: fields.fullName, ...(payoutStale ? { payoutVerifiedAt: null } : {}) },
      });
    });
    await this.audit.log({
      actorId: landlordId,
      actorRole: 'landlord',
      actionType: 'LANDLORD_EKYC_VERIFIED',
      entityName: 'Profile',
      entityId: landlordId,
      newValue: { simulated: true, payoutReset: payoutStale },
    });
    this.logger.log(`[EKYC] Chủ nhà ${landlordId} đã xác thực CCCD (mô phỏng OCR)`);
    return this.status(landlordId);
  }

  /**
   * Lưu + xác thực tài khoản thụ hưởng: bắt buộc đã eKYC; tên chủ TK phải trùng họ tên CCCD (bỏ dấu, không phân biệt hoa thường).
   * MÔ PHỎNG tra cứu tên chủ TK qua Napas247 bằng phép so tên này. Có Audit Log (bản che).
   */
  async updatePayout(landlordId: string, dto: UpdatePayoutAccountDto): Promise<LandlordVerification> {
    const bankName = dto.bankName.trim();
    const account = dto.bankAccount.trim();
    const holder = dto.bankAccountHolder.trim().toUpperCase();
    if (!bankName || !PAYOUT_ACCOUNT_PATTERN.test(account) || holder.length < 3) {
      throw new UnprocessableEntityException({ message: 'Tài khoản nhận tiền cần đủ ngân hàng, số tài khoản (6–20 số) và tên chủ tài khoản.', code: 'payout_invalid' });
    }
    const kyc = this.decryptKyc((await this.latestKyc(landlordId))?.verifiedDataRef);
    if (!kyc) {
      throw new ConflictException({ message: 'Vui lòng xác thực CCCD (eKYC) trước khi thêm tài khoản ngân hàng.', code: 'kyc_required' });
    }
    if (normalizeName(holder) !== normalizeName(kyc.fullName)) {
      throw new UnprocessableEntityException({
        message: `Tên chủ tài khoản phải trùng họ tên trên CCCD (${kyc.fullName}). Tài khoản người khác không được nhận tiền thuê.`,
        code: 'payout_name_mismatch',
      });
    }
    const now = new Date();
    await this.prisma.profile.update({
      where: { id: landlordId },
      data: {
        payoutBankName: bankName,
        payoutAccountEnc: this.phones.encrypt(account),
        payoutAccountHolder: holder,
        payoutUpdatedAt: now,
        payoutVerifiedAt: now,
      },
    });
    await this.audit.log({
      actorId: landlordId,
      actorRole: 'landlord',
      actionType: 'PAYOUT_ACCOUNT_VERIFIED',
      entityName: 'Profile',
      entityId: landlordId,
      newValue: { bankName, bankAccountMasked: maskBankAccount(account), bankAccountHolder: holder, simulated: true },
    });
    return this.status(landlordId);
  }
}

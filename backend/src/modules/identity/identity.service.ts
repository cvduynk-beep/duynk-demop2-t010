import {
  Injectable,
  ConflictException,
  UnprocessableEntityException,
  Logger,
} from '@nestjs/common';
import { DepositStatus, IdentityStatus, ViewingStatus } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { PhoneService } from '../auth/phone/phone.service';
import { BookingAccessService } from '../tenant/booking-access.service';
import { DepositService } from '../deposit/deposit.service';
import { EkycSimulator, EKYC_CONSENT_VERSION } from './ekyc.simulator';
import { EkycScanRequestDto, SubmitEkycInputDto } from './dto/identity.dto';
import { toTenantBooking, statusToWeb } from '../tenant/tenant.mappers';
import { EkycScanResult, TenantBooking } from '../tenant/tenant.types';

/** Họ tên so khớp không dấu, không phân biệt hoa thường/khoảng trắng. */
export function normalizeName(str: string): string {
  return (str || '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/đ/g, 'd')
    .replace(/Đ/g, 'D')
    .toUpperCase()
    .trim()
    .replace(/\s+/g, ' ');
}

export function parseVnDate(dateStr: string): Date | null {
  const parts = (dateStr || '').split('/');
  if (parts.length !== 3) return null;
  const d = new Date(parseInt(parts[2], 10), parseInt(parts[1], 10) - 1, parseInt(parts[0], 10));
  return isNaN(d.getTime()) ? null : d;
}

export function ageOn(dob: Date, today: Date): number {
  let age = today.getFullYear() - dob.getFullYear();
  const m = today.getMonth() - dob.getMonth();
  if (m < 0 || (m === 0 && today.getDate() < dob.getDate())) age--;
  return age;
}

/**
 * eKYC CCCD của Khách thuê (bước trước khi ký Hợp đồng thuê).
 *
 * MÔ PHỎNG (được giữ có chủ đích): `scan` không gọi FPT.AI mà dùng `EkycSimulator` — trả kết quả OCR giả kèm độ tin
 * cậy từng trường và `scanId` ký HMAC hạn 15 phút. Phần còn lại là thật: chỉ chủ lịch, lịch phải đang giữ chỗ (cọc đã
 * báo có, chưa hết hạn), dữ liệu đã xác nhận được mã hoá AES-256 vào `identity_verifications.verified_data_ref`.
 * Hợp đồng thuê lập ở bước sau: `POST /contracts/lease/sign`.
 */
@Injectable()
export class IdentityService {
  private readonly logger = new Logger(IdentityService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly phones: PhoneService,
    private readonly bookingAccess: BookingAccessService,
    private readonly depositService: DepositService,
  ) {}

  /** Lịch phải HOLDING và cọc còn hiệu lực; hết hạn thì nhả căn rồi báo `hold_expired`. */
  private async assertActiveHold(viewing: any) {
    if (viewing.status !== ViewingStatus.HOLDING) {
      throw new ConflictException({
        message: 'Lịch hẹn không ở trạng thái giữ chỗ.',
        code: 'bad_status',
        expected: 'holding',
        actual: statusToWeb(viewing.status),
      });
    }
    const deposit = viewing.deposit;
    const now = new Date();
    const expired = deposit?.expiresAt && deposit.expiresAt <= now;
    if (!deposit || deposit.paymentStatus !== DepositStatus.PAID_HOLDING || expired) {
      if (expired) await this.depositService.expireIfDue(viewing.unitId);
      throw new ConflictException({ message: 'Thời hạn giữ chỗ đã kết thúc.', code: 'hold_expired' });
    }
    return deposit;
  }

  private contactPhone(viewing: any): string | undefined {
    if (!viewing.contactPhoneEnc) return undefined;
    try {
      return this.phones.decrypt(viewing.contactPhoneEnc);
    } catch {
      return undefined;
    }
  }

  async scan(ref: string, user: { id: string }, dto: EkycScanRequestDto): Promise<EkycScanResult> {
    const viewing = await this.bookingAccess.loadOwned(ref, user);
    const deposit = await this.assertActiveHold(viewing);
    if (deposit.identity) {
      throw new ConflictException({ message: 'Thông tin eKYC đã được xác thực trước đó.', code: 'ekyc_already_done' });
    }
    if (dto.consent !== true || dto.consentVersion !== EKYC_CONSENT_VERSION) {
      throw new ConflictException({
        message: 'Phiên bản chấp thuận dữ liệu cá nhân đã cũ, vui lòng cập nhật.',
        code: 'terms_version_stale',
      });
    }

    const scanData = EkycSimulator.scan(viewing.contactName || viewing.tenant?.fullName, this.contactPhone(viewing));
    const scanId = EkycSimulator.createScanToken(viewing.id, scanData, dto.consentVersion);
    return { scanId, ...scanData };
  }

  async submit(ref: string, user: { id: string }, dto: SubmitEkycInputDto): Promise<{ booking: TenantBooking }> {
    const viewing = await this.bookingAccess.loadOwned(ref, user);

    const token = EkycSimulator.verifyScanToken(dto.scanId);
    if (!token || token.viewingId !== viewing.id) {
      throw new UnprocessableEntityException({
        message: 'Mã phiên quét eKYC đã hết hạn (15 phút) hoặc không hợp lệ.',
        code: 'scan_expired',
      });
    }
    // Phiên bản đồng ý quyền riêng tư phải là bản khách ĐÃ đồng ý lúc scan (nằm trong token ký), không tin body.
    if (dto.consentVersion !== token.consentVersion || token.consentVersion !== EKYC_CONSENT_VERSION) {
      throw new ConflictException({
        message: 'Phiên bản đồng ý xử lý dữ liệu cá nhân không còn hiệu lực. Vui lòng quét lại.',
        code: 'terms_version_stale',
      });
    }

    const deposit = await this.assertActiveHold(viewing);
    if (deposit.identity) {
      throw new ConflictException({ message: 'Thông tin eKYC đã được xác thực trước đó.', code: 'ekyc_already_done' });
    }

    const now = new Date();
    const fields = {
      fullName: (dto.fields.fullName || '').trim().toUpperCase(),
      idNumber: (dto.fields.idNumber || '').trim(),
      dob: (dto.fields.dob || '').trim(),
      issuedDate: (dto.fields.issuedDate || '').trim(),
      address: (dto.fields.address || '').trim(),
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
      throw new UnprocessableEntityException({
        message: 'Vui lòng xác nhận các trường thông tin có độ tin cậy thấp.',
        code: 'kyc_confirmation_required',
      });
    }
    const bookingName = viewing.contactName || viewing.tenant?.fullName || '';
    const nameMismatch = normalizeName(fields.fullName) !== normalizeName(bookingName);
    if (nameMismatch && !dto.confirmedNameMismatch) {
      throw new UnprocessableEntityException({
        message: 'Họ tên trên CCCD khác tên người đặt lịch xem phòng, vui lòng xác nhận.',
        code: 'kyc_confirmation_required',
      });
    }

    await this.prisma.$transaction(async (tx) => {
      await tx.identityVerification.create({
        data: {
          tenantId: viewing.tenantId,
          depositId: deposit.id,
          providerName: 'SIMULATED',
          providerRefId: token.jti,
          confidenceScore: Math.min(...Object.values(token.confidence)),
          fieldConfidence: token.confidence,
          faceMatchScore: token.faceMatch,
          manuallyEdited: JSON.stringify(fields) !== JSON.stringify(token.fields),
          mismatchFields: nameMismatch ? ['fullName'] : [],
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
      await tx.profile.update({ where: { id: viewing.tenantId }, data: { fullName: fields.fullName } });
      if (nameMismatch) {
        await tx.auditLog.create({
          data: {
            actorId: user.id,
            actorRole: 'tenant',
            actionType: 'EKYC_NAME_MISMATCH',
            entityName: 'IdentityVerification',
            entityId: deposit.id,
            newValue: { bookingName, cccdName: fields.fullName },
          },
        });
      }
    });
    this.logger.log(`[EKYC] Đã lưu eKYC (mô phỏng OCR) cho lịch ${viewing.bookingRefCode}`);

    const reloaded = await this.bookingAccess.loadOwned(ref, user);
    return { booking: toTenantBooking(reloaded, { rawPhone: this.contactPhone(reloaded) }) };
  }
}

import { randomBytes } from 'node:crypto';
import {
  BadRequestException,
  ConflictException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { Furnishing, LayoutType, MandateStatus, OtpPurpose, PhysicalKeyState, UnitStatus } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { OtpService } from '../auth/otp/otp.service';
import { PhoneService } from '../auth/phone/phone.service';
import { toPhotoView } from '../inspection/inspection.helpers';
import { toPayoutView } from '../../common/payout/payout-account';
import type { LandlordInspectionView } from '../inspection/inspection.types';
import { InspectorAssigner } from '../inspection/inspector-assigner.service';
import { ConsignmentMetaStore } from './consignment-meta.store';
import { LandlordAccessService } from './landlord-access.service';
import { LandlordPhotoService } from './landlord-photo.service';
import { LandlordVerificationService } from './landlord-verification.service';
import { mgmtFeePerM2 } from './mgmt-fee';
import { CreateConsignmentDto } from './dto/landlord.dto';
import {
  ABSOLUTE_RENT_CEILING,
  ConsignmentMeta,
  INSPECT_SLA_HOURS,
  MIN_FLOOR_RENT,
  RENT_CEILING_BY_KIND,
  LockKind,
  consignmentStage,
  doorFromCode,
  isCatalogCode,
  maskPhone,
  parseLock,
  readConsignmentMeta,
  toDoorLockType,
  toLayoutKind,
  toLayoutType,
  toLockKind,
  withConsignmentMeta,
} from './landlord.mappers';

type MandateWithUnit = Awaited<ReturnType<LandlordAccessService['ownedMandate']>>;

/**
 * Hồ sơ ký gửi = Unit (chưa niêm yết, `isVerified=false`) + ExclusiveMandate `PENDING_INSPECTION`.
 * Không có bản nháp: hồ sơ chỉ được tạo khi chủ nhà đã cam kết + ký OTP, vào thẳng `awaiting_host`.
 * `consignmentId` chính là `ExclusiveMandate.id` — cùng khóa mà module Host dùng khi liệt kê ca thẩm định.
 */
@Injectable()
export class LandlordConsignmentService {
  private readonly logger = new Logger(LandlordConsignmentService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly access: LandlordAccessService,
    private readonly audit: AuditService,
    private readonly otp: OtpService,
    private readonly phones: PhoneService,
    private readonly photos: LandlordPhotoService,
    private readonly metaStore: ConsignmentMetaStore,
    private readonly assigner: InspectorAssigner,
    private readonly verification: LandlordVerificationService,
  ) {}

  private async configValue(key: string, fallback: number): Promise<number> {
    const row = await this.prisma.feeConfig.findUnique({ where: { configKey: key } }).catch(() => null);
    if (!row || typeof row.paramValue !== 'number' || isNaN(row.paramValue)) return fallback;
    return row.paramValue;
  }

  /** Cọc bảo đảm phải trong [min, max] × giá thuê tháng (Admin cấu hình, mặc định 0.5–4). */
  /** Giá chào không được vượt trần theo layout / trần tuyệt đối (chặn cứng ở backend, không chỉ ở form). */
  private assertRentWithinCeiling(layout: LayoutType, askRent: number): void {
    const ceiling = Math.min(RENT_CEILING_BY_KIND[toLayoutKind(layout)], ABSOLUTE_RENT_CEILING);
    if (askRent > ceiling) {
      throw new BadRequestException({
        message: `Giá thuê vượt trần cho loại căn này (tối đa ${ceiling.toLocaleString('vi-VN')}đ/tháng).`,
        code: 'rent_above_ceiling',
        ceiling,
      });
    }
  }

  /** null = không ủy quyền chốt nhanh. Bật ⇒ bắt buộc giá sàn ≥ 3.000.000 và < giá chào. */
  private parseFloorRent(allowFastClose: boolean, floorRent: number | undefined, askRent: number): number | null {
    if (!allowFastClose) return null;
    if (floorRent == null || !Number.isInteger(floorRent) || floorRent < MIN_FLOOR_RENT || floorRent >= askRent) {
      throw new BadRequestException({
        message: `Giá sàn phải từ ${MIN_FLOOR_RENT.toLocaleString('vi-VN')}đ và thấp hơn giá chào thuê.`,
        code: 'floor_rent_invalid',
      });
    }
    return floorRent;
  }

  private async assertDepositInRange(askRent: number, deposit: number): Promise<void> {
    const minRatio = await this.configValue('deposit_min_ratio', 0.5);
    const maxRatio = await this.configValue('deposit_max_ratio', 4.0);
    const minDeposit = Math.round(minRatio * askRent);
    const maxDeposit = Math.round(maxRatio * askRent);
    if (deposit < minDeposit || deposit > maxDeposit) {
      throw new BadRequestException(
        `Tiền cọc đề xuất phải từ ${Math.round(minRatio * 100)}% đến ${maxRatio} lần giá thuê (${minDeposit.toLocaleString('vi-VN')}đ – ${maxDeposit.toLocaleString('vi-VN')}đ).`,
      );
    }
  }

  async list(landlordId: string) {
    const mandates = await this.prisma.exclusiveMandate.findMany({
      where: { unit: { landlordId } },
      orderBy: { createdAt: 'desc' },
      include: { unit: { include: { building: true } } },
    });
    // Mọi ủy quyền ĐÃ KÝ đều là hồ sơ ký gửi — kể cả ủy quyền nhập thẳng DB (không có meta biểu mẫu: lấy số liệu từ `units`).
    // Chưa ký (`signedAt` null) = bản nháp cũ trước khi bỏ nháp ⇒ không hiển thị.
    return mandates.filter((m) => m.signedAt).map((m) => this.toDto(m));
  }

  /** Chi tiết một hồ sơ, kèm ảnh chủ nhà đã tải lên (URL xem có hạn 1 giờ). */
  async get(landlordId: string, id: string) {
    const mandate = await this.access.ownedMandate(landlordId, id);
    // Bản nháp cũ (chưa ký) không còn là hồ sơ hợp lệ: coi như không tồn tại.
    if (!mandate.signedAt && mandate.status === MandateStatus.PENDING_INSPECTION) throw new NotFoundException('Không tìm thấy hồ sơ ký gửi.');
    const meta = readConsignmentMeta(mandate.doorAccessConfig);
    const [photos, inspection] = await Promise.all([this.photos.withUrls(meta?.photos ?? []), this.inspectionView(meta)]);
    return { ...this.toDto(mandate), photos, inspection };
  }

  /**
   * Phiếu thẩm định cho chủ nhà xem (E10): báo cáo + ảnh hạng mục/niêm yết (link ký 1h) + tên Host. Chưa nộp phiếu ⇒ null.
   * Chỉ họ tên Host, không SĐT/email (B10).
   */
  private async inspectionView(meta: ConsignmentMeta | null): Promise<LandlordInspectionView | null> {
    const report = meta?.report;
    if (!meta || !report) return null;
    const photos = meta.inspection?.photos ?? [];
    const [host, urls] = await Promise.all([
      this.prisma.fieldHost.findUnique({ where: { id: report.hostId }, select: { profile: { select: { fullName: true } } } }),
      this.photos.signPaths(photos.map((p) => p.path)),
    ]);
    return {
      hostName: host?.profile?.fullName ?? null,
      submittedAt: report.submittedAt,
      report,
      photos: photos.map((p) => toPhotoView(p, urls)),
    };
  }

  async create(landlordId: string, dto: CreateConsignmentDto) {
    const layout = toLayoutType(dto.layout);
    if (!layout) throw new BadRequestException(`Loại căn không hợp lệ: ${dto.layout}`);


    const inventoryCodes = [...new Set(dto.inventoryCodes ?? [])];
    const unknown = inventoryCodes.find((c) => !isCatalogCode(c));
    if (unknown) throw new BadRequestException(`Hạng mục không có trong bảng kê: ${unknown}`);

    const locks = this.parseLocks(dto.locks);
    this.assertRentWithinCeiling(layout, dto.askRent);
    const floorRent = this.parseFloorRent(dto.allowFastClose === true, dto.floorRent, dto.askRent);
    const suggestedDeposit = dto.suggestedDeposit ?? dto.askRent;
    await this.assertDepositInRange(dto.askRent, suggestedDeposit);
    if (dto.ownershipWarranted !== true) {
      throw new BadRequestException('Cần cam kết quyền sở hữu/sử dụng hợp pháp căn hộ trước khi ký.');
    }

    const building = await this.prisma.building.findUnique({ where: { buildingCode: dto.building } });
    if (!building) throw new BadRequestException('Tòa nhà không thuộc phân khu hỗ trợ.');
    if (dto.floor > building.totalFloors) {
      throw new BadRequestException(`Tòa ${building.buildingCode} chỉ có ${building.totalFloors} tầng.`);
    }

    const unitCode = `VHOP-${building.buildingCode}-${dto.floor}${dto.door.toUpperCase()}`;
    if (await this.prisma.unit.findUnique({ where: { unitCode } })) {
      throw new ConflictException(`Căn ${unitCode} đã có trong hệ thống.`);
    }

    const mgmtRate = await mgmtFeePerM2(this.prisma);
    const lock = toDoorLockType(locks[0]);
    const payout = await this.resolvePayout(landlordId);
    // Mọi kiểm tra rẻ đã xong ⇒ mới tiêu thụ OTP (không đốt mã vì lỗi form).
    const { phone: signedPhone, otpSkipped } = await this.verifySignOtp(landlordId, dto.otp, dto.phone);
    const now = new Date();
    const meta: ConsignmentMeta = {
      stage: 'awaiting_host',
      ownershipWarrantedAt: now.toISOString(),
      signedPhoneEnc: this.phones.encrypt(signedPhone),
      inspectDueAt: new Date(now.getTime() + INSPECT_SLA_HOURS * 3_600_000).toISOString(),
      payout,
      form: {
        building: building.buildingCode,
        floor: dto.floor,
        door: dto.door.toUpperCase(),
        areaM2: dto.areaM2,
        askRent: dto.askRent,
        suggestedDeposit,
        leaseTerm: dto.leaseTerm ?? null,
        furnished: dto.furnished ?? null,
        locks,
        note: dto.note?.trim() || null,
        ...(dto.inventoryCodes ? { inventoryCodes } : {}),
        allowFastClose: floorRent !== null,
        floorRent,
      },
    };

    let inspectorId: string | null = null;
    const mandate = await this.prisma.$transaction(async (tx) => {
      const unit = await tx.unit.create({
        data: {
          unitCode,
          buildingId: building.id,
          landlordId,
          floorNumber: dto.floor,
          layoutType: layout,
          carpetAreaM2: dto.areaM2,
          baseRentPrice: dto.askRent,
          managementFee: Math.round(dto.areaM2 * mgmtRate),
          // Chưa có số liệu thị trường: đặt bằng giá chào ⇒ chưa có badge "Căn hời" (không còn bước Admin duyệt; giữ nguyên giá trị này khi niêm yết).
          marketAvgPrice: dto.askRent,
          bathrooms: dto.bathrooms ?? (layout === 'STUDIO' || layout === 'ONE_BED_PLUS' ? 1 : 2),
          direction: dto.direction ?? null,
          securityDeposit: dto.suggestedDeposit ?? null,
          minLeaseMonths: dto.leaseTerm === 'long' || dto.leaseTerm === 'fixed' ? 12 : 6,
          ...(dto.furnished === true ? { furnishing: Furnishing.FULL } : dto.furnished === false ? { furnishing: Furnishing.EMPTY } : {}),
          doorLockType: lock,
          isVerified: false,
          status: UnitStatus.UNLISTED,
        },
      });
      if (dto.doorCode || locks.includes('physical')) {
        await tx.doorAccessKey.create({
          data: {
            unitId: unit.id,
            keyType: lock,
            vaultSecretRef: dto.doorCode && lock === 'ELECTRONIC_PIN' ? `aes:${this.phones.encrypt(dto.doorCode)}` : null,
            physicalKeyState: lock === 'PHYSICAL_KEY' ? PhysicalKeyState.AT_DESK : null,
          },
        });
      }
      // Không có Inspector trong phân khu ⇒ không ghi hostId: ca vào Open Pool ngay.
      const inspector = await this.assigner.pick(tx, building.zoneName);
      inspectorId = inspector?.id ?? null;
      if (inspector) {
        meta.hostId = inspector.id;
        meta.offeredAt = now.toISOString();
      }
      return tx.exclusiveMandate.create({
        data: {
          unitId: unit.id,
          contractNumber: `UQ-${new Date().getFullYear()}-${building.buildingCode.replace('.', '')}-${randomBytes(3).toString('hex').toUpperCase()}`,
          status: MandateStatus.PENDING_INSPECTION,
          signedAt: now,
          doorAccessConfig: withConsignmentMeta(null, meta) as object,
        },
        include: { unit: { include: { building: true } } },
      });
    });

    await this.audit.log({
      actorId: landlordId,
      actorRole: 'landlord',
      actionType: 'CONSIGNMENT_CREATED',
      entityName: 'ExclusiveMandate',
      entityId: mandate.id,
      newValue: { unitCode, askRent: dto.askRent },
    });
    await this.audit.log({
      actorId: landlordId,
      actorRole: 'landlord',
      actionType: 'CONSIGNMENT_SIGNED',
      entityName: 'ExclusiveMandate',
      entityId: mandate.id,
      newValue: { signedAt: now.toISOString(), hostId: inspectorId, inspectorId, otpSkipped },
    });
    this.logger.log(`[CONSIGNMENT] ${landlordId} ký gửi ${unitCode}`);
    return this.toDto(mandate);
  }

  /**
   * Chỉ chủ nhà đã xác thực đủ (SĐT + eKYC + ngân hàng) mới được ký gửi. Tài khoản thụ hưởng của căn = tài khoản ĐÃ XÁC THỰC
   * trong hồ sơ chủ nhà tại thời điểm ký (ghi bản mã hoá vào meta căn — đổi tài khoản sau không làm đổi căn đã ký).
   */
  private async resolvePayout(landlordId: string) {
    await this.verification.assertReady(landlordId);
    const saved = await this.prisma.profile.findUnique({
      where: { id: landlordId },
      select: { payoutBankName: true, payoutAccountEnc: true, payoutAccountHolder: true },
    });
    if (!saved?.payoutBankName || !saved.payoutAccountEnc || !saved.payoutAccountHolder) {
      throw new BadRequestException({ message: 'Vui lòng xác thực tài khoản nhận tiền thuê.', code: 'payout_required' });
    }
    return { bankName: saved.payoutBankName, accountEnc: saved.payoutAccountEnc, holder: saved.payoutAccountHolder };
  }

  // ─── nội bộ ───────────────────────────────────────────────────────────────────────────────

  private parseLocks(raw?: string[]): LockKind[] {
    if (!raw?.length) return ['smart'];
    const parsed = raw.map((l) => parseLock(l));
    if (parsed.some((l) => !l)) throw new BadRequestException('Hình thức khóa phải là smart hoặc physical.');
    return [...new Set(parsed as LockKind[])];
  }

  /**
   * Gửi OTP ký ủy quyền. Số đã xác thực trong tài khoản (và chủ nhà không nhập số khác) ⇒ KHÔNG cần OTP:
   * trả `otpRequired: false`, không gửi mã. Nhập số khác số đã xác thực, hoặc tài khoản chưa có số ⇒ gửi OTP tới số đó.
   */
  async sendSignOtp(landlordId: string, phoneRaw?: string) {
    const { phone, trusted } = await this.signingPhone(landlordId, phoneRaw);
    if (trusted) return { otpRequired: false as const, maskedPhone: maskPhone(phone), expiresInSeconds: 0 };
    // Zalo mô phỏng ⇒ luôn kèm `devCode` để màn hình hiện mã.
    const { devCode } = await this.otp.send({ phone, purpose: OtpPurpose.PHONE_VERIFY });
    return {
      otpRequired: true as const,
      maskedPhone: maskPhone(phone),
      expiresInSeconds: this.otp.expiresInSeconds,
      resendInSeconds: this.otp.resendInSeconds,
      ...(devCode ? { devCode } : {}),
    };
  }

  /**
   * SĐT dùng để ký. `trusted` = đúng số ĐÃ XÁC THỰC của tài khoản (khách đặt lịch cũng vậy: xác thực một lần cho mỗi số,
   * đổi số mới phải OTP lại). Số client nhập khác số đã lưu ⇒ dùng số đó, không tin cậy.
   */
  private async signingPhone(landlordId: string, phoneRaw?: string): Promise<{ phone: string; trusted: boolean }> {
    const profile = await this.prisma.profile.findUnique({
      where: { id: landlordId },
      select: { phoneEnc: true, isPhoneVerified: true },
    });
    const typed = phoneRaw ? this.phones.normalize(phoneRaw) : null;
    if (phoneRaw && !typed) throw new BadRequestException('Số điện thoại không đúng định dạng Việt Nam.');
    const stored = profile?.phoneEnc ? this.phones.decrypt(profile.phoneEnc) : null;
    if (typed && typed !== stored) return { phone: typed, trusted: false };
    if (stored) return { phone: stored, trusted: !!profile?.isPhoneVerified };
    throw new BadRequestException('Nhập số điện thoại hợp lệ để nhận mã OTP ký ủy quyền.');
  }

  /**
   * Xác nhận người ký, trả số đã ký. Số đã xác thực của tài khoản ⇒ không cần OTP (`otpSkipped`). Ngược lại bắt buộc OTP.
   * KHÔNG gắn số vào tài khoản (và không kiểm trùng số với tài khoản khác): số ký lưu mã hoá trong hồ sơ ký gửi
   * (`signedPhoneEnc`); xác thực số vào tài khoản là việc của `/auth/phone/verify`.
   */
  private async verifySignOtp(landlordId: string, code: string | undefined, phoneRaw?: string): Promise<{ phone: string; otpSkipped: boolean }> {
    const { phone, trusted } = await this.signingPhone(landlordId, phoneRaw);
    if (trusted) return { phone, otpSkipped: true };
    if (!code) throw new BadRequestException('Cần mã OTP gửi tới số điện thoại này để ký ủy quyền.');
    const verified = await this.otp.verify({ phone, purpose: OtpPurpose.PHONE_VERIFY, code });
    await this.otp.consume(verified.id);
    return { phone, otpSkipped: false };
  }

  private toDto(mandate: MandateWithUnit) {
    const meta = readConsignmentMeta(mandate.doorAccessConfig);
    const unit = mandate.unit;
    const form = meta?.form;
    return {
      id: mandate.id,
      unitId: unit.id,
      unitCode: unit.unitCode,
      contractNumber: mandate.contractNumber,
      status: consignmentStage(mandate),
      building: unit.building.buildingCode,
      zone: unit.building.zoneName,
      floor: unit.floorNumber,
      door: form?.door ?? unit.doorNumber ?? doorFromCode(unit.unitCode, unit.floorNumber),
      layout: unit.layoutType,
      layoutKind: toLayoutKind(unit.layoutType),
      areaM2: form?.areaM2 ?? Number(unit.carpetAreaM2),
      askRent: form?.askRent ?? Number(unit.baseRentPrice),
      suggestedDeposit: form?.suggestedDeposit ?? Number(unit.securityDeposit ?? unit.baseRentPrice),
      leaseTerm: form?.leaseTerm ?? (unit.minLeaseMonths >= 12 ? 'long' : 'mid'),
      furnished: form?.furnished ?? unit.furnishing !== 'EMPTY',
      locks: form?.locks ?? [toLockKind(unit.doorLockType)],
      note: form?.note ?? null,
      // Chỉ chủ nhà của hồ sơ thấy (route /landlord/* lọc theo landlordId); không có trong API của khách thuê.
      allowFastClose: form?.allowFastClose === true,
      floorRent: form?.allowFastClose ? (form.floorRent ?? null) : null,
      photoCount: meta?.photos?.length ?? 0,
      createdAt: mandate.createdAt,
      signedAt: mandate.signedAt,
      ownershipWarrantedAt: meta?.ownershipWarrantedAt ?? null,
      inspectDueAt: meta?.inspectDueAt ?? null,
      hostId: meta?.hostId ?? null,
      hostAcceptedAt: meta?.hostAcceptedAt ?? null,
      report: meta?.report ?? null,
      decidedAt: meta?.decidedAt ?? null,
      decidedBy: meta?.decidedBy ?? null,
      decisionNote: meta?.decisionNote ?? null,
      // Chỉ trả dạng che, chỉ cho chủ nhà của hồ sơ (route /landlord/*).
      payout: meta?.payout ? toPayoutView({ bankName: meta.payout.bankName, accountEnc: meta.payout.accountEnc, holder: meta.payout.holder }, (e) => this.phones.decrypt(e)) : null,
      pricingProposal: meta?.pricingProposal && consignmentStage(mandate) === 'awaiting_landlord' ? meta.pricingProposal : null,
    };
  }
}

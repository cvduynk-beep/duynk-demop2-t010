import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { toPayoutView } from '../../common/payout/payout-account';
import { PrismaService } from '../../prisma/prisma.service';
import { UpdateProfileDto } from './dto/account.dto';
import { PhoneService } from '../auth/phone/phone.service';
import { toTenantBooking, toTenantContract, toTenantUnit } from '../tenant/tenant.mappers';
import { clampHoldHours, readDefaultHoldHours } from '../deposit/hold-policy';
import { TenantContract, TenantUnit } from '../tenant/tenant.types';

/** Hồ sơ trả về cho chính chủ: KHÔNG kèm `phoneEnc`/`phoneHash`/ví/vị trí Host. */
const PROFILE_SELECT = {
  id: true,
  phoneEnc: true, // chỉ để giải mã trả `phone` cho chính chủ; không bao giờ ra khỏi service dạng mã hoá
  fullName: true,
  email: true,
  isPhoneVerified: true,
  createdAt: true,
  // Tài khoản thụ hưởng: chỉ dùng để dựng bản che `payoutAccount`, không trả số TK mã hoá ra ngoài.
  payoutBankName: true,
  payoutAccountEnc: true,
  payoutAccountHolder: true,
  role: { select: { code: true, name: true } },
} as const;

/**
 * Dữ liệu của CHÍNH người gọi. `userId` luôn đến từ phiên đã xác thực (xem controller); service không bao giờ
 * "đoán" một người dùng khác hay trả dữ liệu mẫu khi thiếu dữ liệu thật.
 */
@Injectable()
export class AccountService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly phones: PhoneService,
  ) {}

  async getProfile(userId: string) {
    const profile = await this.prisma.profile.findUnique({ where: { id: userId }, select: PROFILE_SELECT });
    if (!profile) throw new NotFoundException('Không tìm thấy hồ sơ');
    return this.toOwnProfile(profile);
  }

  /** SĐT (dạng 0xxxxxxxxx) chỉ trả cho chính chủ để điền sẵn form đặt lịch; giải mã lỗi ⇒ null, không làm hỏng hồ sơ. */
  private toOwnProfile<
    T extends { phoneEnc: string | null; payoutBankName: string | null; payoutAccountEnc: string | null; payoutAccountHolder: string | null },
  >(profile: T) {
    const { phoneEnc, payoutBankName, payoutAccountEnc, payoutAccountHolder, ...rest } = profile;
    const payoutAccount = toPayoutView(
      { bankName: payoutBankName, accountEnc: payoutAccountEnc, holder: payoutAccountHolder },
      (e) => this.phones.decrypt(e),
    );
    let phone: string | null = null;
    if (phoneEnc) {
      try {
        const e164 = this.phones.decrypt(phoneEnc);
        phone = e164.startsWith('+84') ? `0${e164.slice(3)}` : e164;
      } catch {
        phone = null;
      }
    }
    return { ...rest, phone, payoutAccount };
  }

  /**
   * Chỉ cho đổi họ tên. Email là định danh đăng nhập, SĐT chỉ đổi qua OTP Zalo ở bước đặt lịch ⇒ client gửi `email`/`phone`
   * nhận 400 `field_not_editable` (không lặng lẽ bỏ qua). Lỗi kèm `errors.<field>` để FE hiện đúng ô.
   */
  async updateProfile(userId: string, dto: UpdateProfileDto) {
    const locked = (['email', 'phone'] as const).filter((k) => dto[k] !== undefined);
    if (locked.length) {
      throw new BadRequestException({
        code: 'field_not_editable',
        message: 'Không thể đổi email hoặc số điện thoại ở hồ sơ.',
        errors: Object.fromEntries(
          locked.map((k) => [k, k === 'email' ? 'Email là tài khoản đăng nhập, không thể thay đổi.' : 'Số điện thoại chỉ đổi qua xác thực OTP Zalo khi đặt lịch xem.']),
        ),
      });
    }
    if (dto.fullName === undefined) return this.getProfile(userId);
    const fullName = typeof dto.fullName === 'string' ? dto.fullName.trim().replace(/\s+/g, ' ') : '';
    if (fullName.length < 2 || fullName.length > 100) {
      throw new BadRequestException({
        code: 'profile_invalid',
        message: 'Thông tin hồ sơ không hợp lệ.',
        errors: { fullName: 'Họ tên phải từ 2 đến 100 ký tự.' },
      });
    }
    const updated = await this.prisma.profile.update({ where: { id: userId }, data: { fullName }, select: PROFILE_SELECT });
    return this.toOwnProfile(updated);
  }

  async getBookings(userId: string) {
    const viewings = await this.prisma.viewing.findMany({
      where: { tenantId: userId },
      include: {
        unit: { include: { building: true, media: true } },
        tickets: {
          include: {
            host: {
              select: {
                id: true,
                rating: true,
                profile: { select: { fullName: true } },
              },
            },
          },
        },
        deposit: {
          include: {
            identity: true,
            contract: true,
          },
        },
        tenant: { select: { fullName: true } },
      },
      orderBy: { createdAt: 'desc' },
    });
    const defaultHoldHours = await readDefaultHoldHours(this.prisma);
    return viewings.map((v) => toTenantBooking(v, { defaultHoldHours }));
  }

  async getContracts(userId: string): Promise<TenantContract[]> {
    const contracts = await this.prisma.contract.findMany({
      where: { tenantId: userId },
      include: {
        unit: { include: { building: true } },
        holdingDeposit: { include: { viewing: true } },
        document: true,
      },
      orderBy: { createdAt: 'desc' },
    });
    return contracts.map((c) => toTenantContract(c));
  }

  /** Căn đã lưu của chính người gọi, mới lưu trước. Trả đúng DTO `TenantUnit` như catalog công khai. */
  async getFavorites(userId: string): Promise<TenantUnit[]> {
    const rows = await this.prisma.favoriteUnit.findMany({
      where: { profileId: userId },
      orderBy: { createdAt: 'desc' },
      include: { unit: { include: { building: true, media: { orderBy: { order: 'asc' } } } } },
    });
    // Cùng luật với catalog: giờ riêng của căn → mặc định Admin cài (trước đây bỏ qua mặc định, luôn 48).
    const defaultHold = await readDefaultHoldHours(this.prisma);
    return rows.map((r) => toTenantUnit(r.unit, null, clampHoldHours(r.unit.holdHoursOverride ?? defaultHold), 0));
  }

  /** `codeOrId` là mã căn (VHOP-…) hoặc UUID; lưu lặp lại là idempotent. */
  async addFavorite(userId: string, codeOrId: string) {
    const unit = await this.resolveUnit(codeOrId);
    await this.prisma.favoriteUnit.upsert({
      where: { profileId_unitId: { profileId: userId, unitId: unit.id } },
      create: { profileId: userId, unitId: unit.id },
      update: {},
    });
    return { success: true, unitId: unit.unitCode, saved: true };
  }

  /** Idempotent: bỏ lưu mục chưa lưu, hoặc căn không còn tồn tại ⇒ vẫn 200 `{ saved: false }`. Chỉ xoá dòng của chính người gọi. */
  async removeFavorite(userId: string, codeOrId: string) {
    const unit = await this.findUnit(codeOrId);
    if (!unit) return { success: true, unitId: codeOrId, saved: false };
    await this.prisma.favoriteUnit.deleteMany({ where: { profileId: userId, unitId: unit.id } });
    return { success: true, unitId: unit.unitCode, saved: false };
  }

  private findUnit(codeOrId: string) {
    const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(codeOrId);
    return this.prisma.unit.findFirst({
      where: { OR: [{ unitCode: { equals: codeOrId, mode: 'insensitive' } }, ...(isUuid ? [{ id: codeOrId }] : [])] },
      select: { id: true, unitCode: true },
    });
  }

  private async resolveUnit(codeOrId: string) {
    const unit = await this.findUnit(codeOrId);
    if (!unit) {
      throw new NotFoundException({ message: 'Không tìm thấy căn hộ.', code: 'unit_not_found' });
    }
    return unit;
  }

  /** Chưa có bảng thông báo: trả rỗng thay vì dữ liệu mẫu giả. */
  getNotifications(_userId: string) {
    return [];
  }
}

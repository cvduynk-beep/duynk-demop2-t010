import { BadRequestException, ConflictException, Injectable, NotFoundException, Optional } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import type { AdminActor } from './admin-fee.service';
import { DEFAULT_FEE_RATES, FeeRatesService } from '../property/fee-rates.service';
import { mgmtFeePerM2 } from '../landlord/mgmt-fee';
import {
  consignmentStage,
  doorFromCode,
  readConsignmentMeta,
  toLayoutKind,
  toLockKind,
} from '../landlord/landlord.mappers';

const DAY_MS = 86_400_000;
/** Thời gian khoá căn mặc định sau khi khách chuyển cọc; chỉnh riêng từng căn trong khoảng [min, max] (AGENTS.md). */
export const HOLD_HOURS_DEFAULT = 48;
export const HOLD_HOURS_MIN = 12;
export const HOLD_HOURS_MAX = 72;
// Hợp đồng còn hiệu lực/đang xử lý chặn việc chấm dứt mandate (SAD_v2 §10.4).
const BLOCKING_CONTRACT_STATUSES = ['ACTIVE', 'AWAITING_TENANT_SIGN', 'AWAITING_LANDLORD_SIGN', 'DISPUTED'];

/** Hộ tham chiếu khi xem căn không gắn với khách cụ thể — trùng mặc định của AI Matchmaker (matchmaker.service). */
export const REFERENCE_HOUSEHOLD = { motorbikes: 1, cars: 0, occupants: 2 } as const;

const HOLD_HOURS_KEY = 'hold_hours_default';
const HOLD_AUDIT_ACTIONS = ['UNIT_HOLD_HOURS_UPDATED', 'HOLD_HOURS_DEFAULT_UPDATED'];

const CONSIGNMENT_INCLUDE = {
  unit: { include: { building: true, landlord: { select: { id: true, fullName: true } } } },
} as const;

@Injectable()
export class AdminInventoryService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    @Optional() private readonly feeRates?: FeeRatesService,
  ) {}

  async getExclusiveInventory(now: Date = new Date()) {
    const units: any[] = await this.prisma.unit.findMany({
      include: {
        building: true,
        landlord: true,
        mandates: { orderBy: { createdAt: 'desc' }, take: 1 },
      },
      orderBy: { createdAt: 'desc' },
    });

    return units.map((u) => {
      const m = u.mandates[0];
      const effective: Date | null = m?.exitEffectiveAt ? new Date(m.exitEffectiveAt) : null;
      let blocked: string | null = null;
      if (m?.status !== 'EXIT_REQUESTED') blocked = 'MANDATE_NOT_EXIT_REQUESTED';
      else if (u.status === 'HOLDING') blocked = 'UNIT_HOLDING';
      else if (!effective || effective.getTime() > now.getTime()) blocked = 'EXIT_NOTICE_NOT_ELAPSED';

      return {
        id: u.id,
        unitCode: u.unitCode,
        building: u.building.buildingCode,
        zone: u.building.zoneName,
        layout: u.layoutType,
        carpetAreaM2: Number(u.carpetAreaM2),
        baseRentPrice: Number(u.baseRentPrice),
        status: u.status,
        landlordName: u.landlord?.fullName || null,
        floorNumber: u.floorNumber,
        doorNumber: u.doorNumber,
        doorLockType: u.doorLockType,
        isVerified: u.isVerified,
        managementFee: Number(u.managementFee),
        createdAt: u.createdAt ? new Date(u.createdAt).toISOString() : new Date().toISOString(),
        mandateStatus: m?.status || 'NONE',
        exitCountdownDays: effective
          ? Math.max(0, Math.ceil((effective.getTime() - now.getTime()) / DAY_MS))
          : null,
        mandateId: m?.id ?? null,
        exitRequestedAt: m?.exitRequestedAt ? new Date(m.exitRequestedAt).toISOString() : null,
        exitEffectiveAt: effective ? effective.toISOString() : null,
        canTerminate: blocked === null,
        terminateBlockedReason: blocked,
      };
    });
  }

  async getExclusiveInventoryDetail(id: string, now: Date = new Date()) {
    const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(id);
    const unit = await this.prisma.unit.findFirst({
      where: {
        OR: [
          ...(isUuid ? [{ id }] : []),
          { unitCode: id },
          { mandates: { some: { id } } },
        ],
      },
      include: {
        building: true,
        landlord: { select: { id: true, fullName: true, email: true } },
        mandates: { orderBy: { createdAt: 'desc' }, take: 1 },
        media: { orderBy: { order: 'asc' }, select: { id: true, url: true, category: true, verifiedAt: true } },
      },
    });
    if (!unit) throw new NotFoundException('Không tìm thấy căn hộ trong rổ hàng.');

    const mandate = unit.mandates[0];
    const effectiveAt = mandate?.exitEffectiveAt ?? null;
    const exitCountdownDays = effectiveAt
      ? Math.max(0, Math.ceil((effectiveAt.getTime() - now.getTime()) / DAY_MS))
      : null;
    const [defaultHold, host, rates] = await Promise.all([
      this.defaultHoldHours(),
      this.hostForZone(unit.building.zoneName),
      this.feeRates?.get() ?? DEFAULT_FEE_RATES,
    ]);
    // Cùng công thức AI Matchmaker (khách thuê thấy): phí QL lưu trên căn (diện tích × đơn giá, Host xác minh lúc thẩm
    // định); gửi xe theo biểu phí tòa Host xác minh, chưa có ⇒ đơn giá chung fee_configs; điện nước = số người × định mức.
    const h = REFERENCE_HOUSEHOLD;
    const motorbikeRate = unit.motorbikeFee != null ? Number(unit.motorbikeFee) : rates.motorbike;
    const carRate = unit.carFee != null ? Number(unit.carFee) : rates.car;
    const costs = {
      rent: Number(unit.baseRentPrice),
      managementFee: Number(unit.managementFee),
      parkingFee: h.motorbikes * motorbikeRate + h.cars * carRate,
      utilityCost: h.occupants * rates.utilityPerPerson,
    };
    const canTerminate = mandate?.status === 'EXIT_REQUESTED' &&
      unit.status !== 'HOLDING' &&
      effectiveAt !== null && effectiveAt <= now;

    return {
      id: unit.id,
      unitCode: unit.unitCode,
      building: unit.building.buildingCode,
      zone: unit.building.zoneName,
      floorNumber: unit.floorNumber,
      doorNumber: unit.doorNumber,
      layout: unit.layoutType,
      carpetAreaM2: Number(unit.carpetAreaM2),
      baseRentPrice: Number(unit.baseRentPrice),
      managementFee: Number(unit.managementFee),
      marketAvgPrice: Number(unit.marketAvgPrice),
      furnishing: unit.furnishing,
      allInCost: { ...costs, total: Object.values(costs).reduce((sum, v) => sum + v, 0), household: h, feeVerified: unit.motorbikeFee != null },
      host,
      status: unit.status,
      isVerified: unit.isVerified,
      doorLockType: unit.doorLockType,
      // Thời gian khoá căn sau khi khách chuyển cọc. Chỉ sửa được khi căn còn trống (AVAILABLE).
      holdHours: unit.holdHoursOverride ?? defaultHold,
      holdHoursOverride: unit.holdHoursOverride ?? null,
      defaultHoldHours: defaultHold,
      canEditHoldHours: unit.status === 'AVAILABLE',
      landlord: unit.landlord,
      media: unit.media.map((photo) => ({ ...photo, verifiedAt: photo.verifiedAt.toISOString() })),
      mandate: mandate ? {
        id: mandate.id,
        contractNumber: mandate.contractNumber,
        status: mandate.status,
        signedAt: mandate.signedAt?.toISOString() ?? null,
        exitRequestedAt: mandate.exitRequestedAt?.toISOString() ?? null,
        exitEffectiveAt: effectiveAt?.toISOString() ?? null,
        exitCountdownDays,
        canTerminate,
      } : null,
    };
  }

  /** Field Host phụ trách phân khu — cùng quy tắc `LandlordDirectoryService.hostForZone` (tên phân khu nằm trong `assignedZone`). */
  private async hostForZone(zoneName: string): Promise<{ id: string; name: string | null } | null> {
    const row: any = await (this.prisma as any).fieldHost?.findFirst?.({
      where: { assignedZone: { contains: zoneName }, profile: { isActive: true } },
      orderBy: { createdAt: 'asc' },
      select: { id: true, profile: { select: { fullName: true } } },
    });
    return row ? { id: row.id, name: row.profile?.fullName ?? null } : null;
  }

  /**
   * Hồ sơ ký gửi (mọi ủy quyền ĐÃ KÝ) cho Admin. Cùng nguồn meta với `/landlord/consignments` nhưng KHÔNG trả tài
   * khoản nhận tiền và Giá sàn bảo mật (chỉ chủ nhà xem). Tên Host gắn sẵn để Admin không phải tra thêm.
   */
  async listConsignments() {
    const mandates: any[] = await this.prisma.exclusiveMandate.findMany({
      where: { signedAt: { not: null } },
      orderBy: { createdAt: 'desc' },
      include: CONSIGNMENT_INCLUDE,
    });
    const hostNames = await this.hostNames(mandates.flatMap((m) => this.hostIdsOf(m)));
    return mandates.map((m) => this.toConsignmentView(m, hostNames));
  }

  async getConsignment(id: string) {
    const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(id);
    const mandate: any = isUuid
      ? await this.prisma.exclusiveMandate.findFirst({ where: { id, signedAt: { not: null } }, include: CONSIGNMENT_INCLUDE })
      : null;
    if (!mandate) throw new NotFoundException('Không tìm thấy hồ sơ ký gửi.');
    const hostNames = await this.hostNames(this.hostIdsOf(mandate));
    return this.toConsignmentView(mandate, hostNames);
  }

  /** Host được giao/nhận ca và Host đã nộp phiếu (có thể khác nhau sau Open Pool). */
  private hostIdsOf(mandate: { doorAccessConfig: unknown }): (string | null)[] {
    const meta = readConsignmentMeta(mandate.doorAccessConfig);
    return [meta?.hostId ?? null, meta?.report?.hostId ?? null];
  }

  private async hostNames(ids: (string | null)[]): Promise<Map<string, string | null>> {
    const unique = [...new Set(ids.filter((x): x is string => !!x))];
    if (!unique.length) return new Map();
    const rows: any[] = await this.prisma.fieldHost.findMany({
      where: { id: { in: unique } },
      select: { id: true, profile: { select: { fullName: true } } },
    });
    return new Map(rows.map((r) => [r.id, r.profile?.fullName ?? null]));
  }

  private toConsignmentView(mandate: any, hostNames: Map<string, string | null>) {
    const meta = readConsignmentMeta(mandate.doorAccessConfig);
    const form = meta?.form;
    const unit = mandate.unit;
    const hostId = meta?.hostId ?? null;
    return {
      id: mandate.id,
      unitId: unit.id,
      unitCode: unit.unitCode,
      contractNumber: mandate.contractNumber,
      mandateStatus: mandate.status,
      status: consignmentStage(mandate),
      building: unit.building.buildingCode,
      zone: unit.building.zoneName,
      floor: unit.floorNumber,
      door: form?.door ?? unit.doorNumber ?? doorFromCode(unit.unitCode, unit.floorNumber),
      layoutKind: toLayoutKind(unit.layoutType),
      areaM2: form?.areaM2 ?? Number(unit.carpetAreaM2),
      askRent: form?.askRent ?? Number(unit.baseRentPrice),
      suggestedDeposit: form?.suggestedDeposit ?? Number(unit.securityDeposit ?? unit.baseRentPrice),
      furnished: form?.furnished ?? unit.furnishing !== 'EMPTY',
      locks: form?.locks ?? [toLockKind(unit.doorLockType)],
      note: form?.note ?? null,
      allowFastClose: form?.allowFastClose === true,
      landlord: unit.landlord ? { id: unit.landlord.id, fullName: unit.landlord.fullName } : null,
      createdAt: mandate.createdAt.toISOString(),
      signedAt: mandate.signedAt?.toISOString() ?? null,
      ownershipWarrantedAt: meta?.ownershipWarrantedAt ?? null,
      inspectDueAt: meta?.inspectDueAt ?? null,
      hostId,
      hostName: hostId ? (hostNames.get(hostId) ?? null) : null,
      hostAcceptedAt: meta?.hostAcceptedAt ?? null,
      report: meta?.report ?? null,
      reportHostName: meta?.report?.hostId ? (hostNames.get(meta.report.hostId) ?? null) : null,
      decidedAt: meta?.decidedAt ?? null,
      decidedBy: meta?.decidedBy ?? null,
      decisionNote: meta?.decisionNote ?? null,
    };
  }

  // ------------------------------------------------------------------ Cài đặt toàn sàn

  /** Thời hạn giữ chỗ mặc định toàn sàn + nhật ký thay đổi (mặc định lẫn riêng từng căn), mới nhất trước. */
  async getHoldPolicy(limit = 10) {
    const [defaultHours, cfg, rows] = await Promise.all([
      this.defaultHoldHours(),
      (this.prisma as any).feeConfig?.findUnique?.({ where: { configKey: HOLD_HOURS_KEY } }),
      this.prisma.auditLog.findMany({
        where: { actionType: { in: HOLD_AUDIT_ACTIONS } },
        orderBy: { createdAt: 'desc' },
        take: limit,
        include: { actor: { select: { fullName: true, email: true } } },
      }) as Promise<any[]>,
    ]);
    const unitIds = [...new Set(rows.filter((r) => r.actionType === 'UNIT_HOLD_HOURS_UPDATED').map((r) => r.entityId))];
    const units: any[] = unitIds.length
      ? await this.prisma.unit.findMany({ where: { id: { in: unitIds } }, select: { id: true, unitCode: true } })
      : [];
    const codes = new Map(units.map((u) => [u.id, u.unitCode]));
    return {
      defaultHours,
      min: HOLD_HOURS_MIN,
      max: HOLD_HOURS_MAX,
      /** `config` = Admin đã đặt; `default` = chưa cấu hình, dùng 48 giờ. */
      source: cfg ? 'config' : 'default',
      history: rows.map((r) => ({
        id: r.id,
        at: new Date(r.createdAt).toISOString(),
        by: r.actor?.fullName || r.actor?.email || r.actorRole,
        scope: r.actionType === 'HOLD_HOURS_DEFAULT_UPDATED' ? 'default' : 'unit',
        unitId: r.actionType === 'UNIT_HOLD_HOURS_UPDATED' ? r.entityId : null,
        unitCode: r.actionType === 'UNIT_HOLD_HOURS_UPDATED' ? (codes.get(r.entityId) ?? null) : null,
        from: typeof r.oldValue?.holdHours === 'number' ? r.oldValue.holdHours : null,
        to: typeof r.newValue?.holdHours === 'number' ? r.newValue.holdHours : null,
        reset: r.newValue?.reset === true,
        reason: typeof r.newValue?.reason === 'string' ? r.newValue.reason : null,
      })),
    };
  }

  /**
   * Đặt thời hạn giữ chỗ mặc định toàn sàn (`fee_configs.hold_hours_default`). Chỉ áp cho cọc MỚI: cọc đã thu giữ hạn
   * theo mức lúc khách chấp thuận. Căn có mức riêng (`holdHoursOverride`) không bị ảnh hưởng.
   */
  async updateDefaultHoldHours(hours: number, reason: string, actor: AdminActor) {
    const why = (reason ?? '').trim();
    if (!why) throw new BadRequestException('Bắt buộc nhập lý do thay đổi.');
    if (!Number.isInteger(hours) || hours < HOLD_HOURS_MIN || hours > HOLD_HOURS_MAX) {
      throw new BadRequestException(`Thời gian khoá căn phải là số giờ nguyên từ ${HOLD_HOURS_MIN} đến ${HOLD_HOURS_MAX}.`);
    }
    const before = await this.defaultHoldHours();
    await (this.prisma as any).feeConfig.upsert({
      where: { configKey: HOLD_HOURS_KEY },
      update: { paramValue: hours, updatedBy: actor.id },
      create: { configKey: HOLD_HOURS_KEY, paramValue: hours, paramUnit: 'giờ', updatedBy: actor.id },
    });
    await this.audit.log({
      actorId: actor.id,
      actorRole: actor.role,
      actionType: 'HOLD_HOURS_DEFAULT_UPDATED',
      entityName: 'fee_configs',
      entityId: HOLD_HOURS_KEY,
      oldValue: { holdHours: before },
      newValue: { holdHours: hours, reason: why },
    } as any);
    return { success: true, defaultHours: hours };
  }

  /** Biểu phí dùng tính All-in (đơn giá chung khi căn chưa có biểu phí tòa Host xác minh). Chỉ đọc. */
  async getFeeRates() {
    const [rates, mgmt] = await Promise.all([
      this.feeRates?.get() ?? DEFAULT_FEE_RATES,
      mgmtFeePerM2(this.prisma as any),
    ]);
    return { mgmtFeePerM2: mgmt, ...rates, referenceHousehold: REFERENCE_HOUSEHOLD };
  }

  /** Mặc định khi căn không có mức riêng: `FeeConfig.hold_hours_default` nếu có (dữ liệu cũ), không thì 48 giờ. Cùng nguồn với deposit.service. */
  private async defaultHoldHours(): Promise<number> {
    const cfg = await (this.prisma as any).feeConfig?.findUnique?.({ where: { configKey: 'hold_hours_default' } });
    const hours = cfg ? Math.round(Number(cfg.paramValue)) : HOLD_HOURS_DEFAULT;
    return Math.min(HOLD_HOURS_MAX, Math.max(HOLD_HOURS_MIN, hours));
  }

  /**
   * Đặt thời gian khoá căn RIÊNG cho một căn. Chỉ khi căn còn trống (AVAILABLE): căn đang giữ chỗ/đã thuê thì cọc đã
   * chốt hạn theo mức cũ, đổi lúc này sẽ lệch với điều khoản khách đã chấp thuận. `hours` null = về mặc định.
   */
  async updateHoldHours(unitId: string, hours: number | null | undefined, reason: string, actor: AdminActor) {
    const why = (reason ?? '').trim();
    if (!why) throw new BadRequestException('Bắt buộc nhập lý do thay đổi.');
    const next = hours ?? null;
    if (next !== null && (!Number.isInteger(next) || next < HOLD_HOURS_MIN || next > HOLD_HOURS_MAX)) {
      throw new BadRequestException(`Thời gian khoá căn phải là số giờ nguyên từ ${HOLD_HOURS_MIN} đến ${HOLD_HOURS_MAX}.`);
    }

    const unit: any = await this.prisma.unit.findUnique({ where: { id: unitId } });
    if (!unit) throw new NotFoundException('Không tìm thấy căn hộ.');
    if (unit.status !== 'AVAILABLE') {
      throw new ConflictException('Chỉ chỉnh được thời gian khoá căn khi căn còn trống.');
    }

    const defaultHold = await this.defaultHoldHours();
    const before = unit.holdHoursOverride ?? defaultHold;
    await this.prisma.unit.update({ where: { id: unitId }, data: { holdHoursOverride: next } });
    await this.audit.log({
      actorId: actor.id,
      actorRole: actor.role,
      actionType: 'UNIT_HOLD_HOURS_UPDATED',
      entityName: 'units',
      entityId: unitId,
      oldValue: { holdHours: before },
      newValue: { holdHours: next ?? defaultHold, reset: next === null, reason: why },
    } as any);
    return { success: true, unitId, holdHours: next ?? defaultHold, holdHoursOverride: next, defaultHoldHours: defaultHold };
  }

  async terminateMandate(id: string, reason: string, actor: AdminActor, now: Date = new Date()) {
    const why = (reason ?? '').trim();
    if (!why) throw new BadRequestException('Bắt buộc nhập lý do chấm dứt ủy quyền.');

    return this.prisma.$transaction(async (tx: any) => {
      const mandate = await tx.exclusiveMandate.findUnique({ where: { id } });
      if (!mandate) throw new NotFoundException('Không tìm thấy hợp đồng ủy quyền.');
      if (mandate.status !== 'EXIT_REQUESTED') {
        throw new ConflictException('Chỉ chấm dứt được ủy quyền đang ở trạng thái EXIT_REQUESTED.');
      }
      if (!mandate.exitEffectiveAt || new Date(mandate.exitEffectiveAt).getTime() > now.getTime()) {
        throw new ConflictException('Chưa đủ 15 ngày báo trước thoát ủy quyền.');
      }

      const unit = await tx.unit.findUnique({ where: { id: mandate.unitId } });
      if (!unit) throw new NotFoundException('Không tìm thấy căn hộ của ủy quyền.');
      if (unit.status === 'HOLDING') {
        throw new ConflictException('Căn đang HOLDING (có cọc giữ chỗ), không thể chấm dứt ủy quyền.');
      }
      const blocking = await tx.contract.count({
        where: { unitId: unit.id, status: { in: BLOCKING_CONTRACT_STATUSES } },
      });
      if (blocking > 0) {
        throw new ConflictException('Căn có hợp đồng thuê đang hiệu lực/đang xử lý, không thể chấm dứt ủy quyền.');
      }

      const oldValue = { status: mandate.status, unitStatus: unit.status };
      await tx.exclusiveMandate.update({ where: { id }, data: { status: 'TERMINATED' } });
      await tx.unit.update({ where: { id: unit.id }, data: { status: 'UNLISTED' } });
      await this.audit.log({
        actorId: actor.id,
        actorRole: actor.role,
        actionType: 'MANDATE_TERMINATED_BY_ADMIN',
        entityName: 'ExclusiveMandate',
        entityId: id,
        oldValue,
        newValue: { status: 'TERMINATED', unitStatus: 'UNLISTED', reason: why },
      });
      return { mandateId: id, unitId: unit.id, status: 'TERMINATED', unitStatus: 'UNLISTED' };
    });
  }
}

import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { DepositStatus, LayoutType, MandateStatus, UnitStatus, ViewingStatus } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import {
  ABSOLUTE_RENT_CEILING,
  MIN_FLOOR_RENT,
  RENT_CEILING_BY_KIND,
  readConsignmentMeta,
  toLayoutKind,
} from './landlord.mappers';

/** Cùng giả định All-in với `PropertyService.calculateAllInCost` (1 xe máy, 2 người ở). */
const PARKING = 150_000;
const UTILITIES = 2 * 300_000;
/** Ngưỡng badge "Căn hời phân khu": tiết kiệm All-in ≥ 10% so với mặt bằng (AGENTS.md). */
const DEAL_SAVING = 0.1;
const MIN_COMPS = 3;
const WINDOW_DAYS = 30;
const MIN_VACANT_DAYS = 7;
const ROUND = 100_000;

export interface PriceInsight {
  unitId: string;
  unitCode: string;
  layoutKind: string;
  zone: string;
  /** Phạm vi so sánh: cùng phân khu, hoặc toàn Ocean Park khi phân khu chưa đủ căn đối chứng. */
  scope: 'zone' | 'park';
  comps: number;
  currentRent: number;
  marketMedian: number;
  suggestedRent: number;
  /** true ⇒ ở giá đề xuất căn đạt badge "Căn hời phân khu" (All-in rẻ hơn mặt bằng ≥ 10%). */
  dealBadge: boolean;
  savingPercent: number;
  daysVacant: number;
  viewings30d: number;
  viewingsNoDeposit: number;
  noShows: number;
  /** Tiền thuê mất mỗi tháng nếu căn còn trống. */
  vacancyLossPerMonth: number;
  /** Có giá sàn chốt nhanh và đề xuất đã chạm sàn. */
  floorLimited: boolean;
}

const median = (xs: number[]) => {
  const s = [...xs].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
};

/** Lọc ngoại lai theo IQR (AGENTS.md §4): bỏ giá ngoài [Q1 − 1.5·IQR, Q3 + 1.5·IQR]. */
function withoutOutliers(xs: number[]): number[] {
  if (xs.length < 4) return xs;
  const s = [...xs].sort((a, b) => a - b);
  const q = (p: number) => s[Math.floor((s.length - 1) * p)];
  const iqr = q(0.75) - q(0.25);
  return s.filter((x) => x >= q(0.25) - 1.5 * iqr && x <= q(0.75) + 1.5 * iqr);
}

const roundDown = (v: number) => Math.floor(v / ROUND) * ROUND;

/**
 * Gợi ý giá cho căn đang trống của chủ nhà (AI Matchmaker · Dynamic Deal). Toàn bộ là phép tính trên dữ liệu thật:
 * mặt bằng = trung vị giá các căn CÙNG layout đã xác thực (`isVerified`) ở cùng phân khu (lọc IQR, không học từ tin nháp),
 * tín hiệu = số ngày trống, ca xem 30 ngày, ca xem không chốt cọc, khách không đến. Giá đề xuất = mức cao nhất vẫn đạt badge
 * "Căn hời" (tiết kiệm All-in ≥ 10%), không thấp hơn giá sàn chốt nhanh của chủ nhà, không dưới 3 triệu.
 */
@Injectable()
export class LandlordPriceInsightService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  private async marketFor(unit: { id: string; layoutType: LayoutType; building: { zoneName: string } }) {
    const rows = await this.prisma.unit.findMany({
      where: {
        id: { not: unit.id },
        layoutType: unit.layoutType,
        isVerified: true,
        status: { in: [UnitStatus.AVAILABLE, UnitStatus.HOLDING, UnitStatus.RENTED] },
      },
      select: { baseRentPrice: true, building: { select: { zoneName: true } } },
    });
    const zone = withoutOutliers(rows.filter((r) => r.building.zoneName === unit.building.zoneName).map((r) => Number(r.baseRentPrice)));
    if (zone.length >= MIN_COMPS) return { scope: 'zone' as const, comps: zone.length, median: median(zone) };
    const park = withoutOutliers(rows.map((r) => Number(r.baseRentPrice)));
    if (park.length >= MIN_COMPS) return { scope: 'park' as const, comps: park.length, median: median(park) };
    return null;
  }

  async insights(landlordId: string, now = new Date()): Promise<PriceInsight[]> {
    const since = new Date(now.getTime() - WINDOW_DAYS * 86_400_000);
    const units = await this.prisma.unit.findMany({
      where: { landlordId, status: UnitStatus.AVAILABLE, isVerified: true, mandates: { some: { status: MandateStatus.ACTIVE } } },
      include: {
        building: true,
        mandates: { orderBy: { createdAt: 'desc' }, take: 1 },
        viewings: { where: { viewingSlot: { gte: since } }, select: { status: true, completedAt: true, deposit: { select: { paymentStatus: true } } } },
      },
    });

    const out: PriceInsight[] = [];
    for (const u of units) {
      const market = await this.marketFor(u);
      if (!market) continue;
      const current = Number(u.baseRentPrice);
      const fees = Number(u.managementFee) + PARKING + UTILITIES;
      const target = roundDown(market.median - DEAL_SAVING * (market.median + fees));
      const meta = readConsignmentMeta(u.mandates[0]?.doorAccessConfig);
      const floor = meta?.form?.allowFastClose && meta.form.floorRent ? meta.form.floorRent : 0;
      const suggested = Math.max(target, floor, MIN_FLOOR_RENT);
      if (suggested >= current) continue; // đã là giá tốt (hoặc sàn không cho hạ) ⇒ không làm phiền chủ nhà

      const done = u.viewings.filter((v) => v.completedAt && v.status !== ViewingStatus.NO_SHOW);
      const noDeposit = done.filter((v) => !v.deposit || v.deposit.paymentStatus === DepositStatus.FORFEITED).length;
      const noShows = u.viewings.filter((v) => v.status === ViewingStatus.NO_SHOW).length;
      const vacantSince = u.verifiedAt ?? u.mandates[0]?.signedAt ?? u.createdAt;
      const daysVacant = Math.max(0, Math.floor((now.getTime() - vacantSince.getTime()) / 86_400_000));
      // Chỉ gợi ý khi có tín hiệu thật: trống lâu, có khách xem mà không cọc, hoặc giá cao hơn mặt bằng.
      if (daysVacant < MIN_VACANT_DAYS && noDeposit === 0 && current <= market.median) continue;

      const saving = Math.round(((market.median - suggested) / (market.median + fees)) * 100);
      out.push({
        unitId: u.id,
        unitCode: u.unitCode,
        layoutKind: toLayoutKind(u.layoutType),
        zone: u.building.zoneName,
        scope: market.scope,
        comps: market.comps,
        currentRent: current,
        marketMedian: Math.round(market.median),
        suggestedRent: suggested,
        dealBadge: suggested <= target,
        savingPercent: Math.max(0, saving),
        daysVacant,
        viewings30d: u.viewings.length,
        viewingsNoDeposit: noDeposit,
        noShows,
        vacancyLossPerMonth: current,
        floorLimited: floor > 0 && suggested === floor && floor > target,
      });
    }
    // Ưu tiên căn có khách xem mà không chốt, rồi căn trống lâu nhất.
    return out.sort((a, b) => b.viewingsNoDeposit - a.viewingsNoDeposit || b.daysVacant - a.daysVacant);
  }

  /**
   * Chủ nhà áp dụng giá mới cho căn đang trống. Chặn cứng: căn của chính chủ nhà, đang AVAILABLE (không đổi giá khi khách
   * đang giữ chỗ/đang thuê), ≥ 3 triệu, ≥ giá sàn chốt nhanh, ≤ trần layout. Cập nhật `marketAvgPrice` = mặt bằng vừa tính
   * để badge "Căn hời" phản ánh đúng. Có Audit Log.
   */
  async applyRent(landlordId: string, unitId: string, rent: number) {
    const u = await this.prisma.unit.findFirst({
      where: { id: unitId, landlordId },
      include: { building: true, mandates: { orderBy: { createdAt: 'desc' }, take: 1 } },
    });
    if (!u) throw new NotFoundException('Không tìm thấy căn.');
    if (u.status !== UnitStatus.AVAILABLE || u.mandates[0]?.status !== MandateStatus.ACTIVE) {
      throw new ConflictException({ message: 'Chỉ đổi giá khi căn đang trống và ủy quyền còn hiệu lực.', code: 'unit_not_available' });
    }
    const meta = readConsignmentMeta(u.mandates[0]?.doorAccessConfig);
    const floor = meta?.form?.allowFastClose && meta.form.floorRent ? meta.form.floorRent : MIN_FLOOR_RENT;
    const ceiling = Math.min(RENT_CEILING_BY_KIND[toLayoutKind(u.layoutType)], ABSOLUTE_RENT_CEILING);
    if (!Number.isInteger(rent) || rent < Math.max(floor, MIN_FLOOR_RENT) || rent > ceiling) {
      throw new BadRequestException({
        message: `Giá thuê phải từ ${Math.max(floor, MIN_FLOOR_RENT).toLocaleString('vi-VN')}đ đến ${ceiling.toLocaleString('vi-VN')}đ.`,
        code: 'rent_out_of_range',
      });
    }
    const market = await this.marketFor(u);
    const previous = Number(u.baseRentPrice);
    await this.prisma.unit.update({
      where: { id: u.id },
      data: { baseRentPrice: rent, ...(market ? { marketAvgPrice: Math.round(market.median) } : {}) },
    });
    await this.audit.log({
      actorId: landlordId,
      actorRole: 'landlord',
      actionType: 'UNIT_RENT_UPDATED',
      entityName: 'Unit',
      entityId: u.id,
      oldValue: { baseRentPrice: previous },
      newValue: { baseRentPrice: rent, marketAvgPrice: market ? Math.round(market.median) : null, source: 'price_insight' },
    });
    return { unitId: u.id, rent, previous, marketMedian: market ? Math.round(market.median) : null };
  }
}

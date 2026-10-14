import { Injectable } from '@nestjs/common';
import { HostDutyStatus, TicketStatus, ViewingStatus } from '@prisma/client';
import { hostConflict } from '../host-viewings/host-viewings.errors';
import { PrismaService } from '../../prisma/prisma.service';
import { authError } from '../auth/auth.errors';
import { toHostRoleCodes } from '../auth/host-roles';
import { zoneScopeView } from '../field-hosts/host-scope';
import { PhoneService } from '../auth/phone/phone.service';
import { decryptPhoneForDisplay } from '../auth/phone/phone-display';
import { CAMPAIGN_MAX_DEALS_PER_WEEK, isoWeekPeriod, RATING_BONUS_MIN_AVG } from '../admin/admin-payout.service';

@Injectable()
export class HostService {
  constructor(
    private prisma: PrismaService,
    private readonly phones: PhoneService,
  ) {}

  /** Hồ sơ của CHÍNH Field Host đang đăng nhập. Không có số thẻ RFID, mật khẩu, mã hoá SĐT. */
  async getMe(profileId: string) {
    const host = await this.prisma.fieldHost.findUnique({
      where: { profileId },
      include: { profile: { select: { fullName: true, email: true, phoneEnc: true, isPhoneVerified: true } } },
    });
    if (!host) throw authError('host_not_provisioned');
    return {
      hostId: host.id,
      fullName: host.profile.fullName,
      email: host.profile.email,
      phone: decryptPhoneForDisplay(this.phones, host.profile.phoneEnc),
      isPhoneVerified: host.profile.isPhoneVerified,
      assignedZone: host.assignedZone,
      // Phạm vi nhận ca pool + xem (Sổ tay phân khu lọc theo đây). `zones` null = tất cả phân khu.
      ...zoneScopeView(host),
      roles: toHostRoleCodes(host.roles),
      dutyStatus: host.dutyStatus,
      rating: Number(host.rating),
      joinedAt: host.createdAt.toISOString(),
    };
  }

  /**
   * Bật/tắt trực (H1). Chỉ Host ONLINE mới được giao ticket tầng 1. Đang dẫn khách (RECEIVING/VIEWING) ⇒ không tắt
   * được (`host_busy`); bật trực khi đang dẫn thì giữ BUSY_VIEWING — trạng thái tự trả về ONLINE khi xong phần dẫn.
   */
  async setDuty(profileId: string, status: 'ONLINE_AVAILABLE' | 'OFF_DUTY') {
    const host = await this.prisma.fieldHost.findUnique({ where: { profileId } });
    if (!host) throw authError('host_not_provisioned');
    const guiding = await this.prisma.dispatchTicket.count({
      where: {
        hostId: host.id,
        status: TicketStatus.ACCEPTED,
        viewing: { status: { in: [ViewingStatus.RECEIVING, ViewingStatus.VIEWING] } },
      },
    });
    if (guiding > 0) {
      if (status === 'OFF_DUTY') throw hostConflict('host_busy');
      return { dutyStatus: HostDutyStatus.BUSY_VIEWING };
    }
    await this.prisma.fieldHost.update({ where: { id: host.id }, data: { dutyStatus: status } });
    return { dutyStatus: status };
  }

  /**
   * Thu nhập của CHÍNH Host: mọi số đều cộng từ sổ `host_payouts` (do AdminPayoutService ghi). Kèm biểu phí đang áp dụng để
   * dựng "Cách tính thù lao", số liệu tuần ISO hiện tại, và danh sách deal (căn, khách, ngày cọc, hoa hồng).
   */
  async getEarnings(profileId: string, now: Date = new Date()) {
    const host = await this.prisma.fieldHost.findUnique({
      where: { profileId },
      include: { payouts: { orderBy: { createdAt: 'desc' } }, profile: { select: { fullName: true } } },
    });
    if (!host) throw authError('host_not_provisioned');

    const rows = host.payouts.map((p) => ({
      id: p.id,
      amount: Number(p.amount),
      period: p.period,
      status: p.status,
      createdAt: p.createdAt.toISOString(),
      ...parseTransRef(p.transRef),
    }));
    const thisWeek = isoWeekPeriod(now);
    const [sources, feeRows, ratings] = await Promise.all([
      this.loadDealSources(rows),
      this.prisma.feeConfig.findMany(),
      this.prisma.viewing.findMany({
        where: { tenantRating: { not: null }, tickets: { some: { hostId: host.id } } },
        select: { tenantRating: true },
      }),
    ]);
    const fee = (key: string): number | null => {
      const row = feeRows.find((r) => r.configKey === key);
      return row ? Number(row.paramValue as any) : null;
    };
    const ratingCount = ratings.length;
    const ratingAvg = ratingCount ? ratings.reduce((sum, r) => sum + Number(r.tenantRating), 0) / ratingCount : null;

    return {
      hostId: host.id,
      fullName: host.profile.fullName,
      rating: Number(host.rating),
      ratingAvg,
      ratingCount,
      roles: host.roles.map((r) => r.toLowerCase()),
      walletBalance: Number(host.walletBalance),
      fees: {
        baseViewingFee: fee('host_base_viewing_fee'),
        dealCommission: fee('host_deal_commission'),
        ratingMultiplier: fee('host_rating_multiplier_5star'),
        ratingMinAvg: RATING_BONUS_MIN_AVG,
        campaignBonus: fee('host_campaign_bonus'),
        campaignMaxDealsPerWeek: CAMPAIGN_MAX_DEALS_PER_WEEK,
        inspectionFee: fee('host_inspection_fee'),
        peakMultiplier: fee('host_peak_hour_multiplier'),
        peakStart: fee('host_peak_hour_start'),
        peakEnd: fee('host_peak_hour_end'),
      },
      stats: summarize(rows),
      week: { period: thisWeek, ...summarize(rows.filter((r) => r.period === thisWeek)) },
      currentPeriod: rows[0]?.period ?? null,
      deals: buildDeals(rows, sources),
    };
  }

  /** Nạp căn, khách, ngày cọc cho các deal bằng MỘT truy vấn gộp (không N+1). Cọc đã bị xoá ⇒ để trống. */
  private async loadDealSources(rows: Array<{ kind: PayoutKind; sourceId: string | null }>) {
    const depositIds = [...new Set(rows.filter((r) => DEAL_KINDS.includes(r.kind) && r.sourceId).map((r) => r.sourceId!))];
    const deposits = depositIds.length
      ? await this.prisma.holdingDeposit.findMany({
          where: { id: { in: depositIds } },
          include: {
            unit: { include: { building: { select: { buildingCode: true } } } },
            viewing: { select: { bookingRefCode: true, contactName: true } },
          },
        })
      : [];
    const map = new Map<string, PayoutSource>();
    for (const d of deposits as any[]) {
      const source = {
        unit: unitLabel(d.unit),
        ref: d.depositCode,
        tenantName: d.viewing?.contactName ?? null,
        href: d.viewing?.bookingRefCode ? `/host/viewing/${d.viewing.bookingRefCode}` : null,
        paidAt: d.paidAt ? new Date(d.paidAt).toISOString() : null,
        depositStatus: d.paymentStatus as string,
      };
      map.set(d.id, source);
    }
    return map;
  }
}

export type PayoutKind = 'VIEWING_FEE' | 'DEAL_COMMISSION' | 'RATING_BONUS' | 'CAMPAIGN_BONUS' | 'INSPECTION_FEE' | 'OTHER';

interface PayoutSource {
  unit: string | null;
  ref: string | null;
  tenantName: string | null;
  href: string | null;
  paidAt?: string | null;
  depositStatus?: string;
}

const DEAL_KINDS: PayoutKind[] = ['DEAL_COMMISSION', 'RATING_BONUS', 'CAMPAIGN_BONUS'];

/**
 * "Deal gần đây": mỗi cọc Host được ghi công là MỘT dòng. `commission` = hoa hồng + thưởng đánh giá (như bản mock:
 * hoa hồng × hệ số); thưởng chiến dịch tách riêng `campaignBonus` vì nó đã có dòng riêng trong "Cách tính thù lao".
 */
function buildDeals(rows: Array<{ kind: PayoutKind; sourceId: string | null; amount: number; createdAt: string }>, sources: Map<string, PayoutSource>) {
  const deals = new Map<string, { depositId: string; commission: number; campaignBonus: number; createdAt: string }>();
  for (const r of rows) {
    if (!DEAL_KINDS.includes(r.kind) || !r.sourceId) continue;
    const deal = deals.get(r.sourceId) ?? { depositId: r.sourceId, commission: 0, campaignBonus: 0, createdAt: r.createdAt };
    if (r.kind === 'CAMPAIGN_BONUS') deal.campaignBonus += r.amount;
    else deal.commission += r.amount;
    deals.set(r.sourceId, deal);
  }
  return [...deals.values()].map((d) => {
    const src = sources.get(d.depositId);
    return {
      depositId: d.depositId,
      unit: src?.unit ?? null,
      tenantName: src?.tenantName ?? null,
      depositCode: src?.ref ?? null,
      paidAt: src?.paidAt ?? d.createdAt,
      status: src?.depositStatus ?? null,
      commission: d.commission,
      campaignBonus: d.campaignBonus,
      href: src?.href ?? null,
    };
  });
}

/** Quy ước transRef của AdminPayoutService: viewing:<id> · deposit:<id>[:rating|:campaign] · inspection:<mandateId>. */
export function parseTransRef(transRef: string | null): { kind: PayoutKind; sourceId: string | null } {
  const [prefix, id, suffix] = (transRef ?? '').split(':');
  if (prefix === 'viewing' && id) return { kind: 'VIEWING_FEE', sourceId: id };
  if (prefix === 'inspection' && id) return { kind: 'INSPECTION_FEE', sourceId: id };
  if (prefix === 'deposit' && id) {
    if (suffix === 'rating') return { kind: 'RATING_BONUS', sourceId: id };
    if (suffix === 'campaign') return { kind: 'CAMPAIGN_BONUS', sourceId: id };
    if (!suffix) return { kind: 'DEAL_COMMISSION', sourceId: id };
  }
  return { kind: 'OTHER', sourceId: null };
}

function summarize(rows: Array<{ kind: PayoutKind; amount: number }>) {
  const of = (kind: PayoutKind) => rows.filter((r) => r.kind === kind);
  const sum = (list: Array<{ amount: number }>) => list.reduce((total, r) => total + r.amount, 0);
  return {
    totalViewings: of('VIEWING_FEE').length,
    viewingFeeTotal: sum(of('VIEWING_FEE')),
    totalDeals: of('DEAL_COMMISSION').length,
    dealCommissionTotal: sum(of('DEAL_COMMISSION')),
    ratingBonusCount: of('RATING_BONUS').length,
    ratingBonus: sum(of('RATING_BONUS')),
    campaignBonusCount: of('CAMPAIGN_BONUS').length,
    campaignBonus: sum(of('CAMPAIGN_BONUS')),
    totalInspections: of('INSPECTION_FEE').length,
    inspectionFeeTotal: sum(of('INSPECTION_FEE')),
    totalEarnings: sum(rows),
  };
}

/** "S2.12 · Tầng 16 · Căn 08" — đủ để Host nhận ra căn, không lộ thông tin chủ nhà. */
function unitLabel(unit: any): string | null {
  if (!unit) return null;
  const parts = [unit.building?.buildingCode, `Tầng ${unit.floorNumber}`, unit.doorNumber ? `Căn ${unit.doorNumber}` : unit.unitCode];
  return parts.filter(Boolean).join(' · ');
}

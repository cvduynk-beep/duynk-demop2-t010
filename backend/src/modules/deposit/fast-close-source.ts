import { readConsignmentMeta } from '../landlord/landlord.mappers';
import { securityDepositAmount } from './deposit-amount';
import { fastDepositQuote, type FastCloseSource } from './fast-close';

/**
 * Nguồn chốt nhanh của căn từ hồ sơ ký gửi MỚI NHẤT (`exclusive_mandates.door_access_config.consignment.form`):
 * chủ nhà không bật ủy quyền hoặc thiếu giá sàn ⇒ `floorRent` null. Hàm thuần — dùng chung cho cọc, ký HĐ và catalog.
 */
export function fastCloseSourceOf(
  unit: { baseRentPrice: unknown; securityDeposit?: unknown },
  latestMandateDoorConfig: unknown,
): FastCloseSource {
  const form = readConsignmentMeta(latestMandateDoorConfig)?.form;
  const floor = form?.allowFastClose && form.floorRent ? Number(form.floorRent) : null;
  return { rent: Math.round(Number(unit.baseRentPrice)), deposit: securityDepositAmount(unit as any), floorRent: floor };
}

/** Dấu "Cọc nhanh" công khai trên thẻ/chi tiết căn: chỉ mức giảm TIỀN CỌC (không lộ giá sàn / giá thuê đã giảm). */
export interface UnitFastDepositBadge {
  depositDiscount: number;
}

export function fastDepositBadge(
  unit: { status: unknown; baseRentPrice: unknown; securityDeposit?: unknown },
  latestMandateDoorConfig: unknown,
): UnitFastDepositBadge | null {
  if (unit.status !== 'AVAILABLE') return null;
  const q = fastDepositQuote(fastCloseSourceOf(unit, latestMandateDoorConfig));
  return q ? { depositDiscount: q.depositDiscount } : null;
}

/** Hồ sơ ký gửi mới nhất của nhiều căn trong MỘT truy vấn (catalog). */
export async function latestMandateConfigs(db: any, unitIds: string[]): Promise<Map<string, unknown>> {
  const out = new Map<string, unknown>();
  if (unitIds.length === 0) return out;
  const rows: { unitId: string; doorAccessConfig: unknown }[] = await db.exclusiveMandate.findMany({
    where: { unitId: { in: unitIds } },
    orderBy: { createdAt: 'desc' },
    select: { unitId: true, doorAccessConfig: true },
  });
  for (const r of rows) if (!out.has(r.unitId)) out.set(r.unitId, r.doorAccessConfig);
  return out;
}

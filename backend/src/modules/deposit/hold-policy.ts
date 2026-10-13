/**
 * Chính sách giữ chỗ — NGUỒN DUY NHẤT cho số giờ khoá căn sau khi cọc 2.000.000đ được báo có (AGENTS: mặc định 48h,
 * Admin cài 12–72h trên `/admin/settings`, chỉnh riêng từng căn ở Kho căn).
 *
 * Thứ tự ưu tiên (mọi nơi: biên bản cọc, tạo cọc, báo có webhook / duyệt UNC, catalog, căn đã lưu, chatbot):
 *   1. `holding_deposits.hold_hours` đã chốt lúc tạo cọc (đúng điều khoản khách đã tick) — chỉ áp cho cọc đã có
 *   2. `units.hold_hours_override` (riêng căn)
 *   3. `fee_configs.hold_hours_default` (mặc định toàn sàn, Admin cài)
 *   4. `HOLD_HOURS_DEFAULT` (chưa ai cài)
 * rồi làm tròn và kẹp [HOLD_HOURS_MIN, HOLD_HOURS_MAX]. Đổi mặc định KHÔNG làm đổi cọc đã tạo / đang giữ.
 */
export const HOLD_HOURS_KEY = 'hold_hours_default';
export const HOLD_HOURS_DEFAULT = 48;
export const HOLD_HOURS_MIN = 12;
export const HOLD_HOURS_MAX = 72;

/** Client tối thiểu (PrismaService hoặc transaction). */
export interface HoldPolicyReader {
  feeConfig: { findUnique(args: { where: { configKey: string } }): Promise<{ paramValue: unknown } | null> };
}

export function clampHoldHours(hours: number): number {
  return Math.min(HOLD_HOURS_MAX, Math.max(HOLD_HOURS_MIN, Math.round(hours)));
}

/** Mặc định toàn sàn: giá trị Admin đã lưu, chưa lưu thì 48. */
export async function readDefaultHoldHours(client: HoldPolicyReader): Promise<number> {
  const row = await client.feeConfig.findUnique({ where: { configKey: HOLD_HOURS_KEY } });
  return clampHoldHours(row ? Number(row.paramValue) : HOLD_HOURS_DEFAULT);
}

/** Giờ giữ chỗ hiệu lực theo thứ tự ở đầu file. `defaultHours` truyền sẵn khi đã đọc (vd. catalog nhiều căn). */
export async function resolveHoldHours(
  client: HoldPolicyReader,
  source: { snapshot?: number | null; override?: number | null; defaultHours?: number },
): Promise<number> {
  const picked = source.snapshot ?? source.override ?? source.defaultHours ?? (await readDefaultHoldHours(client));
  return clampHoldHours(picked);
}

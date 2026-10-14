/**
 * Smart Move-in Window Protocol (legal/02 Điều 2.6 · legal/06 Điều 2; quyết định 2026-10-14) — hàm thuần, ngày lịch giờ VN.
 * T0 = ngày cọc về (paid_at). Ngày dọn vào: sớm nhất T0+2 (BQL duyệt cư dân, thẻ thang máy, Field Host kiểm định),
 * muộn nhất T0+30. Miễn phí chờ tới T0+7 (ngày thứ 08 tính cả T0); chọn muộn hơn ⇒ Hợp đồng & tiền thuê bắt đầu từ T0+7,
 * khách được nhận mã cửa từ ngày đó.
 */
export const MOVE_IN_MIN_DAYS = 2;
export const MOVE_IN_FREE_DAYS = 7;
export const MOVE_IN_MAX_DAYS = 30;
const DAY_MS = 86_400_000;
const ICT_MS = 7 * 3_600_000;
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

export const ictDate = (d: Date) => new Date(d.getTime() + ICT_MS).toISOString().slice(0, 10);
const addDays = (day: string, n: number) => new Date(Date.parse(`${day}T00:00:00Z`) + n * DAY_MS).toISOString().slice(0, 10);

export interface MoveInWindow {
  /** T0 (YYYY-MM-DD giờ VN). */
  depositDate: string;
  earliest: string;
  freeUntil: string;
  latest: string;
}

export function moveInWindow(paidAt: Date): MoveInWindow {
  const t0 = ictDate(paidAt);
  return { depositDate: t0, earliest: addDays(t0, MOVE_IN_MIN_DAYS), freeUntil: addDays(t0, MOVE_IN_FREE_DAYS), latest: addDays(t0, MOVE_IN_MAX_DAYS) };
}

/** Kiểu phẳng (repo tắt strictNullChecks ⇒ union phân biệt theo boolean không thu hẹp được). `ok=false` ⇒ có `message`. */
export interface MoveInResult {
  ok: boolean;
  message?: string;
  moveInDate?: string;
  billingStartDate?: string;
  freeHolding?: boolean;
  window: MoveInWindow;
}

export function evaluateMoveIn(paidAt: Date, chosen: string): MoveInResult {
  const w = moveInWindow(paidAt);
  const fmt = (d: string) => d.split('-').reverse().join('/');
  if (!DATE_RE.test(chosen) || Number.isNaN(Date.parse(`${chosen}T00:00:00Z`)) || addDays(chosen, 0) !== chosen) {
    return { ok: false, message: 'Ngày dọn vào phải có dạng YYYY-MM-DD.', window: w };
  }
  if (chosen < w.earliest || chosen > w.latest) {
    return { ok: false, message: `Ngày dọn vào phải từ ${fmt(w.earliest)} đến ${fmt(w.latest)} (02–30 ngày sau khi cọc về).`, window: w };
  }
  const freeHolding = chosen <= w.freeUntil;
  return { ok: true, moveInDate: chosen, billingStartDate: freeHolding ? chosen : w.freeUntil, freeHolding, window: w };
}

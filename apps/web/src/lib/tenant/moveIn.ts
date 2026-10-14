/**
 * Smart Move-in Window — bản hiển thị, khớp `backend/src/modules/contract/move-in.ts` (backend mới là nơi kiểm thật).
 * T0 = ngày cọc về (giờ VN). Dọn vào sớm nhất T0+2, muộn nhất T0+30; miễn phí chờ tới T0+7, chọn muộn hơn thì
 * Hợp đồng & tiền thuê tính từ T0+7.
 */
export const MOVE_IN_MIN_DAYS = 2;
export const MOVE_IN_FREE_DAYS = 7;
export const MOVE_IN_MAX_DAYS = 30;
const DAY_MS = 86_400_000;
const ICT_MS = 7 * 3_600_000;

export const ictDate = (ms: number) => new Date(ms + ICT_MS).toISOString().slice(0, 10);
const addDays = (day: string, n: number) => new Date(Date.parse(`${day}T00:00:00Z`) + n * DAY_MS).toISOString().slice(0, 10);

export interface MoveInWindow {
  depositDate: string;
  earliest: string;
  freeUntil: string;
  latest: string;
}

export function moveInWindow(paidAtMs: number): MoveInWindow {
  const t0 = ictDate(paidAtMs);
  return { depositDate: t0, earliest: addDays(t0, MOVE_IN_MIN_DAYS), freeUntil: addDays(t0, MOVE_IN_FREE_DAYS), latest: addDays(t0, MOVE_IN_MAX_DAYS) };
}

/** Ngày bắt đầu tính tiền thuê cho ngày dọn vào `moveIn` (YYYY-MM-DD). */
export const billingStart = (w: MoveInWindow, moveIn: string) => (moveIn <= w.freeUntil ? moveIn : w.freeUntil);

import { BadRequestException } from '@nestjs/common';

/** Khoảng thời gian báo cáo của Admin — ngày lịch theo giờ Việt Nam (Asia/Ho_Chi_Minh, UTC+7, không có giờ mùa hè). */
export const REPORT_TIMEZONE = 'Asia/Ho_Chi_Minh';
export const DEFAULT_RANGE_DAYS = 7;
export const MAX_RANGE_DAYS = 90;

export const DAY_MS = 86_400_000;
const ICT_OFFSET_MS = 7 * 3_600_000;
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

/** Ngày lịch ICT của một thời điểm, dạng YYYY-MM-DD. */
export const ictDay = (d: Date) => new Date(d.getTime() + ICT_OFFSET_MS).toISOString().slice(0, 10);
/** 00:00 ICT của ngày YYYY-MM-DD. */
export const ictStart = (day: string) => new Date(Date.parse(`${day}T00:00:00+07:00`));
export const addDays = (day: string, n: number) => ictDay(new Date(ictStart(day).getTime() + n * DAY_MS));

export interface ReportRange {
  /** Ngày đầu (gồm), YYYY-MM-DD theo giờ ICT. */
  from: string;
  /** Ngày cuối (gồm), YYYY-MM-DD theo giờ ICT. */
  to: string;
  timezone: typeof REPORT_TIMEZONE;
  days: number;
  /** Mốc truy vấn: `start` ≤ t < `end`. */
  start: Date;
  end: Date;
}

function invalid(field: 'from' | 'to', message: string): never {
  throw new BadRequestException({ code: 'invalid_range', message, errors: { [field]: message } });
}

function parseDay(field: 'from' | 'to', value: string): string {
  if (!DATE_RE.test(value)) invalid(field, 'Ngày phải có dạng YYYY-MM-DD.');
  const d = ictStart(value);
  if (Number.isNaN(d.getTime()) || ictDay(d) !== value) invalid(field, 'Ngày không tồn tại.');
  return value;
}

/**
 * Đọc `from`/`to` (đều tuỳ chọn). Thiếu cả hai ⇒ `defaultDays` (mặc định 7) ngày gần nhất tính tới hôm nay; thiếu một ⇒ suy
 * ra theo `defaultDays`. Sai định dạng, `from` > `to` hoặc dài quá `maxDays` (mặc định 90) ⇒ 400 `invalid_range` theo field.
 */
export function parseReportRange(
  fromRaw: string | undefined,
  toRaw: string | undefined,
  now: Date = new Date(),
  opts: { defaultDays?: number; maxDays?: number } = {},
): ReportRange {
  const defaultDays = opts.defaultDays ?? DEFAULT_RANGE_DAYS;
  const maxDays = opts.maxDays ?? MAX_RANGE_DAYS;
  const fromIn = fromRaw?.trim() || undefined;
  const toIn = toRaw?.trim() || undefined;
  let to = toIn ? parseDay('to', toIn) : undefined;
  let from = fromIn ? parseDay('from', fromIn) : undefined;
  if (!to) to = from ? addDays(from, defaultDays - 1) : ictDay(now);
  if (!from) from = addDays(to, -(defaultDays - 1));
  const start = ictStart(from);
  const end = ictStart(addDays(to, 1));
  if (start > ictStart(to)) invalid('from', 'Ngày bắt đầu phải trước hoặc bằng ngày kết thúc.');
  const days = Math.round((end.getTime() - start.getTime()) / DAY_MS);
  if (days > maxDays) invalid('to', `Khoảng thời gian tối đa ${maxDays} ngày.`);
  return { from, to, timezone: REPORT_TIMEZONE, days, start, end };
}

/** Bỏ mốc truy vấn nội bộ khi trả ra API. */
export const publicRange = (r: ReportRange) => ({ from: r.from, to: r.to, timezone: r.timezone, days: r.days });

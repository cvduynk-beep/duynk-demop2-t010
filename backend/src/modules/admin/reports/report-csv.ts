import type { ReportColumn } from './report-types';

/**
 * Ô CSV an toàn: chống CSV/Excel injection (ô bắt đầu bằng `= + - @`, tab, CR bị Excel coi là công thức ⇒ thêm `'` phía
 * trước), bọc ngoặc kép khi có dấu phẩy / ngoặc kép / xuống dòng. Số giữ nguyên (không bị coi là công thức).
 */
export function csvCell(v: string | number | null | undefined): string {
  if (v == null) return '';
  if (typeof v === 'number') return Number.isFinite(v) ? String(v) : '';
  let s = v;
  if (/^[=+\-@\t\r]/.test(s)) s = `'${s}`;
  return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

/** UTF-8 có BOM (Excel đọc đúng tiếng Việt), xuống dòng CRLF. */
export function toCsv<R>(columns: readonly ReportColumn<R>[], rows: readonly R[]): string {
  const head = columns.map((c) => csvCell(c.label)).join(',');
  const body = rows.map((r) => columns.map((c) => csvCell(c.value ? c.value(r) : ((r as any)[c.key] ?? null))).join(','));
  return '﻿' + [head, ...body].join('\r\n') + '\r\n';
}

/** Tên file có báo cáo + khoảng ngày, chỉ ký tự an toàn cho header Content-Disposition. */
export const csvFilename = (reportId: string, from: string, to: string) => `vinstay-${reportId}_${from}_${to}.csv`.replace(/[^a-zA-Z0-9._-]/g, '');

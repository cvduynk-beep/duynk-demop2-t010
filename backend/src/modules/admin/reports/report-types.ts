import type { Prisma } from '@prisma/client';
import type { ReportRange } from '../admin-range';

export type Tx = Prisma.TransactionClient;
export type SortDir = 'asc' | 'desc';
export type ReportFilterKey = 'from' | 'to' | 'zone' | 'hostId' | 'status';

/** Tham số đã validate (whitelist) — định nghĩa báo cáo chỉ nhận dạng này, không nhận chuỗi thô từ query. */
export interface ReportQuery {
  range: ReportRange;
  zone: string | null;
  hostId: string | null;
  status: string | null;
  page: number;
  pageSize: number;
  sort: string;
  dir: SortDir;
}

export interface ReportColumn<R> {
  key: string;
  label: string;
  /** Giá trị ô CSV; mặc định `row[key]`. */
  value?: (row: R) => string | number | null;
}

export interface ReportResult<R, S> {
  rows: R[];
  /** Số dòng của TOÀN BỘ tập đã lọc (không phải trang hiện tại). */
  total: number;
  /** Tính trên toàn bộ tập đã lọc. */
  summary: S;
}

/** Mỗi báo cáo là một định nghĩa riêng: thêm báo cáo mới = thêm một file + đăng ký trong REPORTS. */
export interface ReportDefinition<R = any, S = any> {
  id: string;
  name: string;
  description: string;
  filters: readonly ReportFilterKey[];
  statuses?: readonly string[];
  /** Khoá sắp xếp công khai → biểu thức SQL (chỉ dùng qua whitelist này). */
  sorts: Readonly<Record<string, string>>;
  defaultSort: string;
  defaultDir: SortDir;
  /** Chỉ số → định nghĩa/công thức, trả trong `meta.definitions`. */
  definitions: Readonly<Record<string, string>>;
  columns: readonly ReportColumn<R>[];
  run(tx: Tx, q: ReportQuery, opts: ReportRunOptions): Promise<ReportResult<R, S>>;
}

export interface ReportRunOptions {
  /** Số dòng tối đa (xuất file); không truyền ⇒ phân trang theo `page`/`pageSize`. */
  limit?: number;
  /** Giải mã SĐT (để che) — PhoneService của AuthModule; lỗi ⇒ null. */
  decryptPhone: (enc: string | null) => string | null;
}

/** numeric/bigint từ $queryRaw ⇒ chuỗi decimal chính xác (không qua float). */
export const money = (v: unknown): string => (v == null ? '0' : String(v));
export const int = (v: unknown): number => (v == null ? 0 : Number(v));
export const numOrNull = (v: unknown): number | null => (v == null ? null : Number(v));

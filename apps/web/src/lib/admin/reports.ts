"use client";

import { useEffect, useState } from "react";
import { api, apiErrorText, downloadFile, type ApiResponse } from "@/lib/apiClient";
import { useApiQuery, type Query } from "@/lib/query/useApiQuery";

// ─── Contract backend: GET /admin/reports · /admin/reports/:id · /admin/reports/:id/export ─────────────────────

export type ReportId = "host-performance" | "deals" | "host-earnings";
export type SortDir = "asc" | "desc";

export interface ReportCatalog {
  timezone: string;
  defaultDays: number;
  maxDays: number;
  pageSizeMax: number;
  exportFormats: string[];
  exportMaxRows: number;
  zones: string[];
  reports: {
    id: ReportId;
    name: string;
    description: string;
    filters: string[];
    statuses: string[];
    sorts: string[];
    defaultSort: string;
    defaultDir: SortDir;
    columns: { key: string; label: string }[];
  }[];
}

export interface ReportMeta {
  reportId: ReportId;
  from: string;
  to: string;
  timezone: string;
  days: number;
  generatedAt: string;
  definitions: Record<string, string>;
}

export interface ReportPage<R, S> {
  rows: R[];
  summary: S;
  page: number;
  pageSize: number;
  total: number;
  meta: ReportMeta;
}

/** Tiền: chuỗi decimal VND do server tính bằng numeric (không cộng lại ở client). */
export type Money = string;

export interface HostPerformanceRow {
  hostId: string;
  name: string | null;
  zone: string;
  isSale: boolean;
  isActive: boolean;
  tours: number;
  deals: number;
  grv: Money;
  winRate: number | null;
  ticketsOffered: number;
  ticketsAccepted: number;
  acceptMedianSec: number | null;
  acceptAvgSec: number | null;
  slaBreaches: number;
  ratingAvg: number | null;
  ratingCount: number;
}
export type HostPerformanceSummary = Omit<HostPerformanceRow, "hostId" | "name" | "zone" | "isSale" | "isActive"> & { hosts: number };

export interface DealRow {
  depositCode: string;
  receivedAt: string;
  status: string;
  unitCode: string;
  layout: string;
  unitZone: string;
  hostName: string | null;
  hostZone: string | null;
  tenantName: string | null;
  tenantPhone: string | null;
  depositAmount: Money;
  inbound: Money;
  refund: Money;
  monthlyRent: Money;
  rentSource: "contract" | "listing";
  contractNumber: string | null;
  contractStatus: string | null;
  salesCycleDays: number | null;
}
export interface DealSummary {
  rows: number;
  byStatus: Record<string, number>;
  inbound: Money;
  refund: Money;
  netHeld: Money;
  closedDeals: number;
  grv: Money;
}

export interface HostEarningsRow {
  hostId: string;
  name: string | null;
  zone: string;
  entries: number;
  viewingFee: Money;
  dealCommission: Money;
  ratingBonus: Money;
  campaignBonus: Money;
  inspectionFee: Money;
  other: Money;
  total: Money;
  paid: Money;
  pending: Money;
}
export type HostEarningsSummary = Omit<HostEarningsRow, "hostId" | "name" | "zone"> & { hosts: number };

export const useReportCatalog = (): Query<ReportCatalog> =>
  useApiQuery({ key: "admin-reports:catalog", fetch: () => api.get<ReportCatalog>("/admin/reports"), errorText: (r) => apiErrorText(r, "Không tải được danh mục báo cáo.") });

// ─── Bộ lọc ⇄ URL ─────────────────────────────────────────────────────────────────────────────────────────

export interface CommonFilters {
  from: string;
  to: string;
  zone: string;
  hostId: string;
}
export interface TableState {
  sort: string;
  dir: SortDir;
  page: number;
  status?: string;
}

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const ICT = 7 * 3_600_000;
export const ictToday = (now = Date.now()) => new Date(now + ICT).toISOString().slice(0, 10);
export const shiftDay = (day: string, n: number) => new Date(Date.parse(`${day}T00:00:00Z`) + n * 86_400_000).toISOString().slice(0, 10);

export type PresetKey = "7d" | "30d" | "month" | "quarter" | "custom";
export const PRESETS: { key: Exclude<PresetKey, "custom">; label: string }[] = [
  { key: "7d", label: "7 ngày qua" },
  { key: "30d", label: "30 ngày qua" },
  { key: "month", label: "Tháng này" },
  { key: "quarter", label: "Quý này" },
];

/** Khoảng ngày (giờ VN) của một preset, tính tới hôm nay. */
export function presetRange(key: Exclude<PresetKey, "custom">, today = ictToday()): { from: string; to: string } {
  if (key === "7d") return { from: shiftDay(today, -6), to: today };
  if (key === "30d") return { from: shiftDay(today, -29), to: today };
  const [y, m] = today.split("-").map(Number);
  const startMonth = key === "month" ? m : Math.floor((m - 1) / 3) * 3 + 1;
  return { from: `${y}-${String(startMonth).padStart(2, "0")}-01`, to: today };
}

export function detectPreset(f: Pick<CommonFilters, "from" | "to">, today = ictToday()): PresetKey {
  for (const p of PRESETS) {
    const r = presetRange(p.key, today);
    if (r.from === f.from && r.to === f.to) return p.key;
  }
  return "custom";
}

/** Đọc bộ lọc chung từ URL; thiếu/sai ⇒ 30 ngày gần nhất (khớp mặc định server). Server vẫn validate lại. */
export function readCommon(sp: URLSearchParams, today = ictToday()): CommonFilters {
  const def = presetRange("30d", today);
  const from = sp.get("from") ?? "";
  const to = sp.get("to") ?? "";
  return {
    from: DATE_RE.test(from) ? from : def.from,
    to: DATE_RE.test(to) ? to : def.to,
    zone: sp.get("zone") ?? "",
    hostId: sp.get("hostId") ?? "",
  };
}

/** Trạng thái bảng của một báo cáo trên URL: `<prefix>Sort`, `<prefix>Dir`, `<prefix>Page`, `<prefix>Status`. */
export function readTable(sp: URLSearchParams, prefix: string, def: { sort: string; dir: SortDir }): TableState {
  const page = Number(sp.get(`${prefix}Page`));
  const dir = sp.get(`${prefix}Dir`);
  return {
    sort: sp.get(`${prefix}Sort`) || def.sort,
    dir: dir === "asc" || dir === "desc" ? dir : def.dir,
    page: Number.isInteger(page) && page >= 1 ? page : 1,
    status: sp.get(`${prefix}Status`) || undefined,
  };
}

export function reportQuery(common: CommonFilters, t?: Partial<TableState> & { pageSize?: number }): string {
  const s = new URLSearchParams({ from: common.from, to: common.to });
  if (common.zone) s.set("zone", common.zone);
  if (common.hostId) s.set("hostId", common.hostId);
  if (t?.sort) s.set("sort", t.sort);
  if (t?.dir) s.set("dir", t.dir);
  if (t?.page) s.set("page", String(t.page));
  if (t?.pageSize) s.set("pageSize", String(t.pageSize));
  if (t?.status) s.set("status", t.status);
  return s.toString();
}

// ─── Tải báo cáo: huỷ request cũ khi đổi bộ lọc ────────────────────────────────────────────────────────────

export type ReportState<T> =
  | { status: "loading"; data?: T }
  | { status: "ready"; data: T }
  | { status: "error"; message: string; httpStatus: number; data?: T };

/**
 * Mỗi báo cáo tải độc lập (lỗi một báo cáo không làm sập trang). Đổi bộ lọc ⇒ AbortController huỷ request cũ ở tầng mạng,
 * chỉ kết quả của bộ lọc hiện tại được hiển thị; trong lúc tải lại vẫn giữ dữ liệu cũ (mờ) thay vì nháy trắng.
 */
export function useReport<T>(id: ReportId, qs: string): { state: ReportState<T>; reload: () => void } {
  const key = `${id}?${qs}`;
  const [entry, setEntry] = useState<{ key: string; state: ReportState<T> }>({ key: "", state: { status: "loading" } });
  const [tick, setTick] = useState(0);

  useEffect(() => {
    const ctrl = new AbortController();
    void api.get<T>(`/admin/reports/${id}?${qs}`, { signal: ctrl.signal }).then((res: ApiResponse<T>) => {
      if (ctrl.signal.aborted || res.code === "aborted") return;
      setEntry({
        key,
        state: res.ok ? { status: "ready", data: res.data } : { status: "error", message: apiErrorText(res, "Không tải được báo cáo."), httpStatus: res.status },
      });
    });
    return () => ctrl.abort();
  }, [id, qs, key, tick]);

  const state: ReportState<T> =
    entry.key === key ? entry.state : { status: "loading", data: entry.state.status === "ready" ? entry.state.data : undefined };
  return { state, reload: () => setTick((t) => t + 1) };
}

export async function exportReport(id: ReportId, qs: string): Promise<{ ok: true; filename: string } | { ok: false; message: string }> {
  const res = await downloadFile(`/admin/reports/${id}/export?${qs}&format=csv`);
  if (!res.ok) return { ok: false, message: apiErrorText(res, "Chưa xuất được file.") };
  const filename = res.data.filename ?? `vinstay-${id}.csv`;
  const a = document.createElement("a");
  a.href = URL.createObjectURL(res.data.blob);
  a.download = filename;
  a.click();
  // Thu hồi sau khi trình duyệt đã nhận file (thu hồi ngay có thể làm hỏng lượt tải ở vài trình duyệt).
  setTimeout(() => URL.revokeObjectURL(a.href), 10_000);
  return { ok: true, filename };
}

// ─── Hiển thị ─────────────────────────────────────────────────────────────────────────────────────────────

const nf = new Intl.NumberFormat("vi-VN");
const nf1 = new Intl.NumberFormat("vi-VN", { maximumFractionDigits: 1 });
const nf2 = new Intl.NumberFormat("vi-VN", { maximumFractionDigits: 2 });
/** Chuỗi decimal VND ⇒ "12.500.000 đ" (chỉ hiển thị; số liệu đã tính ở server). */
export const fmtMoney = (v: Money) => `${nf.format(Math.round(Number(v)))} đ`;
export const fmtInt = (n: number) => nf.format(n);
export const fmtPct = (n: number | null) => (n == null ? "—" : `${nf1.format(n)}%`);
export const fmtSec = (n: number | null) => (n == null ? "—" : n >= 60 ? `${Math.floor(n / 60)} phút ${Math.round(n % 60)} giây` : `${nf1.format(n)} giây`);
export const fmtRating = (n: number | null) => (n == null ? "—" : `${nf2.format(n)} ★`);
export const fmtDays = (n: number | null) => (n == null ? "—" : `${nf1.format(n)} ngày`);
export const fmtDayVn = (day: string) => day.split("-").reverse().join("/");

export const DEAL_STATUS_LABEL: Record<string, string> = {
  PAID_HOLDING: "Đang giữ chỗ",
  CONVERTED_TO_CONTRACT: "Đã ký HĐ",
  FORFEITED: "Mất cọc",
  REFUNDED: "Đã hoàn",
};
export const pageCount = (total: number, size: number) => Math.max(1, Math.ceil(total / size));

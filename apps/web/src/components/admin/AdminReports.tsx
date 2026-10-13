"use client";

import { useRef, useState, type ReactNode } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Download, HelpCircle, Printer } from "lucide-react";
import { StatTile } from "@/components/charts/StatTile";
import { DataTable, type DataTableColumn } from "@/components/ui/DataTable";
import { Modal } from "@/components/ui/Modal";
import { PageHeader } from "@/components/ui/PageHeader";
import { Section } from "@/components/ui/Section";
import { toast } from "@/components/ui/Toast";
import { useHostList } from "@/lib/admin/hosts";
import {
  DEAL_STATUS_LABEL,
  PRESETS,
  detectPreset,
  exportReport,
  fmtDayVn,
  fmtDays,
  fmtInt,
  fmtMoney,
  fmtPct,
  fmtRating,
  fmtSec,
  ictToday,
  pageCount,
  presetRange,
  readCommon,
  readTable,
  reportQuery,
  useReport,
  useReportCatalog,
  type CommonFilters,
  type DealRow,
  type DealSummary,
  type HostEarningsRow,
  type HostEarningsSummary,
  type HostPerformanceRow,
  type HostPerformanceSummary,
  type ReportId,
  type ReportPage,
  type SortDir,
} from "@/lib/admin/reports";
import styles from "./Admin.module.css";

const PAGE_SIZE = 20;
const MAX_DAYS = 366;

type SetParams = (patch: Record<string, string | null>) => void;

/** Bộ lọc nằm trên URL (chia sẻ link / tải lại không mất); đổi bộ lọc chung ⇒ về trang 1 ở mọi bảng. */
function useUrlParams(): { sp: URLSearchParams; set: SetParams } {
  const sp = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();
  const set: SetParams = (patch) => {
    const next = new URLSearchParams(sp.toString());
    for (const [k, v] of Object.entries(patch)) {
      if (v == null || v === "") next.delete(k);
      else next.set(k, v);
    }
    const qs = next.toString();
    router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
  };
  return { sp: new URLSearchParams(sp.toString()), set };
}

const RESET_PAGES = { hpPage: null, dlPage: null, hePage: null };

function Filters({
  common,
  set,
  zones,
}: {
  common: CommonFilters;
  set: SetParams;
  zones: string[];
}) {
  const hosts = useHostList({ role: "sale" });
  const today = ictToday();
  const preset = detectPreset(common, today);
  const [custom, setCustom] = useState(preset === "custom");
  const [draft, setDraft] = useState({ from: common.from, to: common.to });
  const [error, setError] = useState<string | null>(null);

  const applyCustom = () => {
    const days =
      (Date.parse(draft.to) - Date.parse(draft.from)) / 86_400_000 + 1;
    if (!draft.from || !draft.to)
      return setError("Chọn đủ ngày bắt đầu và ngày kết thúc.");
    if (days < 1)
      return setError("Ngày bắt đầu phải trước hoặc bằng ngày kết thúc.");
    if (days > MAX_DAYS)
      return setError(`Khoảng thời gian tối đa ${MAX_DAYS} ngày.`);
    setError(null);
    set({ from: draft.from, to: draft.to, ...RESET_PAGES });
  };

  return (
    <section
      className="card"
      style={{ padding: "16px 20px", display: "grid", gap: 12 }}
      aria-label="Bộ lọc báo cáo"
    >
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(190px, 1fr))",
          gap: 12,
        }}
      >
        <label className="field">
          <span className="label">Khung thời gian</span>
          <select
            className="select"
            value={custom ? "custom" : preset}
            onChange={(e) => {
              const v = e.target.value;
              if (v === "custom") {
                setCustom(true);
                setDraft({ from: common.from, to: common.to });
                return;
              }
              setCustom(false);
              setError(null);
              set({
                ...presetRange(v as (typeof PRESETS)[number]["key"], today),
                ...RESET_PAGES,
              });
            }}
          >
            {PRESETS.map((p) => (
              <option key={p.key} value={p.key}>
                {p.label}
              </option>
            ))}
            <option value="custom">Khoảng ngày tuỳ chọn…</option>
          </select>
        </label>
        <label className="field">
          <span className="label">Phân khu (của Field Host)</span>
          <select
            className="select"
            value={common.zone}
            onChange={(e) => set({ zone: e.target.value, ...RESET_PAGES })}
          >
            <option value="">Tất cả phân khu</option>
            {zones.map((z) => (
              <option key={z} value={z}>
                {z}
              </option>
            ))}
          </select>
        </label>
        <label className="field">
          <span className="label">Field Host (Sale)</span>
          <select
            className="select"
            value={common.hostId}
            onChange={(e) => set({ hostId: e.target.value, ...RESET_PAGES })}
            disabled={hosts.state.status === "loading"}
          >
            <option value="">Tất cả Field Host</option>
            {hosts.state.status === "ready" &&
              hosts.state.data.map((h) => (
                <option key={h.id} value={h.id}>
                  {h.fullName ?? h.email ?? h.id} · {h.assignedZone}
                </option>
              ))}
          </select>
          {hosts.state.status === "error" && (
            <span className="field-error">Không tải được danh sách Host.</span>
          )}
        </label>
      </div>
      {custom && (
        <form
          style={{
            display: "flex",
            gap: 12,
            alignItems: "flex-end",
            flexWrap: "wrap",
          }}
          // Kiểm bằng applyCustom để báo lỗi tiếng Việt; ràng buộc HTML gốc sẽ chặn submit mà không có thông báo.
          noValidate
          onSubmit={(e) => {
            e.preventDefault();
            applyCustom();
          }}
        >
          <label className="field">
            <span className="label">Từ ngày</span>
            <input
              className="input"
              type="date"
              value={draft.from}
              max={today}
              onChange={(e) =>
                setDraft((d) => ({ ...d, from: e.target.value }))
              }
            />
          </label>
          <label className="field">
            <span className="label">Đến ngày</span>
            <input
              className="input"
              type="date"
              value={draft.to}
              max={today}
              onChange={(e) => setDraft((d) => ({ ...d, to: e.target.value }))}
            />
          </label>
          <button type="submit" className="btn btn-primary btn-sm">
            Áp dụng
          </button>
          {error && (
            <span className="field-error" role="alert">
              {error}
            </span>
          )}
        </form>
      )}
      <p className="xs muted" style={{ margin: 0 }}>
        Đang xem {fmtDayVn(common.from)} – {fmtDayVn(common.to)} · giờ Việt Nam
        (Asia/Ho_Chi_Minh). Lọc phân khu/Host theo Field Host được gán.
      </p>
    </section>
  );
}

function ErrorBox({
  title,
  message,
  onRetry,
}: {
  title: string;
  message: string;
  onRetry: () => void;
}) {
  return (
    <div className={`card ${styles.widgetError}`} role="alert">
      <b>{title}</b>
      <p className="small">{message}</p>
      <button type="button" className="btn btn-quiet btn-sm" onClick={onRetry}>
        Thử lại
      </button>
    </div>
  );
}

/** Nút xuất: chống bấm trùng (ref chặn trong cùng tick + disabled), trạng thái đang xử lý, lỗi 422/429/5xx báo rõ. */
function ExportButton({ id, qs }: { id: ReportId; qs: string }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const inFlight = useRef(false);
  return (
    <span
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 8,
        flexWrap: "wrap",
      }}
    >
      <button
        type="button"
        className="btn btn-secondary btn-sm"
        disabled={busy}
        aria-busy={busy}
        onClick={async () => {
          if (inFlight.current) return;
          inFlight.current = true;
          setBusy(true);
          setError(null);
          try {
            const out = await exportReport(id, qs);
            if (out.ok) toast(`Đã xuất ${out.filename}`, "success");
            else setError(out.message);
          } finally {
            inFlight.current = false;
            setBusy(false);
          }
        }}
        style={{ display: "inline-flex", alignItems: "center", gap: 6 }}
      >
        <Download size={14} /> {busy ? "Đang xuất…" : "Xuất CSV"}
      </button>
      {error && (
        <span className="field-error xs" role="alert">
          {error}
        </span>
      )}
    </span>
  );
}

function Definitions({
  title,
  defs,
}: {
  title: string;
  defs: Record<string, string> | undefined;
}) {
  const [open, setOpen] = useState(false);
  if (!defs) return null;
  return (
    <>
      <button
        type="button"
        className="btn btn-quiet btn-sm"
        onClick={() => setOpen(true)}
        style={{ display: "inline-flex", alignItems: "center", gap: 6 }}
      >
        <HelpCircle size={14} /> Cách tính
      </button>
      {open && (
        <Modal
          open
          onClose={() => setOpen(false)}
          title={`Cách tính — ${title}`}
          description="Định nghĩa do server trả kèm số liệu (meta.definitions)."
        >
          <dl className="small" style={{ margin: 0, display: "grid", gap: 10 }}>
            {Object.entries(defs).map(([k, v]) => (
              <div key={k}>
                <dt className="muted xs">{k}</dt>
                <dd style={{ margin: 0 }}>{v}</dd>
              </div>
            ))}
          </dl>
        </Modal>
      )}
    </>
  );
}

function SortBar({
  sorts,
  labels,
  sort,
  dir,
  onChange,
}: {
  sorts: string[];
  labels: Record<string, string>;
  sort: string;
  dir: SortDir;
  onChange: (s: string, d: SortDir) => void;
}) {
  return (
    <div
      style={{
        display: "flex",
        gap: 8,
        alignItems: "center",
        flexWrap: "wrap",
      }}
    >
      <label
        className="small muted"
        style={{ display: "flex", gap: 6, alignItems: "center" }}
      >
        Sắp xếp
        <select
          className="select"
          value={sort}
          onChange={(e) => onChange(e.target.value, dir)}
          aria-label="Cột sắp xếp"
        >
          {sorts.map((s) => (
            <option key={s} value={s}>
              {labels[s] ?? s}
            </option>
          ))}
        </select>
      </label>
      <button
        type="button"
        className="btn btn-quiet btn-sm"
        onClick={() => onChange(sort, dir === "desc" ? "asc" : "desc")}
        aria-label="Đảo chiều sắp xếp"
      >
        {dir === "desc" ? "Giảm dần ↓" : "Tăng dần ↑"}
      </button>
    </div>
  );
}

function Pager({
  page,
  total,
  onPage,
  refreshing,
}: {
  page: number;
  total: number;
  onPage: (p: number) => void;
  refreshing: boolean;
}) {
  const pages = pageCount(total, PAGE_SIZE);
  if (pages <= 1 && !refreshing) return null;
  return (
    <div className={styles.tools} style={{ justifyContent: "space-between" }}>
      <span className="muted small" aria-live="polite">
        {fmtInt(total)} dòng · trang {page}/{pages}
        {refreshing ? " · đang cập nhật…" : ""}
      </span>
      <div style={{ display: "flex", gap: 6 }}>
        <button
          type="button"
          className="btn btn-quiet btn-sm"
          disabled={page <= 1}
          onClick={() => onPage(page - 1)}
        >
          Trang trước
        </button>
        <button
          type="button"
          className="btn btn-quiet btn-sm"
          disabled={page >= pages}
          onClick={() => onPage(page + 1)}
        >
          Trang sau
        </button>
      </div>
    </div>
  );
}

interface SectionProps<R, S> {
  id: ReportId;
  title: string;
  description: string;
  prefix: string;
  common: CommonFilters;
  sp: URLSearchParams;
  set: SetParams;
  catalog:
    | {
        sorts: string[];
        defaultSort: string;
        defaultDir: SortDir;
        statuses: string[];
      }
    | undefined;
  sortLabels: Record<string, string>;
  columns: DataTableColumn<R>[];
  summary: (s: S) => ReactNode;
  emptyText: string;
}

/** Một báo cáo: tải độc lập, loading / rỗng / lỗi riêng; sắp xếp + trang + (trạng thái) trên URL. */
function ReportSection<R, S>({
  id,
  title,
  description,
  prefix,
  common,
  sp,
  set,
  catalog,
  sortLabels,
  columns,
  summary,
  emptyText,
}: SectionProps<R, S>) {
  const t = readTable(sp, prefix, {
    sort: catalog?.defaultSort ?? "",
    dir: catalog?.defaultDir ?? "desc",
  });
  const qsAll = reportQuery(common, {
    sort: t.sort || undefined,
    dir: t.dir,
    status: t.status,
  });
  const qs = reportQuery(common, {
    sort: t.sort || undefined,
    dir: t.dir,
    status: t.status,
    page: t.page,
    pageSize: PAGE_SIZE,
  });
  const { state, reload } = useReport<ReportPage<R, S>>(id, qs);
  const data = state.data;

  return (
    <Section
      title={title}
      description={description}
      actions={
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          <Definitions title={title} defs={data?.meta.definitions} />
          <ExportButton id={id} qs={qsAll} />
        </div>
      }
    >
      <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
        <div
          style={{
            display: "flex",
            gap: 12,
            justifyContent: "space-between",
            flexWrap: "wrap",
          }}
        >
          {catalog && (
            <SortBar
              sorts={catalog.sorts}
              labels={sortLabels}
              sort={t.sort}
              dir={t.dir}
              onChange={(s, d) =>
                set({
                  [`${prefix}Sort`]: s,
                  [`${prefix}Dir`]: d,
                  [`${prefix}Page`]: null,
                })
              }
            />
          )}
          {catalog && catalog.statuses.length > 0 && (
            <label
              className="small muted"
              style={{ display: "flex", gap: 6, alignItems: "center" }}
            >
              Trạng thái
              <select
                className="select"
                value={t.status ?? ""}
                onChange={(e) =>
                  set({
                    [`${prefix}Status`]: e.target.value,
                    [`${prefix}Page`]: null,
                  })
                }
                aria-label="Lọc trạng thái"
              >
                <option value="">Tất cả</option>
                {catalog.statuses.map((s) => (
                  <option key={s} value={s}>
                    {DEAL_STATUS_LABEL[s] ?? s}
                  </option>
                ))}
              </select>
            </label>
          )}
        </div>

        {state.status === "error" && (
          <ErrorBox
            title={`Không tải được báo cáo "${title}"`}
            message={state.message}
            onRetry={reload}
          />
        )}
        {state.status === "loading" && !data && (
          <div
            className="skeleton"
            style={{ height: 220, borderRadius: 16 }}
            aria-busy="true"
            aria-label={`Đang tải ${title}`}
          />
        )}
        {data && (
          <div
            style={{
              opacity: state.status === "loading" ? 0.6 : 1,
              transition: "opacity .15s",
              display: "flex",
              flexDirection: "column",
              gap: 12,
            }}
            aria-busy={state.status === "loading"}
          >
            {summary(data.summary)}
            <DataTable<R>
              columns={columns}
              rows={data.rows}
              empty={<span className="muted">{emptyText}</span>}
            />
            <Pager
              page={data.page}
              total={data.total}
              refreshing={state.status === "loading"}
              onPage={(p) => set({ [`${prefix}Page`]: String(p) })}
            />
            <p className="xs muted" style={{ margin: 0 }}>
              Số liệu tính lúc{" "}
              {new Date(data.meta.generatedAt).toLocaleString("vi-VN", {
                timeZone: "Asia/Ho_Chi_Minh",
              })}{" "}
              (giờ VN), tổng tính trên toàn bộ dữ liệu đã lọc.
            </p>
          </div>
        )}
      </div>
    </Section>
  );
}

const Pairs = ({ items }: { items: [string, string][] }) => (
  <div className={styles.kpis}>
    {items.map(([label, value]) => (
      <StatTile key={label} label={label} value={value} />
    ))}
  </div>
);

const hpColumns: DataTableColumn<HostPerformanceRow>[] = [
  {
    key: "name",
    header: "Field Host",
    render: (r) => (
      <span>
        <b>{r.name ?? "—"}</b>
        <br />
        <span className="xs muted">
          {r.zone}
          {r.isSale ? "" : " · không còn vai Sale"}
          {r.isActive ? "" : " · đã khoá"}
        </span>
      </span>
    ),
  },
  { key: "tours", header: "Lượt dẫn", render: (r) => fmtInt(r.tours) },
  { key: "deals", header: "Căn chốt", render: (r) => fmtInt(r.deals) },
  { key: "grv", header: "Doanh số tiền thuê", render: (r) => fmtMoney(r.grv) },
  { key: "winRate", header: "Tỷ lệ chốt", render: (r) => fmtPct(r.winRate) },
  {
    key: "accept",
    header: "Nhận ticket (trung vị)",
    render: (r) => (
      <span>
        {fmtSec(r.acceptMedianSec)}
        <br />
        <span className="xs muted">
          {fmtInt(r.ticketsAccepted)}/{fmtInt(r.ticketsOffered)} ticket
        </span>
      </span>
    ),
  },
  {
    key: "breach",
    header: "Vi phạm SLA",
    render: (r) =>
      r.slaBreaches > 0 ? (
        <b style={{ color: "var(--danger)" }}>{fmtInt(r.slaBreaches)}</b>
      ) : (
        "0"
      ),
  },
  {
    key: "rating",
    header: "Đánh giá",
    render: (r) => (
      <span>
        {fmtRating(r.ratingAvg)}
        <br />
        <span className="xs muted">{fmtInt(r.ratingCount)} lượt</span>
      </span>
    ),
  },
];

const dlColumns: DataTableColumn<DealRow>[] = [
  {
    key: "code",
    header: "Mã cọc",
    render: (r) => (
      <span>
        <b>{r.depositCode}</b>
        <br />
        <span className="xs muted">
          {new Date(r.receivedAt).toLocaleString("vi-VN", {
            timeZone: "Asia/Ho_Chi_Minh",
          })}
        </span>
      </span>
    ),
  },
  {
    key: "status",
    header: "Trạng thái",
    render: (r) => DEAL_STATUS_LABEL[r.status] ?? r.status,
  },
  {
    key: "unit",
    header: "Căn hộ",
    render: (r) => (
      <span>
        {r.unitCode}
        <br />
        <span className="xs muted">{r.unitZone}</span>
      </span>
    ),
  },
  {
    key: "host",
    header: "Field Host",
    render: (r) => r.hostName ?? <span className="muted">—</span>,
  },
  {
    key: "tenant",
    header: "Khách (đã che)",
    render: (r) => (
      <span>
        {r.tenantName ?? "—"}
        <br />
        <span className="xs muted tnum">{r.tenantPhone ?? ""}</span>
      </span>
    ),
  },
  {
    key: "money",
    header: "Tiền vào / hoàn",
    render: (r) => (
      <span>
        {fmtMoney(r.inbound)}
        {Number(r.refund) > 0 && (
          <>
            <br />
            <span className="xs muted">hoàn {fmtMoney(r.refund)}</span>
          </>
        )}
      </span>
    ),
  },
  {
    key: "rent",
    header: "Giá thuê tháng",
    render: (r) => (
      <span>
        {fmtMoney(r.monthlyRent)}
        <br />
        <span className="xs muted">
          {r.rentSource === "contract"
            ? `HĐ ${r.contractNumber ?? ""}`
            : "giá niêm yết hiện tại"}
        </span>
      </span>
    ),
  },
  {
    key: "cycle",
    header: "Chu kỳ chốt",
    render: (r) => fmtDays(r.salesCycleDays),
  },
];

const heColumns: DataTableColumn<HostEarningsRow>[] = [
  {
    key: "name",
    header: "Field Host",
    render: (r) => (
      <span>
        <b>{r.name ?? "—"}</b>
        <br />
        <span className="xs muted">
          {r.zone} · {fmtInt(r.entries)} khoản
        </span>
      </span>
    ),
  },
  {
    key: "viewing",
    header: "Thù lao dẫn",
    render: (r) => fmtMoney(r.viewingFee),
  },
  {
    key: "deal",
    header: "Hoa hồng cọc",
    render: (r) => fmtMoney(r.dealCommission),
  },
  {
    key: "rating",
    header: "Thưởng đánh giá",
    render: (r) => fmtMoney(r.ratingBonus),
  },
  {
    key: "campaign",
    header: "Thưởng chiến dịch",
    render: (r) => fmtMoney(r.campaignBonus),
  },
  {
    key: "inspect",
    header: "Thẩm định",
    render: (r) => fmtMoney(r.inspectionFee),
  },
  { key: "total", header: "Tổng", render: (r) => <b>{fmtMoney(r.total)}</b> },
  { key: "pending", header: "Chờ trả", render: (r) => fmtMoney(r.pending) },
];

/** `/admin/reports`: 3 báo cáo thật từ `/api/v1/admin/reports/*` (tổng hợp ở Postgres). Không còn dữ liệu mock. */
export function AdminReports() {
  const { sp, set } = useUrlParams();
  const common = readCommon(sp);
  const catalog = useReportCatalog();
  const cat = catalog.state.status === "ready" ? catalog.state.data : null;
  const def = (id: ReportId) => cat?.reports.find((r) => r.id === id);

  return (
    <div className={styles.page}>
      <PageHeader
        title="Báo cáo & KPI"
        description="Hiệu suất Field Host, giao dịch cọc & hợp đồng, thu nhập Host — số liệu thật, tổng hợp từ cơ sở dữ liệu."
        actions={
          <button
            type="button"
            className="btn btn-secondary"
            onClick={() => window.print()}
            style={{ display: "inline-flex", alignItems: "center", gap: 6 }}
          >
            <Printer size={15} /> In / PDF
          </button>
        }
      />

      {catalog.state.status === "error" && (
        <ErrorBox
          title="Không tải được danh mục báo cáo"
          message={catalog.state.message}
          onRetry={catalog.reload}
        />
      )}
      {/* key: khoảng ngày đổi từ ngoài (back/forward) ⇒ dựng lại ô ngày tuỳ chọn theo URL */}
      <Filters
        key={`${common.from}_${common.to}`}
        common={common}
        set={set}
        zones={cat?.zones ?? []}
      />

      <ReportSection<HostPerformanceRow, HostPerformanceSummary>
        id="host-performance"
        title="Hiệu suất Field Host (Sale)"
        description="Lượt dẫn, căn chốt, doanh số tiền thuê, tốc độ nhận ticket, vi phạm SLA, đánh giá của khách."
        prefix="hp"
        common={common}
        sp={sp}
        set={set}
        catalog={def("host-performance")}
        sortLabels={{
          deals: "Căn chốt",
          grv: "Doanh số",
          tours: "Lượt dẫn",
          winRate: "Tỷ lệ chốt",
          acceptMedianSec: "Tốc độ nhận ticket",
          slaBreaches: "Vi phạm SLA",
          ratingAvg: "Đánh giá",
          name: "Tên Host",
        }}
        columns={hpColumns}
        emptyText="Không có Field Host nào trong bộ lọc này."
        summary={(s) => (
          <Pairs
            items={[
              ["Doanh số tiền thuê (GRV)", fmtMoney(s.grv)],
              ["Căn chốt", fmtInt(s.deals)],
              [
                "Lượt dẫn · tỷ lệ chốt",
                `${fmtInt(s.tours)} · ${fmtPct(s.winRate)}`,
              ],
              [
                "Nhận ticket (trung vị) · vi phạm SLA",
                `${fmtSec(s.acceptMedianSec)} · ${fmtInt(s.slaBreaches)}`,
              ],
            ]}
          />
        )}
      />

      <ReportSection<DealRow, DealSummary>
        id="deals"
        title="Giao dịch cọc & hợp đồng"
        description="Đối soát từng khoản cọc giữ chỗ có tiền về trong khoảng. Tên và SĐT khách đã che (cả khi xuất file)."
        prefix="dl"
        common={common}
        sp={sp}
        set={set}
        catalog={def("deals")}
        sortLabels={{
          receivedAt: "Thời điểm tiền về",
          monthlyRent: "Giá thuê",
          salesCycleDays: "Chu kỳ chốt",
          depositCode: "Mã cọc",
        }}
        columns={dlColumns}
        emptyText="Không có khoản cọc nào có tiền về trong khoảng này."
        summary={(s) => (
          <Pairs
            items={[
              ["Tiền cọc vào", fmtMoney(s.inbound)],
              [
                "Đã hoàn · đang/đã giữ",
                `${fmtMoney(s.refund)} · ${fmtMoney(s.netHeld)}`,
              ],
              [
                "Căn chốt · GRV",
                `${fmtInt(s.closedDeals)} · ${fmtMoney(s.grv)}`,
              ],
              [
                "Theo trạng thái",
                Object.entries(s.byStatus)
                  .filter(([, n]) => n > 0)
                  .map(([k, n]) => `${DEAL_STATUS_LABEL[k] ?? k} ${n}`)
                  .join(" · ") || "—",
              ],
            ]}
          />
        )}
      />

      <ReportSection<HostEarningsRow, HostEarningsSummary>
        id="host-earnings"
        title="Thu nhập Field Host"
        description="Các khoản biến phí đã ghi sổ cho Host trong khoảng (theo thời điểm ghi khoản)."
        prefix="he"
        common={common}
        sp={sp}
        set={set}
        catalog={def("host-earnings")}
        sortLabels={{
          total: "Tổng",
          dealCommission: "Hoa hồng cọc",
          viewingFee: "Thù lao dẫn",
          pending: "Chờ trả",
          name: "Tên Host",
        }}
        columns={heColumns}
        emptyText="Chưa có khoản thu nhập nào được ghi trong khoảng này."
        summary={(s) => (
          <Pairs
            items={[
              ["Tổng thu nhập Host", fmtMoney(s.total)],
              [
                "Đã trả · chờ trả",
                `${fmtMoney(s.paid)} · ${fmtMoney(s.pending)}`,
              ],
              [
                "Thù lao dẫn · hoa hồng cọc",
                `${fmtMoney(s.viewingFee)} · ${fmtMoney(s.dealCommission)}`,
              ],
              [
                "Số Host · số khoản",
                `${fmtInt(s.hosts)} · ${fmtInt(s.entries)}`,
              ],
            ]}
          />
        )}
      />
    </div>
  );
}

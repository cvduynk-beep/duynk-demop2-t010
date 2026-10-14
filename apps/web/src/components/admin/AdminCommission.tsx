"use client";

import { useState } from "react";
import Link from "next/link";
import { Download, RefreshCw, Save, SlidersHorizontal, Users } from "lucide-react";
import { DataTable, type DataTableColumn } from "@/components/ui/DataTable";
import { PageHeader } from "@/components/ui/PageHeader";
import { toast } from "@/components/ui/Toast";
import { apiErrorText } from "@/lib/apiClient";
import { useAdminCommission, useAdminCommissionAudit, type AdminFeeAudit, type AdminFeeConfig, type AdminPayoutHost } from "@/lib/admin/api";
import {
  FEE_FIELDS,
  FEE_LABEL,
  feeValues,
  fmtFee,
  invalidateCommission,
  payoutCsvHref,
  recentPeriods,
  sampleDeal,
  saveFee,
  sweepPayouts,
  usePayoutStatement,
  validateFee,
  type FeeKey,
  type FeeValues,
} from "@/lib/admin/commission";
import { useHostList } from "@/lib/admin/hosts";
import { fmtDateTime, vnd } from "@/lib/format";
import { useNow } from "@/lib/useNow";
import { AdminQuery } from "./AdminQuery";
import styles from "./Admin.module.css";

/** Biến phí Field Host: tham số đọc/ghi `fee_configs` (có Audit Log), bảng kê `host_payouts` theo tuần ISO. */
export function AdminCommission() {
  const config = useAdminCommission();
  const hosts = useHostList({});
  const hostCount = hosts.state.status === "ready" ? hosts.state.data.length : null;

  return (
    <div className={styles.page}>
      <PageHeader
        title="Biến phí Field Host"
        description="Điều chỉnh thù lao theo mùa vụ, không cần sửa mã nguồn. Thay đổi áp dụng cho khoản ghi nhận mới và được lưu vết."
      />

      <div className={styles.adminSubNavStrip}>
        <Link href="/admin/hosts" className={styles.adminSubNavLink}>
          <Users size={15} />
          <span>Danh sách Field Host</span>
          {hostCount !== null && <span className={styles.subCountBadge}>{hostCount}</span>}
        </Link>
        <Link href="/admin/commission" className={`${styles.adminSubNavLink} ${styles.adminSubNavLinkActive}`}>
          <SlidersHorizontal size={15} />
          <span>Chính sách Biến phí & Thù lao</span>
        </Link>
      </div>

      <AdminQuery query={config} title="Không tải được tham số biến phí">
        {(d) => <FeeEditor configs={d.configs} />}
      </AdminQuery>

      <PayoutSection />
      <AuditSection />
    </div>
  );
}

// ─── Tham số ────────────────────────────────────────────────────────────────────────────────────────────────

function FeeEditor({ configs }: { configs: AdminFeeConfig[] }) {
  const saved = feeValues(configs);
  const [draft, setDraft] = useState<Partial<Record<FeeKey, string>>>({});
  const [reason, setReason] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  const changed = FEE_FIELDS.filter((f) => draft[f.key] !== undefined && Number(draft[f.key]) !== saved[f.key]);
  const preview: FeeValues = { ...saved, ...Object.fromEntries(changed.map((f) => [f.key, Number(draft[f.key])])) };
  const deal = sampleDeal(preview);
  const missing = FEE_FIELDS.filter((f) => f.required && saved[f.key] === undefined);

  const feeRow = (f: (typeof FEE_FIELDS)[number]) => (
    <div key={f.key} className={styles.fee}>
      <div>
        <h4>{f.title}</h4>
        <p className="muted small">{f.help}</p>
      </div>
      <label className={styles.suffix} title={`Khoảng cho phép: ${fmtFee(f.key, f.min)} – ${fmtFee(f.key, f.max)}`}>
        <span className="sr-only">{f.title}</span>
        <input
          className="input"
          type="number"
          inputMode="decimal"
          min={f.min}
          max={f.max}
          step={f.step}
          placeholder={saved[f.key] === undefined ? "Chưa cấu hình" : undefined}
          value={draft[f.key] ?? (saved[f.key] !== undefined ? String(saved[f.key]) : "")}
          onChange={(e) => {
            setDraft({ ...draft, [f.key]: e.target.value });
            setError("");
          }}
        />
        <span>{f.unit}</span>
      </label>
    </div>
  );

  const save = async () => {
    for (const f of changed) {
      const invalid = validateFee(f, draft[f.key]!);
      if (invalid) return setError(`${f.title}: ${invalid}`);
    }
    if (!reason.trim()) return setError("Bắt buộc nhập lý do thay đổi (lưu nhật ký kiểm toán).");

    setBusy(true);
    const failed: string[] = [];
    for (const f of changed) {
      const res = await saveFee(f.key, Number(draft[f.key]), reason.trim());
      if (!res.ok) failed.push(`${f.title}: ${apiErrorText(res, "không lưu được")}`);
    }
    setBusy(false);
    invalidateCommission();
    if (failed.length) return setError(failed.join(" · "));
    toast(`Đã lưu ${changed.length} tham số. Áp dụng cho các khoản thù lao ghi nhận từ bây giờ.`, "success");
    setDraft({});
    setReason("");
    setError("");
  };

  return (
    <>
      {missing.length > 0 && (
        <div className={`card ${styles.widgetError}`} role="alert">
          <b>Chưa cấu hình: {missing.map((f) => f.title).join(", ")}</b>
          <p className="small">Backend không ghi được khoản thù lao tương ứng cho đến khi có giá trị.</p>
        </div>
      )}

      <div className={styles.split}>
        <section className={`card ${styles.padCard}`} aria-label="Tham số biến phí">
          {FEE_FIELDS.map((f) => feeRow(f))}

          {changed.length > 0 && (
            <label className="field" style={{ marginTop: 12 }}>
              <span className="label">Lý do thay đổi (bắt buộc, lưu nhật ký)</span>
              <input className="input" value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Ví dụ: Kích cầu mùa thấp điểm tháng 11" />
            </label>
          )}
          {error && <p className="field-error">{error}</p>}
          <div style={{ display: "flex", gap: 8, marginTop: 12 }}>
            <button
              type="button"
              className="btn btn-quiet"
              disabled={changed.length === 0 || busy}
              onClick={() => {
                setDraft({});
                setError("");
              }}
            >
              Hoàn tác
            </button>
            <button type="button" className="btn btn-primary" disabled={changed.length === 0 || busy} onClick={save}>
              <Save size={16} /> {busy ? "Đang lưu…" : `Lưu thay đổi${changed.length > 0 ? ` (${changed.length})` : ""}`}
            </button>
          </div>
        </section>

        <section className={`card ${styles.padCard}`} aria-label="Xem trước">
          <h3 style={{ fontSize: 18, marginBottom: 6 }}>Một deal thành công, Host từ 4,8 sao nhận</h3>
          <p className="num" style={{ fontSize: 40, fontWeight: 700, lineHeight: 1.1 }}>
            {vnd(deal.total)}đ
          </p>
          <dl className={styles.reqMeta} style={{ marginTop: 14 }}>
            <div>
              <dt>Thù lao lượt dẫn</dt>
              <dd>{vnd(deal.viewing)}đ</dd>
            </div>
            <div>
              <dt>Hoa hồng chốt cọc</dt>
              <dd>{vnd(deal.commission)}đ</dd>
            </div>
            <div>
              <dt>Thưởng đánh giá sao</dt>
              <dd>{vnd(deal.ratingBonus)}đ</dd>
            </div>
            <div>
              <dt>Thưởng nóng</dt>
              <dd>{vnd(deal.campaign)}đ</dd>
            </div>
          </dl>
          {changed.length > 0 && <p className="small" style={{ marginTop: 12, color: "var(--amber-600)" }}>Đang xem trước, chưa lưu.</p>}
        </section>
      </div>
    </>
  );
}

// ─── Bảng kê thù lao theo tuần ──────────────────────────────────────────────────────────────────────────────

function PayoutSection() {
  const now = useNow(60_000);
  const periods = now ? recentPeriods(now) : [];
  const [picked, setPicked] = useState<string | null>(null);
  const period = picked ?? periods[0] ?? "";
  return (
    <section className={`card ${styles.tableCard}`} aria-label="Bảng kê thanh toán tuần">
      {period ? <PayoutTable period={period} periods={periods} onPick={setPicked} /> : <div className="skeleton" style={{ height: 200 }} />}
    </section>
  );
}

function PayoutTable({ period, periods, onPick }: { period: string; periods: string[]; onPick: (p: string) => void }) {
  const query = usePayoutStatement(period);
  const [sweeping, setSweeping] = useState(false);

  const sweep = async () => {
    setSweeping(true);
    const res = await sweepPayouts();
    setSweeping(false);
    if (!res.ok) return toast(apiErrorText(res, "Chưa quét được."));
    toast(`Đã quét: ghi thêm ${res.data.created} khoản, bỏ qua ${res.data.skipped} khoản đã có.`, "success");
    invalidateCommission();
  };

  return (
    <>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12, padding: "18px 20px 6px", flexWrap: "wrap" }}>
        <div>
          <h3 style={{ fontSize: 18 }}>Bảng kê thanh toán tuần {period}</h3>
          <p className="muted small">
            {query.state.status === "ready" ? `Tổng chi trả ${vnd(query.state.data.grandTotal)}đ · ` : ""}đối soát và chuyển khoản vào Chủ nhật
          </p>
        </div>
        <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
          <select className="select" value={period} onChange={(e) => onPick(e.target.value)} aria-label="Chọn tuần">
            {periods.map((p, i) => (
              <option key={p} value={p}>
                {p}
                {i === 0 ? " (tuần này)" : ""}
              </option>
            ))}
          </select>
          <button type="button" className="btn btn-quiet" onClick={sweep} disabled={sweeping} title="Ghi nhận thù lao cho ca xem / cọc / phiếu thẩm định chưa được ghi">
            <RefreshCw size={16} /> {sweeping ? "Đang quét…" : "Quét ghi nhận"}
          </button>
          <a className="btn btn-quiet" href={payoutCsvHref(period)} download>
            <Download size={16} /> Xuất CSV
          </a>
        </div>
      </div>
      <AdminQuery query={query} title="Không tải được bảng kê" height={200}>
        {(st) => (
          <DataTable<AdminPayoutHost>
            columns={
              [
                {
                  key: "host",
                  header: "Field Host",
                  render: (h) => (
                    <>
                      <Link href={`/admin/hosts/${h.hostId}`} className="link">
                        <b>{h.fullName ?? "—"}</b>
                      </Link>
                      <span className="muted xs" style={{ display: "block" }}>
                        {h.rating !== null ? `${String(h.rating).replace(".", ",")}★` : "Chưa có đánh giá"}
                      </span>
                    </>
                  ),
                },
                { key: "viewings", header: "Lượt dẫn", align: "right", render: (h) => h.viewings },
                { key: "viewingFee", header: "Thù lao lượt", align: "right", render: (h) => vnd(h.viewingFee) },
                { key: "deals", header: "Deal", align: "right", render: (h) => h.deals },
                { key: "commission", header: "Hoa hồng", align: "right", render: (h) => vnd(h.commission) },
                { key: "rating", header: "Thưởng sao", align: "right", render: (h) => vnd(h.ratingBonus) },
                { key: "campaign", header: "Thưởng nóng", align: "right", render: (h) => vnd(h.campaignBonus) },
                { key: "inspection", header: "Thẩm định", align: "right", render: (h) => (h.inspections ? `${h.inspections} · ${vnd(h.inspectionFee)}` : "—") },
                { key: "total", header: "Thực nhận", align: "right", render: (h) => <b>{vnd(h.total)}đ</b> },
              ] satisfies DataTableColumn<AdminPayoutHost>[]
            }
            rows={st.hosts}
            empty={<span className="muted">Tuần {st.period} chưa có khoản thù lao nào.</span>}
          />
        )}
      </AdminQuery>
    </>
  );
}

// ─── Nhật ký thay đổi ───────────────────────────────────────────────────────────────────────────────────────

function AuditSection() {
  const query = useAdminCommissionAudit();
  return (
    <section className={`card ${styles.tableCard}`} aria-label="Nhật ký thay đổi">
      <h3 style={{ fontSize: 18, padding: "18px 20px 6px" }}>Nhật ký thay đổi cấu hình</h3>
      <AdminQuery query={query} title="Không tải được nhật ký" height={160}>
        {(rows) => (
          <DataTable<AdminFeeAudit>
            columns={
              [
                { key: "at", header: "Thời điểm", render: (a) => <span className="tnum">{fmtDateTime(a.at)}</span> },
                { key: "by", header: "Người sửa", render: (a) => a.by },
                { key: "field", header: "Tham số", render: (a) => FEE_LABEL[a.configKey] ?? a.configKey },
                { key: "from", header: "Giá trị cũ", align: "right", render: (a) => fmtFee(a.configKey, a.from) },
                { key: "to", header: "Giá trị mới", align: "right", render: (a) => <b>{fmtFee(a.configKey, a.to)}</b> },
                { key: "reason", header: "Lý do", render: (a) => <span className="small muted">{a.reason ?? "—"}</span> },
              ] satisfies DataTableColumn<AdminFeeAudit>[]
            }
            rows={rows}
            empty={<span className="muted">Chưa có thay đổi nào.</span>}
          />
        )}
      </AdminQuery>
    </section>
  );
}

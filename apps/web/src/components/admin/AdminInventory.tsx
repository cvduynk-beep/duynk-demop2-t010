"use client";

import Link from "next/link";
import { useState } from "react";
import { AlertTriangle, BadgeCheck, Check, KeyRound, Smartphone, Timer, X } from "lucide-react";
import { DataTable, type DataTableColumn } from "@/components/ui/DataTable";
import { Modal } from "@/components/ui/Modal";
import { PageHeader } from "@/components/ui/PageHeader";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { toast } from "@/components/ui/Toast";
import { CONSIGN_STATUS_META } from "@/components/consign/status";
import { apiErrorText } from "@/lib/apiClient";
import { fmtDate, vnd } from "@/lib/format";
import { LAYOUT_LABEL } from "@/lib/landlord/labels";
import {
  consignmentHref,
  invalidateInventory,
  inventoryApi,
  isInspectOverdue,
  layoutKindOf,
  lockLabel,
  REJECT_NOTE_MIN,
  TERMINATE_BLOCKED_LABEL,
  UNIT_STATUS_LABEL,
  unitStatusMeta,
  unitTitle,
  useConsignments,
  useInventory,
  type AdminConsignment,
  type DoorLockApi,
  type InventoryRow,
  type UnitStatusApi,
} from "@/lib/admin/inventory";
import { useNow } from "@/lib/useNow";
import { AdminQuery } from "./AdminQuery";
import styles from "./Admin.module.css";

type Tab = "units" | "requests" | "exit";

/** Hồ sơ còn cần Admin để mắt (chưa chốt). Hồ sơ đã chốt vẫn hiện ở cuối danh sách để tra cứu. */
const OPEN_STAGES = new Set(["awaiting_host", "inspecting", "reviewing", "awaiting_landlord"]);

export function AdminInventory({ initialTab }: { initialTab: Tab }) {
  const [tab, setTab] = useState<Tab>(initialTab);
  const inventory = useInventory();
  const consignments = useConsignments();

  const units = inventory.state.status === "ready" ? inventory.state.data : null;
  const reqs = consignments.state.status === "ready" ? consignments.state.data : null;
  const openReqs = reqs?.filter((c) => OPEN_STAGES.has(c.status)).length ?? 0;
  const exiting = units?.filter((u) => u.mandateStatus === "EXIT_REQUESTED").length ?? 0;

  return (
    <div className={styles.page}>
      <PageHeader title="Căn hộ và ký gửi" description="Rổ hàng ký gửi độc quyền: chi phí kiểm định một lần khi tiếp nhận, không môi giới ngoài." />

      <div className={styles.tabs} role="tablist">
        <button type="button" role="tab" aria-selected={tab === "units"} onClick={() => setTab("units")}>
          Rổ hàng{units ? ` (${units.length})` : ""}
        </button>
        <button type="button" role="tab" aria-selected={tab === "requests"} onClick={() => setTab("requests")}>
          Yêu cầu ký gửi {openReqs > 0 && <i>{openReqs}</i>}
        </button>
        <button type="button" role="tab" aria-selected={tab === "exit"} onClick={() => setTab("exit")}>
          Thoát uỷ quyền 15 ngày {exiting > 0 && <i>{exiting}</i>}
        </button>
      </div>

      {tab === "units" && (
        <AdminQuery query={inventory} title="Không tải được rổ hàng">
          {(rows) => <UnitsTab rows={rows} />}
        </AdminQuery>
      )}
      {tab === "requests" && (
        <AdminQuery query={consignments} title="Không tải được hồ sơ ký gửi">
          {(rows) => <RequestsTab rows={rows} />}
        </AdminQuery>
      )}
      {tab === "exit" && (
        <AdminQuery query={inventory} title="Không tải được rổ hàng">
          {(rows) => <ExitTab rows={rows.filter((u) => u.mandateStatus === "EXIT_REQUESTED")} />}
        </AdminQuery>
      )}
    </div>
  );
}

// ─── Rổ hàng ────────────────────────────────────────────────────────────────────────────────────────────────

function UnitsTab({ rows }: { rows: InventoryRow[] }) {
  const [zone, setZone] = useState("all");
  const [status, setStatus] = useState<UnitStatusApi | "all">("all");
  const [lock, setLock] = useState<DoorLockApi | "all">("all");
  const zones = Array.from(new Set(rows.map((u) => u.zone))).sort();
  const list = rows.filter((u) => (zone === "all" || u.zone === zone) && (status === "all" || u.status === status) && (lock === "all" || u.doorLockType === lock));

  return (
    <>
      <div className={styles.tools}>
        <select className="select" value={zone} onChange={(e) => setZone(e.target.value)} aria-label="Lọc theo phân khu">
          <option value="all">Mọi phân khu</option>
          {zones.map((z) => (
            <option key={z} value={z}>
              {z}
            </option>
          ))}
        </select>
        <select className="select" value={status} onChange={(e) => setStatus(e.target.value as UnitStatusApi | "all")} aria-label="Lọc theo trạng thái">
          <option value="all">Mọi trạng thái</option>
          {(Object.keys(UNIT_STATUS_LABEL) as UnitStatusApi[]).map((s) => (
            <option key={s} value={s}>
              {UNIT_STATUS_LABEL[s].label}
            </option>
          ))}
        </select>
        <select className="select" value={lock} onChange={(e) => setLock(e.target.value as DoorLockApi | "all")} aria-label="Lọc theo loại khoá">
          <option value="all">Mọi loại khoá</option>
          <option value="ELECTRONIC_PIN">Khoá điện tử</option>
          <option value="PHYSICAL_KEY">Chìa cơ</option>
        </select>
        <span className="muted small">{list.length} căn</span>
      </div>
      <DataTable<InventoryRow>
        columns={
          [
            {
              key: "unit",
              header: "Căn hộ",
              render: (u) => (
                <>
                  <b>{unitTitle(u)}</b>
                  <span className="muted xs" style={{ display: "block" }}>
                    {u.unitCode}
                    {u.isVerified && <BadgeCheck size={12} aria-label="Đã xác minh" style={{ marginLeft: 4, color: "var(--ok)" }} />}
                  </span>
                </>
              ),
            },
            { key: "zone", header: "Phân khu", render: (u) => u.zone },
            { key: "layout", header: "Loại", render: (u) => `${LAYOUT_LABEL[layoutKindOf(u.layout)]} · ${u.carpetAreaM2}m²` },
            { key: "rent", header: "Giá thuê", align: "right", render: (u) => vnd(u.baseRentPrice) },
            {
              key: "status",
              header: "Trạng thái",
              render: (u) => (
                <>
                  <span className={`badge ${unitStatusMeta(u.status, u.mandateStatus).badge}`}>{unitStatusMeta(u.status, u.mandateStatus).label}</span>
                  {u.mandateStatus === "EXIT_REQUESTED" && (
                    <span className="badge badge-coral-soft" style={{ marginLeft: 6 }}>
                      <Timer size={12} /> Đang thoát
                    </span>
                  )}
                </>
              ),
            },
            {
              key: "lock",
              header: "Khoá",
              render: (u) => (
                <span className="badge badge-plain">
                  {u.doorLockType === "PHYSICAL_KEY" ? <KeyRound size={12} /> : <Smartphone size={12} />} {lockLabel(u.doorLockType)}
                </span>
              ),
            },
            { key: "landlord", header: "Chủ nhà", render: (u) => u.landlordName ?? "—" },
          ] satisfies DataTableColumn<InventoryRow>[]
        }
        rows={list}
        rowHref={(u) => `/admin/inventory/${u.id}`}
        empty={<span className="muted">Không có căn nào khớp bộ lọc.</span>}
      />
    </>
  );
}

// ─── Hồ sơ ký gửi ───────────────────────────────────────────────────────────────────────────────────────────

function RequestsTab({ rows }: { rows: AdminConsignment[] }) {
  const now = useNow(60_000);
  const [rejecting, setRejecting] = useState<AdminConsignment | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  if (!now) return <div className="skeleton" style={{ height: 360 }} />;

  const sorted = [...rows].sort((a, b) => Number(OPEN_STAGES.has(b.status)) - Number(OPEN_STAGES.has(a.status)));
  const reviewing = rows.filter((c) => c.status === "reviewing").length;
  const inspecting = rows.filter((c) => c.status === "awaiting_host" || c.status === "inspecting");
  const overdue = inspecting.filter((c) => isInspectOverdue(c, now)).length;

  const approve = async (c: AdminConsignment) => {
    setBusy(c.id);
    const res = await inventoryApi.approve(c.id);
    setBusy(null);
    if (!res.ok) return toast(apiErrorText(res, "Chưa duyệt được hồ sơ."));
    toast("Đã duyệt ký gửi theo phiếu thẩm định.", "success");
    invalidateInventory();
  };

  return (
    <>
      <div className="card" style={{ marginBottom: "var(--space-3)", display: "flex", gap: "var(--space-3)", flexWrap: "wrap", alignItems: "center", justifyContent: "space-between" }}>
        <div>
          <b>Chờ duyệt:</b> {reviewing} căn · <b>Đang thẩm định:</b> {inspecting.length} căn
          {overdue > 0 && (
            <span className="badge badge-coral-soft" style={{ marginLeft: 8 }}>
              <Timer size={12} /> {overdue} quá hạn
            </span>
          )}
        </div>
        <span className="muted small">Host kiểm tra thực tế trong 48h. Admin chỉ duyệt hồ sơ Inspector đề xuất không nhận.</span>
      </div>

      {sorted.length === 0 && <div className={styles.empty}>Chưa có yêu cầu ký gửi.</div>}
      <div className={styles.reqs}>
        {sorted.map((c) => {
          const meta = CONSIGN_STATUS_META[c.status];
          const late = isInspectOverdue(c, now);
          const report = c.report as { recommendation?: string; note?: string } | null;
          return (
            <article key={c.id} className={`card ${styles.req}`}>
              <div style={{ display: "flex", justifyContent: "space-between", gap: 10, alignItems: "flex-start", flexWrap: "wrap" }}>
                <div>
                  <h3>
                    <Link href={consignmentHref(c.id)} className="link" style={{ textDecoration: "none" }}>
                      {c.building} · Tầng {c.floor} · Căn {c.door}
                    </Link>
                  </h3>
                  <p className="muted small">
                    {c.landlord?.fullName ?? "—"} · #{c.contractNumber}
                  </p>
                </div>
                <div style={{ display: "flex", gap: 6, alignItems: "center", flexWrap: "wrap" }}>
                  {late && (
                    <span className="badge badge-coral-soft" style={{ display: "inline-flex", alignItems: "center", gap: 4, fontWeight: 700 }}>
                      <AlertTriangle size={12} /> Quá hạn thẩm định
                    </span>
                  )}
                  <StatusBadge tone={meta.tone}>{meta.label}</StatusBadge>
                </div>
              </div>
              <dl className={styles.reqMeta}>
                <div>
                  <dt>Loại căn</dt>
                  <dd>
                    {LAYOUT_LABEL[c.layoutKind]} · {c.areaM2} m²
                  </dd>
                </div>
                <div>
                  <dt>Giá chào thuê</dt>
                  <dd>{vnd(c.askRent)}đ/tháng</dd>
                </div>
                <div>
                  <dt>Nội thất</dt>
                  <dd>{c.furnished ? "Có nội thất" : "Không nội thất"}</dd>
                </div>
                <div>
                  <dt>Khoá cửa</dt>
                  <dd>{c.locks.includes("physical") ? (c.locks.includes("smart") ? "Điện tử + chìa cơ" : "Chìa cơ") : "Khoá điện tử"}</dd>
                </div>
                <div>
                  <dt>Host phụ trách</dt>
                  <dd>{c.hostName ?? "Chưa gán"}</dd>
                </div>
                <div>
                  <dt>Gửi lúc</dt>
                  <dd>{fmtDate(c.createdAt)}</dd>
                </div>
              </dl>
              {c.note && <p className="small muted">Ghi chú: {c.note}</p>}
              {report?.recommendation && (
                <p className="small" style={{ marginTop: "var(--space-2)" }}>
                  <b>Đề xuất từ Host:</b>{" "}
                  <span className={report.recommendation === "approve" ? "text-ok" : "text-danger"}>
                    {report.recommendation === "approve" ? "Đủ điều kiện nhận ký gửi" : "Không khuyến nghị nhận"}
                  </span>
                  {report.note ? ` — ${report.note}` : ""}
                </p>
              )}
              {c.status === "reviewing" && (
                <div className={styles.reqActions}>
                  <button type="button" className="btn btn-quiet" onClick={() => setRejecting(c)} disabled={busy === c.id}>
                    <X size={16} /> Từ chối
                  </button>
                  <button type="button" className="btn btn-success" style={{ flex: 1 }} onClick={() => approve(c)} disabled={busy === c.id}>
                    <Check size={16} /> {busy === c.id ? "Đang duyệt…" : "Duyệt ký gửi"}
                  </button>
                </div>
              )}
            </article>
          );
        })}
      </div>

      <RejectModal target={rejecting} onClose={() => setRejecting(null)} />
    </>
  );
}

/** Từ chối hồ sơ ở stage `reviewing` — backend yêu cầu lý do ≥ 5 ký tự và chấm dứt ủy quyền. */
export function RejectModal({ target, onClose }: { target: Pick<AdminConsignment, "id"> | null; onClose: () => void }) {
  const [note, setNote] = useState("Ảnh hiện trạng hoặc chất lượng chưa đạt yêu cầu");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  const submit = async () => {
    if (!target) return;
    if (note.trim().length < REJECT_NOTE_MIN) return setError(`Lý do từ chối phải có ít nhất ${REJECT_NOTE_MIN} ký tự.`);
    setBusy(true);
    const res = await inventoryApi.reject(target.id, note.trim());
    setBusy(false);
    if (!res.ok) return setError(apiErrorText(res, "Chưa từ chối được hồ sơ."));
    toast("Đã từ chối hồ sơ ký gửi và báo chủ nhà.", "success");
    invalidateInventory();
    setError("");
    onClose();
  };

  return (
    <Modal
      open={!!target}
      onClose={() => {
        setError("");
        onClose();
      }}
      variant="sheet"
      title="Từ chối yêu cầu ký gửi"
      footer={
        <button type="button" className="btn btn-danger btn-block" onClick={submit} disabled={busy}>
          {busy ? "Đang gửi…" : "Xác nhận không duyệt"}
        </button>
      }
    >
      <label className="field">
        <span className="label">Lý do (gửi cho chủ nhà)</span>
        <textarea
          className="textarea"
          value={note}
          onChange={(e) => {
            setNote(e.target.value);
            if (error) setError("");
          }}
          placeholder={`Nêu rõ lý do từ chối (tối thiểu ${REJECT_NOTE_MIN} ký tự)...`}
        />
        {error && <span className="field-error">{error}</span>}
      </label>
    </Modal>
  );
}

// ─── Thoát ủy quyền ─────────────────────────────────────────────────────────────────────────────────────────

function ExitTab({ rows }: { rows: InventoryRow[] }) {
  const [terminating, setTerminating] = useState<InventoryRow | null>(null);
  return (
    <>
      {rows.length === 0 && <div className={styles.empty}>Không có căn nào đang đếm ngược thoát uỷ quyền.</div>}
      <div className={styles.reqs}>
        {rows.map((u) => (
          <article key={u.id} className={`card ${styles.req}`}>
            <div style={{ display: "flex", justifyContent: "space-between", gap: 10 }}>
              <div>
                <h3>
                  <Link href={`/admin/inventory/${u.id}`} className="link" style={{ textDecoration: "none" }}>
                    {unitTitle(u)}
                  </Link>
                </h3>
                <p className="muted small">{u.landlordName ?? "—"}</p>
              </div>
              <span className="badge badge-coral-soft">
                <Timer size={12} /> {u.exitCountdownDays ? `Còn ${u.exitCountdownDays} ngày` : "Đã đủ 15 ngày"}
              </span>
            </div>
            <dl className={styles.reqMeta}>
              <div>
                <dt>Yêu cầu lúc</dt>
                <dd>{u.exitRequestedAt ? fmtDate(u.exitRequestedAt) : "—"}</dd>
              </div>
              <div>
                <dt>Hiệu lực</dt>
                <dd>{u.exitEffectiveAt ? fmtDate(u.exitEffectiveAt) : "—"}</dd>
              </div>
              <div>
                <dt>Trạng thái căn</dt>
                <dd>{unitStatusMeta(u.status, u.mandateStatus).label}</dd>
              </div>
            </dl>
            <p className="small muted">Khi chấm dứt, căn chuyển “Ngừng niêm yết”. Trong thời gian báo trước căn vẫn hiển thị để đón nốt khách.</p>
            <div style={{ marginTop: 10, display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
              {u.canTerminate ? (
                <button type="button" className="btn btn-danger btn-sm" onClick={() => setTerminating(u)}>
                  Chấm dứt ủy quyền
                </button>
              ) : (
                <span className="small muted">{u.terminateBlockedReason ? TERMINATE_BLOCKED_LABEL[u.terminateBlockedReason] : ""}</span>
              )}
              {u.mandateId && (
                <Link href={`/admin/contracts/mandate-${u.mandateId}`} className="link small">
                  Xem hợp đồng →
                </Link>
              )}
            </div>
          </article>
        ))}
      </div>
      <TerminateModal target={terminating ? { mandateId: terminating.mandateId!, title: unitTitle(terminating) } : null} onClose={() => setTerminating(null)} />
    </>
  );
}

/** Chấm dứt ủy quyền sau 15 ngày báo trước; backend chặn 409 khi căn HOLDING hoặc có hợp đồng hiệu lực. */
export function TerminateModal({ target, onClose }: { target: { mandateId: string; title: string } | null; onClose: () => void }) {
  const [reason, setReason] = useState("Chủ nhà đã báo trước đủ 15 ngày");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  const submit = async () => {
    if (!target) return;
    if (!reason.trim()) return setError("Bắt buộc nhập lý do chấm dứt ủy quyền.");
    setBusy(true);
    const res = await inventoryApi.terminateMandate(target.mandateId, reason.trim());
    setBusy(false);
    if (!res.ok) return setError(apiErrorText(res, "Chưa chấm dứt được ủy quyền."));
    toast("Đã chấm dứt ủy quyền, căn chuyển Ngừng niêm yết.", "success");
    invalidateInventory();
    setError("");
    onClose();
  };

  return (
    <Modal
      open={!!target}
      onClose={() => {
        setError("");
        onClose();
      }}
      variant="sheet"
      title="Chấm dứt ủy quyền độc quyền"
      description={target?.title}
      footer={
        <button type="button" className="btn btn-danger btn-block" onClick={submit} disabled={busy}>
          {busy ? "Đang xử lý…" : "Xác nhận chấm dứt"}
        </button>
      }
    >
      <label className="field">
        <span className="label">Lý do (lưu Audit)</span>
        <textarea
          className="textarea"
          value={reason}
          onChange={(e) => {
            setReason(e.target.value);
            if (error) setError("");
          }}
        />
        {error && <span className="field-error">{error}</span>}
      </label>
    </Modal>
  );
}

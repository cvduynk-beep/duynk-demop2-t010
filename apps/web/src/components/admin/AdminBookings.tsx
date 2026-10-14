"use client";

import { useRef, useState, type FormEvent } from "react";
import { AlertTriangle, CheckCircle2, Search, UserCog } from "lucide-react";
import { STATUS_META } from "@/components/booking/status";
import { DataTable, type DataTableColumn } from "@/components/ui/DataTable";
import { Field } from "@/components/ui/Field";
import { Modal } from "@/components/ui/Modal";
import { PageHeader } from "@/components/ui/PageHeader";
import { toast } from "@/components/ui/Toast";
import {
  PAGE_SIZE,
  REASON_MAX,
  TIER_LABEL,
  invalidateAfterReassign,
  pageCount,
  reassignBooking,
  reassignOutcome,
  ticketLabel,
  useAdminBookings,
  useReassignCandidates,
  validateReassign,
  webStatus,
  type AdminBookingRow,
  type BookingTab,
} from "@/lib/admin/bookings";
import { dayLabel, fmtTime } from "@/lib/format";
import { useNow } from "@/lib/useNow";
import styles from "./Admin.module.css";

const TABS: [BookingTab, string][] = [
  ["open", "Đang xử lý"],
  ["today", "Hôm nay"],
  ["all", "Tất cả"],
];

/** SLA nhận ca theo ticket hiện tại (đếm theo đồng hồ, mốc hạn do server tính). */
function SlaCell({ row, now }: { row: AdminBookingRow; now: number }) {
  const t = row.ticket;
  if (!t) return <span className="muted">—</span>;
  if (t.status === "OFFERED") {
    const left = Math.ceil((Date.parse(t.deadlineAt) - now) / 1000);
    return left < 0 ? (
      <span className={styles.warnText}>
        <AlertTriangle size={14} aria-label="Quá SLA" /> Quá {Math.max(1, Math.floor(-left / 60))} phút
      </span>
    ) : (
      <span className="muted tnum">Còn {left} giây</span>
    );
  }
  if (t.acceptedAt) {
    const took = Math.round((Date.parse(t.acceptedAt) - Date.parse(t.offeredAt)) / 1000);
    const ok = took <= t.slaSeconds;
    return (
      <span className={ok ? styles.okText : styles.warnText}>
        {ok ? <CheckCircle2 size={14} aria-label="Đạt" /> : <AlertTriangle size={14} aria-label="Vượt" />} Nhận sau {took} giây
      </span>
    );
  }
  return <span className="muted">{ticketLabel(t.status)}</span>;
}

export function AdminBookings() {
  const now = useNow(1000);
  const [tab, setTab] = useState<BookingTab>("open");
  const [search, setSearch] = useState("");
  const [q, setQ] = useState("");
  const [page, setPage] = useState(1);
  const [editing, setEditing] = useState<AdminBookingRow | null>(null);
  const list = useAdminBookings({ tab, q, page });

  const go = (next: Partial<{ tab: BookingTab; q: string; page: number }>) => {
    if (next.tab !== undefined) setTab(next.tab);
    if (next.q !== undefined) setQ(next.q);
    setPage(next.page ?? 1);
  };

  return (
    <div className={styles.page}>
      <PageHeader
        title="Điều phối lịch xem"
        description="Auto-Dispatch 3 tầng: Host gần nhất → Open Pool 500m → Area Lead. Ticket quá hạn hiện màu đỏ để Admin giao lại tay."
      />

      <div className={styles.tools}>
        <div className={styles.tabs} role="tablist">
          {TABS.map(([k, l]) => (
            <button key={k} type="button" role="tab" aria-selected={tab === k} onClick={() => go({ tab: k })}>
              {l}
            </button>
          ))}
        </div>
        <form
          className={styles.search}
          role="search"
          onSubmit={(e) => {
            e.preventDefault();
            go({ q: search.trim() });
          }}
        >
          <Search size={16} />
          <input className="input" type="search" placeholder="Mã booking hoặc mã căn" value={search} maxLength={50} onChange={(e) => setSearch(e.target.value)} aria-label="Tìm lịch xem" />
        </form>
      </div>

      {list.state.status === "loading" && <div className="skeleton" style={{ height: 360, borderRadius: 16 }} aria-busy="true" aria-label="Đang tải danh sách" />}
      {list.state.status === "error" && (
        <div className={`card ${styles.widgetError}`} role="alert">
          <b>Không tải được danh sách lịch xem</b>
          <p className="small">{list.state.message}</p>
          <button type="button" className="btn btn-quiet btn-sm" onClick={list.reload}>
            Thử lại
          </button>
        </div>
      )}
      {list.state.status === "ready" && (
        <>
          <DataTable<AdminBookingRow>
            columns={
              [
                {
                  key: "slot",
                  header: "Giờ hẹn",
                  render: (b) => (
                    <>
                      <b className="tnum">{fmtTime(b.slot)}</b>
                      <span className="muted xs" style={{ display: "block" }}>
                        {now ? dayLabel(b.slot, now) : ""}
                      </span>
                    </>
                  ),
                },
                {
                  key: "unit",
                  header: "Căn hộ",
                  render: (b) => (
                    <>
                      {b.unit.code}
                      <span className="muted xs" style={{ display: "block" }}>
                        {b.bookingRef} · {b.unit.zone}
                      </span>
                    </>
                  ),
                },
                {
                  key: "tenant",
                  header: "Khách",
                  render: (b) => (
                    <>
                      {b.tenant.name ?? <span className="muted">Chưa có tên</span>}
                      {b.tenant.phoneMasked && (
                        <span className="muted xs tnum" style={{ display: "block" }}>
                          {b.tenant.phoneMasked}
                        </span>
                      )}
                    </>
                  ),
                },
                {
                  key: "host",
                  header: "Field Host",
                  render: (b) =>
                    b.ticket ? (
                      <>
                        {b.ticket.hostName ?? <span className="badge badge-coral">Chưa có Host</span>}
                        <span className="muted xs" style={{ display: "block" }}>
                          {TIER_LABEL[b.ticket.tier] ?? `Tầng ${b.ticket.tier}`} · {ticketLabel(b.ticket.status)}
                        </span>
                      </>
                    ) : (
                      <span className="muted">Chưa có ticket</span>
                    ),
                },
                {
                  key: "status",
                  header: "Trạng thái",
                  render: (b) => {
                    const m = STATUS_META[webStatus(b.viewingStatus)];
                    return <span className={`badge ${m?.badge ?? "badge-plain"}`}>{m?.label ?? b.viewingStatus}</span>;
                  },
                },
                { key: "sla", header: "SLA nhận ca", render: (b) => (now ? <SlaCell row={b} now={now} /> : null) },
                {
                  key: "dispatch",
                  header: "Điều phối",
                  render: (b) => (
                    <div style={{ display: "flex", flexDirection: "column", gap: 4, alignItems: "flex-start" }}>
                      {b.canReassign ? (
                        <button type="button" className="btn btn-quiet btn-sm" onClick={() => setEditing(b)} aria-label={`Giao lại ${b.bookingRef}`}>
                          <UserCog size={14} /> Giao lại
                        </button>
                      ) : (
                        <span className="muted xs">{b.reassignBlockedReason}</span>
                      )}
                      {b.lastReassign && (
                        <span className="badge badge-kelp xs" title={b.lastReassign.reason ?? undefined}>
                          <CheckCircle2 size={12} /> Admin đã giao{b.lastReassign.actorName ? ` · ${b.lastReassign.actorName}` : ""} · {fmtTime(b.lastReassign.at)}
                        </span>
                      )}
                    </div>
                  ),
                },
              ] satisfies DataTableColumn<AdminBookingRow>[]
            }
            rows={list.state.data.items}
            empty={<span className="muted">{q ? `Không có lịch nào khớp “${q}”.` : "Không có lịch nào."}</span>}
          />
          <Pager page={list.state.data.page} total={list.state.data.total} onPage={(p) => setPage(p)} refreshing={list.state.refreshing} />
        </>
      )}

      {editing && (
        <ReassignModal
          key={editing.viewingId}
          row={editing}
          onClose={() => setEditing(null)}
          onDone={() => setEditing(null)}
        />
      )}
    </div>
  );
}

function Pager({ page, total, onPage, refreshing }: { page: number; total: number; onPage: (p: number) => void; refreshing: boolean }) {
  const pages = pageCount(total, PAGE_SIZE);
  return (
    <div className={styles.tools} style={{ justifyContent: "space-between" }}>
      <span className="muted small" aria-live="polite">
        {total.toLocaleString("vi-VN")} lịch · trang {page}/{pages}
        {refreshing ? " · đang cập nhật…" : ""}
      </span>
      <div style={{ display: "flex", gap: 6 }}>
        <button type="button" className="btn btn-quiet btn-sm" disabled={page <= 1} onClick={() => onPage(page - 1)}>
          Trang trước
        </button>
        <button type="button" className="btn btn-quiet btn-sm" disabled={page >= pages} onClick={() => onPage(page + 1)}>
          Trang sau
        </button>
      </div>
    </div>
  );
}

/** Modal giao lại: Host thật từ backend (đã lọc theo đúng quy tắc lúc ghi), lý do bắt buộc, chống bấm trùng, xử lý 409. */
function ReassignModal({ row: initial, onClose, onDone }: { row: AdminBookingRow; onClose: () => void; onDone: () => void }) {
  const [row, setRow] = useState(initial);
  const candidates = useReassignCandidates(row.viewingId);
  const [hostId, setHostId] = useState("");
  const [reason, setReason] = useState("");
  const [errors, setErrors] = useState<Partial<Record<"hostId" | "reason", string>>>({});
  const [notice, setNotice] = useState<{ tone: "error" | "conflict"; text: string } | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const inFlight = useRef(false);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (inFlight.current) return; // chống bấm trùng (kể cả bấm Enter liên tục)
    const v = validateReassign(hostId, reason);
    setErrors(v ?? {});
    if (v) return;
    if (!row.version) {
      setNotice({ tone: "error", text: "Lịch xem chưa có ticket điều phối." });
      return;
    }
    inFlight.current = true;
    setSubmitting(true);
    setNotice(null);
    const res = await reassignBooking(row.viewingId, { hostId, reason: reason.trim(), version: row.version });
    const out = reassignOutcome(res);
    inFlight.current = false;
    setSubmitting(false);
    if (out.kind === "ok") {
      invalidateAfterReassign();
      toast(`Đã giao ${out.row.bookingRef} cho ${out.row.ticket?.hostName ?? "Host mới"}`, "success");
      onDone();
      return;
    }
    if (out.kind === "conflict") {
      // Người khác vừa đổi: lấy bản mới nhất làm gốc, bỏ lựa chọn cũ, tải lại danh sách + ứng viên từ server.
      if (out.latest) setRow(out.latest);
      setHostId("");
      invalidateAfterReassign();
      setNotice({ tone: "conflict", text: out.message });
      return;
    }
    if (out.kind === "field") {
      setErrors(out.errors);
      if (out.errors.hostId) invalidateAfterReassign(); // trạng thái Host có thể vừa đổi ⇒ tải lại ứng viên
      return;
    }
    invalidateAfterReassign();
    setNotice({ tone: "error", text: out.message });
  };

  const c = candidates.state.status === "ready" ? candidates.state.data : null;
  const blocked = !row.canReassign ? row.reassignBlockedReason : c && !c.canReassign ? c.reassignBlockedReason : null;

  return (
    <Modal
      open
      onClose={submitting ? () => {} : onClose}
      title={`Giao lại ${row.bookingRef}`}
      description={`${row.unit.code} · ${fmtTime(row.slot)} · Host hiện tại: ${row.ticket?.hostName ?? "chưa có"}`}
      footer={
        <>
          <button type="button" className="btn btn-quiet" onClick={onClose} disabled={submitting}>
            Đóng
          </button>
          <button type="submit" form="reassign-form" className="btn btn-primary" disabled={submitting || !!blocked || !c} aria-busy={submitting}>
            {submitting ? "Đang giao…" : "Giao ca"}
          </button>
        </>
      }
    >
      <form id="reassign-form" onSubmit={submit} noValidate style={{ display: "flex", flexDirection: "column", gap: 14 }}>
        {notice && (
          <p className={`small ${styles.warnText}`} role="alert">
            <AlertTriangle size={14} /> {notice.text}
            {notice.tone === "conflict" && ` Hiện tại: ${row.ticket?.hostName ?? "chưa có Host"} · ${ticketLabel(row.ticket?.status ?? "")}.`}
          </p>
        )}
        {blocked && <p className="small muted">{blocked}</p>}

        {candidates.state.status === "loading" && <div className="skeleton" style={{ height: 120, borderRadius: 12 }} aria-busy="true" aria-label="Đang tải Field Host" />}
        {candidates.state.status === "error" && (
          <div className={styles.widgetError} role="alert">
            <p className="small">{candidates.state.message}</p>
            <button type="button" className="btn btn-quiet btn-sm" onClick={candidates.reload}>
              Thử lại
            </button>
          </div>
        )}
        {c && !blocked && (
          <Field label="Field Host nhận ca" error={errors.hostId}>
            {c.eligible.length === 0 ? (
              <p className="small muted">Hiện không có Field Host nào đủ điều kiện (đang trực, vai Sale, không trùng ca ±45 phút).</p>
            ) : (
              <div role="radiogroup" aria-label="Field Host nhận ca" style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                {c.eligible.map((h) => (
                  <label key={h.hostId} style={{ display: "flex", gap: 8, alignItems: "flex-start" }}>
                    <input type="radio" name="hostId" value={h.hostId} checked={hostId === h.hostId} onChange={() => setHostId(h.hostId)} disabled={submitting} />
                    <span>
                      <b>{h.name}</b> <span className="muted xs">· {h.openTickets} ca đang mở</span>
                      <span className="xs" style={{ display: "block" }}>
                        {h.sameZone ? <span className="muted">{h.zone}</span> : <span className={styles.warnText}>Khác phân khu: {h.zone}</span>}
                      </span>
                    </span>
                  </label>
                ))}
              </div>
            )}
          </Field>
        )}
        {c && c.ineligible.length > 0 && !blocked && (
          <details>
            <summary className="small muted">{c.ineligible.length} Host không đủ điều kiện</summary>
            <ul className="xs muted" style={{ marginTop: 6, display: "flex", flexDirection: "column", gap: 2 }}>
              {c.ineligible.map((h) => (
                <li key={h.hostId}>
                  {h.name}: {h.reason}
                </li>
              ))}
            </ul>
          </details>
        )}
        {!blocked && (
          <Field label="Lý do can thiệp" hint={`${reason.trim().length}/${REASON_MAX} ký tự · lưu vào nhật ký`} error={errors.reason}>
            <textarea className="input" rows={3} maxLength={REASON_MAX} value={reason} onChange={(e) => setReason(e.target.value)} disabled={submitting} aria-invalid={!!errors.reason} />
          </Field>
        )}
      </form>
    </Modal>
  );
}

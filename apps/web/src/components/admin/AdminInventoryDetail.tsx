"use client";

import Link from "next/link";
import { useState } from "react";
import { Check, X } from "lucide-react";
import { STATUS_META } from "@/components/booking/status";
import { ConsignTimeline } from "@/components/consign/ConsignTimeline";
import { InspectionReportView } from "@/components/consign/InspectionReportView";
import { CONSIGN_STATUS_META } from "@/components/consign/status";
import { DataTable, type DataTableColumn } from "@/components/ui/DataTable";
import { EmptyState } from "@/components/ui/EmptyState";
import { KeyValue } from "@/components/ui/KeyValue";
import { PageHeader } from "@/components/ui/PageHeader";
import { Section } from "@/components/ui/Section";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { toast } from "@/components/ui/Toast";
import { apiErrorText } from "@/lib/apiClient";
import { useAdminBookings, webStatus, type AdminBookingRow } from "@/lib/admin/bookings";
import {
  CONSIGN_PREFIX,
  consignmentHref,
  FURNISHING_LABEL,
  HOLD_HOURS_MAX,
  HOLD_HOURS_MIN,
  invalidateInventory,
  inventoryApi,
  isInspectOverdue,
  layoutKindOf,
  MANDATE_STATUS_LABEL,
  unitStatusMeta,
  unitTitle,
  useConsignment,
  useInventoryDetail,
  type AdminConsignment,
  type InventoryDetail,
} from "@/lib/admin/inventory";
import { fmtDate, fmtDateTime, vnd } from "@/lib/format";
import { LAYOUT_LABEL } from "@/lib/landlord/labels";
import type { InspectionReport } from "@/lib/mock/types";
import { useNow } from "@/lib/useNow";
import { RejectModal, TerminateModal } from "./AdminInventory";
import { AdminQuery } from "./AdminQuery";
import styles from "./Admin.module.css";

const BACK = { href: "/admin/inventory", label: "Căn hộ & ký gửi" };

/** `consign-<mandateId>` ⇒ hồ sơ ký gửi; còn lại là id/mã căn trong rổ hàng. */
export function AdminInventoryDetail({ id }: { id: string }) {
  return id.startsWith(CONSIGN_PREFIX) ? <ConsignmentDetail id={id.slice(CONSIGN_PREFIX.length)} /> : <UnitDetail id={id} />;
}

// ─── Căn trong rổ hàng ──────────────────────────────────────────────────────────────────────────────────────

function UnitDetail({ id }: { id: string }) {
  const query = useInventoryDetail(id);
  return (
    <div className={styles.page}>
      <AdminQuery query={query} title="Không tải được thông tin căn hộ" height={420}>
        {(u) => <UnitBody u={u} />}
      </AdminQuery>
    </div>
  );
}

function UnitBody({ u }: { u: InventoryDetail }) {
  const [terminating, setTerminating] = useState(false);
  const st = unitStatusMeta(u.status, u.mandate?.status);
  const m = u.mandate;

  return (
    <>
      <PageHeader title={unitTitle(u)} description={u.unitCode} back={BACK} actions={<StatusBadge tone={st.tone}>{st.label}</StatusBadge>} />

      <Section title="Thông tin căn hộ">
        <KeyValue
          items={[
            { label: "Chủ nhà", value: u.landlord?.fullName ?? "—" },
            { label: "Phân khu", value: u.zone },
            { label: "Loại căn", value: `${LAYOUT_LABEL[layoutKindOf(u.layout)]} · ${u.carpetAreaM2} m²` },
            { label: "Giá thuê", value: `${vnd(u.baseRentPrice)}đ/tháng` },
            {
              label: "All-in cost",
              value: (
                <span>
                  <b>{vnd(u.allInCost.total)}đ/tháng</b>
                  <span className="muted xs" style={{ display: "block" }}>
                    Phí QL {vnd(u.allInCost.managementFee)}đ · Gửi xe {vnd(u.allInCost.parkingFee)}đ{u.allInCost.feeVerified ? " (biểu phí tòa)" : ""} · Điện nước{" "}
                    {vnd(u.allInCost.utilityCost)}đ — tính cho {u.allInCost.household.motorbikes} xe máy, {u.allInCost.household.occupants} người
                  </span>
                </span>
              ),
            },
            { label: "Giá TB thị trường", value: u.marketAvgPrice ? `${vnd(u.marketAvgPrice)}đ/tháng` : "—" },
            { label: "Nội thất", value: FURNISHING_LABEL[u.furnishing] },
            { label: "Loại khoá", value: u.doorLockType === "PHYSICAL_KEY" ? "Chìa cơ tại quầy phân khu" : "Khoá điện tử" },
            {
              label: "Field Host phụ trách",
              value: u.host ? (
                <Link href={`/admin/hosts/${u.host.id}`} className="link">
                  {u.host.name ?? "Field Host"}
                </Link>
              ) : (
                "Phân khu chưa có Host"
              ),
            },
            { label: "Xác minh", value: u.isVerified ? "Đã xác minh" : "Chưa xác minh" },
            { label: "Ảnh niêm yết", value: `${u.media.length} ảnh` },
          ]}
        />
      </Section>

      <Section title="Ủy quyền ký gửi độc quyền">
        {m ? (
          <>
            <KeyValue
              items={[
                { label: "Số hợp đồng", value: m.contractNumber },
                { label: "Trạng thái", value: MANDATE_STATUS_LABEL[m.status] },
                { label: "Ký lúc", value: m.signedAt ? fmtDateTime(m.signedAt) : "Chưa ký" },
                ...(m.exitRequestedAt
                  ? [
                      { label: "Báo thoát lúc", value: fmtDate(m.exitRequestedAt) },
                      { label: "Hiệu lực thoát", value: m.exitEffectiveAt ? `${fmtDate(m.exitEffectiveAt)} (còn ${m.exitCountdownDays ?? 0} ngày)` : "—" },
                    ]
                  : []),
              ]}
            />
            <div style={{ display: "flex", gap: 12, marginTop: 12, alignItems: "center", flexWrap: "wrap" }}>
              <Link href={consignmentHref(m.id)} className="link small">
                Xem hồ sơ ký gửi & phiếu thẩm định →
              </Link>
              {m.canTerminate && (
                <button type="button" className="btn btn-danger btn-sm" onClick={() => setTerminating(true)}>
                  Chấm dứt ủy quyền
                </button>
              )}
            </div>
          </>
        ) : (
          <p className="muted small">Căn chưa có ủy quyền ký gửi.</p>
        )}
      </Section>

      <HoldHoursSection key={`${u.holdHours}-${u.holdHoursOverride}`} u={u} />

      <UnitBookings unitCode={u.unitCode} />

      <TerminateModal target={terminating && m ? { mandateId: m.id, title: unitTitle(u) } : null} onClose={() => setTerminating(false)} />
    </>
  );
}

/** Thời hạn khoá căn sau khi khách chuyển cọc (12–72h, mặc định 48h). Chỉ sửa khi căn còn trống. */
function HoldHoursSection({ u }: { u: InventoryDetail }) {
  const isOverride = u.holdHoursOverride !== null;
  const [val, setVal] = useState(String(u.holdHours));
  const [reason, setReason] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  const save = async (hours: number | null) => {
    if (hours !== null && (!Number.isInteger(hours) || hours < HOLD_HOURS_MIN || hours > HOLD_HOURS_MAX)) {
      return setError(`Thời gian khoá căn phải là số giờ nguyên từ ${HOLD_HOURS_MIN} đến ${HOLD_HOURS_MAX}.`);
    }
    if (!reason.trim()) return setError("Bắt buộc nhập lý do thay đổi.");
    setBusy(true);
    const res = await inventoryApi.setHoldHours(u.id, hours, reason.trim());
    setBusy(false);
    if (!res.ok) return setError(apiErrorText(res, "Chưa lưu được thời hạn giữ chỗ."));
    toast(hours === null ? "Đã về thời hạn giữ chỗ mặc định." : "Đã cập nhật thời hạn giữ chỗ riêng cho căn.", "success");
    setError("");
    setReason("");
    invalidateInventory();
  };

  return (
    <Section title="Thời hạn giữ chỗ căn hộ" description={`Căn khoá trạng thái giữ chỗ sau khi khách chuyển Tiền cọc bảo đảm. Mặc định ${u.defaultHoldHours} giờ.`}>
      <div style={{ display: "flex", flexDirection: "column", gap: 10, maxWidth: 540 }}>
        <div>
          <span className="small muted">Mức áp dụng hiện tại: </span>
          <span className={`badge ${isOverride ? "badge-amber-soft" : "badge-plain"}`}>
            {u.holdHours} giờ ({isOverride ? "Riêng căn này" : "Mặc định toàn sàn"})
          </span>
        </div>
        {u.canEditHoldHours ? (
          <form
            onSubmit={(e) => {
              e.preventDefault();
              save(Number(val));
            }}
            style={{ display: "flex", flexDirection: "column", gap: 8 }}
          >
            <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
              <input
                type="number"
                min={HOLD_HOURS_MIN}
                max={HOLD_HOURS_MAX}
                step={1}
                className="input"
                value={val}
                onChange={(e) => {
                  setVal(e.target.value);
                  setError("");
                }}
                style={{ width: 120 }}
                aria-label="Số giờ giữ chỗ"
              />
              <span className="small muted">giờ</span>
            </div>
            <input className="input" placeholder="Lý do thay đổi (lưu Audit)" value={reason} onChange={(e) => setReason(e.target.value)} />
            <div style={{ display: "flex", gap: 8 }}>
              <button type="submit" className="btn btn-primary btn-sm" disabled={busy}>
                Lưu riêng căn
              </button>
              {isOverride && (
                <button type="button" className="btn btn-quiet btn-sm" onClick={() => save(null)} disabled={busy}>
                  Về mặc định
                </button>
              )}
            </div>
            {error && <p className="xs" style={{ color: "var(--danger)", margin: 0 }}>{error}</p>}
          </form>
        ) : (
          <p className="small muted" style={{ margin: 0 }}>
            Chỉ chỉnh được khi căn còn trống — cọc đang giữ đã chốt hạn theo mức khách chấp thuận.
          </p>
        )}
      </div>
    </Section>
  );
}

/** Lịch xem của căn: `GET /admin/bookings?tab=all&q=<mã căn>` (backend tìm theo mã căn). */
function UnitBookings({ unitCode }: { unitCode: string }) {
  const query = useAdminBookings({ tab: "all", q: unitCode, page: 1 });
  return (
    <Section title="Lịch xem gần nhất" flush>
      <AdminQuery query={query} title="Không tải được lịch xem" height={160}>
        {(page) => (
          <>
            <DataTable<AdminBookingRow>
              columns={
                [
                  {
                    key: "ref",
                    header: "Mã lịch",
                    render: (b) => (
                      <Link href={`/admin/bookings?q=${encodeURIComponent(b.bookingRef)}`} className="link" style={{ fontWeight: 600 }}>
                        {b.bookingRef}
                      </Link>
                    ),
                  },
                  { key: "slot", header: "Giờ hẹn", render: (b) => fmtDateTime(b.slot) },
                  { key: "tenant", header: "Khách", render: (b) => b.tenant.name ?? "—" },
                  { key: "host", header: "Field Host", render: (b) => b.ticket?.hostName ?? "—" },
                  {
                    key: "status",
                    header: "Trạng thái",
                    render: (b) => {
                      const meta = STATUS_META[webStatus(b.viewingStatus)];
                      return <span className={`badge ${meta?.badge ?? "badge-plain"}`}>{meta?.label ?? b.viewingStatus}</span>;
                    },
                  },
                ] satisfies DataTableColumn<AdminBookingRow>[]
              }
              rows={page.items}
              empty={<span className="muted">Chưa có lịch xem nào cho căn này.</span>}
            />
            {page.total > page.items.length && (
              <p className="small muted" style={{ padding: "8px 16px" }}>
                Hiển thị {page.items.length}/{page.total} ·{" "}
                <Link href={`/admin/bookings?q=${encodeURIComponent(unitCode)}`} className="link">
                  Xem tất cả
                </Link>
              </p>
            )}
          </>
        )}
      </AdminQuery>
    </Section>
  );
}

// ─── Hồ sơ ký gửi ───────────────────────────────────────────────────────────────────────────────────────────

function ConsignmentDetail({ id }: { id: string }) {
  const query = useConsignment(id);
  return (
    <div className={styles.page}>
      <AdminQuery query={query} title="Không tải được hồ sơ ký gửi" height={420}>
        {(c) => <ConsignmentBody c={c} />}
      </AdminQuery>
    </div>
  );
}

function ConsignmentBody({ c }: { c: AdminConsignment }) {
  const now = useNow(60_000);
  const [rejecting, setRejecting] = useState(false);
  const [busy, setBusy] = useState(false);
  const meta = CONSIGN_STATUS_META[c.status];
  const report = (c.report ?? undefined) as InspectionReport | undefined;
  const overdue = now ? isInspectOverdue(c, now) : false;

  const approve = async () => {
    setBusy(true);
    const res = await inventoryApi.approve(c.id);
    setBusy(false);
    if (!res.ok) return toast(apiErrorText(res, "Chưa duyệt được hồ sơ."));
    toast("Đã duyệt ký gửi theo phiếu thẩm định.", "success");
    invalidateInventory();
  };

  return (
    <>
      <PageHeader
        title={`${c.building} · Tầng ${c.floor} · Căn ${c.door}`}
        description={`Hồ sơ #${c.contractNumber} · ${c.unitCode}`}
        back={BACK}
        actions={<StatusBadge tone={meta.tone}>{meta.label}</StatusBadge>}
      />

      {now > 0 && (
        <ConsignTimeline
          c={{
            status: c.status,
            signedAt: c.signedAt ?? undefined,
            hostAcceptedAt: c.hostAcceptedAt ?? undefined,
            decidedAt: c.decidedAt ?? undefined,
            note: c.decisionNote ?? undefined,
            inspectDueAt: c.inspectDueAt ?? undefined,
            report,
          }}
          now={now}
        />
      )}

      <Section title="Yêu cầu ký gửi">
        <KeyValue
          items={[
            { label: "Chủ nhà", value: c.landlord?.fullName ?? "—" },
            { label: "Phân khu", value: c.zone },
            { label: "Loại căn", value: `${LAYOUT_LABEL[c.layoutKind]} · ${c.areaM2} m²` },
            { label: "Giá chào thuê", value: `${vnd(c.askRent)}đ/tháng` },
            { label: "Tiền cọc đề xuất", value: `${vnd(c.suggestedDeposit)}đ` },
            { label: "Nội thất", value: c.furnished ? "Có nội thất" : "Không nội thất" },
            { label: "Loại khoá", value: c.locks.includes("physical") ? (c.locks.includes("smart") ? "Điện tử + chìa cơ" : "Chìa cơ gửi quầy phân khu") : "Khoá điện tử" },
            { label: "Ủy quyền AI chốt nhanh", value: c.allowFastClose ? "Có (giá sàn bảo mật, chỉ chủ nhà xem)" : "Không" },
            { label: "Field Host phụ trách", value: c.hostName ?? "Chưa gán" },
            { label: "Ký ủy quyền", value: c.signedAt ? fmtDateTime(c.signedAt) : "Chưa ký" },
            { label: "Cam đoan sở hữu (Điều 2)", value: c.ownershipWarrantedAt ? `Đã cam đoan lúc ${fmtDateTime(c.ownershipWarrantedAt)}` : "Chưa cam đoan" },
            {
              label: "Hạn thẩm định",
              value: c.inspectDueAt ? (
                <span>
                  {fmtDateTime(c.inspectDueAt)}
                  {overdue && (
                    <span className="badge badge-coral-soft" style={{ marginLeft: 6 }}>
                      Quá hạn 48h
                    </span>
                  )}
                </span>
              ) : (
                "—"
              ),
            },
            ...(c.decidedAt ? [{ label: "Người chốt", value: `${c.decidedBy ?? "—"} (${fmtDateTime(c.decidedAt)})` }] : []),
          ]}
        />
        {c.note && <p className="small muted" style={{ marginTop: 12 }}>Ghi chú: {c.note}</p>}
        <p className="small" style={{ marginTop: 12 }}>
          <Link href={`/admin/inventory/${c.unitId}`} className="link">
            Mở căn trong rổ hàng →
          </Link>
        </p>
      </Section>

      <Section title="Kết quả thẩm định thực tế" description={c.reportHostName ? `Phiếu do Field Host ${c.reportHostName} nộp.` : undefined}>
        {report ? (
          <InspectionReportView c={{ building: c.building, floor: c.floor, door: c.door, layout: c.layoutKind, areaM2: c.areaM2, furnished: c.furnished, locks: c.locks, report }} />
        ) : (
          <EmptyState title="Chờ Field Host nộp báo cáo thẩm định" description="Field Host phân khu đang tiếp nhận hoặc kiểm tra thực tế tại căn hộ trong vòng 48 giờ." />
        )}
      </Section>

      {c.status === "reviewing" && (
        <div className={styles.reqActions}>
          <button type="button" className="btn btn-quiet" onClick={() => setRejecting(true)} disabled={busy}>
            <X size={16} /> Từ chối
          </button>
          <button type="button" className="btn btn-success" style={{ flex: 1 }} onClick={approve} disabled={busy}>
            <Check size={16} /> {busy ? "Đang duyệt…" : "Duyệt ký gửi"}
          </button>
        </div>
      )}

      {c.status === "rejected" && (
        <div className="card" style={{ marginTop: "var(--space-4)", background: "var(--danger-050)", borderColor: "var(--danger-200)" }}>
          <p className="small">
            <b>Đã từ chối ký gửi:</b> {c.decisionNote ?? "Không đạt yêu cầu"}
          </p>
        </div>
      )}

      {c.status === "approved" && (
        <div className="card" style={{ marginTop: "var(--space-4)", background: "var(--ok-050)", borderColor: "var(--ok-200)" }}>
          <p className="small">
            <b>Đã nhận ký gửi</b> — căn đã lên rổ hàng.
          </p>
        </div>
      )}

      <RejectModal target={rejecting ? c : null} onClose={() => setRejecting(false)} />
    </>
  );
}

"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Check, X } from "lucide-react";
import { DataTable, type DataTableColumn } from "@/components/ui/DataTable";
import { EmptyState } from "@/components/ui/EmptyState";
import { KeyValue } from "@/components/ui/KeyValue";
import { Modal } from "@/components/ui/Modal";
import { PageHeader } from "@/components/ui/PageHeader";
import { Section } from "@/components/ui/Section";
import { StatusBadge, type StatusTone } from "@/components/ui/StatusBadge";
import { toast } from "@/components/ui/Toast";
import { STATUS_META } from "@/components/booking/status";
import { ConsignTimeline } from "@/components/consign/ConsignTimeline";
import { InspectionReportView } from "@/components/consign/InspectionReportView";
import { CONSIGN_STATUS_META } from "@/components/consign/status";
import { approveConsignment, rejectConsignment, setHoldHours, adminDelistUnit, adminRelistUnit, DELIST_REASON_LABELS } from "@/lib/mock/actions";
import { DEMO_USERS } from "@/lib/mock/actors";
import { allInCost, DEFAULT_HOUSEHOLD } from "@/lib/mock/cost";
import { fmtDate, fmtDateTime, fmtPhone, fmtTime, vnd } from "@/lib/mock/format";
import { unitDisplayStatus, unitStatus, isOpenBooking } from "@/lib/mock/selectors";
import { consignmentById, unitBookings } from "@/lib/mock/selectors-admin";
import { isInspectOverdue } from "@/lib/mock/selectors-inspection";
import { viewingLog, type ViewingLogEntry } from "@/lib/mock/selectors-viewing";
import { setMockState, useMock } from "@/lib/mock/store";
import type { Booking, Consignment, InspectionReport, DelistReason } from "@/lib/mock/types";
import { FURNISHING_LABEL, LAYOUT_LABEL, hostById, hostForUnit, landlordById, unitAddress, unitById, zoneById, type LayoutKind, type UnitStatus, type Unit } from "@/lib/mock/units";
import { useNow } from "@/lib/useNow";
import { Archive, RotateCcw, AlertTriangle } from "lucide-react";
import styles from "./Admin.module.css";

const UNIT_STATUS_META: Record<UnitStatus, { label: string; tone: StatusTone }> = {
  available: { label: "Còn trống", tone: "ok" },
  holding: { label: "Đang giữ căn", tone: "warn" },
  rented: { label: "Đã cho thuê", tone: "neutral" },
  archived: { label: "Đã lưu trữ / Ngừng niêm yết", tone: "neutral" },
};

const OUTCOME_LABEL: Record<ViewingLogEntry["outcome"], { label: string; badge: string }> = {
  in_progress: { label: "Đang xem", badge: "badge-amber-soft" },
  deposit: { label: "Khách cọc", badge: "badge-kelp" },
  not_decided: { label: "Chưa quyết định", badge: "badge-plain" },
  no_show: { label: "Bỏ hẹn", badge: "badge-coral-soft" },
  cancelled: { label: "Đã huỷ", badge: "badge-plain" },
};

function parseLayoutKind(layout: string | undefined): LayoutKind {
  if (!layout) return "2PN";
  if (layout === "STUDIO" || layout === "Studio") return "Studio";
  if (layout === "ONE_BED_PLUS" || layout === "1PN") return "1PN";
  if (layout === "TWO_BED_ONE_BATH" || layout === "TWO_BED_TWO_BATH" || layout === "2PN") return "2PN";
  if (layout === "THREE_BED" || layout === "3PN") return "3PN";
  return "2PN";
}

/** Hồ sơ duyệt một căn ký gửi — id có thể là consignment id (chưa có Unit) hoặc unit id (đã lên rổ hàng). */
export function AdminInventoryDetail({ id }: { id: string }) {
  const state = useMock();
  const now = useNow(60_000);
  const [rejecting, setRejecting] = useState(false);
  const [note, setNote] = useState("Ảnh hiện trạng chưa rõ hoặc chất lượng chưa đạt yêu cầu");
  const [rejectError, setRejectError] = useState("");

  const unit = unitById(id);
  const existingConsignment = unit ? undefined : consignmentById(state, id);
  const [dbConsignment, setDbConsignment] = useState<Consignment | null>(null);
  const [loadingDb, setLoadingDb] = useState<boolean>(() => !unit && !existingConsignment);

  const consignment = existingConsignment || dbConsignment;

  useEffect(() => {
    if (unit || existingConsignment) {
      setLoadingDb(false);
      return;
    }
    let unmounted = false;
    async function fetchConsignment() {
      try {
        const res = await fetch("/api/v1/host/inspections", { credentials: "same-origin" });
        if (!res.ok) {
          if (!unmounted) setLoadingDb(false);
          return;
        }
        const data = await res.json();
        if (!Array.isArray(data)) {
          if (!unmounted) setLoadingDb(false);
          return;
        }
        const item = data.find(
          (x: any) =>
            x.consignmentId === id ||
            x.unitId === id ||
            x.id === id ||
            x.unitCode === id,
        );
        if (item && !unmounted) {
          const code = item.unitCode || "";
          const parts = code.split("-");
          const doorRaw = parts[2] || "01";
          const doorNum = doorRaw.replace(/^[A-Za-z]+/, "") || "01";
          const mapped: Consignment = {
            id: item.consignmentId || item.id || id,
            landlordId: item.landlordId || "L01",
            building: item.building || "S1.02",
            floor: item.floor || 12,
            door: doorNum.padStart(2, "0"),
            layout: parseLayoutKind(item.layout),
            areaM2: item.carpetAreaM2 || 45,
            askRent: item.askRent || 6000000,
            suggestedDeposit: item.askRent || 6000000,
            leaseTerm: "long",
            furnished: true,
            locks: ["smart"],
            auditByHost: true,
            status: (item.status as any) || "awaiting_host",
            createdAt: item.createdAt || new Date().toISOString(),
            signedAt: item.createdAt || new Date().toISOString(),
            hostId: item.hostId || undefined,
            inspectDueAt: new Date(
              new Date(item.createdAt || Date.now()).getTime() + 48 * 3600000,
            ).toISOString(),
            furnishing: "full",
            lock: "smart",
            items: [],
          };
          setDbConsignment(mapped);
          setMockState((s) => {
            const next = [...s.consignments];
            const idx = next.findIndex((x) => x.id === mapped.id);
            if (idx >= 0) {
              next[idx] = { ...next[idx], ...mapped };
            } else {
              next.push(mapped);
            }
            return { ...s, consignments: next };
          });
        }
      } catch {
        // ignore
      } finally {
        if (!unmounted) setLoadingDb(false);
      }
    }
    fetchConsignment();
    return () => {
      unmounted = true;
    };
  }, [id, unit, existingConsignment]);

  if (!state.ready || !now || loadingDb) return <div className="skeleton" style={{ height: 420 }} />;

  if (!unit && !consignment) notFound();

  if (unit) {
    const s = unitDisplayStatus(state, unit);
    const m = state.mandates[unit.id];
    const bookings = unitBookings(state, unit.id).slice(0, 8);
    const logs = viewingLog(state, { unitId: unit.id });
    return (
      <div className={styles.page}>
        <PageHeader title={unitAddress(unit)} back={{ href: "/admin/inventory", label: "Căn hộ & ký gửi" }} />

        <Section title="Thông tin căn hộ">
          <KeyValue
            items={[
              { label: "Chủ nhà", value: landlordById(unit.landlordId)?.name ?? "—" },
              { label: "Phân khu", value: zoneById(unit.zoneId).name },
              { label: "Loại căn", value: `${unit.layoutLabel} · ${unit.areaM2} m²` },
              { label: "Giá thuê", value: `${vnd(unit.rent)}đ/tháng` },
              { label: "All-in cost", value: `${vnd(allInCost(unit, DEFAULT_HOUSEHOLD).total)}đ/tháng` },
              { label: "Nội thất", value: FURNISHING_LABEL[unit.furnishing] },
              { label: "Loại khoá", value: unit.lock === "smart" ? "Khoá điện tử" : "Chìa cơ tại quầy phân khu" },
              { label: "Field Host phụ trách", value: hostForUnit(unit).name },
              {
                label: "Trạng thái",
                value: (
                  <StatusBadge tone={s === "viewing" ? "warn" : UNIT_STATUS_META[s].tone}>
                    {s === "viewing" ? "Có khách xem" : UNIT_STATUS_META[s].label}
                  </StatusBadge>
                ),
              },
              { label: "Ủy quyền ký gửi", value: m ? `${m.status === "exiting" ? "Đang thoát, hiệu lực đến " + fmtDate(m.exitEffectiveAt!) : "Đang hiệu lực"} từ ${fmtDate(m.signedAt)}` : "Chưa ký ủy quyền" },
            ]}
          />
        </Section>

        <UnitHoldPolicySection unitId={unit.id} />

        <UnitArchiveSection unit={unit} />

        <Section title={`Nhật ký xem phòng (${logs.length})`} flush>
          <DataTable<ViewingLogEntry>
            columns={[
              {
                key: "ref",
                header: "Mã lịch",
                render: (l) => (
                  <Link href={`/admin/bookings?q=${l.ref}`} className="link" style={{ fontWeight: 600 }}>
                    {l.ref}
                  </Link>
                ),
              },
              { key: "startedAt", header: "Bắt đầu", render: (l) => fmtDateTime(l.startedAt) },
              { key: "doorOpenedAt", header: "Mở cửa", render: (l) => l.doorOpenedAt ? fmtTime(l.doorOpenedAt) : "—" },
              { key: "endedAt", header: "Kết thúc", render: (l) => l.endedAt ? fmtTime(l.endedAt) : "—" },
              { key: "duration", header: "Thời lượng", render: (l) => l.durationMin !== undefined ? `${l.durationMin} phút` : "—" },
              {
                key: "tenant",
                header: "Khách",
                render: (l) => (
                  <div>
                    <b>{l.tenantName}</b>
                    <span className="muted xs" style={{ display: "block" }}>{fmtPhone(l.tenantPhone)}</span>
                  </div>
                ),
              },
              { key: "host", header: "Field Host", render: (l) => hostById(l.hostId)?.name ?? "—" },
              {
                key: "outcome",
                header: "Kết quả",
                render: (l) => (
                  <span className={`badge ${OUTCOME_LABEL[l.outcome]?.badge ?? "badge-plain"}`}>
                    {OUTCOME_LABEL[l.outcome]?.label ?? l.outcome}
                  </span>
                ),
              },
              { key: "note", header: "Ghi chú", render: (l) => <span className="small muted">{l.note || "—"}</span> },
            ]}
            rows={logs}
            empty={<span className="muted">Chưa có lượt dẫn khách nào cho căn này.</span>}
          />
        </Section>

        <Section title="Lịch xem gần nhất" flush>
          <DataTable<Booking>
            columns={
              [
                { key: "slot", header: "Giờ hẹn", render: (b) => fmtDateTime(b.slot) },
                { key: "tenant", header: "Khách", render: (b) => b.tenant.name },
                {
                  key: "host",
                  header: "Field Host",
                  render: (b) => {
                    if (b.status === "pending" && b.dispatch?.state === "open") {
                      const n = b.dispatch.offeredTo.length;
                      return (
                        <span className="badge badge-coral">
                          Đang mở cho {n} Sale{b.dispatch.escalated ? " · Cần điều phối tay" : ""}
                        </span>
                      );
                    }
                    return hostById(b.hostId)?.name ?? "—";
                  },
                },
                { key: "status", header: "Trạng thái", render: (b) => <span className={`badge ${STATUS_META[b.status].badge}`}>{STATUS_META[b.status].label}</span> },
              ] satisfies DataTableColumn<Booking>[]
            }
            rows={bookings}
            empty={<span className="muted">Chưa có lịch xem nào cho căn này.</span>}
          />
        </Section>
      </div>
    );
  }

  const c = consignment!;
  const host = c.hostId ? hostById(c.hostId) : null;
  const overdue = isInspectOverdue(c, now);

  const kvItems = [
    { label: "Chủ nhà", value: landlordById(c.landlordId)?.name ?? "—" },
    { label: "Toà · Tầng · Căn", value: `${c.building} · Tầng ${c.floor} · Căn ${c.door}` },
    { label: "Loại căn", value: `${LAYOUT_LABEL[c.layout]} · ${c.areaM2} m²` },
    { label: "Giá chào thuê", value: `${vnd(c.askRent)}đ/tháng` },
    { label: "Nội thất", value: FURNISHING_LABEL[c.furnishing] },
    { label: "Loại khoá", value: c.lock === "smart" ? "Khoá điện tử (mã hoá AES-256)" : "Chìa cơ gửi quầy phân khu" },
    { label: "Field Host phụ trách", value: host ? host.name : "Chưa gán" },
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
    { label: "Gửi lúc", value: fmtDate(c.createdAt) },
    {
      label: "Trạng thái",
      value: <StatusBadge tone={CONSIGN_STATUS_META[c.status].tone}>{CONSIGN_STATUS_META[c.status].label}</StatusBadge>,
    },
  ];

  if (c.decidedBy) {
    kvItems.push({
      label: "Người chốt",
      value: `${c.decidedBy} (${fmtDateTime(c.decidedAt!)})`,
    });
  }

  return (
    <div className={styles.page}>
      <PageHeader title={`${c.building} · Tầng ${c.floor} · Căn ${c.door}`} back={{ href: "/admin/inventory", label: "Căn hộ & ký gửi" }} />

      <ConsignTimeline c={c} now={now} />

      <Section title="Yêu cầu ký gửi">
        <KeyValue items={kvItems} />
        {c.note && <p className="small muted" style={{ marginTop: 12 }}>Ghi chú: {c.note}</p>}
      </Section>

      <Section title="Kết quả thẩm định thực tế" description="Biên bản kiểm tra hiện trạng và ảnh thẩm định do Field Host thực hiện.">
        {c.report ? (
          <InspectionReportView c={c as Consignment & { report: InspectionReport }} />
        ) : (
          <EmptyState
            title="Chờ Field Host nộp báo cáo thẩm định"
            description="Field Host phân khu đang tiếp nhận hoặc kiểm tra thực tế tại căn hộ trong vòng 48 giờ."
          />
        )}
      </Section>

      {c.status === "reviewing" && (
        <div className={styles.reqActions}>
          <button
            type="button"
            className="btn btn-quiet"
            onClick={() => {
              setRejecting(true);
              setNote("Ảnh hiện trạng hoặc chất lượng chưa đạt yêu cầu");
              setRejectError("");
            }}
          >
            <X size={16} /> Từ chối
          </button>
          <button
            type="button"
            className="btn btn-success"
            style={{ flex: 1 }}
            onClick={async () => {
              try {
                await fetch(`/api/v1/admin/consignments/${c.id}/approve`, {
                  method: "POST",
                  headers: { "Content-Type": "application/json" },
                  credentials: "same-origin",
                  body: JSON.stringify({ note: "Admin đã duyệt ký gửi" }),
                });
              } catch {
                // ignore
              }
              const res = approveConsignment(c.id, DEMO_USERS.admin.name);
              if (res.ok) {
                toast("Đã nhận ký gửi và niêm yết căn hộ lên hệ thống cho thuê.", "success");
                setDbConsignment((prev) => (prev ? { ...prev, status: "approved" } : null));
              } else {
                toast(`Không thể duyệt: ${res.reason}`);
              }
            }}
          >
            <Check size={16} /> Duyệt ký gửi
          </button>
        </div>
      )}

      {(c.status === "awaiting_host" || c.status === "inspecting") && (
        <div className={styles.reqActions} style={{ alignItems: "center" }}>
          <button
            type="button"
            className="btn btn-quiet"
            onClick={() => {
              setRejecting(true);
              setNote("Thông tin căn hộ không hợp lệ hoặc chủ nhà yêu cầu huỷ");
              setRejectError("");
            }}
          >
            <X size={16} /> Từ chối
          </button>
          <span className="muted small" style={{ marginLeft: "auto" }}>
            Chỉ duyệt được sau khi Field Host nộp báo cáo.
          </span>
        </div>
      )}

      {c.status === "rejected" && (
        <div className="card" style={{ marginTop: "var(--space-4)", background: "var(--danger-050)", borderColor: "var(--danger-200)" }}>
          <p className="small">
            <b>Đã từ chối ký gửi:</b> {c.note ?? "Không đạt yêu cầu"}
            {c.decidedBy && <span className="muted"> (Bởi {c.decidedBy} lúc {fmtDateTime(c.decidedAt!)})</span>}
          </p>
        </div>
      )}

      {c.status === "approved" && (
        <div className="card" style={{ marginTop: "var(--space-4)", background: "var(--ok-050)", borderColor: "var(--ok-200)" }}>
          <p className="small">
            <b>Đã duyệt nhận ký gửi</b>
            {c.decidedBy && <span className="muted"> (Bởi {c.decidedBy} lúc {fmtDateTime(c.decidedAt!)})</span>}
          </p>
        </div>
      )}

      <Modal
        open={rejecting}
        onClose={() => {
          setRejecting(false);
          setRejectError("");
        }}
        variant="sheet"
        title="Từ chối yêu cầu ký gửi"
        footer={
          <button
            type="button"
            className="btn btn-danger btn-block"
            onClick={async () => {
              try {
                await fetch(`/api/v1/admin/consignments/${c.id}/reject`, {
                  method: "POST",
                  headers: { "Content-Type": "application/json" },
                  credentials: "same-origin",
                  body: JSON.stringify({ note: note || "Từ chối ký gửi" }),
                });
              } catch {
                // ignore
              }
              const res = rejectConsignment(c.id, note, DEMO_USERS.admin.name);
              if (!res.ok) {
                if (res.reason === "invalid_note") {
                  setRejectError("Lý do từ chối phải có ít nhất 5 ký tự.");
                } else {
                  setRejectError(res.reason);
                }
                return;
              }
              setDbConsignment((prev) => (prev ? { ...prev, status: "rejected", note } : null));
              setRejecting(false);
              setRejectError("");
              toast("Đã từ chối và báo chủ nhà qua Zalo", "success");
            }}
          >
            Xác nhận không duyệt
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
              if (rejectError) setRejectError("");
            }}
            placeholder="Nêu rõ lý do từ chối (tối thiểu 5 ký tự)..."
          />
          {rejectError && <span className="field-error">{rejectError}</span>}
        </label>
      </Modal>
    </div>
  );
}

function UnitHoldForm({
  unitId,
  initialHours,
  isOverride,
  adminName,
}: {
  unitId: string;
  initialHours: number;
  isOverride: boolean;
  adminName: string;
}) {
  const [val, setVal] = useState<string>(String(initialHours));
  const [error, setError] = useState<string>("");

  const handleSave = (e: React.FormEvent) => {
    e.preventDefault();
    const num = Number(val);
    const res = setHoldHours(unitId, num, adminName);
    if (!res.ok) {
      setError(res.reason);
    } else {
      setError("");
      toast("Đã cập nhật thời hạn giữ chỗ riêng cho căn", "success");
    }
  };

  const handleReset = () => {
    const res = setHoldHours(unitId, null, adminName);
    if (!res.ok) {
      setError(res.reason);
    } else {
      setError("");
      toast("Đã khôi phục về thời hạn giữ chỗ mặc định toàn sàn", "success");
    }
  };

  return (
    <form onSubmit={handleSave} style={{ display: "flex", flexDirection: "column", gap: 6 }}>
      <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
        <input
          type="number"
          min={12}
          max={72}
          step={1}
          className="input"
          value={val}
          onChange={(e) => {
            setVal(e.target.value);
            setError("");
          }}
          style={{ width: 140 }}
        />
        <span className="small muted">giờ</span>
        <button type="submit" className="btn btn-primary btn-sm">
          Lưu riêng căn
        </button>
        {isOverride && (
          <button type="button" className="btn btn-quiet btn-sm" onClick={handleReset}>
            Về mặc định
          </button>
        )}
      </div>
      {error && <p className="xs" style={{ color: "var(--danger)", margin: "4px 0 0" }}>{error}</p>}
    </form>
  );
}

function UnitHoldPolicySection({ unitId }: { unitId: string }) {
  const state = useMock();
  const override = state.holdPolicy.byUnit[unitId];
  const defaultHours = state.holdPolicy.defaultHours;
  const currentHours = override ?? defaultHours;
  const isOverride = override !== undefined;

  return (
    <Section title="Thời hạn giữ chỗ căn hộ (SPEC-P01)">
      <div style={{ display: "flex", flexDirection: "column", gap: 10, maxWidth: 540 }}>
        <div>
          <span className="small muted">Mức áp dụng hiện tại: </span>
          <b>
            {isOverride ? (
              <span className="badge badge-amber-soft">{currentHours} giờ (Riêng căn này)</span>
            ) : (
              <span className="badge badge-plain">{currentHours} giờ (Mặc định toàn sàn)</span>
            )}
          </b>
        </div>

        <UnitHoldForm
          key={`${currentHours}-${isOverride}`}
          unitId={unitId}
          initialHours={currentHours}
          isOverride={isOverride}
          adminName={DEMO_USERS.admin.name}
        />
      </div>
    </Section>
  );
}

function UnitArchiveSection({ unit }: { unit: Unit }) {
  const state = useMock();
  const [modalOpen, setModalOpen] = useState(false);
  const [reason, setReason] = useState<DelistReason>("landlord_exit");
  const [note, setNote] = useState("");
  const [confirmText, setConfirmText] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const isArchived = Boolean(state.archivedUnits?.[unit.id]);
  const archiveRecord = state.archivedUnits?.[unit.id];
  const currentStatus = unitStatus(state, unit.id);
  const hasActiveViewing = state.bookings.some((b) => b.unitId === unit.id && isOpenBooking(b));

  const isHolding = currentStatus === "holding";
  const isRented = currentStatus === "rented";
  const canDelist = !isHolding && !isRented && !hasActiveViewing;

  const handleDelist = () => {
    if (!canDelist) return;
    if (confirmText.trim() !== "DELIST") return;
    setSubmitting(true);
    const res = adminDelistUnit(unit.id, reason, note, DEMO_USERS.admin.name);
    setSubmitting(false);
    if (!res.ok) {
      toast(res.reason ?? "Không thể ngừng niêm yết căn hộ");
      return;
    }
    toast("Đã ngừng niêm yết và chuyển căn hộ vào kho lưu trữ hồ sơ", "success");
    setModalOpen(false);
    setConfirmText("");
    setNote("");
  };

  const handleRelist = () => {
    const res = adminRelistUnit(unit.id, DEMO_USERS.admin.name);
    if (!res.ok) {
      toast(res.reason ?? "Không thể khôi phục niêm yết căn hộ");
      return;
    }
    toast("Đã khôi phục niêm yết căn hộ thành công. Căn đã hiển thị lại trên rổ hàng.", "success");
  };

  return (
    <Section
      title="Ngừng niêm yết / Lưu trữ căn hộ (Delist & Archive)"
      description="Chuẩn nghiệp vụ PropTech cao cấp: Bảo toàn 100% lịch sử giao dịch, hợp đồng & biên bản kiểm định pháp lý."
    >
      {isArchived && archiveRecord ? (
        <div
          className="card"
          style={{
            background: "var(--neutral-050, #f8fafc)",
            border: "1px solid var(--neutral-200, #e2e8f0)",
            padding: 16,
            borderRadius: 8,
          }}
        >
          <div style={{ display: "flex", alignItems: "flex-start", gap: 12, marginBottom: 12 }}>
            <div
              style={{
                width: 36,
                height: 36,
                borderRadius: "50%",
                background: "var(--neutral-200, #e2e8f0)",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                flexShrink: 0,
              }}
            >
              <Archive size={18} style={{ color: "var(--neutral-700, #334155)" }} />
            </div>
            <div style={{ flex: 1 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                <span style={{ fontWeight: 700, color: "var(--ink)" }}>Căn hộ đang được lưu trữ hồ sơ (Đã ngừng niêm yết)</span>
                <span className="badge badge-plain" style={{ background: "var(--neutral-200)", color: "var(--neutral-700)" }}>
                  📁 Đã lưu trữ
                </span>
              </div>
              <p className="small muted" style={{ margin: "4px 0 0" }}>
                Căn hộ đã được ẩn hoàn toàn khỏi Trang chủ, AI Matchmaker và cổng tìm kiếm của khách thuê. Toàn bộ nhật ký xem phòng, hợp đồng và hộ chiếu bàn giao số được bảo lưu nguyên vẹn.
              </p>
            </div>
          </div>

          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))",
              gap: 12,
              background: "#fff",
              padding: 12,
              borderRadius: 6,
              border: "1px solid var(--border)",
              marginBottom: 16,
            }}
          >
            <div>
              <span className="xs muted" style={{ display: "block" }}>Thời gian lưu trữ</span>
              <span className="small font-medium">{fmtDateTime(archiveRecord.archivedAt)}</span>
            </div>
            <div>
              <span className="xs muted" style={{ display: "block" }}>Người thực hiện</span>
              <span className="small font-medium">{archiveRecord.archivedBy}</span>
            </div>
            <div>
              <span className="xs muted" style={{ display: "block" }}>Lý do</span>
              <span className="small font-medium" style={{ color: "var(--primary)" }}>{archiveRecord.reasonLabel}</span>
            </div>
            <div>
              <span className="xs muted" style={{ display: "block" }}>Ghi chú lưu trữ</span>
              <span className="small font-medium">{archiveRecord.note || "—"}</span>
            </div>
          </div>

          <button
            type="button"
            className="btn btn-outline btn-sm"
            style={{ display: "inline-flex", alignItems: "center", gap: 6 }}
            onClick={handleRelist}
          >
            <RotateCcw size={14} /> Khôi phục niêm yết (Relist Unit)
          </button>
        </div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          {!canDelist ? (
            <div
              className="card"
              style={{
                background: "var(--warn-050, #fffbeb)",
                borderColor: "var(--warn-200, #fde68a)",
                padding: 14,
                display: "flex",
                gap: 12,
                alignItems: "flex-start",
              }}
            >
              <AlertTriangle size={18} style={{ color: "var(--warn-700, #b45309)", flexShrink: 0, marginTop: 2 }} />
              <div>
                <b style={{ color: "var(--warn-800, #92400e)", display: "block", fontSize: "0.875rem" }}>
                  Chưa thể ngừng niêm yết căn hộ này do ràng buộc an toàn giao dịch:
                </b>
                <ul className="small muted" style={{ margin: "4px 0 0", paddingLeft: 16 }}>
                  {isHolding && <li>Căn đang được giữ chỗ qua cọc VietQR 2.000.000 VNĐ. Cần hết thời hạn giữ chỗ hoặc xử lý giải tỏa cọc trước.</li>}
                  {isRented && <li>Căn đang trong chu kỳ hợp đồng thuê có hiệu lực với Tiền cọc bảo đảm tài sản. Cần hoàn tất thủ tục thanh lý hợp đồng và bàn giao nhà trước.</li>}
                  {hasActiveViewing && <li>Đang có ca xem phòng đang diễn ra hoặc đã lên lịch của Field Host. Cần hoàn tất hoặc hủy ca xem trước khi lưu trữ.</li>}
                </ul>
              </div>
            </div>
          ) : (
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: 12 }}>
              <div style={{ maxWidth: 520 }}>
                <p className="small muted" style={{ margin: 0 }}>
                  Chức năng này thay thế thao tác xóa cứng dữ liệu: Căn hộ sẽ được đưa vào trạng thái lưu trữ hồ sơ, ẩn khỏi toàn bộ rổ hàng công khai và AI Matchmaker nhưng bảo lưu toàn bộ chứng từ kiểm toán pháp lý.
                </p>
              </div>
              <button
                type="button"
                className="btn btn-quiet btn-sm"
                style={{ color: "var(--danger)", borderColor: "var(--danger-200)", display: "inline-flex", alignItems: "center", gap: 6 }}
                onClick={() => {
                  setConfirmText("");
                  setNote("");
                  setReason("landlord_exit");
                  setModalOpen(true);
                }}
              >
                <Archive size={14} /> Ngừng niêm yết & Lưu trữ căn hộ
              </button>
            </div>
          )}

          <Modal
            open={modalOpen}
            onClose={() => setModalOpen(false)}
            title="Xác nhận Ngừng niêm yết & Lưu trữ căn hộ"
            variant="sheet"
            footer={
              <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
                <button type="button" className="btn btn-quiet" onClick={() => setModalOpen(false)}>
                  Đóng
                </button>
                <button
                  type="button"
                  className="btn btn-danger"
                  disabled={confirmText.trim() !== "DELIST" || submitting}
                  onClick={handleDelist}
                  style={{ display: "inline-flex", alignItems: "center", gap: 6 }}
                >
                  <Archive size={16} /> Xác nhận lưu trữ
                </button>
              </div>
            }
          >
            <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
              <div
                style={{
                  background: "var(--danger-050, #fef2f2)",
                  border: "1px solid var(--danger-200, #fecaca)",
                  padding: 12,
                  borderRadius: 6,
                  color: "var(--danger-800, #991b1b)",
                  fontSize: "0.85rem",
                  lineHeight: 1.5,
                }}
              >
                <b>Lưu ý quan trọng:</b> Thao tác này sẽ ngừng hiển thị căn hộ <b>{unit.code}</b> ({unitAddress(unit)}) trên toàn hệ thống công khai (Trang chủ, AI Matchmaker, giỏ hàng). Căn hộ được chuyển vào kho lưu trữ hồ sơ nhưng không làm mất dữ liệu lịch sử.
              </div>

              <label className="field">
                <span className="label">Lý do ngừng niêm yết *</span>
                <select
                  className="select"
                  value={reason}
                  onChange={(e) => setReason(e.target.value as DelistReason)}
                >
                  {Object.entries(DELIST_REASON_LABELS).map(([k, v]) => (
                    <option key={k} value={k}>
                      {v}
                    </option>
                  ))}
                </select>
              </label>

              <label className="field">
                <span className="label">Ghi chú nghiệp vụ / Biên bản trao đổi</span>
                <textarea
                  className="textarea"
                  value={note}
                  onChange={(e) => setNote(e.target.value)}
                  placeholder="Ghi rõ thông tin trao đổi với chủ nhà, số văn bản hoặc biên bản thanh lý ủy quyền (nếu có)..."
                  rows={3}
                />
              </label>

              <label className="field">
                <span className="label">
                  Cơ chế bảo vệ (Type-to-Confirm): Gõ chính xác chữ <b style={{ color: "var(--danger)" }}>DELIST</b> để mở khóa
                </span>
                <input
                  type="text"
                  className="input"
                  value={confirmText}
                  onChange={(e) => setConfirmText(e.target.value)}
                  placeholder="Nhập DELIST"
                  autoComplete="off"
                />
              </label>
            </div>
          </Modal>
        </div>
      )}
    </Section>
  );
}

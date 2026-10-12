"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { AlertTriangle, Check, KeyRound, Smartphone, Timer, UserCheck, X } from "lucide-react";
import { DataTable, type DataTableColumn } from "@/components/ui/DataTable";
import { Modal } from "@/components/ui/Modal";
import { PageHeader } from "@/components/ui/PageHeader";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { toast } from "@/components/ui/Toast";
import { CONSIGN_STATUS_META } from "@/components/consign/status";
import { approveConsignment, rejectConsignment, adminAssignConsignment, autoEscalateConsignments } from "@/lib/mock/actions";
import { DEMO_USERS } from "@/lib/mock/actors";
import { allInCost, DEFAULT_HOUSEHOLD } from "@/lib/mock/cost";
import { fmtDate, vnd } from "@/lib/mock/format";
import { unitDisplayStatus } from "@/lib/mock/selectors";
import { inspectionSummary, isInspectOverdue } from "@/lib/mock/selectors-inspection";
import { useMock } from "@/lib/mock/store";
import type { Consignment } from "@/lib/mock/types";
import { FURNISHING_LABEL, LAYOUT_LABEL, UNITS, ZONES, hostById, hostForUnit, landlordById, unitAddress, unitById, zoneById, type Unit, type UnitDisplayStatus, type LayoutKind } from "@/lib/mock/units";
import { useNow } from "@/lib/useNow";
import styles from "./Admin.module.css";

type Tab = "units" | "requests" | "exit";

function parseLayoutKind(layout: string): LayoutKind {
  if (layout === "STUDIO" || layout === "Studio") return "Studio";
  if (layout === "ONE_BED_PLUS" || layout === "1PN") return "1PN";
  if (layout === "TWO_BED_ONE_BATH" || layout === "TWO_BED_TWO_BATH" || layout === "2PN") return "2PN";
  if (layout === "THREE_BED" || layout === "3PN") return "3PN";
  return "2PN";
}

export function AdminInventory({ initialTab }: { initialTab: Tab }) {
  const state = useMock();
  const now = useNow(60_000);
  const [tab, setTab] = useState<Tab>(initialTab);
  const [zone, setZone] = useState("all");
  const [status, setStatus] = useState<UnitDisplayStatus | "all">("all");
  const [lock, setLock] = useState<"all" | "smart" | "physical">("all");
  const [rejecting, setRejecting] = useState<Consignment | null>(null);
  const [note, setNote] = useState("Ảnh hiện trạng chưa rõ, cần bổ sung");
  const [rejectError, setRejectError] = useState("");
  const [overrideConsignment, setOverrideConsignment] = useState<Consignment | null>(null);
  const [targetHostId, setTargetHostId] = useState("H01");
  const [dbItems, setDbItems] = useState<Consignment[]>([]);

  // Tự động kiểm tra và leo thang SLA cho các hồ sơ ký gửi
  useEffect(() => {
    autoEscalateConsignments(now);
  }, [now]);

  // Tự động kéo các căn đã ký gửi thực tế từ Backend Database về
  useEffect(() => {
    let unmounted = false;
    async function loadDbConsignments() {
      try {
        const res = await fetch("/api/v1/host/inspections", { credentials: "same-origin" });
        if (!res.ok) return;
        const data = await res.json();
        const list = Array.isArray(data) ? data : data?.data;
        if (!Array.isArray(list) || unmounted) return;

        const mapped: Consignment[] = list.map((item: any) => {
          const parts = (item.unitCode || "").split("-");
          const doorPart = parts[2] || "";
          const doorNum = doorPart.replace(new RegExp(`^${item.floor}`), "") || "01";
          return {
            id: item.consignmentId || item.id,
            landlordId: item.landlordName || "Chủ nhà Ocean Park",
            building: item.building,
            floor: item.floor,
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
            inspectDueAt: new Date(new Date(item.createdAt || Date.now()).getTime() + 48 * 3600000).toISOString(),
            furnishing: item.report?.furnishing || "full",
            lock: "smart",
            items: [],
            note: item.note || undefined,
            report: item.report
              ? {
                  furnishing: item.report.furnishing || "full",
                  netAreaM2: item.report.netAreaM2 || item.carpetAreaM2 || 45,
                  inventory: Array.isArray(item.report.inventory) ? item.report.inventory : [],
                  declared: Array.isArray(item.report.declared)
                    ? item.report.declared
                    : [
                        { field: "identity", ok: true },
                        { field: "layout", ok: true },
                        { field: "areaM2", ok: true },
                        { field: "furnishing", ok: true },
                        { field: "lock", ok: true },
                      ],
                  recommendation: item.report.recommendation || "approve",
                  note: item.report.note || "",
                  submittedAt: item.report.submittedAt || new Date().toISOString(),
                  hostId: item.report.hostId || item.hostId || "host-s2",
                }
              : undefined,
          };
        });

        if (!unmounted) setDbItems(mapped);
      } catch {
        // ignore offline
      }
    }
    loadDbConsignments();
    return () => {
      unmounted = true;
    };
  }, []);

  if (!state.ready || !now) return <div className="skeleton" style={{ height: 360 }} />;

  // Hợp nhất dữ liệu mock và dữ liệu thực từ Database (ưu tiên dữ liệu từ DB)
  const allConsignments = [...state.consignments];
  for (const dbItem of dbItems) {
    const existingIdx = allConsignments.findIndex(
      (c) => c.id === dbItem.id || (c.building === dbItem.building && c.floor === dbItem.floor && c.door === dbItem.door)
    );
    if (existingIdx >= 0) {
      allConsignments[existingIdx] = { ...allConsignments[existingIdx], ...dbItem };
    } else {
      allConsignments.push(dbItem);
    }
  }

  const reviewing = allConsignments.filter((c) => c.status === "reviewing");
  const inspecting = allConsignments.filter((c) => c.status === "awaiting_host" || c.status === "inspecting");
  const overdueCount = inspecting.filter((c) => isInspectOverdue(c, now)).length;
  const exiting = Object.values(state.mandates).filter((m) => m.status === "exiting");
  const units = UNITS.filter((u) => (zone === "all" || u.zoneId === zone) && (status === "all" || unitDisplayStatus(state, u) === status) && (lock === "all" || u.lock === lock));

  return (
    <div className={styles.page}>
      <PageHeader title="Căn hộ và ký gửi" description="Rổ hàng ký gửi độc quyền: chi phí kiểm định một lần khi tiếp nhận, không môi giới ngoài." />

      <div className={styles.tabs} role="tablist">
        <button type="button" role="tab" aria-selected={tab === "units"} onClick={() => setTab("units")}>
          Rổ hàng ({UNITS.length})
        </button>
        <button type="button" role="tab" aria-selected={tab === "requests"} onClick={() => setTab("requests")}>
          Yêu cầu ký gửi {allConsignments.length > 0 && <i>{allConsignments.length}</i>}
        </button>
        <button type="button" role="tab" aria-selected={tab === "exit"} onClick={() => setTab("exit")}>
          Thoát uỷ quyền 15 ngày {exiting.length > 0 && <i>{exiting.length}</i>}
        </button>
      </div>

      {tab === "units" && (
        <>
          <div className={styles.tools}>
            <select className="select" value={zone} onChange={(e) => setZone(e.target.value)} aria-label="Lọc theo phân khu">
              <option value="all">Mọi phân khu</option>
              {ZONES.map((z) => (
                <option key={z.id} value={z.id}>
                  {z.name}
                </option>
              ))}
            </select>
            <select className="select" value={status} onChange={(e) => setStatus(e.target.value as UnitDisplayStatus | "all")} aria-label="Lọc theo trạng thái">
              <option value="all">Mọi trạng thái</option>
              <option value="available">Còn trống</option>
              <option value="viewing">Có khách xem</option>
              <option value="holding">Đang giữ căn</option>
              <option value="rented">Đã cho thuê</option>
              <option value="archived">Đã lưu trữ / Ngừng niêm yết</option>
            </select>
            <select className="select" value={lock} onChange={(e) => setLock(e.target.value as "all" | "smart" | "physical")} aria-label="Lọc theo loại khoá">
              <option value="all">Mọi loại khoá</option>
              <option value="smart">Khoá điện tử</option>
              <option value="physical">Chìa cơ</option>
            </select>
            <span className="muted small">{units.length} căn</span>
          </div>
          <DataTable<Unit>
            columns={
              [
                {
                  key: "unit",
                  header: "Căn hộ",
                  render: (u) => (
                    <>
                      <b>{unitAddress(u)}</b>
                      <span className="muted xs" style={{ display: "block" }}>
                        {u.code}
                      </span>
                    </>
                  ),
                },
                {
                  key: "zone",
                  header: "Phân khu · Host",
                  render: (u) => (
                    <>
                      {zoneById(u.zoneId).short}
                      <span className="muted xs" style={{ display: "block" }}>
                        {hostForUnit(u).name}
                      </span>
                    </>
                  ),
                },
                { key: "layout", header: "Loại", render: (u) => `${u.layoutLabel} · ${u.areaM2}m²` },
                { key: "rent", header: "Giá thuê", align: "right", render: (u) => vnd(u.rent) },
                { key: "allin", header: "All-in", align: "right", render: (u) => vnd(allInCost(u, DEFAULT_HOUSEHOLD).total) },
                {
                  key: "status",
                  header: "Trạng thái",
                  render: (u) => {
                    const s = unitDisplayStatus(state, u);
                    const m = state.mandates[u.id];
                    let badgeEl = <span className="badge badge-kelp">Còn trống</span>;
                    if (s === "viewing") {
                      badgeEl = <span className="badge badge-amber-soft">Có khách xem</span>;
                    } else if (s === "holding") {
                      badgeEl = <span className="badge badge-amber-soft">Đang giữ căn</span>;
                    } else if (s === "rented") {
                      badgeEl = <span className="badge badge-ink">Đã cho thuê</span>;
                    } else if (s === "archived") {
                      badgeEl = <span className="badge badge-plain" style={{ background: "var(--neutral-100)", color: "var(--neutral-600)" }}>📁 Đã lưu trữ</span>;
                    }
                    return (
                      <>
                        {badgeEl}
                        {m?.status === "exiting" && (
                          <span className="badge badge-coral-soft" style={{ marginLeft: 6 }}>
                            <Timer size={12} /> Đang thoát
                          </span>
                        )}
                      </>
                    );
                  },
                },
                {
                  key: "lock",
                  header: "Khoá",
                  render: (u) => (
                    <span className="badge badge-plain">
                      {u.lock === "smart" ? <Smartphone size={12} /> : <KeyRound size={12} />} {u.lock === "smart" ? "Điện tử" : "Chìa cơ"}
                    </span>
                  ),
                },
                { key: "landlord", header: "Chủ nhà", render: (u) => landlordById(u.landlordId)?.name },
              ] satisfies DataTableColumn<Unit>[]
            }
            rows={units}
            rowHref={(u) => `/admin/inventory/${u.id}`}
            empty={<span className="muted">Không có căn nào khớp bộ lọc.</span>}
          />
        </>
      )}

      {tab === "requests" && (
        <>
          <div className="card" style={{ marginBottom: "var(--space-3)", display: "flex", gap: "var(--space-3)", flexWrap: "wrap", alignItems: "center", justifyContent: "space-between" }}>
            <div>
              <b>Chờ duyệt:</b> {reviewing.length} căn · <b>Đang thẩm định:</b> {inspecting.length} căn
              {overdueCount > 0 && (
                <span className="badge badge-coral-soft" style={{ marginLeft: 8 }}>
                  <Timer size={12} /> {overdueCount} quá hạn
                </span>
              )}
            </div>
            <span className="muted small">Host kiểm tra thực tế trong 48h trước khi Admin chốt.</span>
          </div>

          {allConsignments.length === 0 && <div className={styles.empty}>Chưa có yêu cầu ký gửi.</div>}
          <div className={styles.reqs}>
            {allConsignments.map((c) => {
              const summary = c.report ? inspectionSummary(c.report) : null;
              const host = c.hostId ? hostById(c.hostId) : null;
              const elapsedMin = Math.round((now - new Date(c.signedAt || c.createdAt).getTime()) / 60000);
              const isSlaBreached = c.slaBreached || (c.status === "awaiting_host" && elapsedMin >= 120);
              const isOpenPool = c.openPoolAt || (c.status === "awaiting_host" && elapsedMin >= 30);

              return (
                <article key={c.id} className={`card ${styles.req}`}>
                  <div style={{ display: "flex", justifyContent: "space-between", gap: 10, alignItems: "flex-start", flexWrap: "wrap" }}>
                    <div>
                      <h3>
                        <Link href={`/admin/inventory/${c.id}`} className="link" style={{ textDecoration: "none" }}>
                          {c.building} · Tầng {c.floor} · Căn {c.door}
                        </Link>
                      </h3>
                      <p className="muted small">{landlordById(c.landlordId)?.name}</p>
                    </div>
                    <div style={{ display: "flex", gap: 6, alignItems: "center", flexWrap: "wrap" }}>
                      {isSlaBreached && (
                        <span className="badge badge-coral-soft" style={{ display: "inline-flex", alignItems: "center", gap: 4, fontWeight: 700 }} title="Quá 2 giờ chưa có Host nhận, hệ thống đã leo thang sang Area Lead">
                          <AlertTriangle size={12} /> Quá SLA 2h
                        </span>
                      )}
                      {!isSlaBreached && isOpenPool && (
                        <span className="badge badge-amber-soft" style={{ display: "inline-flex", alignItems: "center", gap: 4 }} title="Đã quá 30 phút, mở quyền nhận tự do cho các Host phân khu lân cận">
                          🌐 Open Pool (&gt;30p)
                        </span>
                      )}
                      <StatusBadge tone={CONSIGN_STATUS_META[c.status].tone}>{CONSIGN_STATUS_META[c.status].label}</StatusBadge>
                    </div>
                  </div>
                  <dl className={styles.reqMeta}>
                    <div>
                      <dt>Loại căn</dt>
                      <dd>
                        {LAYOUT_LABEL[c.layout]} · {c.areaM2} m²
                      </dd>
                    </div>
                    <div>
                      <dt>Giá chào thuê</dt>
                      <dd>{vnd(c.askRent)}đ/tháng</dd>
                    </div>
                    <div>
                      <dt>Nội thất</dt>
                      <dd>{FURNISHING_LABEL[c.furnishing]}</dd>
                    </div>
                    <div>
                      <dt>Khoá cửa</dt>
                      <dd>{c.lock === "smart" ? "Khoá điện tử (mã hoá AES-256)" : "Chìa cơ gửi quầy phân khu"}</dd>
                    </div>
                    <div>
                      <dt>Host phụ trách</dt>
                      <dd>
                        {host ? host.name : "Chưa gán"}
                        {c.adminOverriddenBy ? <span className="muted small"> (Admin chỉ định)</span> : ""}
                      </dd>
                    </div>
                    <div>
                      <dt>Độ mới TB</dt>
                      <dd>{summary ? `${summary.avgCondition}%` : "—"}</dd>
                    </div>
                    <div>
                      <dt>Gửi lúc</dt>
                      <dd>{fmtDate(c.createdAt)}</dd>
                    </div>
                  </dl>
                  {c.note && <p className="small muted">Ghi chú: {c.note}</p>}
                  {c.report && (
                    <p className="small" style={{ marginTop: "var(--space-2)" }}>
                      <b>Đề xuất từ Host:</b>{" "}
                      <span className={c.report.recommendation === "approve" ? "text-ok" : "text-danger"}>
                        {c.report.recommendation === "approve" ? "Đủ điều kiện nhận ký gửi" : "Không khuyến nghị nhận"}
                      </span>
                      {c.report.note ? ` — ${c.report.note}` : ""}
                    </p>
                  )}
                  {c.status === "reviewing" && (
                    <div className={styles.reqActions}>
                      <button
                        type="button"
                        className="btn btn-quiet"
                        onClick={() => {
                          setRejecting(c);
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
                            setDbItems((prev) => prev.map((item) => (item.id === c.id ? { ...item, status: "approved" } : item)));
                            toast("Đã nhận ký gửi và niêm yết căn hộ lên hệ thống cho thuê.", "success");
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
                    <div className={styles.reqActions} style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                      <button
                        type="button"
                        className="btn btn-quiet"
                        onClick={() => {
                          setRejecting(c);
                          setNote("Thông tin căn hộ không hợp lệ hoặc chủ nhà yêu cầu huỷ");
                          setRejectError("");
                        }}
                      >
                        <X size={16} /> Từ chối
                      </button>
                      <button
                        type="button"
                        className="btn btn-outline btn-sm"
                        style={{ display: "inline-flex", alignItems: "center", gap: 5 }}
                        onClick={() => {
                          setOverrideConsignment(c);
                          setTargetHostId(c.hostId || "H01");
                        }}
                        title="Admin có quyền can thiệp thủ công chỉ định Host phụ trách"
                      >
                        <UserCheck size={14} /> Chỉ định Host (Override)
                      </button>
                      <span className="muted small" style={{ marginLeft: "auto" }}>
                        {c.status === "awaiting_host" ? "Chờ Host nhận ca" : "Đang thẩm định thực tế"}
                      </span>
                    </div>
                  )}
                </article>
              );
            })}
          </div>
        </>
      )}

      {tab === "exit" && (
        <>
          {exiting.length === 0 && <div className={styles.empty}>Không có căn nào đang đếm ngược thoát uỷ quyền.</div>}
          <div className={styles.reqs}>
            {exiting.map((m) => {
              const u = unitById(m.unitId)!;
              const days = Math.max(0, Math.ceil((new Date(m.exitEffectiveAt!).getTime() - now) / 86_400_000));
              return (
                <article key={m.unitId} className={`card ${styles.req}`}>
                  <div style={{ display: "flex", justifyContent: "space-between", gap: 10 }}>
                    <div>
                      <h3>
                        <Link href={`/admin/inventory/${u.id}`} className="link" style={{ textDecoration: "none" }}>
                          {unitAddress(u)}
                        </Link>
                      </h3>
                      <p className="muted small">{landlordById(u.landlordId)?.name}</p>
                    </div>
                    <span className="badge badge-coral-soft">
                      <Timer size={12} /> Còn {days} ngày
                    </span>
                  </div>
                  <dl className={styles.reqMeta}>
                    <div>
                      <dt>Yêu cầu lúc</dt>
                      <dd>{fmtDate(m.exitRequestedAt!)}</dd>
                    </div>
                    <div>
                      <dt>Hiệu lực</dt>
                      <dd>{fmtDate(m.exitEffectiveAt!)}</dd>
                    </div>
                  </dl>
                  <p className="small muted">Hết hạn, căn tự chuyển “unlisted”, mã cửa và chìa cơ bị thu hồi khỏi mạng lưới Host. Trong thời gian này căn vẫn hiển thị để đón nốt khách.</p>
                  <div style={{ marginTop: 10, display: "flex", justifyContent: "flex-end" }}>
                    <Link href={`/admin/contracts/mandate.${u.id}`} className="link small">
                      Xem hợp đồng →
                    </Link>
                  </div>
                </article>
              );
            })}
          </div>
        </>
      )}

      <Modal
        open={!!rejecting}
        onClose={() => {
          setRejecting(null);
          setRejectError("");
        }}
        variant="sheet"
        title="Từ chối yêu cầu ký gửi"
        footer={
          <button
            type="button"
            className="btn btn-danger btn-block"
            onClick={async () => {
              if (!rejecting) return;
              try {
                await fetch(`/api/v1/admin/consignments/${rejecting.id}/reject`, {
                  method: "POST",
                  headers: { "Content-Type": "application/json" },
                  credentials: "same-origin",
                  body: JSON.stringify({ note: note || "Từ chối ký gửi" }),
                });
              } catch {
                // ignore
              }
              const res = rejectConsignment(rejecting.id, note, DEMO_USERS.admin.name);
              if (!res.ok) {
                if (res.reason === "invalid_note") {
                  setRejectError("Lý do từ chối phải có ít nhất 5 ký tự.");
                } else {
                  setRejectError(res.reason);
                }
                return;
              }
              setDbItems((prev) => prev.map((item) => (item.id === rejecting.id ? { ...item, status: "rejected", note } : item)));
              setRejecting(null);
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

      {overrideConsignment && (
        <Modal
          open={!!overrideConsignment}
          onClose={() => setOverrideConsignment(null)}
          title="Chỉ định Field Host (Manual Override)"
          footer={
            <button
              type="button"
              className="btn btn-primary"
              onClick={() => {
                const res = adminAssignConsignment(overrideConsignment.id, targetHostId, DEMO_USERS.admin.name);
                if (res.ok) {
                  setDbItems((prev) =>
                    prev.map((item) =>
                      item.id === overrideConsignment.id ? { ...item, hostId: targetHostId, adminOverriddenBy: DEMO_USERS.admin.name } : item
                    )
                  );
                  toast(`Đã chỉ định hồ sơ cho Host ${hostById(targetHostId)?.name || targetHostId}`, "success");
                  setOverrideConsignment(null);
                } else {
                  toast(`Lỗi: ${res.reason}`);
                }
              }}
            >
              Xác nhận chỉ định
            </button>
          }
        >
          <div style={{ display: "flex", flexDirection: "column", gap: "var(--space-3)" }}>
            <p className="small muted" style={{ margin: 0 }}>
              Hồ sơ: <b>{overrideConsignment.building} · Tầng {overrideConsignment.floor} · Căn {overrideConsignment.door}</b>.
              Quản trị viên có toàn quyền can thiệp chỉ định Field Host trực ca để giải phóng tình trạng trễ hẹn thẩm định của chủ nhà.
            </p>
            <label className="field">
              <span className="label">Chọn Field Host phụ trách</span>
              <select
                className="select"
                value={targetHostId}
                onChange={(e) => setTargetHostId(e.target.value)}
              >
                {ZONES.map((z) => (
                  <option key={z.hostId} value={z.hostId}>
                    {hostById(z.hostId)?.name} ({z.name} - {z.hostId})
                  </option>
                ))}
              </select>
            </label>
          </div>
        </Modal>
      )}
    </div>
  );
}

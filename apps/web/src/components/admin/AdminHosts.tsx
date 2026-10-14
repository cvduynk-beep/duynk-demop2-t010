"use client";

import Link from "next/link";
import { useState } from "react";
import {
  Activity,
  AlertTriangle,
  CheckCircle2,
  ChevronDown,
  Compass,
  Lock,
  MapPin,
  RotateCcw,
  Search,
  Shield,
  SlidersHorizontal,
  Unlock,
  UserCheck,
  UserPlus,
  Users,
  X,
} from "lucide-react";
import { DataTable, type DataTableColumn } from "@/components/ui/DataTable";
import { Modal } from "@/components/ui/Modal";
import { PageHeader } from "@/components/ui/PageHeader";
import { toast } from "@/components/ui/Toast";
import { apiErrorText } from "@/lib/apiClient";
import { fmtPhone, initials, vnd } from "@/lib/format";
import {
  ACCEPT_SLA_SECONDS,
  adminHostsApi,
  HOST_STATUS_META,
  hostDisplayStatus,
  hostErrorText,
  invalidateHosts,
  mmss,
  ROLE_CHOICE_LABEL,
  rolesOfChoice,
  setHostActive,
  useHostList,
  useHostZones,
  type HostAdminView,
  type HostDisplayStatus,
  type HostRoleChoice,
} from "@/lib/admin/hosts";
import { AdminQuery } from "./AdminQuery";
import styles from "./Admin.module.css";

/** `sale` = chỉ Sale; `both` = Sale + Thẩm định (backend chỉ có 2 tập vai này). */
type RoleFilter = "all" | "sale" | "both";

export function AdminHosts() {
  // Tải trọn danh sách một lần: KPI cần tổng, số Host nhỏ nên lọc tại client.
  const query = useHostList({});
  const [invite, setInvite] = useState(false);
  return (
    <>
      <AdminQuery query={query} title="Không tải được danh sách Field Host">
        {(hosts) => <HostsBody hosts={hosts} onInvite={() => setInvite(true)} />}
      </AdminQuery>
      <InviteModal open={invite} onClose={() => setInvite(false)} />
    </>
  );
}

function HostsBody({ hosts, onInvite }: { hosts: HostAdminView[]; onInvite: () => void }) {
  const [q, setQ] = useState("");
  const [status, setStatus] = useState<HostDisplayStatus | "all">("all");
  const [zone, setZone] = useState("all");
  const [roleFilter, setRoleFilter] = useState<RoleFilter>("all");
  const [toggling, setToggling] = useState<string | null>(null);

  const zones = Array.from(new Set(hosts.map((h) => h.assignedZone))).sort();
  const isBoth = (h: HostAdminView) => h.roles.includes("inspector");
  const needle = q.trim().toLowerCase();
  const digits = needle.replace(/\D/g, "");
  const list = hosts.filter(
    (h) =>
      (status === "all" || hostDisplayStatus(h) === status) &&
      (zone === "all" || h.assignedZone === zone) &&
      (roleFilter === "all" || (roleFilter === "both" ? isBoth(h) : !isBoth(h))) &&
      (needle === "" ||
        h.fullName?.toLowerCase().includes(needle) ||
        h.email?.toLowerCase().includes(needle) ||
        (digits.length >= 3 && h.phone?.replace(/\D/g, "").includes(digits))),
  );

  const count = (s: HostDisplayStatus) => hosts.filter((h) => hostDisplayStatus(h) === s).length;
  const totalCount = hosts.length;
  const activeCount = count("active");
  const busyCount = count("busy");
  const offDutyCount = count("off_duty");
  const suspendedCount = count("suspended");
  const saleCount = hosts.filter((h) => h.roles.includes("sale")).length;
  const inspectorCount = hosts.filter(isBoth).length;

  const toggle = async (h: HostAdminView) => {
    setToggling(h.id);
    const res = await setHostActive(h.id, !h.isActive);
    setToggling(null);
    if (!res.ok) return toast(hostErrorText(res));
    toast(
      h.isActive
        ? `Đã tạm đóng tài khoản ${h.fullName ?? h.email}. Host không đăng nhập được và ngừng nhận ca.`
        : `Đã mở lại tài khoản ${h.fullName ?? h.email}.`,
      h.isActive ? "info" : "success",
    );
    invalidateHosts();
  };

  const isFiltered = q !== "" || status !== "all" || zone !== "all" || roleFilter !== "all";

  const handleResetFilters = () => {
    setQ("");
    setStatus("all");
    setZone("all");
    setRoleFilter("all");
  };

  return (
    <div className={styles.page}>
      <PageHeader
        title="Danh sách Field Host"
        description="Mạng lưới Host đón tại sảnh & thẩm định căn hộ nội khu · Thù lao biến phí theo hiệu quả, 0đ lương cứng"
        actions={
          <button type="button" className="btn btn-primary" onClick={onInvite}>
            <UserPlus size={17} /> Thêm Field Host
          </button>
        }
      />

      {/* Chuyển đổi nhanh giữa Danh sách Host và Chính sách Biến phí */}
      <div className={styles.adminSubNavStrip}>
        <Link href="/admin/hosts" className={`${styles.adminSubNavLink} ${styles.adminSubNavLinkActive}`}>
          <Users size={15} />
          <span>Danh sách Field Host</span>
          <span className={styles.subCountBadge}>{totalCount}</span>
        </Link>
        <Link href="/admin/commission" className={styles.adminSubNavLink}>
          <SlidersHorizontal size={15} />
          <span>Chính sách Biến phí & Thù lao</span>
        </Link>
      </div>

      {/* 1. Dải KPI thể hiện trực quan sức khỏe đội ngũ thực địa */}
      <div className={styles.kpiSummaryStrip}>
        <div className={styles.kpiCard}>
          <div className={styles.kpiIconWrap} style={{ background: "rgba(14, 82, 99, 0.08)", color: "#0e5263" }}>
            <Users size={20} />
          </div>
          <div>
            <div className={styles.kpiVal}>{totalCount} Field Host</div>
            <div className={styles.kpiLabel}>{saleCount} Sale · {inspectorCount} Thẩm định</div>
          </div>
        </div>

        <div className={styles.kpiCard}>
          <div className={styles.kpiIconWrap} style={{ background: "rgba(16, 185, 129, 0.12)", color: "#10b981" }}>
            <Activity size={20} />
          </div>
          <div>
            <div className={styles.kpiVal} style={{ color: "#047857" }}>{activeCount} Đang trực</div>
            <div className={styles.kpiLabel}>Sẵn sàng đón khách tại sảnh</div>
          </div>
        </div>

        <div className={styles.kpiCard}>
          <div className={styles.kpiIconWrap} style={{ background: "rgba(245, 158, 11, 0.12)", color: "#d97706" }}>
            <Compass size={20} />
          </div>
          <div>
            <div className={styles.kpiVal} style={{ color: "#b45309" }}>{busyCount} Đang bận</div>
            <div className={styles.kpiLabel}>Đang dẫn xem thực địa</div>
          </div>
        </div>

        <div className={styles.kpiCard}>
          <div className={styles.kpiIconWrap} style={{ background: "rgba(148, 163, 184, 0.15)", color: "#64748b" }}>
            <UserCheck size={20} />
          </div>
          <div>
            <div className={styles.kpiVal} style={{ color: "#475569" }}>{offDutyCount} Nghỉ ca</div>
            <div className={styles.kpiLabel}>Chưa nhận ca trực hôm nay</div>
          </div>
        </div>
      </div>

      {/* 2. Thanh tính năng & Bộ lọc chuyên nghiệp (Pro Filter Toolbar) */}
      <div className={styles.filterToolbar}>
        {/* Hàng trên: Ô tìm kiếm đa năng + Dropdowns phân loại */}
        <div className={styles.filterMainRow}>
          <div className={styles.searchBox}>
            <Search size={17} className={styles.searchIcon} />
            <input
              type="text"
              placeholder="Tìm theo tên, email hoặc số điện thoại..."
              value={q}
              onChange={(e) => setQ(e.target.value)}
              aria-label="Tìm theo tên, email hoặc số điện thoại"
            />
            {q && (
              <button
                type="button"
                className={styles.clearSearchBtn}
                onClick={() => setQ("")}
                title="Xóa tìm kiếm"
                aria-label="Xóa từ khóa tìm kiếm"
              >
                <X size={14} />
              </button>
            )}
          </div>

          <div className={styles.filterControls}>
            {/* Bộ lọc phân khu */}
            <div className={styles.selectBox}>
              <MapPin size={15} className={styles.selectIcon} />
              <select
                value={zone}
                onChange={(e) => setZone(e.target.value)}
                aria-label="Lọc theo phân khu"
              >
                <option value="all">Tất cả phân khu</option>
                {zones.map((z) => (
                  <option key={z} value={z}>
                    {z}
                  </option>
                ))}
              </select>
              <ChevronDown size={15} className={styles.selectChevron} />
            </div>

            {/* Bộ lọc vai trò */}
            <div className={styles.selectBox}>
              <Shield size={15} className={styles.selectIcon} />
              <select
                value={roleFilter}
                onChange={(e) => setRoleFilter(e.target.value as RoleFilter)}
                aria-label="Lọc theo vai trò"
              >
                <option value="all">Tất cả vai trò</option>
                <option value="sale">Chỉ Sale (Dẫn khách)</option>
                <option value="both">Sale + Thẩm định</option>
              </select>
              <ChevronDown size={15} className={styles.selectChevron} />
            </div>

            {/* Bộ lọc trạng thái */}
            <div className={styles.selectBox}>
              <Activity size={15} className={styles.selectIcon} />
              <select
                value={status}
                onChange={(e) => setStatus(e.target.value as HostDisplayStatus | "all")}
                aria-label="Lọc theo trạng thái"
              >
                <option value="all">Tất cả trạng thái</option>
                <option value="active">Đang trực</option>
                <option value="busy">Đang bận</option>
                <option value="off_duty">Nghỉ ca</option>
                <option value="suspended">Tạm đóng</option>
              </select>
              <ChevronDown size={15} className={styles.selectChevron} />
            </div>
          </div>
        </div>

        {/* Hàng dưới: Lọc nhanh 1-chạm (Segmented Pills) + Thống kê kết quả */}
        <div className={styles.filterQuickRow}>
          <div className={styles.segmentedPills} role="tablist" aria-label="Lọc nhanh trạng thái">
            <button
              type="button"
              className={`${styles.pillBtn} ${status === "all" ? styles.pillBtnActive : ""}`}
              onClick={() => setStatus("all")}
            >
              Tất cả ({totalCount})
            </button>
            <button
              type="button"
              className={`${styles.pillBtn} ${status === "active" ? styles.pillBtnActive : ""}`}
              onClick={() => setStatus("active")}
            >
              <span className={`${styles.statusDot} ${styles.dotActive}`} />
              Đang trực ({activeCount})
            </button>
            <button
              type="button"
              className={`${styles.pillBtn} ${status === "busy" ? styles.pillBtnActive : ""}`}
              onClick={() => setStatus("busy")}
            >
              <span className={`${styles.statusDot} ${styles.dotBusy}`} />
              Đang bận ({busyCount})
            </button>
            <button
              type="button"
              className={`${styles.pillBtn} ${status === "off_duty" ? styles.pillBtnActive : ""}`}
              onClick={() => setStatus("off_duty")}
            >
              <span className={`${styles.statusDot} ${styles.dotOff}`} />
              Nghỉ ca ({offDutyCount})
            </button>
            {suspendedCount > 0 && (
              <button
                type="button"
                className={`${styles.pillBtn} ${status === "suspended" ? styles.pillBtnActive : ""}`}
                onClick={() => setStatus("suspended")}
                style={{ color: status === "suspended" ? "#991b1b" : "var(--danger)" }}
              >
                <Lock size={12} />
                Tạm đóng ({suspendedCount})
              </button>
            )}
          </div>

          <div className={styles.filterSummary}>
            <span className={styles.resultsCount}>
              Hiển thị <strong>{list.length}</strong> / {totalCount} Field Host
            </span>
            {isFiltered && (
              <button
                type="button"
                className={styles.resetBtn}
                onClick={handleResetFilters}
                title="Xóa tất cả bộ lọc"
              >
                <RotateCcw size={13} /> Đặt lại bộ lọc
              </button>
            )}
          </div>
        </div>
      </div>

      <DataTable<HostAdminView>
        columns={
          [
            {
              key: "host",
              header: "Field Host",
              render: (h) => (
                <span className={styles.person}>
                  <span className={styles.avatar}>{initials(h.fullName ?? h.email ?? "?")}</span>
                  <span>
                    <b>{h.fullName ?? "—"}</b>
                    <span className="muted xs">{h.phone ? fmtPhone(h.phone) : h.email}</span>
                  </span>
                </span>
              ),
            },
            { key: "zone", header: "Phân khu", render: (h) => h.assignedZone },
            {
              key: "roles",
              header: "Vai",
              render: (h) => (
                <div style={{ display: "flex", gap: 4, flexWrap: "wrap" }}>
                  <span className="badge badge-kelp">Sale</span>
                  {isBoth(h) && <span className="badge badge-plain">Thẩm định</span>}
                </div>
              ),
            },
            {
              key: "status",
              header: "Trạng thái",
              render: (h) => {
                const st = hostDisplayStatus(h);
                if (st === "suspended") {
                  return (
                    <span
                      className="badge"
                      style={{
                        background: "var(--danger-050)",
                        color: "var(--danger)",
                        border: "1px solid #fecaca",
                        display: "inline-flex",
                        alignItems: "center",
                        gap: 4,
                        fontWeight: 600,
                      }}
                    >
                      <Lock size={11} /> Tạm đóng
                    </span>
                  );
                }
                return <span className={`badge ${HOST_STATUS_META[st].badge}`}>{HOST_STATUS_META[st].label}</span>;
              },
            },
            { key: "tickets", header: "Ca đã dẫn", align: "right", render: (h) => h.stats.completedViewings },
            { key: "deals", header: "Deal", align: "right", render: (h) => h.stats.deals },
            {
              key: "accept",
              header: "Nhận ca TB",
              render: (h) => {
                const sec = h.stats.avgAcceptSeconds;
                if (sec === null) return <span className="muted">—</span>;
                const slow = sec > ACCEPT_SLA_SECONDS;
                return (
                  <span className={`${slow ? styles.warnText : styles.okText} tnum`}>
                    {slow ? <AlertTriangle size={14} aria-label="Vượt SLA" /> : <CheckCircle2 size={14} aria-label="Đạt SLA" />}
                    {mmss(sec)}
                  </span>
                );
              },
            },
            {
              key: "noshow",
              header: "Bỏ hẹn",
              align: "right",
              render: (h) => (h.stats.noShowRate === null ? "—" : `${String(h.stats.noShowRate).replace(".", ",")}%`),
            },
            { key: "rating", header: "Đánh giá", align: "right", render: (h) => `${String(h.rating).replace(".", ",")}★` },
            { key: "earn", header: "Thu nhập tuần", align: "right", render: (h) => <b>{vnd(h.stats.weekEarnings)}đ</b> },
            {
              key: "actions",
              header: "Thao tác",
              render: (h) => {
                const suspended = !h.isActive;
                return (
                  <button
                    type="button"
                    className={`btn btn-xs ${suspended ? "btn-primary" : "btn-quiet"}`}
                    style={
                      suspended
                        ? { padding: "3px 8px", fontSize: 12 }
                        : { padding: "3px 8px", fontSize: 12, color: "var(--danger)", border: "1px solid #fecaca" }
                    }
                    disabled={toggling === h.id || (!suspended && h.stats.openTickets > 0)}
                    title={
                      !suspended && h.stats.openTickets > 0
                        ? `Host đang có ${h.stats.openTickets} ca chạy — điều phối lại trước khi khoá`
                        : suspended
                          ? "Mở lại tài khoản Field Host"
                          : "Tạm đóng tài khoản Field Host"
                    }
                    onClick={(e) => {
                      e.stopPropagation();
                      e.preventDefault();
                      toggle(h);
                    }}
                  >
                    {suspended ? (
                      <span style={{ display: "inline-flex", alignItems: "center", gap: 4 }}>
                        <Unlock size={11} /> Mở lại
                      </span>
                    ) : (
                      <span style={{ display: "inline-flex", alignItems: "center", gap: 4 }}>
                        <Lock size={11} /> Tạm đóng
                      </span>
                    )}
                  </button>
                );
              },
            },
          ] satisfies DataTableColumn<HostAdminView>[]
        }
        rows={list}
        rowHref={(h) => `/admin/hosts/${h.id}`}
        empty={<span className="muted">Không có Host nào khớp bộ lọc.</span>}
      />
    </div>
  );
}

/** Admin tạo tài khoản Field Host (email đăng nhập Google hoặc mật khẩu ban đầu); Host tự xác thực SĐT trong hồ sơ. */
function InviteModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const zonesQuery = useHostZones();
  const zones = zonesQuery.state.status === "ready" ? zonesQuery.state.data : [];
  const [email, setEmail] = useState("");
  const [name, setName] = useState("");
  const [zone, setZone] = useState("");
  const [choice, setChoice] = useState<HostRoleChoice>("sale");
  const [password, setPassword] = useState("");
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);

  const reset = () => {
    setEmail("");
    setName("");
    setZone("");
    setChoice("sale");
    setPassword("");
    setErr("");
  };

  const submit = async () => {
    const assignedZone = zone || zones[0] || "";
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) return setErr("Nhập email hợp lệ.");
    if (name.trim().length < 2) return setErr("Nhập họ tên Field Host.");
    if (!assignedZone) return setErr("Chọn phân khu phụ trách.");
    if (password && password.length < 8) return setErr("Mật khẩu ban đầu tối thiểu 8 ký tự (hoặc bỏ trống để chỉ đăng nhập Google).");
    setBusy(true);
    const res = await adminHostsApi.create({
      email: email.trim(),
      fullName: name.trim(),
      assignedZone,
      roles: rolesOfChoice(choice),
      ...(password ? { password } : {}),
    });
    setBusy(false);
    if (!res.ok) return setErr(res.code ? hostErrorText(res) : apiErrorText(res, "Chưa tạo được Field Host."));
    toast(`Đã thêm Field Host ${name.trim()} (${ROLE_CHOICE_LABEL[choice]}).`, "success");
    invalidateHosts();
    reset();
    onClose();
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      variant="sheet"
      title="Thêm Field Host"
      description="Host đăng nhập bằng email này (Google hoặc mật khẩu ban đầu) và tự xác thực SĐT trong hồ sơ."
      footer={
        <button type="button" className="btn btn-primary btn-block" onClick={submit} disabled={busy}>
          {busy ? "Đang tạo…" : "Tạo tài khoản"}
        </button>
      }
    >
      <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
        <label className="field">
          <span className="label">Email đăng nhập</span>
          <input className="input" type="email" value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="off" />
        </label>
        <label className="field">
          <span className="label">Họ và tên</span>
          <input className="input" value={name} onChange={(e) => setName(e.target.value)} />
        </label>
        <label className="field">
          <span className="label">Phân khu phụ trách</span>
          <select className="select" value={zone || zones[0] || ""} onChange={(e) => setZone(e.target.value)}>
            {zones.map((z) => (
              <option key={z} value={z}>
                {z}
              </option>
            ))}
          </select>
        </label>

        <div className="field">
          <span className="label">Vai đảm nhiệm</span>
          <div style={{ display: "flex", gap: 16, marginTop: 4, flexWrap: "wrap" }}>
            {(Object.keys(ROLE_CHOICE_LABEL) as HostRoleChoice[]).map((c) => (
              <label key={c} className="check">
                <input type="radio" name="host-role" checked={choice === c} onChange={() => setChoice(c)} />
                <span>{ROLE_CHOICE_LABEL[c]}</span>
              </label>
            ))}
          </div>
        </div>

        <label className="field">
          <span className="label">Mật khẩu ban đầu (tuỳ chọn, ≥ 8 ký tự)</span>
          <input className="input" type="password" value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="new-password" />
        </label>

        {err && <p className="field-error">{err}</p>}
      </div>
    </Modal>
  );
}

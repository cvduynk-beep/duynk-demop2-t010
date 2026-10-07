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
import { setHostSuspended } from "@/lib/mock/actions";
import { fmtPhone, initials, isValidVnPhone, vnd } from "@/lib/mock/format";
import { hostEarnings, hostRoles, hostStatus, hostZones, isHostSuspended } from "@/lib/mock/selectors";
import { useMock } from "@/lib/mock/store";
import {
  HOSTS,
  ZONES,
  zoneById,
  type FieldHost,
  type HostRole,
  type HostStatus,
} from "@/lib/mock/units";
import styles from "./Admin.module.css";

const STATUS: Record<HostStatus, { label: string; badge: string }> = {
  active: { label: "Đang trực", badge: "badge-kelp" },
  busy: { label: "Đang bận", badge: "badge-amber-soft" },
  off_duty: { label: "Nghỉ ca", badge: "badge-plain" },
  suspended: { label: "Tạm đóng", badge: "badge-plain" },
};

const mm = (s: number) => `${Math.floor(s / 60)}′${String(s % 60).padStart(2, "0")}″`;

type RoleFilter = "all" | "sale" | "inspector" | "both";

export function AdminHosts() {
  const state = useMock();
  const [q, setQ] = useState("");
  const [status, setStatus] = useState<HostStatus | "all">("all");
  const [zone, setZone] = useState("all");
  const [roleFilter, setRoleFilter] = useState<RoleFilter>("all");
  const [invite, setInvite] = useState(false);

  if (!state.ready) return <div className="skeleton" style={{ height: 360 }} />;

  const list = HOSTS.filter((h) => {
    const roles = hostRoles(state, h.id);
    const zones = hostZones(state, h.id);
    const hStatus = hostStatus(state, h.id);
    const roleMatch =
      roleFilter === "all" ||
      (roleFilter === "both" && roles.includes("sale") && roles.includes("inspector")) ||
      (roleFilter === "sale" && roles.includes("sale") && !roles.includes("inspector")) ||
      (roleFilter === "inspector" && roles.includes("inspector") && !roles.includes("sale"));

    return (
      (status === "all" || hStatus === status) &&
      (zone === "all" || zones.includes(zone as never)) &&
      roleMatch &&
      (q === "" ||
        h.name.toLowerCase().includes(q.toLowerCase()) ||
        h.phone.replace(/\s/g, "").includes(q.replace(/\s/g, "")))
    );
  });

  const totalCount = HOSTS.length;
  const activeCount = HOSTS.filter((h) => hostStatus(state, h.id) === "active").length;
  const busyCount = HOSTS.filter((h) => hostStatus(state, h.id) === "busy").length;
  const offDutyCount = HOSTS.filter((h) => hostStatus(state, h.id) === "off_duty").length;
  const suspendedCount = HOSTS.filter((h) => hostStatus(state, h.id) === "suspended").length;
  const saleCount = HOSTS.filter((h) => hostRoles(state, h.id).includes("sale")).length;
  const inspectorCount = HOSTS.filter((h) => hostRoles(state, h.id).includes("inspector")).length;

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
          <button type="button" className="btn btn-primary" onClick={() => setInvite(true)}>
            <UserPlus size={17} /> Mời Field Host
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
              placeholder="Tìm theo tên hoặc số điện thoại..."
              value={q}
              onChange={(e) => setQ(e.target.value)}
              aria-label="Tìm theo tên hoặc số điện thoại"
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
                {ZONES.map((z) => (
                  <option key={z.id} value={z.id}>
                    {z.name}
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
                <option value="sale">Vai trò Sale (Dẫn khách)</option>
                <option value="inspector">Vai trò Thẩm định (Ký gửi)</option>
                <option value="both">Đảm nhiệm cả hai vai</option>
              </select>
              <ChevronDown size={15} className={styles.selectChevron} />
            </div>

            {/* Bộ lọc trạng thái */}
            <div className={styles.selectBox}>
              <Activity size={15} className={styles.selectIcon} />
              <select
                value={status}
                onChange={(e) => setStatus(e.target.value as HostStatus | "all")}
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

      <DataTable<FieldHost>
        columns={
          [
            {
              key: "host",
              header: "Field Host",
              render: (h) => (
                <span className={styles.person}>
                  <span className={styles.avatar}>{initials(h.name)}</span>
                  <span>
                    <b>{h.name}</b>
                    <span className="muted xs">{fmtPhone(h.phone)}</span>
                  </span>
                </span>
              ),
            },
            {
              key: "zone",
              header: "Phân khu",
              render: (h) => hostZones(state, h.id).map((z) => zoneById(z).short).join(", "),
            },
            {
              key: "roles",
              header: "Vai",
              render: (h) => {
                const roles = hostRoles(state, h.id);
                return (
                  <div style={{ display: "flex", gap: 4, flexWrap: "wrap" }}>
                    {roles.includes("sale") && <span className="badge badge-kelp">Sale</span>}
                    {roles.includes("inspector") && (
                      <span className="badge badge-plain">Thẩm định</span>
                    )}
                  </div>
                );
              },
            },
            {
              key: "status",
              header: "Trạng thái",
              render: (h) => {
                const st = hostStatus(state, h.id);
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
                return <span className={`badge ${STATUS[st].badge}`}>{STATUS[st].label}</span>;
              },
            },
            {
              key: "tickets",
              header: "Ticket",
              align: "right",
              render: (h) => hostEarnings(state, h, state.fees).viewings,
            },
            {
              key: "deals",
              header: "Deal",
              align: "right",
              render: (h) => hostEarnings(state, h, state.fees).deals,
            },
            {
              key: "accept",
              header: "Nhận ca TB",
              render: (h) => {
                const slow = h.avgAcceptSec > 180;
                return (
                  <span className={`${slow ? styles.warnText : styles.okText} tnum`}>
                    {slow ? (
                      <AlertTriangle size={14} aria-label="Vượt SLA" />
                    ) : (
                      <CheckCircle2 size={14} aria-label="Đạt SLA" />
                    )}
                    {mm(h.avgAcceptSec)}
                  </span>
                );
              },
            },
            {
              key: "noshow",
              header: "Bỏ hẹn",
              align: "right",
              render: (h) => `${Math.round(h.noShowRate * 100)}%`,
            },
            {
              key: "rating",
              header: "Đánh giá",
              align: "right",
              render: (h) => `${String(h.rating).replace(".", ",")}★`,
            },
            {
              key: "earn",
              header: "Thu nhập tuần",
              align: "right",
              render: (h) => <b>{vnd(hostEarnings(state, h, state.fees).total)}đ</b>,
            },
            {
              key: "actions",
              header: "Thao tác",
              render: (h) => {
                const suspended = isHostSuspended(state, h.id);
                return (
                  <button
                    type="button"
                    className={`btn btn-xs ${suspended ? "btn-primary" : "btn-quiet"}`}
                    style={
                      suspended
                        ? { padding: "3px 8px", fontSize: 12 }
                        : { padding: "3px 8px", fontSize: 12, color: "var(--danger)", border: "1px solid #fecaca" }
                    }
                    title={suspended ? "Mở lại tài khoản Field Host" : "Tạm đóng tài khoản Field Host"}
                    onClick={(e) => {
                      e.stopPropagation();
                      e.preventDefault();
                      const res = setHostSuspended(h.id, !suspended, "Admin");
                      if (res.ok) {
                        toast(
                          !suspended
                            ? `Đã tạm đóng tài khoản ${h.name}. Toàn bộ quyền đã thu hồi và ngừng đổ căn.`
                            : `Đã mở lại tài khoản ${h.name}. Quyền hạn và điều phối đã khôi phục.`,
                          !suspended ? "info" : "success"
                        );
                      }
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
          ] satisfies DataTableColumn<FieldHost>[]
        }
        rows={list}
        rowHref={(h) => `/admin/hosts/${h.id}`}
        empty={<span className="muted">Không có Host nào khớp bộ lọc.</span>}
      />

      <InviteModal open={invite} onClose={() => setInvite(false)} />
    </div>
  );
}

function InviteModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [zone, setZone] = useState<string>(ZONES[0].id);
  const [roles, setRoles] = useState<HostRole[]>(["sale"]);
  const [err, setErr] = useState("");

  const toggleRole = (r: HostRole) => {
    setRoles((prev) => (prev.includes(r) ? prev.filter((x) => x !== r) : [...prev, r]));
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      variant="sheet"
      title="Mời Field Host mới"
      description="Host nhận lời mời qua Zalo, đăng nhập và kích hoạt tài khoản theo vai được gán."
      footer={
        <button
          type="button"
          className="btn btn-primary btn-block"
          onClick={() => {
            if (name.trim().length < 2 || !isValidVnPhone(phone)) {
              setErr("Nhập họ tên và số điện thoại hợp lệ.");
              return;
            }
            if (roles.length === 0) {
              setErr("Chọn ít nhất một vai cho Field Host.");
              return;
            }
            toast(
              `Đã gửi lời mời vai ${roles.map((r) => (r === "sale" ? "Sale" : "Thẩm định")).join(" + ")} qua Zalo tới ${name.trim()}`,
              "success",
            );
            setName("");
            setPhone("");
            setRoles(["sale"]);
            setErr("");
            onClose();
          }}
        >
          Gửi lời mời
        </button>
      }
    >
      <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
        <label className="field">
          <span className="label">Họ và tên</span>
          <input className="input" value={name} onChange={(e) => setName(e.target.value)} />
        </label>
        <label className="field">
          <span className="label">Số điện thoại Zalo</span>
          <input
            className="input"
            type="tel"
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
          />
        </label>
        <label className="field">
          <span className="label">Phân khu phụ trách</span>
          <select className="select" value={zone} onChange={(e) => setZone(e.target.value)}>
            {ZONES.map((z) => (
              <option key={z.id} value={z.id}>
                {z.name}
              </option>
            ))}
          </select>
        </label>

        <div className="field">
          <span className="label">Vai đảm nhiệm</span>
          <div style={{ display: "flex", gap: 16, marginTop: 4 }}>
            <label className="check">
              <input
                type="checkbox"
                checked={roles.includes("sale")}
                onChange={() => toggleRole("sale")}
              />
              <span>Sale (Dẫn khách xem phòng)</span>
            </label>
            <label className="check">
              <input
                type="checkbox"
                checked={roles.includes("inspector")}
                onChange={() => toggleRole("inspector")}
              />
              <span>Thẩm định (Kiểm tra 32 hạng mục)</span>
            </label>
          </div>
        </div>

        {err && <p className="field-error">{err}</p>}
      </div>
    </Modal>
  );
}

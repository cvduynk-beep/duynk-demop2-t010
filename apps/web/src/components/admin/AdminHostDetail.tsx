"use client";

import { useState } from "react";
import { Lock, MapPin, ShieldCheck, Unlock } from "lucide-react";
import { KeyValue } from "@/components/ui/KeyValue";
import { PageHeader } from "@/components/ui/PageHeader";
import { Section } from "@/components/ui/Section";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { toast } from "@/components/ui/Toast";
import { useAdminPayouts } from "@/lib/admin/api";
import { ticketLabel } from "@/lib/admin/bookings";
import {
  ACCEPT_SLA_SECONDS,
  adminHostsApi,
  choiceOfRoles,
  HOST_STATUS_META,
  hostDisplayStatus,
  hostErrorText,
  hostRoleLabel,
  invalidateHosts,
  mmss,
  ROLE_CHOICE_LABEL,
  rolesOfChoice,
  setHostActive,
  useHost,
  useHostZones,
  type HostAdminDetail,
  type HostRoleChoice,
  type TicketStatusKey,
} from "@/lib/admin/hosts";
import { fmtDate, fmtDateTime, fmtPhone, vnd } from "@/lib/format";
import { AdminQuery } from "./AdminQuery";
import styles from "./Admin.module.css";

const TICKET_ORDER: TicketStatusKey[] = ["OFFERED", "ACCEPTED", "CHECKED", "COMPLETED", "EXPIRED", "ESCALATED", "CANCELLED"];

/** Hồ sơ một Field Host — `GET /admin/field-hosts/:id`, sửa qua `PATCH`, khoá qua `DELETE`. */
export function AdminHostDetail({ id }: { id: string }) {
  const query = useHost(id);
  return (
    <div className={styles.page}>
      <AdminQuery query={query} title="Không tải được hồ sơ Field Host" height={420}>
        {(h) => <HostBody h={h} />}
      </AdminQuery>
    </div>
  );
}

function HostBody({ h }: { h: HostAdminDetail }) {
  const [busy, setBusy] = useState(false);
  const status = hostDisplayStatus(h);
  const suspended = !h.isActive;
  const name = h.fullName ?? h.email ?? "Field Host";
  const lockBlocked = !suspended && h.stats.openTickets > 0;

  const toggle = async () => {
    setBusy(true);
    const res = await setHostActive(h.id, suspended);
    setBusy(false);
    if (!res.ok) return toast(hostErrorText(res));
    toast(suspended ? `Đã mở lại tài khoản ${name}.` : `Đã tạm đóng tài khoản ${name}. Host không đăng nhập được và ngừng nhận ca.`, suspended ? "success" : "info");
    invalidateHosts();
  };

  return (
    <>
      <PageHeader
        title={name}
        back={{ href: "/admin/hosts", label: "Field Host" }}
        actions={
          <button
            type="button"
            className={suspended ? "btn btn-primary" : "btn btn-quiet"}
            style={suspended ? {} : { color: "var(--danger)", border: "1px solid #fecaca" }}
            onClick={toggle}
            disabled={busy || lockBlocked}
            title={lockBlocked ? `Host đang có ${h.stats.openTickets} ca chạy — điều phối lại trước khi khoá` : undefined}
          >
            {suspended ? (
              <>
                <Unlock size={15} /> Mở lại tài khoản
              </>
            ) : (
              <>
                <Lock size={15} /> Tạm đóng tài khoản
              </>
            )}
          </button>
        }
      />

      {suspended && (
        <div
          style={{
            padding: "14px 18px",
            borderRadius: "var(--r-sm)",
            background: "var(--danger-050)",
            border: "1px solid #fca5a5",
            color: "#991b1b",
            display: "flex",
            alignItems: "center",
            gap: 12,
            fontSize: "var(--fs-14)",
          }}
        >
          <Lock size={20} style={{ flexShrink: 0, color: "var(--danger)" }} />
          <div>
            <strong>Tài khoản Field Host đang bị tạm đóng:</strong> Host không đăng nhập được và hệ thống điều phối <strong>không giao ca nào</strong> (dẫn khách lẫn thẩm định) cho Host này.
          </div>
        </div>
      )}

      <AssignmentSection key={`${h.assignedZone}|${h.roles.join(",")}`} h={h} />

      <Section title="Hồ sơ Field Host">
        <KeyValue
          items={[
            { label: "Email đăng nhập", value: h.email ?? "—" },
            { label: "Số điện thoại", value: h.phone ? `${fmtPhone(h.phone)}${h.isPhoneVerified ? " · đã xác thực" : ""}` : "Host chưa xác thực SĐT" },
            { label: "Phân khu phụ trách", value: h.assignedZone },
            { label: "Vai", value: hostRoleLabel(h.roles) },
            { label: "Đánh giá", value: `${String(h.rating).replace(".", ",")} ★` },
            {
              label: "Nhận ca trung bình",
              value: h.stats.avgAcceptSeconds === null ? "Chưa nhận ca nào" : `${mmss(h.stats.avgAcceptSeconds)} (SLA ${mmss(ACCEPT_SLA_SECONDS)})`,
            },
            { label: "Khách bỏ hẹn", value: h.stats.noShowRate === null ? "—" : `${String(h.stats.noShowRate).replace(".", ",")}%` },
            { label: "Đăng nhập gần nhất", value: h.lastLoginAt ? fmtDateTime(h.lastLoginAt) : "Chưa đăng nhập" },
            { label: "Đăng nhập bằng", value: h.hasPassword ? "Google hoặc mật khẩu" : "Google" },
            { label: "Tham gia", value: fmtDate(h.createdAt) },
            { label: "Trạng thái", value: <StatusBadge tone={HOST_STATUS_META[status].tone}>{HOST_STATUS_META[status].label}</StatusBadge> },
          ]}
        />
      </Section>

      <WeekEarnings hostId={h.id} weekTotal={h.stats.weekEarnings} />

      <Section title="Thống kê ca dẫn xem" description={`${h.stats.completedViewings} ca hoàn tất · ${h.stats.deals} deal chốt cọc · ${h.stats.openTickets} ca đang chạy`}>
        <KeyValue items={TICKET_ORDER.map((k) => ({ label: ticketLabel(k), value: h.ticketStats[k] ?? 0 }))} />
      </Section>

      <PasswordSection hostId={h.id} />
    </>
  );
}

/** Phân khu (một Host — một phân khu) và tập vai `{sale}` / `{sale, inspector}`: lưu chung một PATCH. */
function AssignmentSection({ h }: { h: HostAdminDetail }) {
  const zonesQuery = useHostZones();
  const zones = zonesQuery.state.status === "ready" ? zonesQuery.state.data : [h.assignedZone];
  const [zone, setZone] = useState(h.assignedZone);
  const [choice, setChoice] = useState<HostRoleChoice>(choiceOfRoles(h.roles));
  const [busy, setBusy] = useState(false);
  const dirty = zone !== h.assignedZone || choice !== choiceOfRoles(h.roles);

  const save = async () => {
    setBusy(true);
    const res = await adminHostsApi.update(h.id, { assignedZone: zone, roles: rolesOfChoice(choice) });
    setBusy(false);
    if (!res.ok) return toast(hostErrorText(res));
    toast(`Đã cập nhật phân khu và vai cho ${h.fullName ?? h.email}.`, "success");
    invalidateHosts();
  };

  return (
    <Section
      title="Phân khu & vai đảm nhiệm"
      description="Mỗi Host phụ trách một phân khu. Vai quyết định menu truy cập và luồng tự động giao ticket (dẫn khách / thẩm định ký gửi)."
    >
      <div className="card" style={{ padding: "var(--s-4)", display: "flex", flexDirection: "column", gap: "var(--s-3)" }}>
        <label className="field" style={{ maxWidth: 360 }}>
          <span className="label" style={{ display: "inline-flex", alignItems: "center", gap: 4 }}>
            <MapPin size={13} /> Phân khu phụ trách
          </span>
          <select className="select" value={zone} onChange={(e) => setZone(e.target.value)}>
            {zones.map((z) => (
              <option key={z} value={z}>
                {z}
              </option>
            ))}
          </select>
        </label>

        {(Object.keys(ROLE_CHOICE_LABEL) as HostRoleChoice[]).map((c) => (
          <label key={c} className="check" style={{ alignItems: "flex-start", gap: 10 }}>
            <input type="radio" name="host-role" checked={choice === c} onChange={() => setChoice(c)} style={{ marginTop: 3 }} />
            <div>
              <strong>{ROLE_CHOICE_LABEL[c]}</strong>
              <p className="muted small" style={{ margin: "2px 0 0" }}>
                {c === "sale"
                  ? "Nhận lịch xem, đón khách tại sảnh, dùng thẻ cư dân thang máy dẫn lên phòng và cấp mã cửa."
                  : "Như Sale, thêm nhận ticket ký gửi: kiểm tra hiện trạng 32 hạng mục và đo diện tích thông thuỷ trong 48 giờ."}
              </p>
            </div>
          </label>
        ))}

        <div>
          <button type="button" className="btn btn-primary btn-sm" onClick={save} disabled={!dirty || busy}>
            <ShieldCheck size={14} /> {busy ? "Đang lưu…" : "Lưu phân khu & vai"}
          </button>
        </div>
      </div>
    </Section>
  );
}

/** Thu nhập tuần ISO hiện tại theo bảng kê `GET /admin/payouts` (tách từng loại khoản). */
function WeekEarnings({ hostId, weekTotal }: { hostId: string; weekTotal: number }) {
  const payouts = useAdminPayouts();
  return (
    <Section title="Thu nhập tuần này" description="Theo bảng kê thanh toán tuần hiện tại; cộng dồn thành số tháng khi chi trả.">
      <AdminQuery query={payouts} title="Không tải được bảng kê thu nhập" height={140}>
        {(st) => {
          const p = st.hosts.find((x) => x.hostId === hostId);
          if (!p) return <p className="muted small">Tuần {st.period}: chưa phát sinh khoản nào ({vnd(weekTotal)}đ).</p>;
          return (
            <KeyValue
              items={[
                { label: "Kỳ", value: st.period },
                { label: "Lượt dẫn", value: `${p.viewings} · ${vnd(p.viewingFee)}đ` },
                { label: "Deal chốt cọc", value: `${p.deals} · ${vnd(p.commission)}đ` },
                { label: "Thưởng đánh giá", value: `${vnd(p.ratingBonus)}đ` },
                { label: "Thưởng nóng chiến dịch", value: `${vnd(p.campaignBonus)}đ` },
                ...(p.inspections ? [{ label: "Thẩm định", value: `${p.inspections} · ${vnd(p.inspectionFee)}đ` }] : []),
                { label: "Tổng thực nhận", value: <b>{vnd(p.total)}đ</b> },
              ]}
            />
          );
        }}
      </AdminQuery>
    </Section>
  );
}

/** Đặt/đổi mật khẩu đăng nhập của Host (≥ 8 ký tự); backend ghi Audit không kèm giá trị. */
function PasswordSection({ hostId }: { hostId: string }) {
  const [pw, setPw] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");

  const save = async () => {
    if (pw.length < 8) return setErr("Mật khẩu tối thiểu 8 ký tự.");
    setBusy(true);
    const res = await adminHostsApi.update(hostId, { password: pw });
    setBusy(false);
    if (!res.ok) return setErr(hostErrorText(res));
    toast("Đã đặt mật khẩu mới cho Field Host.", "success");
    setPw("");
    setErr("");
    invalidateHosts();
  };

  return (
    <Section title="Mật khẩu đăng nhập" description="Đặt mật khẩu mới nếu Host không dùng Google.">
      <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap", maxWidth: 480 }}>
        <input
          className="input"
          type="password"
          value={pw}
          onChange={(e) => {
            setPw(e.target.value);
            setErr("");
          }}
          placeholder="Mật khẩu mới (≥ 8 ký tự)"
          autoComplete="new-password"
          style={{ flex: 1, minWidth: 200 }}
        />
        <button type="button" className="btn btn-quiet btn-sm" onClick={save} disabled={busy || !pw}>
          Đặt mật khẩu
        </button>
      </div>
      {err && <p className="field-error">{err}</p>}
    </Section>
  );
}

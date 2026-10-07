"use client";

import { useState } from "react";
import { CheckCircle2, KeyRound, Lock, MapPin, ShieldCheck } from "lucide-react";
import { KeyValue } from "@/components/ui/KeyValue";
import { PageHeader } from "@/components/ui/PageHeader";
import { Section } from "@/components/ui/Section";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { loginPathFor } from "@/lib/auth/portals";
import { DEMO_USERS } from "@/lib/mock/actors";
import { signOut } from "@/lib/auth/client";
import { hostRoles, hostZones, isHostSuspended } from "@/lib/mock/selectors";
import { useMock } from "@/lib/mock/store";
import { hostById, zoneById } from "@/lib/mock/units";
import styles from "./Host.module.css";

const HOST = DEMO_USERS.host;

const SHIFTS = [
  { id: "morning", label: "Ca sáng", time: "08:30–11:30" },
  { id: "afternoon", label: "Ca chiều", time: "14:00–18:00" },
] as const;

const RULES = [
  "Không dùng hộp khoá treo cửa hay dán mã QR ở sảnh — vi phạm quy chế BQL.",
  "Mã cửa hiện ngay khi bạn xác nhận xem phòng và tự ẩn sau 10 phút.",
  "Có sự cố tại căn: chỉ giới thiệu danh bạ thợ ngoài, khách và thợ tự thoả thuận.",
];

/** Hồ sơ Field Host: thông tin cá nhân, phân quyền khu vực kèm thẩm định & dẫn khách, thẻ RFID, ca trực và quy tắc cốt lõi. */
export function AccountView() {
  const state = useMock();
  const host = hostById(HOST.refId!)!;
  const currentZones = hostZones(state, host.id);
  const currentRoles = hostRoles(state, host.id);
  const isSuspended = isHostSuspended(state, host.id);
  const [onShift, setOnShift] = useState<Record<string, boolean>>({ morning: true, afternoon: true });

  const hasSale = currentRoles.includes("sale");
  const hasInspector = currentRoles.includes("inspector");

  return (
    <div className={styles.page}>
      <PageHeader title="Tài khoản" />

      {isSuspended && (
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
            <strong>Tài khoản đang bị tạm đóng:</strong> Quản trị viên đã tạm khóa tài khoản của bạn. Toàn bộ quyền hạn và việc nhận điều phối căn đã bị tạm ngưng.
          </div>
        </div>
      )}

      <div className={styles.two}>
        <div className={styles.stack}>
          <Section title="Thông tin cá nhân">
            <KeyValue
              items={[
                { label: "Họ tên", value: host.name },
                { label: "Số điện thoại", value: host.phone },
                {
                  label: "Khu phụ trách",
                  value:
                    currentZones.length > 0
                      ? currentZones.map((z) => zoneById(z).short).join(" & ")
                      : "Chưa phân khu",
                },
                {
                  label: "Quyền hạn khu vực",
                  value: (
                    <div style={{ display: "flex", flexWrap: "wrap", gap: 6, alignItems: "center" }}>
                      {hasSale && (
                        <span
                          style={{
                            display: "inline-flex",
                            alignItems: "center",
                            gap: 4,
                            padding: "2px 8px",
                            borderRadius: "var(--r-sm)",
                            background: "var(--lagoon-050)",
                            color: "var(--lagoon)",
                            fontSize: "var(--fs-12)",
                            fontWeight: 600,
                          }}
                        >
                          <KeyRound size={12} /> Dẫn khách
                        </span>
                      )}
                      {hasInspector && (
                        <span
                          style={{
                            display: "inline-flex",
                            alignItems: "center",
                            gap: 4,
                            padding: "2px 8px",
                            borderRadius: "var(--r-sm)",
                            background: "var(--ok-050)",
                            color: "var(--ok)",
                            fontSize: "var(--fs-12)",
                            fontWeight: 600,
                          }}
                        >
                          <ShieldCheck size={12} /> Thẩm định 48h
                        </span>
                      )}
                      {!hasSale && !hasInspector && <span className="muted small">Chưa phân vai</span>}
                    </div>
                  ),
                },
                { label: "Đánh giá", value: `${String(host.rating).replace(".", ",")} ★` },
              ]}
            />
          </Section>

          <Section
            title="Phân quyền theo khu vực phụ trách"
            description="Quy chế VinStay AI: Khi được phân quyền theo khu vực nào thì Host được cấp trọn gói cả quyền Thẩm định và quyền Dẫn khách cho toàn bộ phân khu đó."
          >
            <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
              {currentZones.map((zid) => {
                const z = zoneById(zid);
                return (
                  <div
                    key={zid}
                    style={{
                      padding: "12px 14px",
                      borderRadius: "var(--r-sm)",
                      border: "1px solid var(--line)",
                      background: "var(--surface)",
                      display: "flex",
                      flexDirection: "column",
                      gap: 8,
                    }}
                  >
                    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                      <strong style={{ display: "flex", alignItems: "center", gap: 6, color: "var(--ink)" }}>
                        <MapPin size={15} style={{ color: "var(--lagoon)" }} />
                        {z.name}
                      </strong>
                      <span className="muted xs">{z.buildings.slice(0, 5).join(", ")}{z.buildings.length > 5 ? ` +${z.buildings.length - 5} tòa` : ""}</span>
                    </div>

                    <div style={{ display: "flex", flexDirection: "column", gap: 4, fontSize: "var(--fs-13)" }}>
                      <div style={{ display: "flex", alignItems: "center", gap: 6, color: hasSale ? "var(--ink)" : "var(--ink-3)" }}>
                        <CheckCircle2 size={13} style={{ color: hasSale ? "var(--ok)" : "var(--line-strong)" }} />
                        <span><strong>Quyền dẫn khách (Sale):</strong> Đón sảnh, thẻ thang máy RFID, mở mã cửa</span>
                      </div>
                      <div style={{ display: "flex", alignItems: "center", gap: 6, color: hasInspector ? "var(--ink)" : "var(--ink-3)" }}>
                        <CheckCircle2 size={13} style={{ color: hasInspector ? "var(--ok)" : "var(--line-strong)" }} />
                        <span><strong>Quyền thẩm định (Inspector):</strong> Nhận ký gửi, kiểm tra 32 mục trong 48h</span>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </Section>

          <Section title="Thẻ cư dân RFID">
            <KeyValue
              items={[
                { label: "Số thẻ", value: "VS-0412" },
                { label: "Trạng thái", value: <StatusBadge tone="ok">Đã xác minh</StatusBadge> },
              ]}
            />
            <p className="muted small">Thẻ do Ban quản lý cấp, dùng để đưa khách lên tầng. Mất thẻ báo ngay trưởng khu.</p>
          </Section>
        </div>

        <div className={styles.stack}>
          <Section title="Ca trực">
            <ul className={styles.stack}>
              {SHIFTS.map((s) => (
                <li key={s.id} className={styles.shiftRow}>
                  <div>
                    <b>{s.label}</b>
                    <p className="muted small">{s.time}</p>
                  </div>
                  <button
                    type="button"
                    role="switch"
                    aria-checked={onShift[s.id]}
                    aria-label={`Nhận ${s.label.toLowerCase()}`}
                    className={`${styles.switch} ${onShift[s.id] ? styles.switchOn : ""}`}
                    onClick={() => setOnShift((v) => ({ ...v, [s.id]: !v[s.id] }))}
                  >
                    <span />
                  </button>
                </li>
              ))}
            </ul>
          </Section>

          <Section title="Quy tắc">
            <ul className={styles.rules}>
              {RULES.map((r) => (
                <li key={r}>{r}</li>
              ))}
            </ul>
          </Section>
        </div>
      </div>

      <div>
        <button
          type="button"
          className="btn btn-quiet"
          onClick={() => void signOut(loginPathFor("host"))}
        >
          Đăng xuất
        </button>
      </div>
    </div>
  );
}

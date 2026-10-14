"use client";

import { useMemo, useState } from "react";
import { CheckCircle2, KeyRound, MapPin, ShieldCheck } from "lucide-react";
import { KeyValue } from "@/components/ui/KeyValue";
import { PageHeader } from "@/components/ui/PageHeader";
import { Section } from "@/components/ui/Section";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { loginPathFor } from "@/lib/auth/portals";
import { signOut } from "@/lib/auth/client";
import { useHostMe } from "@/lib/host/api";
import { useApiQuery } from "@/lib/query/useApiQuery";
import { tenantQueries } from "@/lib/tenant/queries";
import { zoneOfName } from "@/lib/units";
import styles from "./Host.module.css";
import { requestPhoneVerify } from "./PhoneVerifyGate";

const SHIFTS = [
  { id: "morning", label: "Ca sáng", time: "08:30–11:30" },
  { id: "afternoon", label: "Ca chiều", time: "14:00–18:00" },
] as const;

const RULES = [
  "Không dùng hộp khoá treo cửa hay dán mã QR ở sảnh — vi phạm quy chế BQL.",
  "Mã cửa hiện ngay khi bạn xác nhận xem phòng và tự ẩn sau 10 phút.",
  "Có sự cố tại căn: chỉ giới thiệu danh bạ thợ ngoài, khách và thợ tự thoả thuận.",
];

/** Thẻ cư dân RFID: chưa có bảng lưu số thẻ ⇒ hiển thị mẫu cố định (chỉ minh hoạ, không phải dữ liệu thật). */
const RFID_DEMO = { number: "VS-0412" };

/** Rút gọn danh sách tòa: 5 tòa đầu + "+N tòa". */
function buildingsText(buildings: string[]): string {
  const head = buildings.slice(0, 5).join(", ");
  return buildings.length > 5 ? `${head} +${buildings.length - 5} tòa` : head;
}

/**
 * Hồ sơ Field Host: dữ liệu thật từ `GET /host/me`; tòa của phân khu lấy từ danh mục căn đang niêm yết. Ca trực, thẻ
 * RFID và quy tắc cốt lõi chưa có dữ liệu backend (ca trực: hồ sơ 15).
 */
export function AccountView() {
  const me = useHostMe();
  const catalog = useApiQuery(tenantQueries.units());
  const [onShift, setOnShift] = useState<Record<string, boolean>>({ morning: true, afternoon: true });
  const assignedZone = me.state.status === "ready" ? me.state.data.assignedZone : "";
  const buildings = useMemo(() => {
    if (catalog.state.status !== "ready" || !assignedZone) return [];
    const zone = zoneOfName(assignedZone);
    const names = catalog.state.data.units
      .filter((u) => (zone ? zoneOfName(u.zoneName)?.id === zone.id : u.zoneName === assignedZone))
      .map((u) => u.building);
    return [...new Set(names)].sort((a, b) => a.localeCompare(b, "vi", { numeric: true }));
  }, [catalog.state, assignedZone]);

  if (me.state.status === "loading") return <div className="skeleton" style={{ height: 360 }} />;
  if (me.state.status === "error") {
    return (
      <div className={styles.page}>
        <PageHeader title="Tài khoản" />
        <p role="alert">{me.state.message}</p>
        <button type="button" className="btn btn-quiet" onClick={me.reload}>
          Thử lại
        </button>
      </div>
    );
  }
  const host = me.state.data;
  const hasSale = host.roles.includes("sale");
  const hasInspector = host.roles.includes("inspector");
  const phoneVerified = host.isPhoneVerified && Boolean(host.phone);
  const zoneName = zoneOfName(host.assignedZone)?.name ?? host.assignedZone;

  return (
    <div className={styles.page}>
      <PageHeader title="Tài khoản" />

      <div className={styles.two}>
        <div className={styles.stack}>
          <Section title="Thông tin cá nhân">
            <KeyValue
              items={[
                { label: "Họ tên", value: host.fullName ?? "—" },
                { label: "Email", value: host.email ?? "—" },
                {
                  label: "Số điện thoại",
                  value: (
                    <div className={styles.perms}>
                      <span className="tnum">{phoneVerified ? host.phone : "Chưa có"}</span>
                      <StatusBadge tone={phoneVerified ? "ok" : "warn"}>{phoneVerified ? "Đã xác thực" : "Chưa xác thực"}</StatusBadge>
                      <button
                        type="button"
                        className="btn btn-quiet btn-sm"
                        onClick={() =>
                          requestPhoneVerify(me.reload, "Dùng để nhận ca dẫn khách, ca thẩm định và mã OTP Zalo. Cần xác thực để nhận ca.")
                        }
                      >
                        {phoneVerified ? "Đổi số" : "Xác thực"}
                      </button>
                    </div>
                  ),
                },
                { label: "Khu phụ trách", value: host.assignedZone },
                {
                  label: "Quyền hạn khu vực",
                  value: (
                    <div className={styles.perms}>
                      {hasSale && (
                        <span className={`${styles.perm} ${styles.permSale}`}>
                          <KeyRound size={12} /> Dẫn khách
                        </span>
                      )}
                      {hasInspector && (
                        <span className={`${styles.perm} ${styles.permInspector}`}>
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
            {host.assignedZone ? (
              <div className={styles.zoneCard}>
                <div className={styles.zoneHead}>
                  <strong>
                    <MapPin size={15} /> {zoneName}
                  </strong>
                  {buildings.length > 0 && <span className="muted xs">{buildingsText(buildings)}</span>}
                </div>
                <div className={styles.zonePerms}>
                  <div className={hasSale ? "" : styles.zonePermOff}>
                    <CheckCircle2 size={13} className={hasSale ? styles.zoneCheckOn : styles.zoneCheckOff} />
                    <span>
                      <strong>Quyền dẫn khách (Sale):</strong> Đón sảnh, thẻ thang máy RFID, mở mã cửa
                    </span>
                  </div>
                  <div className={hasInspector ? "" : styles.zonePermOff}>
                    <CheckCircle2 size={13} className={hasInspector ? styles.zoneCheckOn : styles.zoneCheckOff} />
                    <span>
                      <strong>Quyền thẩm định (Inspector):</strong> Nhận ký gửi, kiểm tra 32 mục trong 48h
                    </span>
                  </div>
                </div>
              </div>
            ) : (
              <p className="muted small">Chưa được phân khu. Liên hệ Admin để được gán khu vực.</p>
            )}
          </Section>

          <Section title="Thẻ cư dân RFID">
            <KeyValue
              items={[
                { label: "Số thẻ", value: RFID_DEMO.number },
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

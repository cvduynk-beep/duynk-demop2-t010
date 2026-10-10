import { vnd } from "@/lib/mock/format";
import type { CostBreakdown } from "@/lib/mock/cost";
import styles from "./AllInBar.module.css";

const PARTS = [
  { key: "rent", label: "Tiền thuê nhà", recipient: "Trả Chủ nhà", cls: "rent" },
  { key: "mgmt", label: "Phí quản lý BQL", recipient: "Tự đóng BQL", cls: "mgmt" },
  { key: "parking", label: "Phí gửi xe", recipient: "Tự đóng BQL", cls: "parking" },
  { key: "utility", label: "Điện nước dự trù", recipient: "Tự đóng EVN", cls: "utility" },
] as const;

interface AllInBarProps {
  cost: CostBreakdown;
  /** "bar" = chỉ thanh; "legend" = thanh + chú giải bốn khoản. */
  variant?: "bar" | "legend" | "table";
}

/** Thanh All-in Cost: bốn khoản chi mỗi tháng phân định rõ đối tượng nhận. */
export function AllInBar({ cost, variant = "bar" }: AllInBarProps) {
  const parts = PARTS.map((p) => ({ ...p, value: cost[p.key] })).filter((p) => p.value > 0);
  return (
    <div className={styles.wrap}>
      <div
        className={styles.bar}
        role="img"
        aria-label={`Tổng ${vnd(cost.total)} đồng mỗi tháng: ${parts.map((p) => `${p.label} ${vnd(p.value)}`).join(", ")}`}
      >
        {parts.map((p) => (
          <span key={p.key} className={`${styles.seg} ${styles[p.cls]}`} style={{ flexGrow: p.value }} />
        ))}
      </div>
      {variant === "legend" && (
        <ul className={styles.legend}>
          {parts.map((p) => (
            <li key={p.key}>
              <i className={`${styles.dot} ${styles[p.cls]}`} />
              {p.label} <b className="tnum">{vnd(p.value)}</b>
            </li>
          ))}
        </ul>
      )}
      {variant === "table" && (
        <ul className={styles.table}>
          {parts.map((p) => (
            <li key={p.key}>
              <span>
                <i className={`${styles.dot} ${styles[p.cls]}`} />
                {p.label}
                <small className="muted xs" style={{ marginLeft: 6 }}>({p.recipient})</small>
              </span>
              <b className="tnum">{vnd(p.value)}đ</b>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

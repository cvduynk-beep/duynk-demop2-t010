"use client";

import { useState } from "react";
import { Wallet } from "lucide-react";
import { StatTile } from "@/components/charts/StatTile";
import { DataTable, type DataTableColumn } from "@/components/ui/DataTable";
import { PageHeader } from "@/components/ui/PageHeader";
import { Section } from "@/components/ui/Section";
import { useHostEarnings, type HostEarnings } from "@/lib/admin/api";
import { fmtDate, vnd } from "@/lib/format";
import { DEAL_STATUS, formulaLines, periodLabel } from "@/lib/host/earnings";
import styles from "./Host.module.css";

type Deal = HostEarnings["deals"][number];
type Scope = "week" | "all";

const nowrap = { whiteSpace: "nowrap" } as const;

export function EarningsView() {
  const query = useHostEarnings();
  const [scope, setScope] = useState<Scope>("week");
  if (query.state.status === "loading") return <div className="skeleton" style={{ height: 320 }} />;
  if (query.state.status === "error") return <div role="alert"><p>{query.state.message}</p><button className="btn btn-secondary btn-sm" onClick={query.reload}>Thử lại</button></div>;

  const { stats, week, fees, ratingAvg, ratingCount, walletBalance, deals, roles } = query.state.data;
  const isInspector = roles.includes("inspector");
  const shown = scope === "week" ? week : stats;
  const lines = formulaLines(shown, fees, isInspector);
  const ratingHit = ratingAvg != null && ratingAvg >= fees.ratingMinAvg && fees.ratingMultiplier != null;

  const columns: DataTableColumn<Deal>[] = [
    { key: "unit", header: "Căn hộ", render: (d) => <b style={nowrap}>{d.unit ?? d.depositCode ?? "—"}</b> },
    { key: "tenant", header: "Khách", render: (d) => <span style={nowrap}>{d.tenantName ?? "—"}</span> },
    { key: "paidAt", header: "Ngày cọc", render: (d) => <span className="small muted" style={nowrap}>{fmtDate(d.paidAt)}</span> },
    {
      key: "status",
      header: "Trạng thái",
      render: (d) => {
        const s = (d.status && DEAL_STATUS[d.status]) || { label: "—", badge: "badge-plain" };
        return <span className={`badge ${s.badge}`} style={nowrap}>{s.label}</span>;
      },
    },
    { key: "commission", header: "Hoa hồng", align: "right", render: (d) => <b className="num" style={nowrap}>+{vnd(d.commission)}đ</b> },
  ];

  return (
    <div className={styles.page}>
      <PageHeader
        title="Thu nhập Field Host"
        description={`Kỳ hiện tại: ${periodLabel(week.period)} · Đối soát và chuyển khoản vào 23:59 Chủ nhật hằng tuần`}
      />
      <div className={styles.kpis}>
        <StatTile hero label="Ví thu nhập" value={vnd(walletBalance)} unit="đ" delta={{ text: "Chuyển khoản sau kỳ đối soát Chủ nhật", tone: "good" }} />
        <StatTile label="Tạm tính tuần này" value={vnd(week.totalEarnings)} unit="đ" delta={{ text: periodLabel(week.period), tone: "flat" }} />
        <StatTile
          label="Lượt dẫn tuần này"
          value={String(week.totalViewings)}
          delta={{ text: fees.baseViewingFee != null ? `${vnd(fees.baseViewingFee)}đ / lượt` : "Chưa cấu hình phí", tone: "flat" }}
        />
        <StatTile
          label="Deal chốt cọc tuần này"
          value={String(week.totalDeals)}
          delta={{ text: fees.dealCommission != null ? `${vnd(fees.dealCommission)}đ / deal` : "Chưa cấu hình phí", tone: "flat" }}
        />
        {isInspector && <StatTile label="Phiếu thẩm định tuần này" value={String(week.totalInspections)} delta={{ text: fees.inspectionFee != null ? `${vnd(fees.inspectionFee)}đ / hồ sơ` : "Chưa cấu hình phí", tone: "flat" }} />}
        <StatTile
          label="Đánh giá trung bình"
          value={ratingAvg != null ? `${String(Math.round(ratingAvg * 10) / 10).replace(".", ",")}★` : "—"}
          delta={
            ratingAvg == null
              ? { text: "Chưa có lượt chấm", tone: "flat" }
              : ratingHit
                ? { text: `${ratingCount} lượt · hệ số ×${String(fees.ratingMultiplier).replace(".", ",")}`, tone: "good", dir: "up" }
                : { text: `${ratingCount} lượt · cần ≥ ${String(fees.ratingMinAvg).replace(".", ",")}★ để nhận thưởng`, tone: "flat" }
          }
        />
      </div>
      <div className={styles.earningsLayout}>
        <Section
          title="Cách tính thù lao"
          actions={
            <div className={styles.tabs} role="tablist" aria-label="Phạm vi số liệu">
              <button role="tab" aria-selected={scope === "week"} onClick={() => setScope("week")}>Tuần này</button>
              <button role="tab" aria-selected={scope === "all"} onClick={() => setScope("all")}>Tất cả</button>
            </div>
          }
        >
          <dl className={styles.lines}>
            {lines.map((line) => (
              <div key={line.key}>
                <dt>
                  {line.label}
                  <span className="muted xs">{line.formula}</span>
                </dt>
                <dd className="num">{vnd(line.amount)}đ</dd>
              </div>
            ))}
            <div>
              <dt>Tổng {scope === "week" ? "tuần này" : "đã ghi nhận"}</dt>
              <dd className="num">{vnd(shown.totalEarnings)}đ</dd>
            </div>
          </dl>
          <p className="muted xs">
            Mức thù lao do Admin cấu hình, áp dụng cho ca/cọc mới. Mỗi khoản chỉ được ghi khi ca xem hoàn tất, khách đã chuyển cọc
            {isInspector ? " hoặc phiếu thẩm định đã nộp" : ""}.
          </p>
        </Section>
        <Section title="Deal gần đây" flush>
          <DataTable<Deal>
            columns={columns}
            rows={deals}
            rowHref={(d) => d.href ?? ""}
            empty={<div className={styles.empty}><Wallet size={26} /><b>Chưa có deal</b><p className="muted small">Khi khách bạn dẫn chuyển cọc chốt căn, hoa hồng sẽ cộng vào đây.</p></div>}
          />
        </Section>
      </div>
    </div>
  );
}

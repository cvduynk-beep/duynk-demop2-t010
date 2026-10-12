"use client";

import Link from "next/link";
import { ArrowRight, FilePlus2, FileSignature, ShieldCheck } from "lucide-react";
import { Columns } from "@/components/charts/Columns";
import { StatTile } from "@/components/charts/StatTile";
import { DataTable } from "@/components/ui/DataTable";
import { PageHeader } from "@/components/ui/PageHeader";
import { Section } from "@/components/ui/Section";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { CONSIGN_STATUS_META } from "@/components/consign/status";
import { fmtTime, relTime, vnd, vndShort } from "@/lib/format";
import { LAYOUT_LABEL, UNIT_STATUS_META, axisMillions, hoursLeft, unitLabel } from "@/lib/landlord/labels";
import { queries } from "@/lib/landlord/queries";
import type { Consignment, Finance, LandlordActivity, UnitRow } from "@/lib/landlord/types";
import { useLandlordQuery } from "@/lib/landlord/useLandlordQuery";
import { useNow } from "@/lib/useNow";
import { PriceInsightCard } from "./PriceInsightCard";
import { QueryView } from "./QueryView";
import styles from "./Landlord.module.css";

/** Hồ sơ còn đang xử lý (chưa thành căn chính thức / chưa bị từ chối) — hiện thành nhắc việc đầu trang. */
const IN_PROGRESS = new Set<Consignment["status"]>(["awaiting_host", "inspecting", "reviewing", "awaiting_landlord"]);

/**
 * Tổng quan chủ nhà — toàn bộ từ API thật của người đang đăng nhập:
 * căn (`/landlord/units`), hồ sơ ký gửi (`/consignments`), khoản thu (`/finance`), hoạt động (`/dashboard`), xác thực.
 */
export function LandlordDashboard() {
  const units = useLandlordQuery(queries.units);
  const consignments = useLandlordQuery(queries.consignments);
  const finance = useLandlordQuery(queries.finance);
  const dashboard = useLandlordQuery(queries.dashboard);
  const verification = useLandlordQuery(queries.verification);
  const priceInsights = useLandlordQuery(queries.priceInsights);
  const now = useNow(60_000);

  const unitCount = units.state.status === "ready" ? units.state.data.length : null;
  const notVerified = verification.state.status === "ready" && !verification.state.data.ready ? verification.state.data : null;
  const pending =
    consignments.state.status === "ready" ? consignments.state.data.filter((c) => IN_PROGRESS.has(c.status)) : [];

  return (
    <div className={styles.page}>
      <PageHeader
        title="Tổng quan"
        description="Bạn ở nhà 100%: Field Host đón khách, mở cửa và báo bạn từng bước."
        actions={
          <div style={{ display: "flex", gap: "var(--s-2)", alignItems: "center", flexWrap: "wrap" }}>
            <Link href="/landlord/units" className="btn btn-quiet btn-sm">
              Tất cả căn{unitCount !== null ? ` (${unitCount})` : ""}
            </Link>
            <Link href="/landlord/consign" className="btn btn-primary btn-sm">
              <FilePlus2 size={15} /> Ký gửi căn mới
            </Link>
          </div>
        }
      />

      {(notVerified || pending.length > 0) && (
        <ul className={styles.alerts}>
          {notVerified && (
            <li>
              <ShieldCheck size={20} />
              <div style={{ flex: 1, minWidth: 0 }}>
                <b>Hoàn tất xác thực tài khoản để ký gửi căn mới</b>
                <p className="small muted" style={{ margin: "var(--s-1) 0 0" }}>
                  Còn {notVerified.missing.length}/3 bước: số điện thoại, CCCD (eKYC), tài khoản nhận tiền.
                </p>
              </div>
              <Link href="/landlord/verify" className="btn btn-primary btn-sm">
                Xác thực ngay <ArrowRight size={14} />
              </Link>
            </li>
          )}
          {pending.map((c) => {
            const meta = CONSIGN_STATUS_META[c.status];
            return (
              <li key={c.id}>
                <FileSignature size={20} />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ display: "flex", alignItems: "center", gap: "var(--s-2)", flexWrap: "wrap" }}>
                    <b>{unitLabel(c)}</b>
                    <StatusBadge tone={meta.tone}>{meta.label}</StatusBadge>
                  </div>
                  <p className="small muted" style={{ margin: "var(--s-1) 0 0" }}>
                    {meta.landlordHint}
                  </p>
                </div>
                <Link href={`/landlord/consignments/${c.id}`} className="btn btn-secondary btn-sm">
                  Chi tiết <ArrowRight size={14} />
                </Link>
              </li>
            );
          })}
        </ul>
      )}

      <QueryView query={units} skeleton="cards">
        {(rows) => (
          <QueryView query={finance} skeleton="cards">
            {(f) => <Kpis rows={rows} f={f} />}
          </QueryView>
        )}
      </QueryView>

      {priceInsights.state.status === "ready" && priceInsights.state.data.length > 0 && <PriceInsightCard insights={priceInsights.state.data} />}

      <div className={styles.two}>
        <QueryView query={finance} skeleton="cards">
          {(f) => (
            <Columns
              title="Thực nhận mỗi tháng"
              subtitle="Tiền thuê sau phí dịch vụ, cộng bồi thường trống phòng; tháng hiện tại được nhấn"
              data={f.history.map((m) => ({ label: m.label, value: m.net }))}
              axisFormat={axisMillions}
              scaleFloor={1_000_000}
              valueFormat={(v) => `${vnd(v)}đ`}
              seriesName="Thực nhận"
            />
          )}
        </QueryView>
        <Section title="Hoạt động gần đây" description="30 ngày qua trên các căn của bạn">
          <QueryView query={dashboard} skeleton="table">
            {(d) => <ActivityFeed items={d.activity} now={now} />}
          </QueryView>
        </Section>
      </div>

      <Section
        title="Căn của bạn"
        description={unitCount && unitCount > 5 ? `5 trên tổng ${unitCount} căn đã ký gửi` : undefined}
        actions={
          <Link href="/landlord/units" className="btn btn-quiet btn-sm">
            Xem tất cả <ArrowRight size={14} />
          </Link>
        }
        flush
      >
        <QueryView query={units}>
          {(rows) => (
            <DataTable<UnitRow>
              columns={[
                { key: "unit", header: "Căn", render: (r) => unitLabel(r) },
                { key: "layout", header: "Loại căn", render: (r) => LAYOUT_LABEL[r.layoutKind] },
                { key: "rent", header: "Giá thuê", align: "right", render: (r) => <span className="tnum">{vnd(r.rent)}đ</span> },
                { key: "status", header: "Trạng thái", render: (r) => <UnitBadge r={r} now={now} /> },
                { key: "viewings", header: "Lượt xem", align: "right", render: (r) => <span className="tnum">{r.totalViewings}</span> },
              ]}
              rows={rows.slice(0, 5)}
              rowHref={(r) => `/landlord/units/${r.id}`}
              empty="Bạn chưa ký gửi căn nào."
            />
          )}
        </QueryView>
      </Section>
    </div>
  );
}

function Kpis({ rows, f }: { rows: UnitRow[]; f: Finance }) {
  const count = (pred: (r: UnitRow) => boolean) => rows.filter(pred).length;
  const rented = count((r) => r.status === "rented");
  const holding = count((r) => r.status === "holding");
  const open = count((r) => r.status === "available" || r.status === "viewing");
  const forfeit = f.thisMonth.forfeit ?? 0;
  return (
    <div className={styles.kpis}>
      <StatTile
        hero
        label="Thực nhận tháng này"
        value={vndShort(f.thisMonth.net)}
        delta={{ text: forfeit ? `sau phí dịch vụ, gồm bồi thường ${vndShort(forfeit)}` : "sau phí dịch vụ ký gửi", tone: "flat" }}
        spark={f.history.map((m) => m.net)}
      />
      <StatTile label="Đang cho thuê" value={String(rented)} unit={`/ ${rows.length}`} />
      <StatTile label="Đang giữ căn" value={String(holding)} delta={{ text: "khách đã cọc, chờ ký hợp đồng", tone: "flat" }} />
      <StatTile label="Còn trống, đang mở khách" value={String(open)} delta={{ text: "Host đón khách thay bạn", tone: "flat" }} />
    </div>
  );
}

function UnitBadge({ r, now }: { r: UnitRow; now: number | null }) {
  const meta = UNIT_STATUS_META[r.status];
  if (r.status === "holding" && now) {
    const h = hoursLeft(r.holdExpiresAt, now);
    return <StatusBadge tone={meta.tone}>{h === null ? meta.label : `${meta.label} · còn ${h} giờ`}</StatusBadge>;
  }
  return <StatusBadge tone={meta.tone}>{meta.label}</StatusBadge>;
}

const TONE_CLASS: Record<LandlordActivity["tone"], string> = { info: "", success: "t-success", warning: "t-warning" };

function ActivityFeed({ items, now }: { items: LandlordActivity[]; now: number | null }) {
  if (items.length === 0) {
    return <p className="muted small" style={{ margin: 0 }}>Chưa có hoạt động. Khi khách đặt lịch, Host dẫn xem hoặc khách cọc, bạn sẽ thấy ở đây.</p>;
  }
  return (
    <ul className={styles.feed}>
      {items.map((n) => (
        <li key={n.id} className={TONE_CLASS[n.tone] ? styles[TONE_CLASS[n.tone]] : ""}>
          <div>
            <b>{n.title}</b>
            <p className="small muted">
              <Link href={`/landlord/units/${n.unitId}`}>{n.unitCode}</Link> · {n.body}
            </p>
          </div>
          <span className="xs muted">
            {fmtTime(n.at)}
            {now ? ` · ${relTime(n.at, now)}` : ""}
          </span>
        </li>
      ))}
    </ul>
  );
}

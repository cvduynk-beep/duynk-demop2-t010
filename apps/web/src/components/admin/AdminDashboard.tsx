"use client";

import { useState, type ReactNode } from "react";
import Link from "next/link";
import { AlertTriangle, ArrowRight, ClipboardCheck, Clock3, FileWarning, Timer } from "lucide-react";
import { BarList } from "@/components/charts/BarList";
import { Funnel } from "@/components/charts/Funnel";
import { Heatmap } from "@/components/charts/Heatmap";
import { StackBar } from "@/components/charts/StackBar";
import { StatTile } from "@/components/charts/StatTile";
import { Trend } from "@/components/charts/Trend";
import { PageHeader } from "@/components/ui/PageHeader";
import { Section } from "@/components/ui/Section";
import {
  activityActor,
  activityTitle,
  fmtDuration,
  fmtNumber,
  fmtPercentValue,
  fmtRange,
  funnelSteps,
  heatRows,
  ictDay,
  presetRange,
  shortDay,
  useDashboardActivity,
  useDashboardBi,
  useDashboardDispatch,
  useDashboardWorkItems,
  workItemViews,
  type RangeInput,
} from "@/lib/admin/dashboard";
import { ACCEPT_SLA_SECONDS } from "@/lib/admin/hosts";
import { fmtTime, relTime } from "@/lib/format";
import type { Query } from "@/lib/query/useApiQuery";
import { useNow } from "@/lib/useNow";
import { DashboardRangePicker, type RangeChoice } from "./DashboardRangePicker";
import styles from "./Admin.module.css";

const NO_SHOW_TARGET = 5; // % (PRD: no-show ≤ 5%)
const ICON = { manual: AlertTriangle, sla: AlertTriangle, consign: ClipboardCheck, exit: Timer, contracts: FileWarning } as const;

/** Mỗi widget tự chờ / báo lỗi + thử lại; một nguồn lỗi không làm sập cả trang. Đang làm mới ngầm thì giữ số cũ. */
function Widget<T>({ query, title, height = 220, card = true, children }: { query: Query<T>; title: string; height?: number; card?: boolean; children: (data: T) => ReactNode }) {
  const { state, reload } = query;
  if (state.status === "loading") return <div className="skeleton" style={{ height, borderRadius: 16 }} aria-busy="true" aria-label={`Đang tải ${title.toLowerCase()}`} />;
  if (state.status === "error") {
    return (
      <div className={`${card ? "card " : ""}${styles.widgetError}`} role="alert">
        <b>{title}</b>
        <p className="small">Không tải được số liệu: {state.message}</p>
        <button type="button" className="btn btn-quiet btn-sm" onClick={reload}>
          Thử lại
        </button>
      </div>
    );
  }
  return <>{children(state.data)}</>;
}

const Empty = ({ children }: { children: ReactNode }) => <div className={`card muted small ${styles.widgetEmpty}`}>{children}</div>;

export function AdminDashboard() {
  const now = useNow(60_000);
  const [choice, setChoice] = useState<RangeChoice>({ mode: "preset", days: 7 });
  if (!now) return <div className="skeleton" style={{ height: 480 }} />;
  const range: RangeInput = choice.mode === "preset" ? presetRange(choice.days, now) : { from: choice.from, to: choice.to };
  return <DashboardBody now={now} range={range} choice={choice} onChoice={setChoice} />;
}

function DashboardBody({ now, range, choice, onChoice }: { now: number; range: RangeInput; choice: RangeChoice; onChoice: (c: RangeChoice) => void }) {
  const bi = useDashboardBi(range);
  const dispatch = useDashboardDispatch(range);
  const work = useDashboardWorkItems();
  const activity = useDashboardActivity(8);
  const label = fmtRange(range);

  return (
    <div className={styles.page}>
      <PageHeader
        title="Tổng quan vận hành"
        description={`Vinhomes Ocean Park · ${label} (giờ Việt Nam). Lấp đầy, rổ hàng và việc cần xử lý là số hiện tại.`}
        actions={<DashboardRangePicker value={choice} current={range} today={ictDay(now)} onChange={onChoice} />}
      />

      <Widget query={work} title="Việc cần xử lý" height={96}>
        {(w) => {
          const items = workItemViews(w);
          return (
            <Section title="Việc cần xử lý" flush>
              {items.length === 0 ? (
                <p className={`muted small ${styles.widgetEmpty}`}>Không có việc tồn đọng.</p>
              ) : (
                <ul className={styles.alerts} aria-label="Cần xử lý">
                  {items.map((it) => {
                    const Icon = ICON[it.key as keyof typeof ICON] ?? AlertTriangle;
                    return (
                      <li key={it.key} className={it.bad ? styles.alertBad : undefined}>
                        <Icon size={20} />
                        <div>
                          <b>{it.title}</b>
                          <p className="small">{it.body}</p>
                        </div>
                        <Link href={it.href} className="btn btn-quiet btn-sm">
                          {it.cta} <ArrowRight size={14} />
                        </Link>
                      </li>
                    );
                  })}
                </ul>
              )}
            </Section>
          );
        }}
      </Widget>

      <Section flush>
        <div className={styles.kpis}>
          <Widget query={bi} title="Tỷ lệ lấp đầy" height={128} card={false}>
            {(d) => (
              <StatTile
                hero
                label="Tỷ lệ lấp đầy"
                value={fmtPercentValue(d.portfolioStatus.occupancyRate)}
                unit={d.portfolioStatus.occupancyRate === null ? undefined : "%"}
                delta={{ text: d.portfolioStatus.totalUnits === 0 ? "Chưa có căn trong hệ thống" : `${fmtNumber(d.portfolioStatus.rentedUnits)}/${fmtNumber(d.portfolioStatus.totalUnits)} căn đã cho thuê`, tone: "flat" }}
              />
            )}
          </Widget>
          <Widget query={bi} title="Lịch xem hôm nay" height={128} card={false}>
            {(d) => <StatTile label="Lịch xem hôm nay" value={fmtNumber(d.viewingsToday.today)} delta={{ text: `so với ${fmtNumber(d.viewingsToday.yesterday)} hôm qua`, tone: "flat" }} />}
          </Widget>
          <Widget query={bi} title="Tỷ lệ khách bỏ hẹn" height={128} card={false}>
            {(d) => {
              const r = d.funnel.noShowRate;
              return (
                <StatTile
                  label="Tỷ lệ khách bỏ hẹn"
                  value={fmtPercentValue(r)}
                  unit={r === null ? undefined : "%"}
                  delta={
                    r === null
                      ? { text: "Chưa có lịch xem tới giờ hẹn trong khoảng", tone: "flat" }
                      : { text: `${fmtNumber(d.funnel.noShowCount)}/${fmtNumber(d.funnel.noShowDenominator)} lịch · mục tiêu ≤ ${NO_SHOW_TARGET}%`, tone: r <= NO_SHOW_TARGET ? "good" : "bad", dir: r <= NO_SHOW_TARGET ? "down" : "up" }
                  }
                />
              );
            }}
          </Widget>
          <Widget query={dispatch} title="Host nhận ca trung bình" height={128} card={false}>
            {(s) => {
              const over = s.byHost.filter((h) => h.avgAcceptSeconds > ACCEPT_SLA_SECONDS).length;
              return (
                <StatTile
                  label="Host nhận ca trung bình"
                  value={fmtDuration(s.avgAcceptSeconds)}
                  delta={
                    s.avgAcceptSeconds === null
                      ? { text: "Chưa có ca được nhận trong khoảng", tone: "flat" }
                      : { text: `SLA ${fmtDuration(ACCEPT_SLA_SECONDS)} · ${fmtNumber(over)} Host vượt`, tone: over > 0 ? "bad" : "good", dir: over > 0 ? "up" : "down" }
                  }
                />
              );
            }}
          </Widget>
        </div>
      </Section>

      <div className={styles.two}>
        <Widget query={bi} title="Phễu chuyển đổi" height={320}>
          {(d) => <Funnel steps={funnelSteps(d.funnel.stages)} subtitle={`Lịch xem tạo trong ${label}, theo dõi tới ký hợp đồng`} />}
        </Widget>
        <Widget query={bi} title="Lịch xem đặt mới mỗi ngày" height={320}>
          {(d) => (
            <Trend
              title="Lịch xem đặt mới mỗi ngày"
              subtitle={`${label} · theo ngày tạo lịch, không tính lịch đã huỷ`}
              data={d.dailyBookings.map((x) => ({ label: shortDay(x.date), value: x.count }))}
              seriesName="Lịch xem"
            />
          )}
        </Widget>
      </div>

      <div className={styles.two}>
        <Widget query={bi} title="Tỷ lệ lấp đầy theo toà" height={300}>
          {(d) => (d.occupancyHeatmap.length === 0 ? <Empty>Chưa có căn nào trong hệ thống.</Empty> : <Heatmap rows={heatRows(d.occupancyHeatmap)} />)}
        </Widget>
        <div className={styles.stackCol}>
          <Widget query={bi} title="Rổ hàng" height={110}>
            {(d) => {
              const p = d.portfolioStatus;
              return p.totalUnits === 0 ? (
                <Empty>Chưa có căn nào trong hệ thống.</Empty>
              ) : (
                <div className={`card ${styles.padCard}`}>
                  <StackBar
                    title={`Rổ hàng ${fmtNumber(p.totalUnits)} căn`}
                    segments={[
                      { label: "Đã cho thuê", value: p.rentedUnits },
                      { label: "Đang giữ căn", value: p.holdingUnits },
                      { label: "Còn trống", value: p.availableUnits },
                      { label: "Ngừng niêm yết / bảo trì", value: p.unlistedUnits + p.maintenanceUnits },
                    ]}
                  />
                </div>
              );
            }}
          </Widget>
          <Widget query={activity} title="Dòng sự kiện" height={260}>
            {(page) => (
              <div className={`card ${styles.padCard}`}>
                <h3 className={styles.feedTitle}>
                  <Clock3 size={17} /> Dòng sự kiện
                </h3>
                <ul className={styles.feed}>
                  {page.items.map((n) => (
                    <li key={n.id}>
                      <div>
                        <b>{activityTitle(n.actionType)}</b>
                        <p className="small muted">{activityActor(n)}</p>
                      </div>
                      <span className="xs muted">
                        {fmtTime(n.createdAt)} · {relTime(n.createdAt, now)}
                      </span>
                    </li>
                  ))}
                  {page.items.length === 0 && <li className="muted small">Chưa có sự kiện.</li>}
                </ul>
              </div>
            )}
          </Widget>
        </div>
      </div>

      <Widget query={dispatch} title="Thời gian nhận ca của Field Host" height={220}>
        {(s) =>
          s.byHost.length === 0 ? (
            <Empty>Chưa có ca nào được Host nhận trong {label}.</Empty>
          ) : (
            <BarList
              title="Thời gian nhận ca của Field Host"
              subtitle={`Trung bình trong ${label}; mục tiêu nhận ticket trong vòng 3 phút`}
              items={s.byHost.map((h) => ({ label: h.hostName, value: h.avgAcceptSeconds, sub: `${fmtNumber(h.accepted)} ca` }))}
              threshold={ACCEPT_SLA_SECONDS}
              thresholdLabel="Ngưỡng SLA 3 phút (180 giây)"
              format={(v) => fmtDuration(v)}
              unit="Thời gian nhận ca"
            />
          )
        }
      </Widget>
    </div>
  );
}

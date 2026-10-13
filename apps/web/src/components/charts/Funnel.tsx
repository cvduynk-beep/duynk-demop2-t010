"use client";

import { AlertTriangle } from "lucide-react";
import type { FunnelStepView } from "@/lib/admin/dashboard";
import { ChartFrame } from "./ChartFrame";
import { ORDINAL_6 } from "./tokens";
import { useChartTip } from "./useChartTip";
import styles from "./Charts.module.css";

const NO_SOURCE = "Chưa có nguồn dữ liệu";

/** % giữ lại so với bước trước; null khi một trong hai bước chưa có nguồn hoặc bước trước = 0 (không chia cho 0). */
export function retention(steps: FunnelStepView[], i: number): number | null {
  if (i === 0) return null;
  const cur = steps[i].value;
  const prev = steps[i - 1].value;
  if (cur === null || prev === null || prev === 0) return null;
  return Math.round((cur / prev) * 100);
}

/** Phễu 6 giai đoạn: thứ tự là nghĩa → thang một hue sáng dần đến đậm (ordinal), không phải 6 màu rời. */
export function Funnel({ steps, subtitle }: { steps: FunnelStepView[]; subtitle: string }) {
  const tip = useChartTip();
  const max = Math.max(0, ...steps.map((s) => s.value ?? 0));
  // Điểm rơi lớn nhất giữa hai giai đoạn liền kề đều có số liệu.
  const drops = steps.map((_, i) => ({ i, keep: retention(steps, i) })).filter((d): d is { i: number; keep: number } => d.keep !== null);
  const worst = drops.length ? drops.reduce((a, b) => (b.keep < a.keep ? b : a)) : null;
  const fmt = (v: number | null) => (v === null ? "—" : v.toLocaleString("vi-VN"));

  return (
    <ChartFrame
      title="Phễu chuyển đổi 6 giai đoạn"
      subtitle={subtitle}
      table={{
        head: ["Giai đoạn", "Số lượt", "Giữ lại so với giai đoạn trước"],
        rows: steps.map((s, i) => [s.label, s.value === null ? NO_SOURCE : fmt(s.value), retention(steps, i) === null ? "—" : `${retention(steps, i)}%`]),
      }}
    >
      <div className={styles.plot} data-plot="">
        <ol className={styles.funnel}>
          {steps.map((s, i) => {
            const pct = retention(steps, i);
            const tipLabel = s.value === null ? NO_SOURCE : pct === null ? "số lượt" : `giữ lại ${pct}% so với ${steps[i - 1].label.toLowerCase()}`;
            return (
              <li key={s.key} {...tip.bind(s.label, [{ label: tipLabel, value: fmt(s.value), key: ORDINAL_6[i] }])}>
                <span className={styles.fLabel}>{s.label}</span>
                <span className={styles.fTrack}>
                  {s.value !== null && (
                    <span className={styles.fBar} style={{ width: `${max > 0 ? Math.max(1.6, (s.value / max) * 100) : 1.6}%`, background: ORDINAL_6[i] }} />
                  )}
                </span>
                <span className={`tnum ${styles.fVal}`}>
                  {s.value === null ? <em>{NO_SOURCE}</em> : <b>{fmt(s.value)}</b>}
                  {pct !== null && <em>{pct}%</em>}
                </span>
              </li>
            );
          })}
        </ol>
        {tip.node}
      </div>
      {worst && worst.keep < 100 && (
        <p className={`small ${styles.insight}`}>
          <AlertTriangle size={15} /> Điểm rơi lớn nhất: từ “{steps[worst.i - 1].label}” xuống “{steps[worst.i].label}” chỉ giữ lại {worst.keep}%.
        </p>
      )}
    </ChartFrame>
  );
}

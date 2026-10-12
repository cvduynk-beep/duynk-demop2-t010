"use client";

import { useState } from "react";
import { CheckCircle2, Clock, Sparkles, TrendingDown, X } from "lucide-react";
import { toast } from "@/components/ui/Toast";
import { vnd, vndShort } from "@/lib/format";
import { errorText, landlordApi } from "@/lib/landlord/api";
import { LAYOUT_LABEL } from "@/lib/landlord/labels";
import type { PriceInsight } from "@/lib/landlord/types";
import { invalidateLandlordData } from "@/lib/landlord/useLandlordQuery";
import styles from "./Landlord.module.css";

const DISMISS_KEY = "vinstay.landlord.priceInsight.dismissed";

/** Đã bấm "Giữ nguyên" cho đúng căn + đúng mức đề xuất ⇒ không hiện lại (tiện ích theo trình duyệt, lỗi storage thì bỏ qua). */
const dismissKey = (i: PriceInsight) => `${i.unitId}:${i.suggestedRent}`;
function readDismissed(): string[] {
  try {
    return JSON.parse(localStorage.getItem(DISMISS_KEY) ?? "[]");
  } catch {
    return [];
  }
}
function writeDismissed(keys: string[]) {
  try {
    localStorage.setItem(DISMISS_KEY, JSON.stringify(keys.slice(-50)));
  } catch {
    // trình duyệt chặn storage: chỉ ẩn trong phiên này
  }
}

const tr = (v: number) => `${+(v / 1_000_000).toFixed(1)}tr`;

/**
 * Thẻ "AI Matchmaker · Dynamic Deal Engine": gợi ý hạ giá căn đang trống về mức đạt badge "Căn hời phân khu".
 * Số liệu do backend tính từ dữ liệu thật (mặt bằng căn cùng layout đã xác thực, ngày trống, ca xem không chốt cọc);
 * "Áp dụng" đổi giá thật (`PUT /landlord/units/:id/rent`).
 */
export function PriceInsightCard({ insights }: { insights: PriceInsight[] }) {
  const [dismissed, setDismissed] = useState<string[]>(() => (typeof window === "undefined" ? [] : readDismissed()));
  const [hidden, setHidden] = useState(false);
  const [busy, setBusy] = useState(false);
  const [applied, setApplied] = useState<string | null>(null);

  const i = insights.find((x) => !dismissed.includes(dismissKey(x)));
  if (hidden || !i) return null;

  const keep = () => {
    const next = [...dismissed, dismissKey(i)];
    setDismissed(next);
    writeDismissed(next);
  };

  const apply = async () => {
    setBusy(true);
    const res = await landlordApi.updateUnitRent(i.unitId, i.suggestedRent);
    setBusy(false);
    if (!res.ok) {
      toast(errorText(res, "Không đổi được giá."), "info");
      return;
    }
    setApplied(i.unitId);
    toast(`Đã áp dụng ${vnd(i.suggestedRent)}đ/tháng cho căn ${i.unitCode}${i.dealBadge ? " — bật nhãn Căn hời phân khu" : ""}.`, "success");
    invalidateLandlordData();
  };

  const signals: string[] = [];
  if (i.viewingsNoDeposit > 0) signals.push(`${i.viewingsNoDeposit} ca xem gần đây khách chưa chốt cọc`);
  if (i.noShows > 0) signals.push(`${i.noShows} khách không đến`);
  if (i.daysVacant > 0) signals.push(`căn đã trống ${i.daysVacant} ngày`);
  const diff = i.currentRent - i.marketMedian;
  const scope = i.scope === "zone" ? `${i.zone}` : "toàn Ocean Park";

  return (
    <section className={styles.aiCard} aria-label="Gợi ý tối ưu giá từ VinStay AI">
      <div className={styles.aiHeader}>
        <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
          <span className={styles.aiBadge}>
            <Sparkles size={13} /> AI Matchmaker · Dynamic Deal Engine
          </span>
          <span className="muted xs">
            So với {i.comps} căn {LAYOUT_LABEL[i.layoutKind].toLowerCase()} đã xác thực · {scope}
          </span>
        </div>
        <button type="button" onClick={() => setHidden(true)} className="icon-btn" title="Tạm ẩn gợi ý" style={{ width: 24, height: 24, padding: 0 }}>
          <X size={15} />
        </button>
      </div>

      <div className={styles.aiGrid}>
        <div>
          <h3 style={{ fontSize: 15.5, fontWeight: 700, margin: "0 0 6px", color: "var(--ink)" }}>
            {i.viewingsNoDeposit > 0
              ? `Căn ${i.unitCode} có khách xem nhưng chưa chốt cọc`
              : `Căn ${i.unitCode} đang trống ${i.daysVacant} ngày`}
          </h3>
          <p className="small" style={{ margin: "0 0 8px", color: "var(--ink-700, #475569)", lineHeight: 1.5 }}>
            {signals.length > 0 && <>Ghi nhận: <b>{signals.join(", ")}</b>. </>}
            Giá chào <b>{tr(i.currentRent)}/tháng</b>
            {diff > 0 ? (
              <> cao hơn ~{vndShort(diff)} so với mặt bằng {tr(i.marketMedian)} cùng loại căn ({scope}).</>
            ) : (
              <> sát mặt bằng {tr(i.marketMedian)} cùng loại căn ({scope}) nên chưa nổi bật trong kết quả tìm kiếm.</>
            )}
          </p>
          <div style={{ display: "flex", flexDirection: "column", gap: 6, fontSize: 13 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 6, color: "var(--coral, #dc2626)" }}>
              <TrendingDown size={15} />
              <span>
                Rủi ro trống phòng: <b>mất ~{tr(i.vacancyLossPerMonth)}/tháng</b> + phí quản lý BQL nếu kéo dài thêm 15–30 ngày
              </span>
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: 6, color: "var(--kelp, #059669)" }}>
              <Clock size={15} />
              <span>
                Nếu chỉnh sang <b>{vnd(i.suggestedRent)}đ</b>:{" "}
                {i.dealBadge ? (
                  <>
                    kích hoạt nhãn <b>&quot;Căn hời phân khu&quot;</b> (All-in rẻ hơn mặt bằng ~{i.savingPercent}%), được ưu tiên hiển thị đầu kết quả AI Matchmaker
                  </>
                ) : (
                  <>sát mặt bằng hơn, vẫn giữ đúng giá sàn chốt nhanh bạn đã đặt</>
                )}
              </span>
            </div>
          </div>
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: 8, minWidth: 210, alignSelf: "center" }}>
          {applied === i.unitId ? (
            <div
              style={{
                padding: "8px 12px",
                background: "rgba(16, 185, 129, 0.1)",
                border: "1px solid rgba(16, 185, 129, 0.3)",
                borderRadius: "var(--r)",
                color: "var(--kelp)",
                fontSize: 12.5,
                fontWeight: 600,
                display: "flex",
                alignItems: "center",
                gap: 6,
              }}
            >
              <CheckCircle2 size={16} /> Đã áp dụng {tr(i.suggestedRent)}
              {i.dealBadge ? " & bật nhãn Căn hời" : ""}
            </div>
          ) : (
            <>
              <button
                type="button"
                onClick={() => void apply()}
                disabled={busy}
                className="btn btn-primary btn-sm"
                style={{ display: "inline-flex", alignItems: "center", justifyContent: "center", gap: 6, fontWeight: 600 }}
              >
                <Sparkles size={14} /> Áp dụng giá {tr(i.suggestedRent)}
              </button>
              <button type="button" onClick={keep} disabled={busy} className="btn btn-quiet btn-xs" style={{ fontSize: 12, color: "var(--ink-4, #64748b)" }}>
                Giữ nguyên giá {tr(i.currentRent)}
              </button>
            </>
          )}
        </div>
      </div>
    </section>
  );
}

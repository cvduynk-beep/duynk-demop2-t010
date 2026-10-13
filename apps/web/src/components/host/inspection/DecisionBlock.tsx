"use client";

import { AlertTriangle, CheckCircle2 } from "lucide-react";
import type { InspectionDraft } from "@/lib/inspection/types";
import consign from "@/components/consign/Consign.module.css";
import styles from "./Inspection.module.css";

interface Props {
  draft: InspectionDraft;
  /** Căn khoá điện tử chưa có PIN trong hệ thống ⇒ hiện ô nhập PIN (bắt buộc khi đề xuất duyệt). */
  needPin: boolean;
  invalidField: string | null;
  busy: boolean;
  onChange: (patch: (d: InspectionDraft) => InspectionDraft) => void;
  onSubmit: () => void;
}

/**
 * Mục 8 — đề xuất của Field Host (như bản mock). Căn bình thường ⇒ "Đề xuất duyệt": niêm yết ngay, không qua Admin.
 * Căn bất thường (giá thuê quá cao, nội thất sai hiện trạng…) ⇒ "Đề xuất không duyệt": phiếu chuyển Admin rà soát.
 */
export function DecisionBlock({ draft, needPin, invalidField, busy, onChange, onSubmit }: Props) {
  const approve = draft.recommendation === "approve";
  const set = (recommendation: InspectionDraft["recommendation"]) => onChange((d) => ({ ...d, recommendation }));
  return (
    <>
      <div className={consign.formCard}>
        <h3 className={consign.formCardTitle}>8. Đề xuất của Field Host</h3>

        <div className={styles.decisionRadios} role="radiogroup" aria-label="Đề xuất">
          <label className={styles.decisionRadio}>
            <input type="radio" name="recommendation" value="approve" checked={approve} onChange={() => set("approve")} />
            <span>Đề xuất duyệt</span>
          </label>
          <label className={styles.decisionRadio}>
            <input type="radio" name="recommendation" value="reject" checked={!approve} onChange={() => set("reject")} />
            <span>Đề xuất không duyệt</span>
          </label>
        </div>

        <div className={`${styles.decisionHint} ${approve ? styles.decisionHintOk : styles.decisionHintWarn}`}>
          {approve ? <CheckCircle2 size={16} /> : <AlertTriangle size={16} />}
          <span>
            {approve ? (
              <>
                <b>Căn bình thường:</b> nộp xong căn lên hệ thống ngay, không qua Admin.
              </>
            ) : (
              <>
                <b>Căn bất thường</b> (giá thuê quá cao, nội thất sai hiện trạng…): phiếu tự gửi Admin rà soát, Admin quyết duyệt niêm yết hay từ chối.
              </>
            )}
          </span>
        </div>

        <label id="insp-note" className={`field ${invalidField === "note" ? styles.rowBad : ""}`}>
          <textarea
            className="input"
            rows={3}
            maxLength={300}
            placeholder={approve ? "Ghi chú thêm về tình trạng căn hộ (Tùy chọn)..." : "Nhập lý do đề xuất không duyệt (Bắt buộc)..."}
            value={draft.note}
            onChange={(e) => onChange((d) => ({ ...d, note: e.target.value }))}
            style={{ resize: "vertical" }}
          />
        </label>

        {needPin && (
          <label id="insp-doorPin" className={`field ${invalidField === "doorPin" ? styles.rowBad : ""}`}>
            <span className="label">
              Mã PIN thật của cửa (4–8 chữ số) {approve && <b style={{ color: "var(--danger)" }}>*</b>}
            </span>
            <input
              type="password"
              inputMode="numeric"
              autoComplete="off"
              pattern="\d{4,8}"
              maxLength={8}
              className="input"
              value={draft.doorPin}
              onChange={(e) => onChange((d) => ({ ...d, doorPin: e.target.value.replace(/\D/g, "") }))}
              placeholder="Nhập mã đang dùng mở cửa căn này"
            />
            <span className="muted xs" style={{ marginTop: 4 }}>
              Căn khoá điện tử chưa có mã trong hệ thống. Mã được mã hoá khi lưu, chỉ dùng cấp cho Field Host đón khách; không nhập mã giả.
              {approve ? " Bắt buộc khi đề xuất duyệt." : " Có mã thì Admin mới duyệt niêm yết được."}
            </span>
          </label>
        )}
      </div>

      <div style={{ display: "flex", justifyContent: "flex-end" }}>
        <button type="button" className={`btn ${approve ? "btn-primary" : "btn-danger"}`} style={{ padding: "10px 24px" }} disabled={busy} onClick={onSubmit}>
          {approve ? "Nộp báo cáo & niêm yết" : "Nộp báo cáo cho Admin"}
        </button>
      </div>
    </>
  );
}

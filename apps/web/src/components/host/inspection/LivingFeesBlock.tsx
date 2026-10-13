"use client";

import { vnd } from "@/lib/format";
import { FEE_NOTE_MAX } from "@/lib/inspection/livingFees";
import type { InspectionDetail, InspectionDraft } from "@/lib/inspection/types";
import consign from "@/components/consign/Consign.module.css";
import styles from "./Inspection.module.css";

interface Props {
  detail: Pick<InspectionDetail, "areaM2" | "feeDefaults">;
  draft: InspectionDraft;
  invalidField: string | null;
  onChange: (patch: (d: InspectionDraft) => InspectionDraft) => void;
}

type FeeKey = "mgmtFeePerM2" | "motorbikeFee" | "carFee";

/**
 * Mục 6 — biểu phí sinh hoạt thực tế tại tòa (như bản mock). Điền sẵn đơn giá chung; Host sửa theo xác minh với chủ nhà /
 * lễ tân sảnh. Khi căn niêm yết, All-in Cost của khách tính theo đúng biểu phí này.
 */
export function LivingFeesBlock({ detail, draft, invalidField, onChange }: Props) {
  const f = draft.livingFees;
  const set = (patch: Partial<InspectionDraft["livingFees"]>) => onChange((d) => ({ ...d, livingFees: { ...d.livingFees, ...patch } }));
  // Diện tích tính phí: diện tích thực tế Host nhập ở mục 2 (thông tin tin đăng), thiếu thì diện tích chủ khai.
  const area = Number(draft.facts.areaM2) || detail.areaM2;
  const mgmtMonthly = Math.round(area * (Number(f.mgmtFeePerM2) || 0));
  const std = detail.feeDefaults;
  const bad = (key: string) => (invalidField === `livingFees.${key}` ? styles.rowBad : "");

  const field = (key: FeeKey, label: string, step: number, hint: string) => (
    <label id={`insp-livingFees-${key}`} className={`field ${bad(key)}`}>
      <span className="label" style={{ fontWeight: 600 }}>
        {label}
      </span>
      <input type="number" className="input" min={0} step={step} inputMode="numeric" value={f[key]} onChange={(e) => set({ [key]: e.target.value.replace(/\D/g, "") })} />
      <span className="muted xs">{hint}</span>
    </label>
  );

  return (
    <div className={consign.formCard}>
      <h3 className={consign.formCardTitle}>6. Biểu phí sinh hoạt thực tế tại tòa (Xác minh cùng Chủ nhà &amp; Lễ tân sảnh)</h3>
      <p className="muted small" style={{ margin: 0 }}>
        Sale / Field Host xác nhận biểu phí thực tế với Chủ nhà hoặc Lễ tân sảnh để hiển thị minh bạch cho khách thuê. Khách tự chuẩn bị ngân sách đóng tại sảnh và không bị nhầm lẫn
        với tiền thuê trả cho chủ nhà.
      </p>

      <div className={styles.feeGrid}>
        {field("mgmtFeePerM2", "Phí quản lý BQL (đ/m²/tháng)", 1000, `Căn ${area}m²: ~${vnd(mgmtMonthly)}/tháng (Khách tự đóng BQL)`)}
        {field("motorbikeFee", "Phí gửi xe máy (đ/xe/tháng)", 10000, std ? `Đơn giá chung: ${vnd(std.motorbikeFee)} đ/tháng` : "Theo biểu phí BQL tòa")}
        {field("carFee", "Phí gửi ô tô (đ/xe/tháng)", 50000, std ? `Đơn giá chung: ${vnd(std.carFee)} đ/tháng` : "Theo biểu phí BQL tòa")}
      </div>

      <label id="insp-livingFees-note" className={`field ${bad("note")}`}>
        <span className="label" style={{ fontWeight: 600 }}>
          Ghi chú phí khác / Tiện ích nội khu (nếu có)
        </span>
        <input
          type="text"
          className="input"
          maxLength={FEE_NOTE_MAX}
          placeholder="Ví dụ: Miễn phí bể bơi 4 mùa & gym nội khu, nước theo biểu giá BQL..."
          value={f.note}
          onChange={(e) => set({ note: e.target.value })}
        />
      </label>
    </div>
  );
}

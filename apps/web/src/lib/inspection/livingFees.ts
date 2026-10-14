import { RATES } from "@/lib/pricing/cost";
import { detectListingTextViolation, listingTextMessage } from "@/lib/units/listing-text";
import type { DraftError, InspectionDetail, InspectionDraft, InspectionLivingFees } from "./types";

/**
 * Mục "Biểu phí sinh hoạt thực tế tại tòa" — Field Host xác minh với chủ nhà / lễ tân sảnh. Khớp backend
 * `inspection-report.validator.ts` (V15): số nguyên ≥ 0, trần chống gõ thừa số 0; ghi chú ≤150 ký tự, cấm SĐT/link
 * (số tiền được phép). Niêm yết ⇒ ghi vào căn, All-in Cost của khách tính theo đúng biểu phí này.
 */
export const LIVING_FEE_MAX = { mgmtFeePerM2: 50_000, motorbikeFee: 2_000_000, carFee: 10_000_000 } as const;
export const FEE_NOTE_MAX = 150;
export const LIVING_FEE_KEYS = ["mgmtFeePerM2", "motorbikeFee", "carFee"] as const;

/** Điền sẵn đơn giá chung (fee_configs do Admin cài); backend cũ chưa trả ⇒ đơn giá dự phòng của web. */
export function blankLivingFees(detail: Pick<InspectionDetail, "feeDefaults">): InspectionDraft["livingFees"] {
  const d = detail.feeDefaults ?? { mgmtFeePerM2: RATES.mgmtPerM2, motorbikeFee: RATES.motorbike, carFee: RATES.car };
  return { mgmtFeePerM2: String(d.mgmtFeePerM2), motorbikeFee: String(d.motorbikeFee), carFee: String(d.carFee), note: "" };
}

export function validateLivingFees(draft: InspectionDraft): DraftError | null {
  const f = draft.livingFees;
  for (const key of LIVING_FEE_KEYS) {
    const raw = f[key].trim();
    const v = Number(raw);
    if (raw === "" || !Number.isInteger(v) || v < 0 || v > LIVING_FEE_MAX[key]) {
      return { field: `livingFees.${key}`, message: `Phí phải là số nguyên từ 0 đến ${LIVING_FEE_MAX[key].toLocaleString("vi-VN")}đ.` };
    }
  }
  const note = f.note.trim();
  if (note.length > FEE_NOTE_MAX) return { field: "livingFees.note", message: `Ghi chú phí tối đa ${FEE_NOTE_MAX} ký tự.` };
  const v = note ? detectListingTextViolation(note) : null;
  if (v === "phone" || v === "url") return { field: "livingFees.note", message: listingTextMessage(v) };
  return null;
}

export function toLivingFeesDto(draft: InspectionDraft): InspectionLivingFees {
  const f = draft.livingFees;
  const note = f.note.trim();
  return { mgmtFeePerM2: Number(f.mgmtFeePerM2), motorbikeFee: Number(f.motorbikeFee), carFee: Number(f.carFee), ...(note ? { note } : {}) };
}

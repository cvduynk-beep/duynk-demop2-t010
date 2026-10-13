import { api, apiErrorText, type ApiResponse } from "@/lib/apiClient";
import { invalidateApiPattern, useApiQuery, type Query } from "@/lib/query/useApiQuery";

// ─── Contract backend: /admin/settings/hold-hours · /admin/settings/fee-rates (deposit-policy ở ./api) ────────

export interface HoldAuditEntry {
  id: string;
  at: string;
  by: string;
  scope: "default" | "unit";
  unitId: string | null;
  unitCode: string | null;
  from: number | null;
  to: number | null;
  /** Căn về lại mức mặc định toàn sàn. */
  reset: boolean;
  reason: string | null;
}

export interface HoldPolicy {
  defaultHours: number;
  min: number;
  max: number;
  /** `config` = Admin đã đặt; `default` = chưa cấu hình, dùng 48 giờ. */
  source: "config" | "default";
  history: HoldAuditEntry[];
}

export interface FeeRatesView {
  mgmtFeePerM2: number;
  motorbike: number;
  car: number;
  utilityPerPerson: number;
  referenceHousehold: { motorbikes: number; cars: number; occupants: number };
}

const text = (fallback: string) => (res: ApiResponse<unknown>) => apiErrorText(res, fallback);

export const useHoldPolicy = (): Query<HoldPolicy> =>
  useApiQuery({ key: "admin-settings:hold", fetch: () => api.get<HoldPolicy>("/admin/settings/hold-hours"), errorText: text("Không tải được thời hạn giữ chỗ.") });

export const useFeeRates = (): Query<FeeRatesView> =>
  useApiQuery({ key: "admin-settings:fee-rates", fetch: () => api.get<FeeRatesView>("/admin/settings/fee-rates"), errorText: text("Không tải được biểu phí.") });

export const updateDefaultHoldHours = (hours: number, reason: string) =>
  api.post<{ success: boolean; defaultHours: number }>("/admin/settings/hold-hours", { hours, reason });

/** Đổi mặc định ảnh hưởng mọi căn không có mức riêng ⇒ làm mới cả chi tiết căn trong rổ hàng. */
export function invalidateSettings() {
  invalidateApiPattern("admin-settings:");
  invalidateApiPattern("admin-deposit-policy");
  invalidateApiPattern("admin-inventory:");
}

/** Kiểm trước khi gửi (backend kiểm lại). null = hợp lệ. */
export function validateHoldHours(raw: string, min: number, max: number): string | null {
  const n = Number(raw);
  if (raw.trim() === "" || !Number.isInteger(n) || n < min || n > max) return `Thời hạn phải là số giờ nguyên từ ${min} đến ${max}.`;
  return null;
}

export interface DepositPolicyInput {
  minRatio: number;
  maxRatio: number;
  defaultRatio: number;
}

/** Cùng luật backend `updateDepositPolicy` + DTO: 0.1 ≤ min ≤ 2; max ≥ min, 1 ≤ max ≤ 10; min ≤ default ≤ max. */
export function validateDepositPolicy(p: DepositPolicyInput): string | null {
  if (![p.minRatio, p.maxRatio, p.defaultRatio].every(Number.isFinite)) return "Nhập đủ ba tỷ lệ.";
  if (p.minRatio < 0.1 || p.minRatio > 2) return "Tỷ lệ cọc tối thiểu phải từ 0,1 (10%) đến 2,0 (200%).";
  if (p.maxRatio < p.minRatio || p.maxRatio < 1 || p.maxRatio > 10) return "Tỷ lệ cọc tối đa phải từ 1,0 trở lên, không nhỏ hơn tối thiểu và không vượt quá 10,0 (1000%).";
  if (p.defaultRatio < p.minRatio || p.defaultRatio > p.maxRatio) return "Tỷ lệ cọc mặc định phải nằm trong khoảng tối thiểu – tối đa.";
  return null;
}

import { api, apiErrorText, type ApiResponse } from "@/lib/apiClient";
import { invalidateApiPattern, useApiQuery, type Query } from "@/lib/query/useApiQuery";

// ─── Contract backend: GET / PUT /admin/settings/hold-policy ─────────────────────────────────────────────────

export interface HoldPolicyChange {
  at: string;
  actorName: string | null;
  scope: "default" | "unit";
  unitCode: string | null;
  from: number | null;
  to: number | null;
  reason: string | null;
}

export interface HoldPolicy {
  defaultHours: number;
  minHours: number;
  maxHours: number;
  /** true = chưa ai lưu, đang dùng mặc định cấu hình (48 giờ). */
  isDefault: boolean;
  version: string;
  updatedAt: string | null;
  updatedBy: { id: string; name: string | null } | null;
  holdingDepositAmount: number;
  history: HoldPolicyChange[];
  /** Chỉ có ở response PUT: false = giá trị không đổi, server không ghi gì. */
  changed?: boolean;
}

export const REASON_MIN = 5;
export const REASON_MAX = 300;

export const holdPolicyQuery = {
  key: "admin-settings:hold-policy",
  fetch: () => api.get<HoldPolicy>("/admin/settings/hold-policy"),
  errorText: (res: ApiResponse<HoldPolicy>) => apiErrorText(res, "Không tải được chính sách giữ chỗ."),
};

export const useHoldPolicy = (): Query<HoldPolicy> => useApiQuery(holdPolicyQuery, true);

/** Sau khi lưu / bị 409: bỏ cache ⇒ tải lại từ server (không tự sửa state cục bộ). */
export const invalidateHoldPolicy = () => invalidateApiPattern("admin-settings:");

export const saveHoldPolicy = (body: { defaultHours: number; reason: string; version: string }) =>
  api.put<HoldPolicy>("/admin/settings/hold-policy", body);

export type HoldPolicyField = "defaultHours" | "reason";

export type SaveOutcome =
  | { kind: "ok"; policy: HoldPolicy }
  /** Admin khác vừa lưu: hiện giá trị mới nhất, bắt lưu lại có chủ đích. */
  | { kind: "conflict"; message: string; latest: HoldPolicy | null }
  | { kind: "field"; message: string; errors: Partial<Record<HoldPolicyField, string>> }
  | { kind: "error"; message: string };

export function saveOutcome(res: ApiResponse<HoldPolicy>): SaveOutcome {
  if (res.ok) return { kind: "ok", policy: res.data };
  if (res.status === 409 && res.code === "hold_policy_conflict") {
    return { kind: "conflict", message: res.message ?? "Chính sách vừa được người khác thay đổi.", latest: (res.errors?.latest as HoldPolicy | undefined) ?? null };
  }
  const errors: Partial<Record<HoldPolicyField, string>> = {};
  for (const k of ["defaultHours", "reason"] as const) if (typeof res.errors?.[k] === "string") errors[k] = res.errors[k] as string;
  if (res.status === 400 && Object.keys(errors).length) return { kind: "field", message: res.message ?? "Thông tin chưa hợp lệ.", errors };
  if (res.status === 400 && typeof res.errors?.version === "string") return { kind: "error", message: res.errors.version as string };
  return { kind: "error", message: apiErrorText(res, "Chưa lưu được chính sách giữ chỗ.") };
}

/** Kiểm trước khi gửi (backend kiểm lại). null = hợp lệ. Giới hạn lấy từ server (`minHours`/`maxHours`). */
export function validateHoldPolicy(hoursInput: string, reason: string, min: number, max: number): Partial<Record<HoldPolicyField, string>> | null {
  const e: Partial<Record<HoldPolicyField, string>> = {};
  const raw = hoursInput.trim();
  const n = Number(raw);
  if (!/^\d+$/.test(raw) || n < min || n > max) e.defaultHours = `Nhập số giờ nguyên từ ${min} đến ${max}.`;
  const r = reason.trim().replace(/\s+/g, " ");
  if (r.length < REASON_MIN || r.length > REASON_MAX) e.reason = `Lý do phải từ ${REASON_MIN} đến ${REASON_MAX} ký tự.`;
  return Object.keys(e).length ? e : null;
}

/** Có thay đổi chưa lưu: số giờ khác giá trị server, hoặc đã gõ lý do. */
export const isDirty = (hoursInput: string, reason: string, saved: number) => hoursInput.trim() !== String(saved) || reason.trim() !== "";

export const changeLabel = (c: HoldPolicyChange) => `${c.from ?? "—"}h → ${c.to ?? "—"}h`;
export const scopeLabel = (c: HoldPolicyChange) => (c.scope === "default" ? "Mặc định toàn sàn" : `Riêng căn ${c.unitCode ?? "(đã xoá)"}`);

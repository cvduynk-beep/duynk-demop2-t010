import { api, apiErrorText, type ApiResponse } from "@/lib/apiClient";
import { invalidateApiPattern, useApiQuery, type Query } from "@/lib/query/useApiQuery";
import type { RegistryKind, RegistryRow } from "./api";

// ─── Sổ hợp đồng thật (`AdminContractRegistryService`): KPI, gom theo bên ký, thao tác ──────────────────────────
// Hook đọc sổ (`useContractRegistry`, `useContractRegistryDetail`) nằm ở ./api.

export type PartyRole = "landlord" | "tenant" | "host";
export type PartyRelation = "signatory" | "handler";

export interface PartySummary {
  /** `${role}.${id}` — đường dẫn `/admin/contracts/parties/<key>`. */
  key: string;
  role: PartyRole;
  id: string;
  name: string;
  total: number;
  live: number;
  needsAction: number;
}

/** Văn bản còn hiệu lực/đang xử lý (chưa kết thúc) theo trạng thái gốc backend. */
const LIVE: Record<RegistryKind, ReadonlySet<string>> = {
  mandate: new Set(["PENDING_INSPECTION", "ACTIVE", "EXIT_REQUESTED"]),
  holding: new Set(["PENDING_PAYMENT", "UNC_PENDING_REVIEW", "PAID_HOLDING"]),
  lease: new Set(["DRAFT", "AWAITING_TENANT_SIGN", "AWAITING_LANDLORD_SIGN", "ACTIVE", "DISPUTED"]),
  partnership: new Set(["ACTIVE"]),
};
export const isLive = (r: Pick<RegistryRow, "kind" | "status">) => LIVE[r.kind].has(r.status);

export const LEASE_EXPIRING_DAYS = 30;
const DAY_MS = 86_400_000;

export interface RegistryKpis {
  activeLeases: number;
  expiringLeases: number;
  /** Tổng cọc giữ chỗ đang khoá căn (PAID_HOLDING). */
  heldDeposits: number;
  exitingMandates: number;
  needsAction: number;
}

export function registryKpis(rows: RegistryRow[], now: number): RegistryKpis {
  const k: RegistryKpis = { activeLeases: 0, expiringLeases: 0, heldDeposits: 0, exitingMandates: 0, needsAction: 0 };
  for (const r of rows) {
    if (r.kind === "lease" && r.status === "ACTIVE") {
      k.activeLeases += 1;
      const left = r.endAt ? Date.parse(r.endAt) - now : Infinity;
      if (left >= 0 && left <= LEASE_EXPIRING_DAYS * DAY_MS) k.expiringLeases += 1;
    }
    if (r.kind === "holding" && r.status === "PAID_HOLDING") k.heldDeposits += r.amount ?? 0;
    if (r.kind === "mandate" && r.status === "EXIT_REQUESTED") k.exitingMandates += 1;
    if (r.needsAction) k.needsAction += 1;
  }
  return k;
}

/** Host chốt cọc chỉ "phụ trách" văn bản cọc; Host trong thoả thuận đối tác là bên ký. */
const relationOf = (r: RegistryRow, role: string): PartyRelation => (r.kind === "holding" && role === "host" ? "handler" : "signatory");

/** Gom mọi bên (trừ nền tảng) xuất hiện trong sổ, kèm số văn bản / còn hiệu lực / cần xử lý. */
export function partiesFromRegistry(rows: RegistryRow[]): PartySummary[] {
  const map = new Map<string, PartySummary>();
  for (const r of rows) {
    for (const p of r.parties) {
      if (p.role === "platform" || !p.id) continue;
      const key = `${p.role}.${p.id}`;
      let s = map.get(key);
      if (!s) {
        s = { key, role: p.role, id: p.id, name: p.name, total: 0, live: 0, needsAction: 0 };
        map.set(key, s);
      }
      s.total += 1;
      if (isLive(r)) s.live += 1;
      if (r.needsAction) s.needsAction += 1;
    }
  }
  return [...map.values()].sort((a, b) => b.needsAction - a.needsAction || b.live - a.live || a.name.localeCompare(b.name, "vi"));
}

export function parsePartyKey(key: string): { role: PartyRole; id: string } | null {
  const m = /^(landlord|tenant|host)\.(.+)$/.exec(key);
  return m ? { role: m[1] as PartyRole, id: m[2] } : null;
}

export function contractsOfParty(rows: RegistryRow[], role: PartyRole, id: string): { row: RegistryRow; relation: PartyRelation }[] {
  return rows.filter((r) => r.parties.some((p) => p.role === role && p.id === id)).map((row) => ({ row, relation: relationOf(row, role) }));
}

// ─── Thông tin liên hệ bên ký (HĐ thuê / ký gửi / cọc) ────────────────────────────────────────────────────────

export interface PartyContact {
  id: string;
  name: string | null;
  email: string | null;
  phone: string | null;
  role: "tenant" | "landlord";
}

export const usePartyContact = (id: string, enabled: boolean): Query<PartyContact> =>
  useApiQuery(
    {
      key: `admin-contract-party:${id}`,
      fetch: () => api.get<PartyContact>(`/admin/contract-parties/${encodeURIComponent(id)}`),
      errorText: (res: ApiResponse<PartyContact>) => apiErrorText(res, "Không tải được thông tin liên hệ."),
    },
    enabled,
  );

// ─── Thao tác ──────────────────────────────────────────────────────────────────────────────────────────────

export const VOID_NOTE_MIN = 5;
export const VOID_NOTE_MAX = 200;

export const contractActions = {
  /** id = HoldingDeposit.id. Backend chỉ GHI NHẬN yêu cầu (audit), phương án xử lý tiền do Ops quyết. */
  voidHold: (depositId: string, reason: "landlord_breach" | "force_majeure", note: string) =>
    api.post<{ success: boolean; message?: string }>(`/admin/contracts/${encodeURIComponent(depositId)}/void-hold`, { reason, note }),
  /** id = ExclusiveMandate.id; backend chặn khi chưa đủ 15 ngày / căn HOLDING / còn HĐ thuê hiệu lực. */
  completeExit: (mandateId: string) => api.post<unknown>(`/admin/contracts/${encodeURIComponent(mandateId)}/complete-exit`),
  remindRenewal: (leaseId: string) => api.post<unknown>(`/admin/contracts/${encodeURIComponent(leaseId)}/remind-renewal`),
};

/** Sau thao tác ghi: sổ hợp đồng, rổ hàng và badge dashboard tải lại. */
export function invalidateContracts() {
  invalidateApiPattern("admin-contract");
  invalidateApiPattern("admin-inventory:");
  invalidateApiPattern("admin-dashboard:");
}

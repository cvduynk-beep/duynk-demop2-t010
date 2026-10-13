import { describe, expect, it } from "vitest";
import type { RegistryRow } from "@/lib/admin/api";
import { contractsOfParty, parsePartyKey, partiesFromRegistry, registryKpis } from "@/lib/admin/contracts";
import { validateDepositPolicy, validateHoldHours } from "@/lib/admin/settings";
import { contractsUsingTemplate } from "@/lib/mock/contract-templates";

const NOW = Date.parse("2026-10-13T00:00:00Z");
const row = (over: Partial<RegistryRow>): RegistryRow => ({
  key: "lease-1",
  kind: "lease",
  id: "1",
  docNumber: "HD-1",
  unitId: "u1",
  unitCode: "VHOP-S1-0701",
  scope: "S1 · Tầng 7 · Căn 01",
  parties: [],
  status: "ACTIVE",
  statusLabel: "Đang hiệu lực",
  tone: "ok",
  startAt: null,
  endAt: null,
  amount: null,
  amountLabel: null,
  needsAction: null,
  createdAt: "2026-10-01T00:00:00Z",
  ...over,
});

const L = { role: "landlord" as const, name: "Chủ A", id: "L1" };
const T = { role: "tenant" as const, name: "Khách B", id: "T1" };
const H = { role: "host" as const, name: "Host C", id: "H1" };
const P = { role: "platform" as const, name: "VinStay AI" };

const rows: RegistryRow[] = [
  row({ key: "lease-1", parties: [L, T], endAt: "2026-10-30T00:00:00Z", needsAction: "Hết hạn trong 30 ngày", amount: 9_000_000 }),
  row({ key: "lease-2", id: "2", parties: [L, T], status: "TERMINATED_SETTLED", endAt: "2026-01-01T00:00:00Z" }),
  row({ key: "holding-3", kind: "holding", id: "3", parties: [T, P, H], status: "PAID_HOLDING", amount: 2_000_000 }),
  row({ key: "mandate-4", kind: "mandate", id: "4", parties: [L, P], status: "EXIT_REQUESTED" }),
  row({ key: "partnership-H1", kind: "partnership", id: "H1", parties: [H, P], status: "ACTIVE" }),
];

describe("lib/admin/contracts", () => {
  it("registryKpis: HĐ thuê hiệu lực, sắp hết hạn ≤30 ngày, cọc đang giữ, uỷ quyền đang thoát", () => {
    expect(registryKpis(rows, NOW)).toEqual({ activeLeases: 1, expiringLeases: 1, heldDeposits: 2_000_000, exitingMandates: 1, needsAction: 1 });
  });

  it("partiesFromRegistry: bỏ nền tảng, đếm tổng / còn hiệu lực / cần xử lý theo từng bên", () => {
    const ps = partiesFromRegistry(rows);
    expect(ps.map((p) => p.key).sort()).toEqual(["host.H1", "landlord.L1", "tenant.T1"]);
    expect(ps.find((p) => p.key === "landlord.L1")).toMatchObject({ total: 3, live: 2, needsAction: 1 });
    expect(ps.find((p) => p.key === "host.H1")).toMatchObject({ total: 2, live: 2 });
  });

  it("contractsOfParty: Host chốt cọc là 'phụ trách', Host trong thoả thuận đối tác là 'bên ký'", () => {
    const rel = contractsOfParty(rows, "host", "H1").map((x) => [x.row.kind, x.relation]);
    expect(rel).toEqual([["holding", "handler"], ["partnership", "signatory"]]);
  });

  it("parsePartyKey", () => {
    expect(parsePartyKey("tenant.abc-1")).toEqual({ role: "tenant", id: "abc-1" });
    expect(parsePartyKey("platform.x")).toBeNull();
  });

  it("contractsUsingTemplate chạy được trên hàng sổ thật (chỉ cần `kind`)", () => {
    expect(contractsUsingTemplate(rows, "CORE-01").map((r) => r.kind)).toContain("mandate");
  });
});

describe("lib/admin/settings — kiểm trước khi gửi (khớp luật backend)", () => {
  it("validateHoldHours: nguyên trong [min, max]", () => {
    expect(validateHoldHours("48", 12, 72)).toBeNull();
    for (const bad of ["", "11", "73", "24.5", "abc"]) expect(validateHoldHours(bad, 12, 72)).not.toBeNull();
  });

  it("validateDepositPolicy", () => {
    expect(validateDepositPolicy({ minRatio: 0.5, maxRatio: 4, defaultRatio: 1 })).toBeNull();
    expect(validateDepositPolicy({ minRatio: 1, maxRatio: 1, defaultRatio: 1 })).toBeNull();
    expect(validateDepositPolicy({ minRatio: 0.05, maxRatio: 4, defaultRatio: 1 })).not.toBeNull();
    expect(validateDepositPolicy({ minRatio: 2, maxRatio: 1.5, defaultRatio: 2 })).not.toBeNull();
    expect(validateDepositPolicy({ minRatio: 0.5, maxRatio: 4, defaultRatio: 5 })).not.toBeNull();
    expect(validateDepositPolicy({ minRatio: 0.5, maxRatio: 11, defaultRatio: 1 })).not.toBeNull();
  });
});

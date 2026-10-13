import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import type { ApiResponse } from "@/lib/apiClient";
import { changeLabel, holdPolicyQuery, isDirty, saveOutcome, scopeLabel, validateHoldPolicy, type HoldPolicy } from "@/lib/admin/settings";

const policy = (over: Partial<HoldPolicy> = {}): HoldPolicy => ({
  defaultHours: 48,
  minHours: 12,
  maxHours: 72,
  isDefault: true,
  version: "default",
  updatedAt: null,
  updatedBy: null,
  holdingDepositAmount: 2_000_000,
  history: [],
  ...over,
});
const res = (over: Partial<ApiResponse<HoldPolicy>>): ApiResponse<HoldPolicy> => ({ ok: false, status: 500, data: {} as HoldPolicy, ...over });

describe("admin settings — kết quả lưu → hành vi UI", () => {
  it("200 ⇒ ok kèm chính sách server trả", () => {
    const p = policy({ defaultHours: 24, isDefault: false, version: "2026-10-13T01:00:00.000Z" });
    expect(saveOutcome(res({ ok: true, status: 200, data: p }))).toEqual({ kind: "ok", policy: p });
  });

  it("409 hold_policy_conflict ⇒ conflict kèm giá trị mới nhất (không coi là thành công)", () => {
    const latest = policy({ defaultHours: 60, updatedBy: { id: "b", name: "Admin B" } });
    expect(saveOutcome(res({ status: 409, code: "hold_policy_conflict", message: "Vừa bị đổi.", errors: { latest } }))).toEqual({ kind: "conflict", message: "Vừa bị đổi.", latest });
  });

  it("400 invalid_request ⇒ lỗi theo field; lỗi version ⇒ error chung", () => {
    expect(saveOutcome(res({ status: 400, code: "invalid_request", message: "x", errors: { defaultHours: "Sai", reason: "Ngắn" } }))).toEqual({
      kind: "field",
      message: "x",
      errors: { defaultHours: "Sai", reason: "Ngắn" },
    });
    expect(saveOutcome(res({ status: 400, code: "invalid_request", errors: { version: "Thiếu phiên bản" } }))).toEqual({ kind: "error", message: "Thiếu phiên bản" });
  });

  it("401/403/5xx/mạng ⇒ error với câu báo thống nhất", () => {
    expect(saveOutcome(res({ status: 403 }))).toMatchObject({ kind: "error", message: expect.stringContaining("quyền") });
    expect(saveOutcome(res({ status: 500 }))).toMatchObject({ kind: "error", message: expect.stringContaining("sự cố") });
    expect(saveOutcome(res({ status: 0, code: "network", message: "Không kết nối được máy chủ." }))).toEqual({ kind: "error", message: "Không kết nối được máy chủ." });
  });
});

describe("admin settings — kiểm form trước khi gửi", () => {
  it("số giờ nguyên trong [min, max] của server; lý do 5–300 ký tự sau khi gom khoảng trắng", () => {
    expect(validateHoldPolicy("24", "Mùa cao điểm", 12, 72)).toBeNull();
    expect(validateHoldPolicy("11", "Mùa cao điểm", 12, 72)).toEqual({ defaultHours: expect.any(String) });
    expect(validateHoldPolicy("73", "Mùa cao điểm", 12, 72)).toEqual({ defaultHours: expect.any(String) });
    expect(validateHoldPolicy("24.5", "Mùa cao điểm", 12, 72)).toEqual({ defaultHours: expect.any(String) });
    expect(validateHoldPolicy("", "Mùa cao điểm", 12, 72)).toEqual({ defaultHours: expect.any(String) });
    expect(validateHoldPolicy("24", "  a   b ", 12, 72)).toEqual({ reason: expect.any(String) });
    expect(validateHoldPolicy("24", "x".repeat(301), 12, 72)).toEqual({ reason: expect.any(String) });
  });

  it("chưa lưu = số giờ khác server hoặc đã gõ lý do", () => {
    expect(isDirty("48", "", 48)).toBe(false);
    expect(isDirty(" 48 ", "   ", 48)).toBe(false);
    expect(isDirty("24", "", 48)).toBe(true);
    expect(isDirty("48", "lý do", 48)).toBe(true);
  });

  it("nhãn lịch sử: mặc định / riêng căn", () => {
    const base = { at: "", actorName: null, from: 48, to: 24, reason: null };
    expect(scopeLabel({ ...base, scope: "default", unitCode: null })).toBe("Mặc định toàn sàn");
    expect(scopeLabel({ ...base, scope: "unit", unitCode: "VHOP-S1.02-1208" })).toBe("Riêng căn VHOP-S1.02-1208");
    expect(changeLabel({ ...base, scope: "default", unitCode: null })).toBe("48h → 24h");
  });

  it("truy vấn gọi đúng endpoint thật", () => {
    expect(holdPolicyQuery.key).toBe("admin-settings:hold-policy");
  });
});

describe("màn /admin/settings — không còn mock", () => {
  it("không import lib/mock, không DEMO_USERS, không localStorage, không số giờ cứng 48", () => {
    const src = readFileSync(path.resolve(__dirname, "../components/admin/AdminSettings.tsx"), "utf8");
    expect(src).not.toMatch(/lib\/mock|DEMO_USERS|useMock|setHoldHours/);
    expect(src).not.toMatch(/\b(localStorage|sessionStorage)\./);
    expect(src).not.toMatch(/\b48\b|\b12\b.*\b72\b/);
  });
});

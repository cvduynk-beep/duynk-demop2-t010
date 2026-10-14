import { describe, expect, it, vi } from "vitest";
import { toUnit } from "@/lib/tenant/adapters";
import { FIXTURE_UNITS } from "@/lib/units/fixtures";
import { getUnit, listUnits, mockFallbackEnabled, UnitNotFoundError, UnitsUpstreamError, type SourceDeps } from "@/lib/units/source";

const REAL = { ...FIXTURE_UNITS[0], code: "VHOP-S1.02-0701" };

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });

function deps(fetchImpl: (url: string) => Promise<Response>, env: SourceDeps["env"] = {}) {
  const warn = vi.fn();
  const fetchMock = vi.fn((input: RequestInfo | URL) => fetchImpl(String(input)));
  const d: SourceDeps = { backendUrl: "http://be:4000", env, fetch: fetchMock as unknown as typeof fetch, warn, timeoutMs: 50 };
  return { d, warn, fetchMock };
}

const FLAG_ON = { ALLOW_MOCK_FALLBACK: "true", NODE_ENV: "development" };

describe("units data-source — danh sách", () => {
  it("có dữ liệu ⇒ source api, gọi đúng endpoint + query", async () => {
    const { d, fetchMock } = deps(async () => json({ success: true, data: [REAL] }));
    const res = await listUnits(d, { layout: "Studio", maxRent: 8_000_000, q: " s1.02 " });
    expect(res).toEqual({ data: [REAL], source: "api" });
    expect(String(fetchMock.mock.calls[0][0])).toBe("http://be:4000/api/v1/properties/units?layout=Studio&maxRent=8000000&q=s1.02");
  });

  it("rỗng thật ⇒ rỗng, KHÔNG thay bằng mock kể cả khi cờ bật", async () => {
    const { d, warn } = deps(async () => json({ success: true, data: [] }), FLAG_ON);
    expect(await listUnits(d)).toEqual({ data: [], source: "api" });
    expect(warn).not.toHaveBeenCalled();
  });

  it("5xx + cờ tắt ⇒ ném UnitsUpstreamError (không có dữ liệu giả)", async () => {
    const { d } = deps(async () => json({ success: false }, 503));
    await expect(listUnits(d)).rejects.toMatchObject({ name: "UnitsUpstreamError", status: 503, reason: "http" });
  });

  it("mạng lỗi / timeout ⇒ UnitsUpstreamError đúng lý do", async () => {
    const { d } = deps(async () => Promise.reject(new TypeError("fetch failed")));
    await expect(listUnits(d)).rejects.toMatchObject({ reason: "network", status: 0 });
    const slow = deps(() => new Promise((_, reject) => setTimeout(() => reject(new DOMException("t", "TimeoutError")), 5)));
    await expect(listUnits(slow.d)).rejects.toMatchObject({ reason: "timeout" });
  });

  it("5xx + cờ bật (dev) ⇒ fixture xếp theo giá thuê, source mock, có log cảnh báo", async () => {
    const { d, warn } = deps(async () => json({}, 500), FLAG_ON);
    const res = await listUnits(d);
    expect(res.source).toBe("mock");
    expect(res.data.map((u) => u.rent)).toEqual([...FIXTURE_UNITS].map((u) => u.rent).sort((a, b) => a - b));
    expect(warn).toHaveBeenCalledWith(expect.stringContaining("DỮ LIỆU MẪU"));
  });

  it("phản hồi không phải mảng ⇒ coi là backend hỏng", async () => {
    const { d } = deps(async () => json({ data: { nope: true } }));
    await expect(listUnits(d)).rejects.toBeInstanceOf(UnitsUpstreamError);
  });
});

describe("units data-source — chi tiết", () => {
  it("có dữ liệu ⇒ source api", async () => {
    const { d } = deps(async () => json({ data: REAL }));
    expect(await getUnit(d, "VHOP-S1.02-0701")).toEqual({ data: REAL, source: "api" });
  });

  it("404 ⇒ UnitNotFoundError, kể cả khi cờ bật", async () => {
    const { d } = deps(async () => json({ code: "unit_not_found" }, 404), FLAG_ON);
    await expect(getUnit(d, FIXTURE_UNITS[0].code)).rejects.toBeInstanceOf(UnitNotFoundError);
  });

  it("5xx + cờ tắt ⇒ UnitsUpstreamError", async () => {
    const { d } = deps(async () => json({}, 502));
    await expect(getUnit(d, FIXTURE_UNITS[0].code)).rejects.toBeInstanceOf(UnitsUpstreamError);
  });

  it("5xx + cờ bật + mã có trong fixture ⇒ mock; mã không có ⇒ vẫn là lỗi backend (không giả 404)", async () => {
    const { d } = deps(async () => json({}, 500), FLAG_ON);
    expect(await getUnit(d, FIXTURE_UNITS[1].code.toLowerCase())).toEqual({ data: FIXTURE_UNITS[1], source: "mock" });
    await expect(getUnit(d, "VHOP-S1.02-0701")).rejects.toBeInstanceOf(UnitsUpstreamError);
  });
});

describe("cờ ALLOW_MOCK_FALLBACK", () => {
  it("mặc định tắt; chỉ 'true' mới bật", () => {
    const warn = vi.fn();
    expect(mockFallbackEnabled({ env: {}, warn })).toBe(false);
    expect(mockFallbackEnabled({ env: { ALLOW_MOCK_FALLBACK: "1" }, warn })).toBe(false);
    expect(mockFallbackEnabled({ env: FLAG_ON, warn })).toBe(true);
  });

  it("production KHÔNG THỂ bật (bỏ qua cờ + log)", async () => {
    const warn = vi.fn();
    expect(mockFallbackEnabled({ env: { ALLOW_MOCK_FALLBACK: "true", NODE_ENV: "production" }, warn })).toBe(false);
    expect(warn).toHaveBeenCalledWith(expect.stringContaining("production"));
    const { d } = deps(async () => json({}, 500), { ALLOW_MOCK_FALLBACK: "true", NODE_ENV: "production" });
    await expect(listUnits(d)).rejects.toBeInstanceOf(UnitsUpstreamError);
  });
});

describe("toUnit — bộ map DUY NHẤT backend → UI", () => {
  it("field thiếu/null: không bịa giá trị", () => {
    const u = toUnit({ ...REAL, direction: null, view: null, photos: [], zoneName: undefined, highlights: undefined as never, inventory: undefined as never });
    expect(u.id).toBe(REAL.code);
    expect(u.directionRaw).toBeNull();
    expect(u.photos).toEqual([]);
    expect(u.images).toBe(0);
    expect(u.highlights).toEqual([]);
    expect(u.inventory).toEqual([]);
    expect(u.rent).toBe(REAL.rent);
    expect(u.baseStatus).toBe("available");
  });

  it("zone suy từ zoneName của backend", () => {
    expect(toUnit({ ...REAL, zoneName: "The Sapphire 2" }).zoneId).toBe("sapphire2");
  });
});

import type { TenantUnit } from "@/lib/tenant/types";
import { FIXTURE_UNITS } from "./fixtures";

/**
 * NGUỒN DỮ LIỆU DUY NHẤT cho danh sách + chi tiết căn (chạy ở server). Nguồn chính luôn là DB qua backend
 * (`GET /api/v1/properties/units[/:code]`). Fallback sang `FIXTURE_UNITS` CHỈ khi:
 *   - cờ `ALLOW_MOCK_FALLBACK=true`, VÀ
 *   - không phải production (production luôn tắt, kể cả khi cờ bị bật nhầm), VÀ
 *   - backend lỗi thật (5xx / timeout / mạng). 404 và danh sách RỖNG thật KHÔNG bao giờ được thay bằng dữ liệu mẫu.
 * Khi fallback được dùng: kết quả mang `source: "mock"` và ghi cảnh báo phía server.
 * Không page nào được tự `try/catch → mock`; tất cả đi qua file này.
 */

export type UnitsSource = "api" | "mock";

export interface Sourced<T> {
  data: T;
  source: UnitsSource;
}

export interface UnitListFilter {
  zone?: string;
  layout?: string;
  maxRent?: number;
  q?: string;
}

/** Backend trả 404 cho căn: không tồn tại / không công khai. */
export class UnitNotFoundError extends Error {
  constructor(readonly code: string) {
    super(`Không tìm thấy căn ${code}`);
    this.name = "UnitNotFoundError";
  }
}

/** Backend không phản hồi được (5xx, timeout, mạng, phản hồi hỏng). `status` = 0 khi không có phản hồi HTTP. */
export class UnitsUpstreamError extends Error {
  constructor(
    readonly status: number,
    readonly reason: "http" | "timeout" | "network" | "bad_response",
  ) {
    super(reason === "http" ? `Backend trả lỗi ${status}` : `Backend không phản hồi (${reason})`);
    this.name = "UnitsUpstreamError";
  }
}

export interface SourceDeps {
  backendUrl: string;
  env: { ALLOW_MOCK_FALLBACK?: string; NODE_ENV?: string };
  fetch: typeof fetch;
  warn: (message: string) => void;
  timeoutMs?: number;
}

export const UNITS_TIMEOUT_MS = 8_000;

/** Cờ fallback: chỉ bật khi `ALLOW_MOCK_FALLBACK=true` và KHÔNG phải production. */
export function mockFallbackEnabled(deps: Pick<SourceDeps, "env" | "warn">): boolean {
  if (deps.env.ALLOW_MOCK_FALLBACK !== "true") return false;
  if (deps.env.NODE_ENV === "production") {
    deps.warn("[units] ALLOW_MOCK_FALLBACK=true bị BỎ QUA ở production — không bao giờ phục vụ dữ liệu mẫu.");
    return false;
  }
  return true;
}

async function backendGet<T>(deps: SourceDeps, path: string): Promise<{ status: number; data: T | null }> {
  let res: Response;
  try {
    res = await deps.fetch(`${deps.backendUrl}/api/v1${path}`, {
      cache: "no-store",
      headers: { Accept: "application/json" },
      signal: AbortSignal.timeout(deps.timeoutMs ?? UNITS_TIMEOUT_MS),
    });
  } catch (err) {
    const timedOut = err instanceof DOMException && (err.name === "TimeoutError" || err.name === "AbortError");
    throw new UnitsUpstreamError(0, timedOut ? "timeout" : "network");
  }
  if (res.status === 404) return { status: 404, data: null };
  if (!res.ok) throw new UnitsUpstreamError(res.status, "http");
  let json: unknown;
  try {
    json = await res.json();
  } catch {
    throw new UnitsUpstreamError(res.status, "bad_response");
  }
  const data = json && typeof json === "object" && "data" in json ? (json as { data: T }).data : (json as T);
  return { status: res.status, data };
}

function query(filter: UnitListFilter): string {
  const qs = new URLSearchParams();
  if (filter.zone) qs.set("zone", filter.zone);
  if (filter.layout) qs.set("layout", filter.layout);
  if (filter.maxRent) qs.set("maxRent", String(filter.maxRent));
  if (filter.q?.trim()) qs.set("q", filter.q.trim());
  const s = qs.toString();
  return s ? `?${s}` : "";
}

/** Fixture cùng bộ lọc, xếp theo giá thuê tăng dần (chưa xếp hạng matchmaker). */
function fixtureList(filter: UnitListFilter): TenantUnit[] {
  const q = filter.q?.trim().toUpperCase();
  return FIXTURE_UNITS.filter(
    (u) =>
      (!filter.layout || u.layout === filter.layout) &&
      (!filter.maxRent || u.rent <= filter.maxRent) &&
      (!q || u.code.toUpperCase().includes(q)),
  )
    .slice()
    .sort((a, b) => a.rent - b.rent);
}

function fallbackOrThrow<T>(deps: SourceDeps, err: unknown, what: string, mock: () => T): Sourced<T> {
  if (!(err instanceof UnitsUpstreamError) || !mockFallbackEnabled(deps)) throw err;
  deps.warn(`[units] ${what}: backend lỗi (${err.message}) — đang phục vụ DỮ LIỆU MẪU vì ALLOW_MOCK_FALLBACK=true.`);
  return { data: mock(), source: "mock" };
}

export async function listUnits(deps: SourceDeps, filter: UnitListFilter = {}): Promise<Sourced<TenantUnit[]>> {
  try {
    const { data } = await backendGet<TenantUnit[]>(deps, `/properties/units${query(filter)}`);
    if (!Array.isArray(data)) throw new UnitsUpstreamError(200, "bad_response");
    return { data, source: "api" }; // rỗng thật vẫn là rỗng
  } catch (err) {
    return fallbackOrThrow(deps, err, "danh sách căn", () => fixtureList(filter));
  }
}

export async function getUnit(deps: SourceDeps, code: string): Promise<Sourced<TenantUnit>> {
  let result: { status: number; data: TenantUnit | null };
  try {
    result = await backendGet<TenantUnit>(deps, `/properties/units/${encodeURIComponent(code)}`);
  } catch (err) {
    const mock = FIXTURE_UNITS.find((u) => u.code.toUpperCase() === code.toUpperCase());
    // Backend chết + mã không có trong dữ liệu mẫu ⇒ vẫn là lỗi backend (không giả làm "không tồn tại").
    if (!mock) throw err;
    return fallbackOrThrow(deps, err, `căn ${code}`, () => mock);
  }
  if (result.status === 404 || !result.data) throw new UnitNotFoundError(code);
  return { data: result.data, source: "api" };
}

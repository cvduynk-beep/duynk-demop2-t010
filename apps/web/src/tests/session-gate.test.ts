import { describe, expect, it, vi } from "vitest";
import { checkSession, unavailableHtml } from "@/lib/auth/sessionGate";

const user = { id: "u1", email: "a@b.c", fullName: "A", role: "tenant", portal: "tenant", isHostVerified: false, hostRoles: [] };
const json = (body: unknown, status = 200, setCookie?: string) => {
  const headers = new Headers({ "content-type": "application/json" });
  if (setCookie) headers.append("set-cookie", setCookie);
  return new Response(JSON.stringify(body), { status, headers });
};
const run = (impl: () => Promise<Response>, timeoutMs?: number) =>
  checkSession({ backendUrl: "http://be", portal: "tenant", cookie: "vs_access_tenant=t", fetch: vi.fn(impl) as unknown as typeof fetch, timeoutMs });

describe("proxy — phân biệt 'chưa đăng nhập' với 'backend lỗi'", () => {
  it("có phiên đúng cổng ⇒ ok (kèm Set-Cookie để chuyển tiếp)", async () => {
    const r = await run(async () => json({ data: { user } }, 200, "vs_access_tenant=new; Path=/"));
    expect(r).toMatchObject({ kind: "ok", user: { id: "u1" } });
    expect(r.kind === "ok" && r.setCookies).toEqual(["vs_access_tenant=new; Path=/"]);
  });

  it("backend trả lời rõ ràng là không có phiên ⇒ anonymous (về /login)", async () => {
    expect((await run(async () => json({ data: { user: null } }))).kind).toBe("anonymous");
    expect((await run(async () => json({ data: { user: { ...user, portal: "landlord" } } }))).kind).toBe("anonymous"); // sai cổng
    expect((await run(async () => json({ code: "unauthorized" }, 401))).kind).toBe("anonymous");
    expect((await run(async () => json({ code: "invalid_request" }, 400))).kind).toBe("anonymous");
  });

  it("cookie hỏng bị backend xoá ⇒ anonymous NHƯNG vẫn chuyển tiếp Set-Cookie xoá cookie", async () => {
    const r = await run(async () => json({ data: { user: null } }, 200, "vs_access_tenant=; Max-Age=0; Path=/"));
    expect(r).toEqual({ kind: "anonymous", setCookies: ["vs_access_tenant=; Max-Age=0; Path=/"] });
  });

  it.each([429, 500, 502, 503, 504])("HTTP %i ⇒ unavailable (KHÔNG coi là chưa đăng nhập)", async (status) => {
    expect(await run(async () => json({}, status))).toEqual({ kind: "unavailable", reason: `http_${status}` });
  });

  it("lỗi mạng / timeout / JSON hỏng ⇒ unavailable", async () => {
    expect(await run(async () => Promise.reject(new TypeError("fetch failed")))).toEqual({ kind: "unavailable", reason: "network" });
    const hang = () => new Promise<Response>((_, reject) => setTimeout(() => reject(new DOMException("t", "TimeoutError")), 5));
    expect(await run(hang, 1)).toEqual({ kind: "unavailable", reason: "timeout" });
    expect(await run(async () => new Response("<html>gateway</html>", { status: 200 }))).toEqual({ kind: "unavailable", reason: "bad_response" });
  });

  it("gọi đúng endpoint, chuyển đúng cookie + cổng", async () => {
    const f = vi.fn(async () => json({ data: { user } }));
    await checkSession({ backendUrl: "http://be", portal: "tenant", cookie: "vs_access_tenant=t", fetch: f as unknown as typeof fetch });
    const [url, init] = f.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe("http://be/api/v1/auth/session?portal=tenant");
    expect(init.headers).toMatchObject({ cookie: "vs_access_tenant=t", "x-portal": "tenant" });
  });

  it("trang 503 thoát HTML đường dẫn (không chèn được script)", () => {
    const html = unavailableHtml('/account"><script>alert(1)</script>');
    expect(html).not.toContain("<script>alert(1)</script>");
    expect(html).toContain("&lt;script&gt;");
    expect(html).toContain("vẫn đang đăng nhập");
  });
});

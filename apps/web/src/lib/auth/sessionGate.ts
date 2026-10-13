import type { Portal, SessionUser } from "./portals";

/**
 * Kết quả hỏi backend `GET /auth/session?portal=…` cho proxy, TÁCH BẠCH 3 trường hợp:
 * - `ok`: có phiên đúng cổng.
 * - `anonymous`: backend trả lời rõ ràng là KHÔNG có phiên (200 `user: null`, sai cổng, 400/401) ⇒ về trang đăng nhập.
 * - `unavailable`: KHÔNG biết (429, 5xx, timeout, lỗi mạng, phản hồi hỏng) ⇒ KHÔNG được coi là "chưa đăng nhập"
 *   (sẽ đá người đang đăng nhập về /login, và vì mọi request proxy đi từ cùng một IP nên một sự cố là đăng xuất hàng loạt).
 *   Vẫn đóng cửa an toàn: không phục vụ nội dung trang, trả trang 503 có nút thử lại, giữ nguyên cookie.
 */
export type SessionCheck =
  | { kind: "ok"; user: SessionUser; setCookies: string[] }
  | { kind: "anonymous"; setCookies: string[] }
  | { kind: "unavailable"; reason: string };

export const SESSION_CHECK_TIMEOUT_MS = 5_000;

export async function checkSession(opts: {
  backendUrl: string;
  portal: Portal;
  cookie: string;
  fetch?: typeof fetch;
  timeoutMs?: number;
}): Promise<SessionCheck> {
  const doFetch = opts.fetch ?? fetch;
  let res: Response;
  try {
    res = await doFetch(`${opts.backendUrl}/api/v1/auth/session?portal=${opts.portal}`, {
      headers: { cookie: opts.cookie, "x-portal": opts.portal },
      cache: "no-store",
      signal: AbortSignal.timeout(opts.timeoutMs ?? SESSION_CHECK_TIMEOUT_MS),
    });
  } catch (err) {
    const timedOut = err instanceof DOMException && (err.name === "TimeoutError" || err.name === "AbortError");
    return { kind: "unavailable", reason: timedOut ? "timeout" : "network" };
  }
  const setCookies = typeof res.headers.getSetCookie === "function" ? res.headers.getSetCookie() : [];

  if (res.status === 429 || res.status >= 500) return { kind: "unavailable", reason: `http_${res.status}` };
  if (!res.ok) return { kind: "anonymous", setCookies }; // 400/401/403: backend trả lời rõ ràng là không có phiên hợp lệ

  let body: unknown;
  try {
    body = await res.json();
  } catch {
    return { kind: "unavailable", reason: "bad_response" };
  }
  const user = (body as { data?: { user?: SessionUser | null } })?.data?.user ?? null;
  if (!user || user.portal !== opts.portal) return { kind: "anonymous", setCookies };
  return { kind: "ok", user, setCookies };
}

const escapeHtml = (s: string) => s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c] as string);

/** Trang 503 tự chứa (proxy không render được React): báo đúng sự cố + Thử lại, không đá về đăng nhập. */
export function unavailableHtml(path: string): string {
  const safe = escapeHtml(path);
  return `<!doctype html><html lang="vi"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Chưa xác minh được phiên đăng nhập · VinStay AI</title>
<style>body{margin:0;font-family:system-ui,-apple-system,"Segoe UI",sans-serif;background:#f3f5f6;color:#14262e;display:grid;place-items:center;min-height:100vh}
main{max-width:460px;padding:32px 24px;text-align:center}h1{font-size:22px;margin:0 0 10px}p{color:#4b5d66;line-height:1.55;margin:0 0 20px}
a,button{display:inline-block;margin:4px;padding:10px 18px;border-radius:10px;font-weight:600;font-size:14px;text-decoration:none;cursor:pointer}
button{background:#0f4c5c;color:#fff;border:0}a{color:#0f4c5c;border:1px solid #c9d6db;background:#fff}</style></head>
<body><main role="alert"><h1>Chưa xác minh được phiên đăng nhập</h1>
<p>Hệ thống đang bận hoặc tạm gián đoạn nên chưa kiểm tra được phiên của bạn. Bạn <b>vẫn đang đăng nhập</b> — vui lòng thử lại sau ít giây.</p>
<button type="button" onclick="location.reload()">Thử lại</button><a href="/">Về trang chủ</a>
<noscript><p><a href="${safe}">Tải lại trang</a></p></noscript></main></body></html>`;
}

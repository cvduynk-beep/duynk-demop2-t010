import { NextResponse, type NextRequest } from "next/server";
import { parseSetCookie } from "@/lib/auth/setCookie";
import { hostGateRedirect, loginPathFor, portalForPath, type Portal } from "@/lib/auth/portals";
import { checkSession, unavailableHtml } from "@/lib/auth/sessionGate";

const BACKEND_URL = (process.env.BACKEND_URL ?? "http://localhost:4000").replace(/\/+$/, "");

/** Cổng cần đăng nhập để vào một đường dẫn; null = công khai. `/account`, `/booking` là khu của Khách thuê. */
function requiredPortal(pathname: string): Portal | null {
  if (pathname === "/admin/login" || pathname === "/host/login") return null;
  if (/^\/(account|booking)(\/|$)/.test(pathname)) return "tenant";
  return portalForPath(pathname);
}

/**
 * Chặn trang theo phiên THẬT: hỏi backend `GET /auth/session?portal=<cổng>` (cookie httpOnly `vs_access_<cổng>`).
 * Backend có thể xoá cookie hỏng ⇒ chuyển tiếp Set-Cookie cho trình duyệt và cập nhật cookie của request đang xử lý.
 * Phân biệt "chưa đăng nhập" (⇒ /login) với "backend lỗi / quá tải" (⇒ trang 503 có Thử lại, giữ nguyên phiên).
 */
export async function proxy(request: NextRequest) {
  const { pathname, search } = request.nextUrl;
  const required = requiredPortal(pathname);
  if (!required) return NextResponse.next();

  const check = await checkSession({ backendUrl: BACKEND_URL, portal: required, cookie: request.headers.get("cookie") ?? "" });

  if (check.kind === "unavailable") {
    // Không biết phiên còn hay không ⇒ KHÔNG đá về /login, KHÔNG đụng cookie; đóng cửa an toàn bằng trang 503.
    console.error(`[proxy] không xác minh được phiên cổng ${required} (${check.reason}) cho ${pathname}`);
    return new NextResponse(unavailableHtml(pathname + search), {
      status: 503,
      headers: { "content-type": "text/html; charset=utf-8", "cache-control": "no-store", "retry-after": "5" },
    });
  }

  const setCookies = check.setCookies;
  const user = check.kind === "ok" ? check.user : null;
  if (!user) {
    const target = new URL(loginPathFor(required), request.url);
    target.searchParams.set("next", pathname + search);
    const redirect = NextResponse.redirect(target);
    for (const c of setCookies) redirect.headers.append("set-cookie", c);
    return redirect;
  }

  // Field Host chưa có hồ sơ (Admin chưa tạo) ⇒ về màn đăng nhập kèm lỗi, không vào trang Host.
  const gate = required === "host" ? hostGateRedirect(user) : null;
  if (gate) {
    const redirect = NextResponse.redirect(new URL(gate, request.url));
    for (const c of setCookies) redirect.headers.append("set-cookie", c);
    return redirect;
  }

  // Cập nhật cookie của request đang xử lý để Server Component thấy token mới ngay lượt này.
  const jar = new Map(request.cookies.getAll().map((c) => [c.name, c.value]));
  for (const raw of setCookies) {
    const parsed = parseSetCookie(raw);
    if (!parsed) continue;
    if (parsed.expired) jar.delete(parsed.name);
    else jar.set(parsed.name, parsed.value);
  }
  const headers = new Headers(request.headers);
  const cookieStr = [...jar].map(([k, v]) => `${k}=${v}`).join("; ");
  headers.set("cookie", cookieStr.replace(/[^\x00-\xFF]/g, (c) => encodeURIComponent(c)));
  const response = NextResponse.next({ request: { headers } });
  for (const c of setCookies) response.headers.append("set-cookie", c);
  return response;
}

export const config = {
  matcher: ["/landlord/:path*", "/host/:path*", "/admin/:path*", "/account", "/account/:path*", "/booking", "/booking/:path*"],
};

import "server-only";
import { cookies } from "next/headers";
import type { Portal, SessionUser } from "./portals";

export const backendUrl = () => (process.env.BACKEND_URL ?? "http://localhost:4000").replace(/\/+$/, "");

/** Người dùng của cổng `portal` cho Server Component (proxy.ts đã chặn người chưa đăng nhập; đây chỉ để hiển thị). */
export async function getSessionUser(portal: Portal): Promise<SessionUser | null> {
  try {
    const cookie = (await cookies()).toString();
    const res = await fetch(`${backendUrl()}/api/v1/auth/session?portal=${portal}`, { headers: { cookie }, cache: "no-store" });
    if (!res.ok) return null;
    return ((await res.json()) as { data?: { user: SessionUser | null } }).data?.user ?? null;
  } catch {
    return null;
  }
}

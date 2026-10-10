"use client";

import { useSyncExternalStore } from "react";
import type { SessionUser } from "./portals";

/**
 * Phiên đăng nhập THẬT cho Client Component: đọc `GET /api/v1/auth/session` (cookie httpOnly do backend set),
 * chỉ một lần cho mỗi lần tải trang và dùng chung giữa các component.
 */
export interface SessionState {
  ready: boolean;
  user: SessionUser | null;
}

const SERVER_STATE: SessionState = { ready: false, user: null };
let state: SessionState = SERVER_STATE;
let started = false;
const listeners = new Set<() => void>();

function publish(next: SessionState) {
  state = next;
  for (const l of listeners) l();
}

function getPortalForPath(): string {
  if (typeof window === "undefined") return "tenant";
  const p = window.location.pathname;
  if (p.startsWith("/host")) return "host";
  if (p.startsWith("/landlord")) return "landlord";
  if (p.startsWith("/admin")) return "admin";
  return "tenant";
}

async function load() {
  try {
    const portal = getPortalForPath();
    const url = portal ? `/api/v1/auth/session?portal=${portal}` : "/api/v1/auth/session";
    const res = await fetch(url, {
      credentials: "same-origin",
      cache: "no-store",
      headers: portal ? { "x-portal": portal } : {},
    });
    let user = res.ok ? ((await res.json()) as { data?: { user: SessionUser | null } })?.data?.user ?? null : null;
    if (!user) {
      // Fallback sang endpoint cục bộ /api/auth/session khi backend offline
      const fb = await fetch(portal ? `/api/auth/session?portal=${portal}` : "/api/auth/session");
      if (fb.ok) user = ((await fb.json()) as { data?: { user: SessionUser | null } })?.data?.user ?? null;
    }
    publish({ ready: true, user });
  } catch {
    try {
      const portal = getPortalForPath();
      const fb = await fetch(portal ? `/api/auth/session?portal=${portal}` : "/api/auth/session");
      if (fb.ok) {
        const user = ((await fb.json()) as { data?: { user: SessionUser | null } })?.data?.user ?? null;
        return publish({ ready: true, user });
      }
    } catch {}
    publish({ ready: true, user: null });
  }
}

/** Đọc lại phiên (sau khi đổi họ tên…) để header và các màn hình khác cập nhật ngay. */
export function refreshSession() {
  started = true;
  return load();
}

function subscribe(cb: () => void) {
  listeners.add(cb);
  if (!started) {
    started = true;
    void load();
  }
  return () => {
    listeners.delete(cb);
  };
}

export function useSession(): SessionState {
  return useSyncExternalStore(subscribe, () => state, () => SERVER_STATE);
}

/** Cổng của người đang đăng nhập (null = khách vãng lai hoặc đang tải). */
export function useRole(): SessionUser["portal"] {
  return useSession().user?.portal ?? null;
}

/** Đăng xuất: thu hồi phiên ở backend rồi tải lại toàn trang (xoá cache router của các trang có chắn quyền). */
export async function signOut(redirectTo = "/login") {
  try {
    await fetch("/api/auth/logout", { method: "POST" }).catch(() => {});
    await fetch("/api/v1/auth/logout", { method: "POST" }).catch(() => {});
  } finally {
    window.location.assign(redirectTo);
  }
}

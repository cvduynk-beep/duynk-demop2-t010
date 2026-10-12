"use client";

import { useSyncExternalStore } from "react";
import type { Portal, SessionUser } from "./portals";

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

/** Cổng của trang đang mở: chỉ hỏi phiên (cookie `vs_access_<portal>`) của đúng cổng này. */
function getPortalForPath(): Portal {
  if (typeof window === "undefined") return "tenant";
  const p = window.location.pathname;
  if (p.startsWith("/host")) return "host";
  if (p.startsWith("/landlord")) return "landlord";
  if (p.startsWith("/admin")) return "admin";
  return "tenant";
}

async function load() {
  const portal = getPortalForPath();
  try {
    const res = await fetch(`/api/v1/auth/session?portal=${portal}`, {
      credentials: "same-origin",
      cache: "no-store",
      headers: { "x-portal": portal },
    });
    const user = res.ok ? ((await res.json()) as { data?: { user: SessionUser | null } })?.data?.user ?? null : null;
    publish({ ready: true, user });
  } catch {
    publish({ ready: true, user: null }); // backend không với tới được ⇒ coi như chưa đăng nhập (không có phiên dự phòng)
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

/**
 * Đăng xuất cổng của trang đang mở: backend chỉ xoá cookie `vs_access_<portal>` của cổng đó (cổng khác giữ nguyên),
 * rồi tải lại toàn trang (xoá cache router của các trang có chắn quyền).
 */
export async function signOut(redirectTo = "/login", portal: Portal = getPortalForPath()) {
  try {
    await fetch("/api/v1/auth/logout", {
      method: "POST",
      credentials: "same-origin",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ portal }),
    }).catch(() => {});
  } finally {
    window.location.assign(redirectTo);
  }
}

"use client";

import { useCallback, useMemo, useSyncExternalStore } from "react";
import { useRouter } from "next/navigation";
import { toast } from "@/components/ui/Toast";
import { useSession } from "@/lib/auth/client";
import { primeApiData, useApiQuery } from "@/lib/query/useApiQuery";
import type { ApiResponse } from "@/lib/apiClient";
import { tenantApi, errorText } from "./api";
import { invalidateTenantFavorites, tenantQueries } from "./queries";
import { toUnit } from "./adapters";

/**
 * Trạng thái "đã lưu" hiển thị = trạng thái server + các thay đổi đang chờ (optimistic). Hàm thuần để test.
 * `pending` chỉ giữ mục đang gửi; server trả xong (thành công hay lỗi) thì mục đó bị gỡ khỏi `pending`.
 */
export function effectiveSaved(serverCodes: ReadonlySet<string>, pending: ReadonlyMap<string, boolean>, code: string): boolean {
  const k = code.toUpperCase();
  return pending.has(k) ? (pending.get(k) as boolean) : serverCodes.has(k);
}

/**
 * Một lần bấm tim: đổi ngay (optimistic) → gọi `PUT|DELETE /me/favorites/:code` → thành công thì đồng bộ lại danh sách,
 * lỗi thì rollback + báo lỗi. Đang gửi cho một căn thì bỏ qua lần bấm tiếp theo trên CHÍNH căn đó (chống bấm dồn).
 */
export async function runToggle(
  code: string,
  next: boolean,
  deps: {
    pending: Map<string, boolean>;
    emit: () => void;
    call: (code: string, save: boolean) => Promise<ApiResponse<unknown>>;
    onSuccess: () => Promise<void> | void;
    onError: (res: ApiResponse<unknown>) => void;
  },
): Promise<"ok" | "error" | "skipped"> {
  const k = code.toUpperCase();
  if (deps.pending.has(k)) return "skipped";
  deps.pending.set(k, next);
  deps.emit();
  const res = await deps.call(code, next);
  if (res.ok) {
    await deps.onSuccess(); // tải lại danh sách TRƯỚC khi gỡ pending ⇒ trái tim không chớp về trạng thái cũ
    deps.pending.delete(k);
    deps.emit();
    return "ok";
  }
  deps.pending.delete(k); // rollback
  deps.emit();
  deps.onError(res);
  return "error";
}

// ─── Store optimistic dùng chung cho mọi nút trái tim (`/units`, `/units/[id]`, `/account/saved`) ──────────────────
const pending = new Map<string, boolean>();
/** Ảnh chụp bất biến của `pending`: đổi danh tính mỗi lần emit ⇒ React (kể cả React Compiler) thấy giá trị mới. */
let snapshot: ReadonlyMap<string, boolean> = new Map();
const EMPTY: ReadonlyMap<string, boolean> = new Map();
const listeners = new Set<() => void>();
const emit = () => {
  snapshot = new Map(pending);
  for (const l of listeners) l();
};
const subscribe = (l: () => void) => {
  listeners.add(l);
  return () => {
    listeners.delete(l);
  };
};

/**
 * Căn đã lưu của khách thuê, lấy từ DB qua `/me/favorites`. Khách chưa đăng nhập bấm tim ⇒ chuyển sang đăng nhập
 * (không lưu tạm vào trình duyệt, để danh sách luôn khớp với tài khoản).
 */
export function useFavorites() {
  const { user } = useSession();
  const router = useRouter();
  const signedIn = user?.portal === "tenant";
  const query = useApiQuery(tenantQueries.favorites(signedIn));
  const pendingNow = useSyncExternalStore(subscribe, () => snapshot, () => EMPTY);

  const serverUnits = useMemo(() => (query.state.status === "ready" ? query.state.data.map(toUnit) : []), [query.state]);
  const serverCodes = useMemo(() => new Set(serverUnits.map((u) => u.code.toUpperCase())), [serverUnits]);
  // Đọc từ ảnh chụp `pendingNow` (giá trị reactive) — KHÔNG đọc Map module trực tiếp, để mọi trái tim vẽ lại khi đổi.
  const isSaved = useCallback((code: string) => effectiveSaved(serverCodes, pendingNow, code), [serverCodes, pendingNow]);
  // Danh sách hiển thị: bỏ ngay các căn đang được bỏ lưu (optimistic); căn mới lưu hiện sau khi server xác nhận.
  const units = useMemo(() => serverUnits.filter((u) => isSaved(u.code)), [serverUnits, isSaved]);

  const toggle = useCallback(
    async (code: string) => {
      if (!signedIn) {
        const here = window.location.pathname + window.location.search;
        router.push(`/login?next=${encodeURIComponent(here)}`);
        return;
      }
      const next = !effectiveSaved(serverCodes, pendingNow, code);
      await runToggle(code, next, {
        pending,
        emit,
        call: (c, save) => (save ? tenantApi.addFavorite(c) : tenantApi.removeFavorite(c)),
        onSuccess: async () => {
          // Ghi thẳng danh sách mới vào cache dùng chung TRƯỚC khi gỡ trạng thái tạm ⇒ mọi trái tim đồng bộ, không chớp.
          const fresh = await tenantApi.favorites();
          if (fresh.ok) primeApiData(tenantQueries.favorites(true).key, fresh.data);
          else invalidateTenantFavorites(); // server đã lưu xong; đọc lại danh sách lỗi ⇒ để query tự tải lại
          toast(next ? "Đã lưu căn này" : "Đã bỏ khỏi danh sách lưu", next ? "success" : "info");
        },
        onError: (res) => toast(errorText(res, next ? "Chưa lưu được căn, vui lòng thử lại." : "Chưa bỏ lưu được, vui lòng thử lại.")),
      });
    },
    [signedIn, serverCodes, pendingNow, router],
  );

  const busyCode = (code: string) => pendingNow.has(code.toUpperCase());

  return {
    units,
    count: units.length,
    loading: query.state.status === "loading",
    error: query.state.status === "error" ? query.state.message : null,
    isSaved,
    toggle,
    isBusy: busyCode,
    signedIn,
    reload: query.reload,
  };
}

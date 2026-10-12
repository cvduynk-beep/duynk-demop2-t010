"use client";

import { useSyncExternalStore } from "react";
import { registerDynamicUnits, UNITS, type Unit } from "@/lib/mock/units";
import { fetchUnitsFromApi } from "./unitAdapter";

interface UnitsSnapshot {
  units: Unit[];
  isLoadingDb: boolean;
}

// Store dùng chung cho cả session client: mọi component đọc cùng một snapshot (useSyncExternalStore).
const SERVER_SNAPSHOT: UnitsSnapshot = { units: UNITS, isLoadingDb: true };
let snapshot: UnitsSnapshot = SERVER_SNAPSHOT;
let fetchStarted = false;
const listeners = new Set<() => void>();

function setSnapshot(next: UnitsSnapshot) {
  snapshot = next;
  for (const listener of listeners) listener();
}

/**
 * Đẩy một căn hộ mới (vừa ký gửi / thẩm định) trực tiếp lên trang chủ và danh mục giỏ hàng.
 */
export function publishUnitToCatalog(unit: Unit) {
  registerDynamicUnits([unit]);
  const filtered = snapshot.units.filter((u) => u.id !== unit.id);
  setSnapshot({ units: [unit, ...filtered], isLoadingDb: false });
}

/** Nạp căn từ Backend DB đúng một lần cho cả session; lỗi mạng / rỗng ⇒ giữ mock UNITS. */
function startFetch() {
  if (fetchStarted) return;
  fetchStarted = true;
  fetchUnitsFromApi()
    .then((dbUnits) => {
      if (dbUnits && dbUnits.length > 0) {
        registerDynamicUnits(dbUnits);
        // Hợp nhất dữ liệu: Các căn từ DB thật được ưu tiên hiển thị trước
        const dbIds = new Set(dbUnits.map((u) => u.id));
        setSnapshot({ units: [...dbUnits, ...snapshot.units.filter((u) => !dbIds.has(u.id))], isLoadingDb: false });
      } else {
        setSnapshot({ units: snapshot.units, isLoadingDb: false });
      }
    })
    .catch(() => {
      setSnapshot({ units: snapshot.units, isLoadingDb: false });
    });
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  startFetch();
  return () => {
    listeners.delete(listener);
  };
}

/**
 * Hook nạp danh sách căn hộ thông minh (Dual-layer):
 * 1. Khởi tạo ngay lập tức từ mock UNITS (0ms delay, không giật màn hình).
 * 2. Tự động kết nối Backend DB qua API `/api/v1/properties/units` (một lần cho cả session).
 * 3. Hợp nhất căn hộ thực tế từ Database vào rổ hàng.
 * 4. Nếu Backend offline hoặc lỗi mạng, tự động fallback mượt mà về mock data.
 */
export function useUnits(): UnitsSnapshot {
  return useSyncExternalStore(subscribe, () => snapshot, () => SERVER_SNAPSHOT);
}

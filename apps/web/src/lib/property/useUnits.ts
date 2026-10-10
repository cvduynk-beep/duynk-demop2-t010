"use client";

import { useEffect, useState } from "react";
import { registerDynamicUnits, UNITS, type Unit } from "@/lib/mock/units";
import { fetchUnitsFromApi } from "./unitAdapter";

// In-memory cache cho session client
let cachedUnits: Unit[] | null = null;
let isFetchingGlobal = false;
const listeners = new Set<(units: Unit[]) => void>();

function notify(units: Unit[]) {
  for (const listener of listeners) {
    listener(units);
  }
}

/**
 * Đẩy một căn hộ mới (vừa ký gửi / thẩm định) trực tiếp lên trang chủ và danh mục giỏ hàng.
 */
export function publishUnitToCatalog(unit: Unit) {
  registerDynamicUnits([unit]);
  const base = cachedUnits || UNITS;
  const filtered = base.filter((u) => u.id !== unit.id);
  const updated = [unit, ...filtered];
  cachedUnits = updated;
  notify(updated);
}

/**
 * Hook nạp danh sách căn hộ thông minh (Dual-layer):
 * 1. Khởi tạo ngay lập tức từ mock UNITS (0ms delay, không giật màn hình).
 * 2. Tự động kết nối Backend DB qua API `/api/v1/properties/units`.
 * 3. Hợp nhất căn hộ thực tế từ Database vào rổ hàng.
 * 4. Nếu Backend offline hoặc lỗi mạng, tự động fallback mượt mà về mock data.
 */
export function useUnits(): { units: Unit[]; isLoadingDb: boolean } {
  const [units, setUnits] = useState<Unit[]>(() => cachedUnits || UNITS);
  const [isLoadingDb, setIsLoadingDb] = useState(!cachedUnits);

  useEffect(() => {
    // Đăng ký listener cập nhật khi các component khác kích hoạt fetch
    const listener = (newUnits: Unit[]) => {
      setUnits(newUnits);
      setIsLoadingDb(false);
    };
    listeners.add(listener);

    if (cachedUnits) {
      setUnits(cachedUnits);
      setIsLoadingDb(false);
      return () => {
        listeners.delete(listener);
      };
    }

    if (!isFetchingGlobal) {
      isFetchingGlobal = true;
      fetchUnitsFromApi()
        .then((dbUnits) => {
          if (dbUnits && dbUnits.length > 0) {
            registerDynamicUnits(dbUnits);
            // Hợp nhất dữ liệu: Các căn từ DB thật được ưu tiên hiển thị trước
            const dbIds = new Set(dbUnits.map((u) => u.id));
            const merged = [...dbUnits, ...UNITS.filter((u) => !dbIds.has(u.id))];
            cachedUnits = merged;
            notify(merged);
          } else {
            cachedUnits = UNITS;
            notify(UNITS);
          }
        })
        .catch(() => {
          cachedUnits = UNITS;
          notify(UNITS);
        })
        .finally(() => {
          isFetchingGlobal = false;
          setIsLoadingDb(false);
        });
    }

    return () => {
      listeners.delete(listener);
    };
  }, []);

  return { units, isLoadingDb };
}

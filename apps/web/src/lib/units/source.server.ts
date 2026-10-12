import "server-only";
import { cache } from "react";
import { backendUrl } from "@/lib/auth/session";
import { getUnit, listUnits, type SourceDeps, type UnitListFilter } from "./source";

/** Ràng buộc data-source với môi trường server: cờ chỉ đọc ở đây (không lộ ra trình duyệt). */
function deps(): SourceDeps {
  return {
    backendUrl: backendUrl(),
    env: { ALLOW_MOCK_FALLBACK: process.env.ALLOW_MOCK_FALLBACK, NODE_ENV: process.env.NODE_ENV },
    fetch: (input, init) => fetch(input, init),
    warn: (message) => console.warn(message),
  };
}

export const listUnitsServer = (filter: UnitListFilter = {}) => listUnits(deps(), filter);

/** `cache` ⇒ `generateMetadata` và page dùng chung một lần gọi backend cho mỗi request. */
export const getUnitServer = cache((code: string) => getUnit(deps(), code));

import type { TenantBooking, TenantContract } from "./types";

type DepositOutcome = NonNullable<TenantBooking["deposit"]>["outcome"];

/** Nhãn + màu cho trạng thái cọc giữ chỗ do backend tính (`deposit.outcome`). */
export const DEPOSIT_OUTCOME: Record<DepositOutcome, { label: string; tone: "ok" | "warn" | "danger" | "neutral" | "info" }> = {
  awaiting_payment: { label: "Chờ thanh toán", tone: "warn" },
  active: { label: "Đã nhận cọc · đang giữ căn", tone: "ok" },
  expired: { label: "Hết hạn giữ chỗ", tone: "neutral" },
  converted: { label: "Đã chuyển thành cọc bảo đảm", tone: "info" },
  refunded: { label: "Đã hoàn", tone: "neutral" },
  forfeited: { label: "Bị mất cọc", tone: "danger" },
};

export interface DepositRow {
  /** Lịch hẹn có cọc (null nếu hợp đồng không còn khớp lịch nào trong danh sách). */
  booking: TenantBooking | null;
  contract: TenantContract | null;
  key: string;
}

/**
 * `/account/contracts`: mỗi dòng = một lịch đã phát sinh cọc giữ chỗ (`/me/bookings`) ghép với hợp đồng thuê của nó
 * (`/me/contracts`, theo `bookingRef`). Hợp đồng không khớp lịch nào vẫn được giữ (không làm mất dữ liệu).
 * Thứ tự: theo thứ tự server trả cho lịch (mới nhất trước), hợp đồng lẻ ở cuối.
 */
export function depositRows(bookings: readonly TenantBooking[], contracts: readonly TenantContract[]): DepositRow[] {
  const byRef = new Map(contracts.map((c) => [c.bookingRef, c]));
  const rows: DepositRow[] = bookings
    .filter((b) => b.deposit || b.contractId || byRef.has(b.ref))
    .map((b) => ({ booking: b, contract: byRef.get(b.ref) ?? null, key: b.ref }));
  const used = new Set(rows.map((r) => r.booking?.ref));
  for (const c of contracts) if (!used.has(c.bookingRef)) rows.push({ booking: null, contract: c, key: c.id });
  return rows;
}

/** Nhãn hạng mục của Hộ chiếu bàn giao (khớp `handover_items.item_category`). Mã lạ ⇒ hiện nguyên mã. */
export const HANDOVER_ITEM_LABEL: Record<string, string> = {
  wall: "Tường",
  floor: "Sàn",
  door_lock: "Cửa & khoá",
  ac: "Điều hoà",
  fridge: "Tủ lạnh",
  kitchen: "Bếp",
  sanitary: "Thiết bị vệ sinh",
  sofa: "Sofa",
  bed: "Giường",
  electrical: "Điện",
};

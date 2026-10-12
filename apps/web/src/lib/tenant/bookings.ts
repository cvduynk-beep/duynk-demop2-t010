import type { BookingStatusWeb, TenantBooking } from "./types";

/**
 * Lịch "Sắp tới" = còn đang diễn ra hoặc chờ bước tiếp theo, kể cả `holding` (đã cọc, chờ ký hợp đồng).
 * Lịch "Đã qua" = đã khép lại: đã ký hợp đồng (`leased`), xem xong, vắng mặt, huỷ, từ chối.
 * Dùng chung cho `/account/bookings` và các màn sau — đừng định nghĩa lại ở chỗ khác.
 */
export const UPCOMING_STATUSES: readonly BookingStatusWeb[] = ["pending", "confirmed", "lobby", "receiving", "viewing", "closing", "holding"];
export const PAST_STATUSES: readonly BookingStatusWeb[] = ["leased", "completed", "no_show", "cancelled", "rejected"];

export const isUpcoming = (b: Pick<TenantBooking, "status">) => UPCOMING_STATUSES.includes(b.status);

/**
 * Chia danh sách `GET /me/bookings` thành hai tab. "Sắp tới": giờ hẹn gần nhất trước. "Đã qua": giữ nguyên thứ tự
 * server trả (mới tạo nhất trước). Trạng thái lạ (server thêm sau này) ⇒ xếp vào "Đã qua" để không mất lịch.
 */
export function splitBookings(list: readonly TenantBooking[]): { upcoming: TenantBooking[]; past: TenantBooking[] } {
  const upcoming = list.filter(isUpcoming).sort((a, b) => Date.parse(a.slot) - Date.parse(b.slot));
  const past = list.filter((b) => !isUpcoming(b));
  return { upcoming, past };
}

/** Lần xác minh CCCD (eKYC) mới nhất trong các lịch của tài khoản; chưa có ⇒ null. */
export function latestKyc(list: readonly TenantBooking[]): NonNullable<TenantBooking["kyc"]> | null {
  let best: NonNullable<TenantBooking["kyc"]> | null = null;
  for (const b of list) {
    if (b.kyc && (!best || Date.parse(b.kyc.verifiedAt) > Date.parse(best.verifiedAt))) best = b.kyc;
  }
  return best;
}

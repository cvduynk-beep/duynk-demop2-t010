import { isOpenBooking } from "./selectors";
import type { Booking, MockState, RefundAccount } from "./types";
import { normalizePhone } from "./format";
import type { Role } from "./actors";

/** Lịch xem của một khách thuê, mới nhất trước — dùng cho `/account/bookings`. */
export function tenantBookings(state: MockState, phone: string): Booking[] {
  return state.bookings
    .filter((b) => b.tenant.phone === phone)
    .slice()
    .sort((a, b) => new Date(b.slot).getTime() - new Date(a.slot).getTime());
}

export const tenantUpcomingBookings = (state: MockState, phone: string): Booking[] =>
  tenantBookings(state, phone).filter(isOpenBooking);

export const tenantPastBookings = (state: MockState, phone: string): Booking[] =>
  tenantBookings(state, phone).filter((b) => !isOpenBooking(b));

/** Lịch có ít nhất một khoản cọc/hợp đồng — dùng cho `/account/contracts`. */
export function tenantContracts(state: MockState, phone: string): Booking[] {
  return tenantBookings(state, phone).filter((b) => b.deposit || b.lease);
}

/** Trạng thái eKYC mới nhất của khách (nếu có), dùng cho Section "Xác minh danh tính" ở `/account`. */
export function tenantLatestKyc(state: MockState, phone: string) {
  return tenantBookings(state, phone).find((b) => b.kyc)?.kyc;
}

/** Tài khoản ngân hàng nhận hoàn cọc đã lưu gần nhất của khách (nếu có). */
export function tenantLatestRefundAccount(state: MockState, phone: string): RefundAccount | undefined {
  const norm = normalizePhone(phone);
  if (!norm) return undefined;
  if (state.savedRefundAccounts && norm in state.savedRefundAccounts) {
    return state.savedRefundAccounts[norm] || undefined;
  }
  if (state.tenantProfile && normalizePhone(state.tenantProfile.phone) === norm) {
    if ("refundAccount" in state.tenantProfile) {
      return state.tenantProfile.refundAccount || undefined;
    }
  }
  const withLease = tenantBookings(state, phone).find((b) => b.lease?.refundAccount);
  return withLease?.lease?.refundAccount;
}

export function accountPhone(state: MockState): string {
  return normalizePhone(state.tenantProfile?.phone ?? "");
}

export function ownsBooking(state: MockState, b: Booking): boolean {
  return normalizePhone(b.tenant.phone) === accountPhone(state);
}

export function isPhoneVerified(state: MockState, phone: string): boolean {
  const norm = normalizePhone(phone);
  return (state.verifiedPhones ?? []).includes(norm);
}

export function canSkipBookingOtp(state: MockState, role: Role | null, phone: string): boolean {
  return (
    role === "tenant" &&
    normalizePhone(phone) === accountPhone(state) &&
    isPhoneVerified(state, phone)
  );
}

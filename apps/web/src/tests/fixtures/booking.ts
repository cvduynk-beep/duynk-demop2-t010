import type { TenantBooking } from "@/lib/tenant/types";
import { FIXTURE_UNITS } from "@/lib/units/fixtures";

/** Lịch hẹn mẫu đúng hình `GET /bookings/:ref` — CHỈ dùng trong test, app thật không import file này. */
export const sampleBooking = (patch: Partial<TenantBooking> = {}): TenantBooking => ({
  ref: "VS-K7M2Q",
  status: "pending",
  unit: FIXTURE_UNITS[0],
  slot: "2026-10-20T01:30:00.000Z",
  createdAt: "2026-10-12T08:00:00.000Z",
  rescheduleCount: 0,
  contact: { name: "Nguyễn Văn Thuê", phoneMasked: "0912 *** 678", persons: 2 },
  host: null,
  canModify: true,
  ...patch,
});

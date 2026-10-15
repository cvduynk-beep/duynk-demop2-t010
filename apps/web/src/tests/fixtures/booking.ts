import type { TenantBooking, TenantContract } from "@/lib/tenant/types";
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
  direct: false,
  ...patch,
});

/** Hợp đồng mẫu đúng hình `GET /me/contracts` — chỉ dùng trong test. */
export const sampleContract = (patch: Partial<TenantContract> = {}): TenantContract => ({
  id: "c-1",
  contractNumber: "VSA-LEASE-MOCK-S1.02-0701-2026-0001",
  bookingRef: "VS-K7M2Q",
  unit: FIXTURE_UNITS[0],
  status: "active",
  establishedAt: "2026-10-12T09:00:00.000Z",
  startDate: "2026-10-15",
  endDate: "2027-10-14",
  months: 12,
  paymentCycle: 1,
  monthlyRent: 5_500_000,
  securityDeposit: 5_500_000,
  convertedHolding: 2_000_000,
  firstPaymentDue: { rent: 5_500_000, depositTopUp: 3_500_000, total: 9_000_000, transferContent: "VSA MOCK KY 1" },
  pdf: { ready: true, sha256: "a".repeat(64), sizeBytes: 12345 },
  ...patch,
});

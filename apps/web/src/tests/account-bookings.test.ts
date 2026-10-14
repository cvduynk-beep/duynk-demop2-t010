import { describe, expect, it } from "vitest";
import { PAST_STATUSES, splitBookings, UPCOMING_STATUSES } from "@/lib/tenant/bookings";
import type { BookingStatusWeb } from "@/lib/tenant/types";
import { sampleBooking } from "./fixtures/booking";

describe("splitBookings — tab Sắp tới / Đã qua của /account/bookings", () => {
  it("phủ đủ mọi trạng thái backend, không trùng giữa hai tab", () => {
    const all: BookingStatusWeb[] = ["pending", "confirmed", "lobby", "receiving", "viewing", "closing", "holding", "leased", "completed", "no_show", "cancelled", "rejected"];
    expect([...UPCOMING_STATUSES, ...PAST_STATUSES].sort()).toEqual([...all].sort());
    expect(UPCOMING_STATUSES.filter((s) => PAST_STATUSES.includes(s))).toEqual([]);
  });

  it("holding (đã cọc, chờ ký) ở Sắp tới; leased ở Đã qua", () => {
    const { upcoming, past } = splitBookings([
      sampleBooking({ ref: "VS-HOLD2", status: "holding" }),
      sampleBooking({ ref: "VS-LEAS3", status: "leased" }),
    ]);
    expect(upcoming.map((b) => b.ref)).toEqual(["VS-HOLD2"]);
    expect(past.map((b) => b.ref)).toEqual(["VS-LEAS3"]);
  });

  it("Sắp tới xếp theo giờ hẹn gần nhất; Đã qua giữ thứ tự server (mới nhất trước)", () => {
    const list = [
      sampleBooking({ ref: "VS-LATE2", status: "pending", slot: "2026-10-25T01:30:00.000Z" }),
      sampleBooking({ ref: "VS-CANC2", status: "cancelled", slot: "2026-10-14T01:30:00.000Z" }),
      sampleBooking({ ref: "VS-SOON2", status: "confirmed", slot: "2026-10-13T07:30:00.000Z" }),
      sampleBooking({ ref: "VS-DONE2", status: "completed", slot: "2026-10-01T01:30:00.000Z" }),
    ];
    const { upcoming, past } = splitBookings(list);
    expect(upcoming.map((b) => b.ref)).toEqual(["VS-SOON2", "VS-LATE2"]);
    expect(past.map((b) => b.ref)).toEqual(["VS-CANC2", "VS-DONE2"]);
    expect(list.map((b) => b.ref)).toEqual(["VS-LATE2", "VS-CANC2", "VS-SOON2", "VS-DONE2"]); // không đổi mảng gốc
  });

  it("trạng thái lạ ⇒ vào Đã qua (không làm mất lịch); danh sách rỗng ⇒ hai tab rỗng", () => {
    const odd = sampleBooking({ ref: "VS-ODD22", status: "archived" as BookingStatusWeb });
    expect(splitBookings([odd]).past.map((b) => b.ref)).toEqual(["VS-ODD22"]);
    expect(splitBookings([])).toEqual({ upcoming: [], past: [] });
  });
});

import { describe, expect, it } from "vitest";
import { retention } from "@/components/charts/Funnel";
import {
  activityActor,
  activityTitle,
  dashboardQueries,
  fmtDuration,
  fmtNumber,
  fmtPercentValue,
  funnelSteps,
  heatRows,
  presetRange,
  validateRange,
  workItemViews,
  type DashboardWorkItems,
  type FunnelStage,
} from "@/lib/admin/dashboard";

// 2026-10-12T20:00Z = 03:00 ngày 13/10 giờ VN
const NOW = Date.parse("2026-10-12T20:00:00Z");

describe("dashboard admin — khoảng thời gian (giờ VN)", () => {
  it("preset N ngày tính tới hôm nay theo giờ VN, không theo giờ UTC của máy", () => {
    expect(presetRange(7, NOW)).toEqual({ from: "2026-10-07", to: "2026-10-13" });
    expect(presetRange(30, NOW)).toEqual({ from: "2026-09-14", to: "2026-10-13" });
    expect(presetRange(90, NOW).from).toBe("2026-07-16");
  });

  it("kiểm theo field: sai định dạng, ngày không tồn tại, from > to, quá 90 ngày", () => {
    expect(validateRange({ from: "2026-10-07", to: "2026-10-13" })).toBeNull();
    expect(validateRange({ from: "", to: "2026-10-13" })).toEqual({ from: expect.any(String) });
    expect(validateRange({ from: "2026-02-30", to: "2026-03-01" })).toEqual({ from: expect.any(String) });
    expect(validateRange({ from: "2026-10-13", to: "2026-10-01" })).toEqual({ from: expect.stringContaining("trước") });
    expect(validateRange({ from: "2026-07-16", to: "2026-10-13" })).toBeNull(); // đúng 90 ngày
    expect(validateRange({ from: "2026-07-15", to: "2026-10-13" })).toEqual({ to: expect.stringContaining("90") });
  });

  it("query key gồm khoảng ⇒ đổi khoảng là tải số mới, không dùng lại số của khoảng cũ", () => {
    const a = dashboardQueries.bi({ from: "2026-10-07", to: "2026-10-13" });
    const b = dashboardQueries.bi({ from: "2026-09-14", to: "2026-10-13" });
    expect(a.key).not.toBe(b.key);
    expect(dashboardQueries.dispatch({ from: "2026-10-07", to: "2026-10-13" }).key).toContain("2026-10-07");
  });
});

describe("dashboard admin — 0 thật khác 'chưa có dữ liệu'", () => {
  it("định dạng vi-VN; null ⇒ '—', 0 ⇒ '0'", () => {
    expect(fmtNumber(0)).toBe("0");
    expect(fmtNumber(1250)).toBe("1.250");
    expect(fmtNumber(null)).toBe("—");
    expect(fmtPercentValue(3.8)).toBe("3,8");
    expect(fmtPercentValue(0)).toBe("0");
    expect(fmtPercentValue(null)).toBe("—");
    expect(fmtDuration(0)).toBe("0′00″");
    expect(fmtDuration(185)).toBe("3′05″");
    expect(fmtDuration(null)).toBe("—");
  });

  const stage = (key: string, count: number | null): FunnelStage => ({ key, stage: `x. ${key}`, count, available: count !== null, dropRate: null });

  it("phễu: bước chưa có nguồn giữ null (không thành 0); nhãn tiếng Việt theo key", () => {
    const steps = funnelSteps([stage("visit", null), stage("matchmaker", null), stage("booked", 4), stage("checkin", 0), stage("deposit", 0), stage("signed", 0)]);
    expect(steps.map((s) => s.value)).toEqual([null, null, 4, 0, 0, 0]);
    expect(steps[2].label).toBe("Đặt lịch xem (đã OTP)");
  });

  it("retention: không chia cho 0, không tính khi một bước chưa có nguồn", () => {
    const steps = funnelSteps([stage("visit", null), stage("matchmaker", null), stage("booked", 4), stage("checkin", 3), stage("deposit", 0), stage("signed", 0)]);
    expect(steps.map((_, i) => retention(steps, i))).toEqual([null, null, null, 75, 0, null]);
  });
});

describe("dashboard admin — việc cần xử lý & dòng sự kiện", () => {
  const work = (over: Partial<DashboardWorkItems> = {}): DashboardWorkItems => ({
    generatedAt: "2026-10-13T03:00:00Z",
    dispatch: { manualDispatch: 0, overSla: 0 },
    consignments: { awaitingHost: 0, overdue: 0, total: 0 },
    mandatesExiting: 0,
    contracts: { needsAction: 0, byKind: {} },
    ...over,
  });

  it("không có việc ⇒ danh sách rỗng (UI hiện 'Không có việc tồn đọng')", () => {
    expect(workItemViews(work())).toEqual([]);
  });

  it("chỉ hiện việc có số > 0, số định dạng vi-VN, link đúng màn xử lý", () => {
    const items = workItemViews(
      work({ dispatch: { manualDispatch: 2, overSla: 0 }, consignments: { awaitingHost: 3, overdue: 1, total: 3 }, contracts: { needsAction: 1200, byKind: { lease: 1200 } } }),
    );
    expect(items.map((i) => i.key)).toEqual(["manual", "consign", "contracts"]);
    expect(items[0]).toMatchObject({ title: "2 ticket cần điều phối tay", href: "/admin/bookings", bad: true });
    expect(items[1]).toMatchObject({ bad: true, body: expect.stringContaining("1 hồ sơ đã quá SLA") });
    expect(items[2].title).toContain("1.200");
  });

  it("hồ sơ ký gửi: chỉ quá hạn (không còn hồ sơ chờ phân Host) ⇒ tiêu đề nói quá SLA, không ghi '0 hồ sơ chờ'", () => {
    const [only] = workItemViews(work({ consignments: { awaitingHost: 0, overdue: 1, total: 1 } }));
    expect(only).toMatchObject({ key: "consign", bad: true, title: "1 hồ sơ ký gửi quá SLA thẩm định 2 giờ" });
    expect(only.title).not.toMatch(/^0 /);
    const [waiting] = workItemViews(work({ consignments: { awaitingHost: 2, overdue: 0, total: 2 } }));
    expect(waiting).toMatchObject({ bad: false, title: "2 hồ sơ ký gửi chờ duyệt & phân Host thẩm định" });
  });

  it("heatmap gom toà theo phân khu, 'used' = căn đã cho thuê", () => {
    expect(
      heatRows([
        { buildingCode: "S1.01", zone: "Sapphire 1", total: 5, rented: 4, occupancyRate: 80, alert: "NORMAL" },
        { buildingCode: "S1.02", zone: "Sapphire 1", total: 5, rented: 1, occupancyRate: 20, alert: "ATTENTION_NEEDED" },
        { buildingCode: "S2.01", zone: "Sapphire 2", total: 2, rented: 0, occupancyRate: 0, alert: "ATTENTION_NEEDED" },
      ]),
    ).toEqual([
      { zone: "Sapphire 1", cells: [{ building: "S1.01", total: 5, used: 4 }, { building: "S1.02", total: 5, used: 1 }] },
      { zone: "Sapphire 2", cells: [{ building: "S2.01", total: 2, used: 0 }] },
    ]);
  });

  it("nhãn sự kiện: mã đã biết dịch tiếng Việt, mã lạ giữ nguyên (không đoán)", () => {
    expect(activityTitle("DISPATCH_REASSIGNED")).toBe("Admin giao lại ca xem");
    expect(activityTitle("HANDOVER_CHECK_IN_CREATED")).toBe("Biên bản bàn giao nhận phòng");
    expect(activityTitle("HOLD_EXPIRED")).toBe("Hết hạn giữ căn, căn mở lại");
    expect(activityTitle("VIEWING_OPEN_DOOR")).toBe("Host xác nhận xem phòng, cấp mã cửa");
    expect(activityTitle("SOMETHING_NEW")).toBe("SOMETHING_NEW");
    expect(activityActor({ actorRole: "ops_admin", actorName: "Nguyễn A" })).toBe("Admin · Nguyễn A");
    expect(activityActor({ actorRole: "landlord", actorName: null })).toBe("Chủ nhà");
  });
});

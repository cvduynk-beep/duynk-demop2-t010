import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { detectPreset, fmtMoney, fmtPct, fmtSec, ictToday, presetRange, readCommon, readTable, reportQuery, shiftDay } from "@/lib/admin/reports";

const TODAY = "2026-10-13";

describe("admin reports — khoảng ngày (giờ VN)", () => {
  it("ictToday đổi ngày đúng ranh giới 00:00 giờ VN (UTC+7)", () => {
    expect(ictToday(Date.parse("2026-10-12T16:59:59Z"))).toBe("2026-10-12"); // 23:59:59 VN
    expect(ictToday(Date.parse("2026-10-12T17:00:00Z"))).toBe("2026-10-13"); // 00:00 VN
  });

  it("preset: 7/30 ngày gồm hôm nay, tháng này, quý này", () => {
    expect(presetRange("7d", TODAY)).toEqual({ from: "2026-10-07", to: TODAY });
    expect(presetRange("30d", TODAY)).toEqual({ from: "2026-09-14", to: TODAY });
    expect(presetRange("month", TODAY)).toEqual({ from: "2026-10-01", to: TODAY });
    expect(presetRange("quarter", TODAY)).toEqual({ from: "2026-10-01", to: TODAY });
    expect(presetRange("quarter", "2026-08-20")).toEqual({ from: "2026-07-01", to: "2026-08-20" });
    expect(shiftDay("2026-03-01", -1)).toBe("2026-02-28");
  });

  it("nhận lại preset từ URL; khoảng khác ⇒ tuỳ chọn", () => {
    expect(detectPreset({ from: "2026-10-07", to: TODAY }, TODAY)).toBe("7d");
    expect(detectPreset({ from: "2026-10-02", to: "2026-10-05" }, TODAY)).toBe("custom");
  });
});

describe("admin reports — bộ lọc ⇄ URL", () => {
  it("URL trống/sai ⇒ 30 ngày (khớp mặc định server); giữ zone/hostId", () => {
    expect(readCommon(new URLSearchParams(""), TODAY)).toEqual({ from: "2026-09-14", to: TODAY, zone: "", hostId: "" });
    expect(readCommon(new URLSearchParams("from=abc&to=2026-10-10&zone=The%20Sapphire%201&hostId=h1"), TODAY)).toEqual({
      from: "2026-09-14",
      to: "2026-10-10",
      zone: "The Sapphire 1",
      hostId: "h1",
    });
  });

  it("trạng thái bảng theo tiền tố; trang sai ⇒ 1; dir sai ⇒ mặc định", () => {
    const sp = new URLSearchParams("dlSort=monthlyRent&dlDir=asc&dlPage=3&dlStatus=REFUNDED&hpPage=-2&hpDir=up");
    expect(readTable(sp, "dl", { sort: "receivedAt", dir: "desc" })).toEqual({ sort: "monthlyRent", dir: "asc", page: 3, status: "REFUNDED" });
    expect(readTable(sp, "hp", { sort: "deals", dir: "desc" })).toEqual({ sort: "deals", dir: "desc", page: 1, status: undefined });
  });

  it("query gửi server chỉ chứa tham số có giá trị", () => {
    expect(reportQuery({ from: "2026-10-01", to: "2026-10-10", zone: "", hostId: "" })).toBe("from=2026-10-01&to=2026-10-10");
    expect(reportQuery({ from: "2026-10-01", to: "2026-10-10", zone: "The Sapphire 1", hostId: "" }, { sort: "deals", dir: "desc", page: 2, pageSize: 20, status: "PAID_HOLDING" })).toBe(
      "from=2026-10-01&to=2026-10-10&zone=The+Sapphire+1&sort=deals&dir=desc&page=2&pageSize=20&status=PAID_HOLDING",
    );
  });
});

describe("admin reports — định dạng vi-VN", () => {
  it("tiền từ chuỗi decimal, %, giây", () => {
    expect(fmtMoney("30300000.00")).toBe("30.300.000 đ");
    expect(fmtMoney("0")).toBe("0 đ");
    expect([fmtPct(150), fmtPct(33.3), fmtPct(null)]).toEqual(["150%", "33,3%", "—"]);
    expect([fmtSec(90), fmtSec(45.5), fmtSec(null)]).toEqual(["1 phút 30 giây", "45,5 giây", "—"]);
  });
});

describe("màn /admin/reports — không còn mock", () => {
  it("không import lib/mock, không mảng số liệu cứng, không .catch(() => null)", () => {
    const src = readFileSync(path.resolve(__dirname, "../components/admin/AdminReports.tsx"), "utf8");
    expect(src).not.toMatch(/lib\/mock|useMock|AGENT_KPIS|CAMPAIGN_DATA|HIGH_VALUE_PROSPECTS|RAW_DEALS|computeReportSummary|exportReportToCsv/);
    expect(src).not.toMatch(/\.catch\(\s*\(\)\s*=>\s*null\s*\)/);
    expect(src).not.toMatch(/AI Lead Scoring|ROI chiến dịch|Net Revenue/);
  });
});

import { describe, it, expect } from "vitest";
import {
  computeReportSummary,
  exportReportToCsv,
  AGENT_KPIS,
  CAMPAIGN_DATA,
  HIGH_VALUE_PROSPECTS,
  RAW_DEALS,
} from "@/lib/mock/reports";

describe("Admin Reports & Multi-dimensional Analytics", () => {
  it("tổng hợp báo cáo tài chính đầy đủ từ dữ liệu thô", () => {
    const res = computeReportSummary({
      timeRange: "month",
      agentId: "all",
      teamId: "all",
      clientType: "all",
    });

    expect(res.financials.totalGrossRentalValue).toBeGreaterThan(0);
    expect(res.financials.totalNetRevenue).toBeGreaterThan(0);
    expect(res.financials.totalDeals).toBeGreaterThan(0);
    expect(res.financials.totalShowings).toBeGreaterThan(0);
    expect(res.financials.avgWinRate).toBeGreaterThan(0);
    expect(res.financials.marketingRoi).toBeGreaterThan(0);
  });

  it("lọc chính xác theo cá nhân Sale (Agent Dimension)", () => {
    const res = computeReportSummary({
      timeRange: "month",
      agentId: "H01",
      teamId: "all",
      clientType: "all",
    });

    expect(res.agents).toHaveLength(1);
    expect(res.agents[0].name).toBe("Lê Quốc Bảo");
    expect(res.prospects.every((p) => p.assignedHostId === "H01")).toBe(true);
    expect(res.exportRows.every((r) => r.agentName === "Lê Quốc Bảo")).toBe(true);
  });

  it("lọc chính xác theo phân loại khách hàng (Client Dimension)", () => {
    const res = computeReportSummary({
      timeRange: "month",
      agentId: "all",
      teamId: "all",
      clientType: "corporate",
    });

    expect(res.prospects.every((p) => p.clientType === "corporate")).toBe(true);
    expect(res.exportRows.every((r) => r.clientType === "Doanh nghiệp")).toBe(true);
  });

  it("đo lường chính xác các chỉ số KPI: tốc độ nhận ticket, đánh giá khách hàng, deals và % KPI", () => {
    for (const a of AGENT_KPIS) {
      expect(a.ticketAcceptSec).toBeGreaterThan(0);
      expect(a.ticketAcceptSec).toBeLessThanOrEqual(180); // SLA < 3 phút
      expect(a.rating).toBeGreaterThanOrEqual(4.0);
      expect(a.rating).toBeLessThanOrEqual(5.0);
      expect(a.toursActual).toBeGreaterThan(0);
      expect(a.dealsActual).toBeGreaterThan(0);
      expect(a.kpiCompletionRate).toBeGreaterThan(0);
      expect(a.timeToFirstResponseMin).toBeGreaterThan(0);
      expect(a.salesCycleDays).toBeGreaterThan(0);
      expect(a.tourToDealRate).toBeGreaterThan(0);
    }
  });

  it("AI Lead Scoring phân loại độ khẩn cấp và điểm số hợp lý", () => {
    for (const p of HIGH_VALUE_PROSPECTS) {
      expect(p.score).toBeGreaterThanOrEqual(70);
      expect(p.score).toBeLessThanOrEqual(100);
      expect(p.urgencyDays).toBeGreaterThan(0);
      expect(["super_hot", "hot", "warm"]).toContain(p.urgencyLevel);
      if (p.urgencyDays <= 5) {
        expect(p.urgencyLevel).toBe("super_hot");
      }
    }
  });

  it("đo lường chính xác ROI và CPQL của từng chiến dịch tiếp thị", () => {
    for (const c of CAMPAIGN_DATA) {
      expect(c.adSpend).toBeGreaterThan(0);
      expect(c.totalLeads).toBeGreaterThan(0);
      expect(c.qualifiedLeads).toBeGreaterThan(0);
      expect(c.costPerQualifiedLead).toBe(Math.round(c.adSpend / c.qualifiedLeads));
      expect(c.roiPercent).toBeGreaterThan(0);
    }
  });
});

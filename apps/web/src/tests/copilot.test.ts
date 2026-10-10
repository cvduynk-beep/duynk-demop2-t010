import { describe, expect, it } from "vitest";
import {
  AGENT_KPIS,
  CAMPAIGN_DATA,
  HIGH_VALUE_PROSPECTS,
  RAW_DEALS,
  computeReportSummary,
} from "@/lib/mock/reports";

describe("Admin Vinny Copilot Logic & Data Engine", () => {
  it("computes executive summary accurately for Vinny", () => {
    const summary = computeReportSummary({
      timeRange: "week",
      agentId: "all",
      teamId: "all",
      clientType: "all",
    });

    expect(summary.financials.totalGrossRentalValue).toBeGreaterThan(0);
    expect(summary.financials.totalDeals).toBeGreaterThan(0);
    expect(summary.agents.length).toBe(5);

    const topKpiAgent = [...AGENT_KPIS].sort((a, b) => b.kpiCompletionRate - a.kpiCompletionRate)[0];
    expect(topKpiAgent.name).toBe("Đỗ Thu Uyên");
    expect(topKpiAgent.kpiCompletionRate).toBe(141);

    const topGrvAgent = [...AGENT_KPIS].sort((a, b) => b.grvActual - a.grvActual)[0];
    expect(topGrvAgent.name).toBe("Lê Quốc Bảo");
    expect(topGrvAgent.grvActual).toBe(108_000_000);

    const avgSla = Math.round(
      AGENT_KPIS.reduce((s, a) => s + a.ticketAcceptSec, 0) / AGENT_KPIS.length
    );
    expect(avgSla).toBeLessThan(180); // SLA target < 180s
  });

  it("identifies top 3 prospects with high AI scores", () => {
    const top3 = HIGH_VALUE_PROSPECTS.slice(0, 3);
    expect(top3.length).toBe(3);
    expect(top3[0].score).toBe(96);
    expect(top3[0].name).toBe("Trần Minh Quân");
    expect(top3[0].urgencyDays).toBeLessThanOrEqual(3);
    expect(top3[1].score).toBe(94);
    expect(top3[1].clientType).toBe("corporate");
  });

  it("distinguishes closed deals from prospective leads accurately", () => {
    // RAW_DEALS are signed/closed contracts
    expect(RAW_DEALS.length).toBeGreaterThan(0);
    const mostRecentDeal = RAW_DEALS[0];
    expect(mostRecentDeal.clientName).toBe("Nguyễn Văn Hùng");
    expect(mostRecentDeal.agentName).toBe("Lê Quốc Bảo");
    expect(mostRecentDeal.status).toBe("Đã ký HĐ & Nhận nhà");
    expect(mostRecentDeal.monthlyRent).toBe(9_000_000);

    // High value prospects are searching/waiting in the funnel (not yet closed)
    const topProspect = HIGH_VALUE_PROSPECTS[0];
    expect(topProspect.name).toBe("Trần Minh Quân");
    expect(topProspect.score).toBe(96);
    expect(topProspect.name).not.toBe(mostRecentDeal.clientName);
  });

  it("correctly identifies performance ranking intent for natural language query", () => {
    const query = "sale nào đang có hiệu suất tốt nhất";
    const AGENT_TERMS = ["sale", "nhân viên", "nhân sự", "host", "ai", "bạn nào"];
    const RANKING_TERMS = ["hiệu suất", "năng suất", "tốt nhất", "cao nhất", "kpi", "chốt nhiều"];

    const hasAgent = AGENT_TERMS.some((w) => query.includes(w));
    const hasRanking = RANKING_TERMS.some((w) => query.includes(w));
    expect(hasAgent && hasRanking).toBe(true);

    const topKpiAgent = [...AGENT_KPIS].sort((a, b) => b.kpiCompletionRate - a.kpiCompletionRate)[0];
    const topGrvAgent = [...AGENT_KPIS].sort((a, b) => b.grvActual - a.grvActual)[0];
    expect(topKpiAgent.name).toBe("Đỗ Thu Uyên");
    expect(topGrvAgent.name).toBe("Lê Quốc Bảo");
  });

  it("detects SLA breaches among agents", () => {
    const breaches = AGENT_KPIS.filter((a) => a.slaBreachCount > 0);
    expect(breaches.length).toBeGreaterThanOrEqual(1);
    expect(breaches.some((b) => b.slaBreachCount > 0)).toBe(true);
  });

  it("identifies best performing campaign by ROI", () => {
    const bestCampaign = [...CAMPAIGN_DATA].sort((a, b) => b.roiPercent - a.roiPercent)[0];
    expect(bestCampaign.channel).toBe("Organic / SEO");
    expect(bestCampaign.roiPercent).toBe(1660);

    const bestPaidCampaign = CAMPAIGN_DATA.filter((c) => c.channel !== "Organic / SEO").sort(
      (a, b) => b.roiPercent - a.roiPercent
    )[0];
    expect(bestPaidCampaign.channel).toBe("Zalo ZNS");
  });
});

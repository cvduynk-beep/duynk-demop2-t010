import type { MockState } from "./types";
import { HOSTS, UNITS } from "./units";

export type TimeRangeKey = "today" | "week" | "month" | "quarter" | "custom";
export type ClientType = "all" | "new" | "renewal" | "corporate";
export type ChannelType = "Facebook Ads" | "Google Search" | "TikTok Ads" | "Zalo ZNS" | "Organic / SEO";

export interface ReportFilter {
  timeRange: TimeRangeKey;
  startDate?: string;
  endDate?: string;
  agentId: string; // "all" | hostId
  teamId: string; // "all" | "sapphire" | "zenpark" | "oceanview"
  clientType: ClientType;
}

export interface AgentKpiMetric {
  hostId: string;
  name: string;
  phone: string;
  team: string;
  avatar: string;
  // 1. Tốc độ nhận ticket & SLA
  ticketAcceptSec: number; // Tốc độ nhận ticket (SLA < 180s = 3 phút)
  timeToFirstResponseMin: number; // Tốc độ liên hệ khách (phút)
  slaBreachCount: number; // Số ca trễ quá SLA
  // 2. Mức đánh giá từ khách hàng
  rating: number; // Đánh giá sao từ khách (1 - 5 ⭐)
  totalReviews: number; // Số lượt đánh giá
  // 3. Lượng căn chốt được & Doanh số
  dealsTarget: number;
  dealsActual: number; // Số căn chốt thành công
  grvTarget: number;
  grvActual: number; // Doanh số tiền thuê mang về (GRV)
  netRevenue: number; // Hoa hồng mang về sàn
  tourToDealRate: number; // Win rate: % chốt trên lượt dẫn
  // 4. Lượt dẫn thực địa & Tỷ lệ hoàn thành KPI
  toursTarget: number;
  toursActual: number; // Lượt dẫn khách thực địa
  kpiCompletionRate: number; // % Hoàn thành KPI tổng thể (Tours & Deals)
  salesCycleDays: number; // Chu kỳ chốt HĐ (ngày)
}

export interface HighValueProspect {
  id: string;
  name: string;
  phoneMasked: string;
  clientType: "new" | "renewal" | "corporate";
  score: number; // 0 - 100
  urgencyLevel: "super_hot" | "hot" | "warm";
  urgencyDays: number; // Số ngày cần vào ở
  budgetMonthly: number; // Ngân sách All-in trần
  preferredLayout: string;
  matchedUnitCode: string;
  assignedHostId: string;
  assignedHostName: string;
  interactionCount: number;
  fastResponse: boolean;
  viewed360: boolean;
  aiNotes: string;
}

export interface CampaignReportRow {
  id: string;
  name: string;
  channel: ChannelType;
  zone: string;
  utmSource: string;
  adSpend: number;
  totalLeads: number;
  qualifiedLeads: number; // Khách nét chịu đi xem
  costPerLead: number;
  costPerQualifiedLead: number; // CPQL = adSpend / qualifiedLeads
  dealsClosed: number;
  grossRentalValue: number;
  netRevenue: number;
  roiPercent: number; // (netRevenue - adSpend) / adSpend * 100
}

export interface FinancialSummary {
  totalGrossRentalValue: number;
  totalNetRevenue: number;
  totalDeals: number;
  totalShowings: number;
  avgDealValue: number;
  avgWinRate: number;
  totalAdSpend: number;
  marketingRoi: number;
  totalAgentCommission: number;
}

export interface RawExportRow {
  dealCode: string;
  createdAt: string;
  clientName: string;
  clientPhone: string;
  clientType: string;
  agentName: string;
  team: string;
  unitAddress: string;
  layout: string;
  monthlyRent: number;
  netRevenue: number;
  channel: string;
  status: string;
  salesCycleDays: number;
}

// ─── DANH SÁCH DỮ LIỆU BÁO CÁO MẪU ĐỒNG BỘ ───────────────────────────────────────────────────

export const TEAMS = [
  { id: "all", name: "Tất cả đội nhóm" },
  { id: "sapphire", name: "Đội Sapphire (S1 & S2)" },
  { id: "oceanview", name: "Đội The Ocean View (Pavilion, Zen)" },
  { id: "vip", name: "Đội VIP / Khách Doanh Nghiệp" },
];

export const CAMPAIGN_DATA: CampaignReportRow[] = [
  {
    id: "cmp-01",
    name: "Khai xuân Sapphire - FB Video Tour",
    channel: "Facebook Ads",
    zone: "The Sapphire 1 & 2",
    utmSource: "fb_sapphire_tour",
    adSpend: 15_000_000,
    totalLeads: 185,
    qualifiedLeads: 52,
    costPerLead: 81_081,
    costPerQualifiedLead: 288_462,
    dealsClosed: 14,
    grossRentalValue: 126_000_000,
    netRevenue: 50_400_000,
    roiPercent: 236,
  },
  {
    id: "cmp-02",
    name: "Google Search - Căn hộ 2PN Vinhomes",
    channel: "Google Search",
    zone: "Toàn khu Ocean Park",
    utmSource: "gg_search_2pn_hanoi",
    adSpend: 18_500_000,
    totalLeads: 142,
    qualifiedLeads: 48,
    costPerLead: 130_281,
    costPerQualifiedLead: 385_417,
    dealsClosed: 12,
    grossRentalValue: 132_000_000,
    netRevenue: 52_800_000,
    roiPercent: 185.4,
  },
  {
    id: "cmp-03",
    name: "TikTok - Review Căn Studio Sinh Viên VinUni",
    channel: "TikTok Ads",
    zone: "The Sapphire 2",
    utmSource: "tt_studio_vinuni",
    adSpend: 8_000_000,
    totalLeads: 210,
    qualifiedLeads: 38,
    costPerLead: 38_095,
    costPerQualifiedLead: 210_526,
    dealsClosed: 9,
    grossRentalValue: 58_500_000,
    netRevenue: 23_400_000,
    roiPercent: 192.5,
  },
  {
    id: "cmp-04",
    name: "Zalo ZNS - Re-engagement Khách Hết Hạn HĐ",
    channel: "Zalo ZNS",
    zone: "Toàn khu",
    utmSource: "zalo_renew_2026",
    adSpend: 3_500_000,
    totalLeads: 65,
    qualifiedLeads: 29,
    costPerLead: 53_846,
    costPerQualifiedLead: 120_690,
    dealsClosed: 11,
    grossRentalValue: 99_000_000,
    netRevenue: 39_600_000,
    roiPercent: 1031.4,
  },
  {
    id: "cmp-05",
    name: "Organic Search & Direct AI Matchmaker",
    channel: "Organic / SEO",
    zone: "Toàn khu",
    utmSource: "seo_organic_direct",
    adSpend: 2_000_000,
    totalLeads: 120,
    qualifiedLeads: 41,
    costPerLead: 16_667,
    costPerQualifiedLead: 48_780,
    dealsClosed: 10,
    grossRentalValue: 88_000_000,
    netRevenue: 35_200_000,
    roiPercent: 1660,
  },
];

export const HIGH_VALUE_PROSPECTS: HighValueProspect[] = [
  {
    id: "pros-01",
    name: "Trần Minh Quân",
    phoneMasked: "0912***456",
    clientType: "new",
    score: 96,
    urgencyLevel: "super_hot",
    urgencyDays: 3,
    budgetMonthly: 9_500_000,
    preferredLayout: "2PN · 64m²",
    matchedUnitCode: "S2.12-1608",
    assignedHostId: "H01",
    assignedHostName: "Lê Quốc Bảo",
    interactionCount: 8,
    fastResponse: true,
    viewed360: true,
    aiNotes: "Đã xác thực Zalo OTP; sẵn sàng chuyển cọc 2M qua VietQR trong 24h nếu duyệt giá sàn 9M.",
  },
  {
    id: "pros-02",
    name: "Công ty TNHH Kyocera Tech",
    phoneMasked: "0988***112",
    clientType: "corporate",
    score: 94,
    urgencyLevel: "super_hot",
    urgencyDays: 4,
    budgetMonthly: 15_000_000,
    preferredLayout: "3PN · 77m²",
    matchedUnitCode: "S2.09-2314",
    assignedHostId: "H02",
    assignedHostName: "Trần Minh Đức",
    interactionCount: 12,
    fastResponse: true,
    viewed360: true,
    aiNotes: "Thuê cho chuyên gia Nhật Bản; thanh toán 6 tháng/lần; yêu cầu xuất hóa đơn VAT điện tử.",
  },
  {
    id: "pros-03",
    name: "Nguyễn Thùy Linh",
    phoneMasked: "0904***789",
    clientType: "renewal",
    score: 91,
    urgencyLevel: "super_hot",
    urgencyDays: 5,
    budgetMonthly: 6_500_000,
    preferredLayout: "Studio · 33m²",
    matchedUnitCode: "S1.03-1520",
    assignedHostId: "H01",
    assignedHostName: "Lê Quốc Bảo",
    interactionCount: 6,
    fastResponse: true,
    viewed360: false,
    aiNotes: "Cư dân hiện hữu sắp hết hạn hợp đồng tòa S1.01; tín nhiệm cao 100% không nợ phí dịch vụ.",
  },
  {
    id: "pros-04",
    name: "Đặng Hoàng Nam",
    phoneMasked: "0977***334",
    clientType: "new",
    score: 86,
    urgencyLevel: "hot",
    urgencyDays: 7,
    budgetMonthly: 8_000_000,
    preferredLayout: "1PN+1 · 45m²",
    matchedUnitCode: "S1.02-1212",
    assignedHostId: "H03",
    assignedHostName: "Phạm Hoàng Nam",
    interactionCount: 5,
    fastResponse: true,
    viewed360: true,
    aiNotes: "Làm việc tại TechnoPark Ocean Park; cần slot gửi xe ô tô hầm; đã xem video 360 4 lần.",
  },
  {
    id: "pros-05",
    name: "Phạm Gia Khánh",
    phoneMasked: "0936***998",
    clientType: "new",
    score: 82,
    urgencyLevel: "hot",
    urgencyDays: 7,
    budgetMonthly: 11_000_000,
    preferredLayout: "2PN · 65m²",
    matchedUnitCode: "S2.16-2216",
    assignedHostId: "H04",
    assignedHostName: "Hoàng Gia Huy",
    interactionCount: 4,
    fastResponse: false,
    viewed360: true,
    aiNotes: "Gia đình có con nhỏ học Vinschool; hỏi kỹ về chi phí All-in và nội quy nuôi cún cảnh.",
  },
  {
    id: "pros-06",
    name: "Bùi Thu Hà",
    phoneMasked: "0965***552",
    clientType: "new",
    score: 75,
    urgencyLevel: "warm",
    urgencyDays: 14,
    budgetMonthly: 5_500_000,
    preferredLayout: "Studio · 30m²",
    matchedUnitCode: "S1.01-2009",
    assignedHostId: "H05",
    assignedHostName: "Đỗ Thu Uyên",
    interactionCount: 3,
    fastResponse: false,
    viewed360: false,
    aiNotes: "Sinh viên mới nhập học; cần tìm bạn ở ghép; đã tham gia hàng chờ Waitlist.",
  },
];

export const AGENT_KPIS: AgentKpiMetric[] = [
  {
    hostId: "H01",
    name: "Lê Quốc Bảo",
    phone: "0981 112 233",
    team: "Đội Sapphire (S1 & S2)",
    avatar: "LB",
    ticketAcceptSec: 42,
    timeToFirstResponseMin: 3.2,
    slaBreachCount: 0,
    rating: 4.95,
    totalReviews: 28,
    dealsTarget: 8,
    dealsActual: 12,
    grvTarget: 75_000_000,
    grvActual: 108_000_000,
    netRevenue: 43_200_000,
    tourToDealRate: 33.3,
    toursTarget: 30,
    toursActual: 36,
    kpiCompletionRate: 135,
    salesCycleDays: 1.8,
  },
  {
    hostId: "H02",
    name: "Trần Minh Đức",
    phone: "0982 223 344",
    team: "Đội The Ocean View",
    avatar: "MĐ",
    ticketAcceptSec: 68,
    timeToFirstResponseMin: 4.5,
    slaBreachCount: 1,
    rating: 4.88,
    totalReviews: 24,
    dealsTarget: 7,
    dealsActual: 9,
    grvTarget: 65_000_000,
    grvActual: 89_000_000,
    netRevenue: 35_600_000,
    tourToDealRate: 31.0,
    toursTarget: 25,
    toursActual: 29,
    kpiCompletionRate: 122,
    salesCycleDays: 2.2,
  },
  {
    hostId: "H03",
    name: "Phạm Hoàng Nam",
    phone: "0983 334 455",
    team: "Đội Sapphire (S1 & S2)",
    avatar: "HN",
    ticketAcceptSec: 95,
    timeToFirstResponseMin: 5.8,
    slaBreachCount: 2,
    rating: 4.75,
    totalReviews: 18,
    dealsTarget: 6,
    dealsActual: 7,
    grvTarget: 55_000_000,
    grvActual: 62_000_000,
    netRevenue: 24_800_000,
    tourToDealRate: 35.0,
    toursTarget: 22,
    toursActual: 20,
    kpiCompletionRate: 104,
    salesCycleDays: 2.9,
  },
  {
    hostId: "H04",
    name: "Hoàng Gia Huy",
    phone: "0984 445 566",
    team: "Đội The Ocean View",
    avatar: "GH",
    ticketAcceptSec: 145,
    timeToFirstResponseMin: 8.2,
    slaBreachCount: 3,
    rating: 4.62,
    totalReviews: 16,
    dealsTarget: 5,
    dealsActual: 5,
    grvTarget: 48_000_000,
    grvActual: 46_000_000,
    netRevenue: 18_400_000,
    tourToDealRate: 27.8,
    toursTarget: 20,
    toursActual: 18,
    kpiCompletionRate: 95,
    salesCycleDays: 3.4,
  },
  {
    hostId: "H05",
    name: "Đỗ Thu Uyên",
    phone: "0985 556 677",
    team: "Đội VIP / Khách Doanh Nghiệp",
    avatar: "TU",
    ticketAcceptSec: 38,
    timeToFirstResponseMin: 2.8,
    slaBreachCount: 0,
    rating: 4.96,
    totalReviews: 22,
    dealsTarget: 5,
    dealsActual: 8,
    grvTarget: 50_000_000,
    grvActual: 88_000_000,
    netRevenue: 35_200_000,
    tourToDealRate: 36.4,
    toursTarget: 18,
    toursActual: 22,
    kpiCompletionRate: 141,
    salesCycleDays: 1.9,
  },
];

export const RAW_DEALS: RawExportRow[] = [
  {
    dealCode: "DL-2026-081",
    createdAt: "2026-10-09",
    clientName: "Nguyễn Văn Hùng",
    clientPhone: "0912***678",
    clientType: "Khách mới",
    agentName: "Lê Quốc Bảo",
    team: "Đội Sapphire (S1 & S2)",
    unitAddress: "S2.12 · Tầng 16 · Căn 08",
    layout: "2PN",
    monthlyRent: 9_000_000,
    netRevenue: 3_600_000,
    channel: "Facebook Ads",
    status: "Đã ký HĐ & Nhận nhà",
    salesCycleDays: 2,
  },
  {
    dealCode: "DL-2026-082",
    createdAt: "2026-10-08",
    clientName: "Kyocera Precision Corp",
    clientPhone: "0988***112",
    clientType: "Doanh nghiệp",
    agentName: "Đỗ Thu Uyên",
    team: "Đội VIP / Khách Doanh Nghiệp",
    unitAddress: "S2.09 · Tầng 23 · Căn 14",
    layout: "3PN",
    monthlyRent: 11_800_000,
    netRevenue: 4_720_000,
    channel: "Google Search",
    status: "Đã thanh toán 6 tháng",
    salesCycleDays: 3,
  },
  {
    dealCode: "DL-2026-083",
    createdAt: "2026-10-07",
    clientName: "Trần Mai Anh",
    clientPhone: "0932***556",
    clientType: "Khách mới",
    agentName: "Trần Minh Đức",
    team: "Đội The Ocean View",
    unitAddress: "S1.03 · Tầng 15 · Căn 20",
    layout: "Studio",
    monthlyRent: 6_500_000,
    netRevenue: 2_600_000,
    channel: "TikTok Ads",
    status: "Đã cọc holding qua VietQR",
    salesCycleDays: 1,
  },
  {
    dealCode: "DL-2026-084",
    createdAt: "2026-10-06",
    clientName: "Lê Hoàng Yến",
    clientPhone: "0974***889",
    clientType: "Tái ký",
    agentName: "Lê Quốc Bảo",
    team: "Đội Sapphire (S1 & S2)",
    unitAddress: "S1.02 · Tầng 12 · Căn 12",
    layout: "2PN",
    monthlyRent: 8_000_000,
    netRevenue: 3_200_000,
    channel: "Zalo ZNS",
    status: "Đã ký số OTP",
    salesCycleDays: 1,
  },
  {
    dealCode: "DL-2026-085",
    createdAt: "2026-10-05",
    clientName: "Đặng Quốc Cường",
    clientPhone: "0903***221",
    clientType: "Khách mới",
    agentName: "Phạm Hoàng Nam",
    team: "Đội Sapphire (S1 & S2)",
    unitAddress: "S1.01 · Tầng 20 · Căn 09",
    layout: "1PN",
    monthlyRent: 4_000_000,
    netRevenue: 1_600_000,
    channel: "Organic / SEO",
    status: "Đã ký HĐ & Nhận nhà",
    salesCycleDays: 4,
  },
  {
    dealCode: "DL-2026-086",
    createdAt: "2026-10-04",
    clientName: "Bùi Thị Mai",
    clientPhone: "0944***333",
    clientType: "Khách mới",
    agentName: "Hoàng Gia Huy",
    team: "Đội The Ocean View",
    unitAddress: "S1.01 · Tầng 17 · Căn 17",
    layout: "1PN",
    monthlyRent: 4_000_000,
    netRevenue: 1_600_000,
    channel: "Facebook Ads",
    status: "Đã ký HĐ & Nhận nhà",
    salesCycleDays: 3,
  },
];

// ─── HÀM TRÍCH XUẤT CSV CHUẨN UTF-8 VÀ ĐỐI SOÁT TÀI CHÍNH ────────────────────────────────────

export function computeReportSummary(
  filter: ReportFilter,
  state?: MockState
): {
  financials: FinancialSummary;
  agents: AgentKpiMetric[];
  prospects: HighValueProspect[];
  campaigns: CampaignReportRow[];
  exportRows: RawExportRow[];
} {
  // 1. Lọc Agents theo filter
  let filteredAgents = [...AGENT_KPIS];
  if (filter.agentId !== "all") {
    filteredAgents = filteredAgents.filter((a) => a.hostId === filter.agentId);
  }
  if (filter.teamId === "sapphire") {
    filteredAgents = filteredAgents.filter((a) => a.team.includes("Sapphire"));
  } else if (filter.teamId === "oceanview") {
    filteredAgents = filteredAgents.filter((a) => a.team.includes("Ocean View"));
  } else if (filter.teamId === "vip") {
    filteredAgents = filteredAgents.filter((a) => a.team.includes("VIP"));
  }

  // 2. Lọc Prospects theo clientType
  let filteredProspects = [...HIGH_VALUE_PROSPECTS];
  if (filter.clientType !== "all") {
    filteredProspects = filteredProspects.filter((p) => p.clientType === filter.clientType);
  }
  if (filter.agentId !== "all") {
    filteredProspects = filteredProspects.filter((p) => p.assignedHostId === filter.agentId);
  }

  // 3. Lọc Export Rows
  let filteredExport = [...RAW_DEALS];
  if (filter.agentId !== "all") {
    const target = AGENT_KPIS.find((a) => a.hostId === filter.agentId);
    if (target) {
      filteredExport = filteredExport.filter((r) => r.agentName === target.name);
    }
  }
  if (filter.clientType === "new") {
    filteredExport = filteredExport.filter((r) => r.clientType === "Khách mới");
  } else if (filter.clientType === "renewal") {
    filteredExport = filteredExport.filter((r) => r.clientType === "Tái ký");
  } else if (filter.clientType === "corporate") {
    filteredExport = filteredExport.filter((r) => r.clientType === "Doanh nghiệp");
  }

  // 4. Tổng hợp Tài chính
  const totalGrossRentalValue = filteredAgents.reduce((s, a) => s + a.grvActual, 0);
  const totalNetRevenue = filteredAgents.reduce((s, a) => s + a.netRevenue, 0);
  const totalDeals = filteredAgents.reduce((s, a) => s + a.dealsActual, 0);
  const totalShowings = filteredAgents.reduce((s, a) => s + a.toursActual, 0);
  const totalAdSpend = CAMPAIGN_DATA.reduce((s, c) => s + c.adSpend, 0);
  const totalCampaignNet = CAMPAIGN_DATA.reduce((s, c) => s + c.netRevenue, 0);

  const avgDealValue = totalDeals > 0 ? Math.round(totalGrossRentalValue / totalDeals) : 0;
  const avgWinRate = totalShowings > 0 ? Math.round((totalDeals / totalShowings) * 1000) / 10 : 0;
  const marketingRoi = totalAdSpend > 0 ? Math.round(((totalCampaignNet - totalAdSpend) / totalAdSpend) * 1000) / 10 : 0;
  const totalAgentCommission = Math.round(totalNetRevenue * 0.4); // 40% chia hoa hồng cho Host

  return {
    financials: {
      totalGrossRentalValue,
      totalNetRevenue,
      totalDeals,
      totalShowings,
      avgDealValue,
      avgWinRate,
      totalAdSpend,
      marketingRoi,
      totalAgentCommission,
    },
    agents: filteredAgents,
    prospects: filteredProspects,
    campaigns: CAMPAIGN_DATA,
    exportRows: filteredExport,
  };
}

/** Xuất file CSV UTF-8 kèm mã BOM để mở tiếng Việt không lỗi trên Microsoft Excel */
export function exportReportToCsv(rows: RawExportRow[], filename = "VinStay_Bao_Cao_Doanh_Thu.csv") {
  const headers = [
    "Mã Giao Dịch",
    "Ngày Chốt",
    "Tên Khách Hàng",
    "Số Điện Thoại",
    "Phân Loại Khách",
    "Sale Phụ Trách",
    "Đội Nhóm",
    "Căn Hộ",
    "Layout",
    "Giá Thuê Tháng (VNĐ)",
    "Hoa Hồng Sàn (VNĐ)",
    "Kênh Tiếp Thị",
    "Trạng Thái",
    "Chu Kỳ Chốt (Ngày)",
  ];

  const escapeCsv = (val: string | number) => {
    const str = String(val ?? "");
    if (str.includes(",") || str.includes('"') || str.includes("\n")) {
      return `"${str.replace(/"/g, '""')}"`;
    }
    return str;
  };

  const csvRows = [
    headers.join(","),
    ...rows.map((r) =>
      [
        escapeCsv(r.dealCode),
        escapeCsv(r.createdAt),
        escapeCsv(r.clientName),
        escapeCsv(r.clientPhone),
        escapeCsv(r.clientType),
        escapeCsv(r.agentName),
        escapeCsv(r.team),
        escapeCsv(r.unitAddress),
        escapeCsv(r.layout),
        escapeCsv(r.monthlyRent),
        escapeCsv(r.netRevenue),
        escapeCsv(r.channel),
        escapeCsv(r.status),
        escapeCsv(r.salesCycleDays),
      ].join(",")
    ),
  ];

  // BOM UTF-8 (\uFEFF) giúp Excel tự động nhận diện tiếng Việt có dấu
  const blob = new Blob(["\uFEFF" + csvRows.join("\r\n")], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.setAttribute("href", url);
  link.setAttribute("download", filename);
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

"use client";

import { useMemo, useState } from "react";
import {
  ArrowDownToLine,
  Award,
  BarChart3,
  BookOpen,
  CheckCircle2,
  Clock,
  Download,
  Filter,
  Flame,
  HelpCircle,
  Info,
  Megaphone,
  Printer,
  Search,
  Sparkles,
  TrendingUp,
  UserCheck,
  Users,
  X,
  Zap,
} from "lucide-react";
import { PageHeader } from "@/components/ui/PageHeader";
import { Section } from "@/components/ui/Section";
import { StatTile } from "@/components/charts/StatTile";
import { DataTable, type DataTableColumn } from "@/components/ui/DataTable";
import { Modal } from "@/components/ui/Modal";
import { toast } from "@/components/ui/Toast";
import { vnd, vndShort } from "@/lib/mock/format";
import {
  computeReportSummary,
  exportReportToCsv,
  TEAMS,
  type AgentKpiMetric,
  type CampaignReportRow,
  type ClientType,
  type HighValueProspect,
  type RawExportRow,
  type ReportFilter,
  type TimeRangeKey,
} from "@/lib/mock/reports";
import { HOSTS } from "@/lib/mock/units";
import { useMock } from "@/lib/mock/store";
import styles from "./Admin.module.css";

type ReportType = "kpi" | "prospects" | "campaign" | "raw";

interface ReportExplanation {
  title: string;
  badge: string;
  whatIsIt: string;
  formulas: {
    name: string;
    formula: string;
    explanation: string;
    benchmark?: string;
  }[];
  actions: string[];
}

const EXPLANATIONS: Record<ReportType, ReportExplanation> = {
  kpi: {
    title: "Bảng KPI & Đánh Giá Năng Suất Nhân Sự Sale",
    badge: "Agent Field Performance Metrics",
    whatIsIt:
      "Báo cáo định lượng hiệu suất làm việc thực địa của đội ngũ Field Host / Sale nội khu tại Vinhomes Ocean Park. LƯU Ý PHÂN ĐỊNH HỆ THỐNG: Phiên chat AI chỉ kết thúc ở mức độ khách đồng ý đi xem phòng — đây là thước đo năng lực của AI Matchmaker & Phễu Marketing, KHÔNG tính vào KPI của Sale. Nhân sự Sale chỉ được đánh giá thực chất qua 4 tiêu chí cốt lõi: (1) Nhanh nhận ticket & SLA, (2) Mức đánh giá từ khách hàng, (3) Lượng căn chốt được & Doanh số, và (4) Tỷ lệ hoàn thành KPI.",
    formulas: [
      {
        name: "1. Tốc độ nhận ticket ca xem & SLA (Ticket Acceptance Speed)",
        formula: "Tốc độ nhận ticket = Thời điểm Host bấm nhận ca – Thời điểm hệ thống điều phối ticket (giây)",
        explanation: "Đo lường sự nhanh nhạy trực ca sảnh và tinh thần sẵn sàng đón khách. Chuẩn Auto-Dispatch 3 tầng ưu tiên nhận trong 3 phút.",
        benchmark: "Chuẩn SLA: < 180 giây (3 phút). Dưới 60 giây là xuất sắc. Quá 3 phút bị trôi ca sang Open Pool và ghi nhận cờ vi phạm.",
      },
      {
        name: "2. Mức độ đánh giá từ khách hàng (Customer Rating & Review)",
        formula: "Điểm đánh giá = Trung bình số sao đánh giá thực tế của khách thuê sau ca dẫn xem (1 – 5 ⭐)",
        explanation: "Khách chấm điểm trực tiếp trên Zalo về thái độ tiếp đón sảnh, đúng giờ, quẹt thẻ cư dân và sự trung thực minh bạch về căn hộ.",
        benchmark: "Mức chuẩn: ≥ 4.8 / 5.0 ⭐.",
      },
      {
        name: "3. Lượng căn chốt được & Doanh số (Deals Closed & GRV)",
        formula: "Doanh số (GRV) = Tổng tiền thuê hàng tháng của các căn chốt thành công qua cọc VietQR 2.000.000đ",
        explanation: "Thước đo giá trị tài chính thực tế Host mang về cho chủ nhà và tiền hoa hồng mang về cho sàn.",
        benchmark: "Chỉ tiêu: ≥ 5 – 8 căn/tháng.",
      },
      {
        name: "4. Tỷ lệ hoàn thành KPI tổng thể (Overall KPI Completion Rate)",
        formula: "% Hoàn thành KPI = Trung bình trọng số giữa (% Đạt chỉ tiêu Lượt dẫn) và (% Đạt chỉ tiêu Căn chốt)",
        explanation: "Đánh giá mức độ nỗ lực hoàn thành kế hoạch kinh doanh được giao trong tháng so với định mức.",
        benchmark: "Mức chuẩn: ≥ 100% KPI tháng.",
      },
      {
        name: "5. Tỷ lệ chốt trên lượt dẫn khách (Tour-to-Deal Win Rate)",
        formula: "Win Rate (%) = (Số căn chốt cọc thành công / Tổng số lượt dẫn xem thực tế) × 100%",
        explanation: "Chỉ số đánh giá kỹ năng tư vấn tại phòng và chuyển hóa khách xem thành người xuống tiền cọc.",
        benchmark: "Mức chuẩn: 28% – 35% (dẫn 10 khách chốt 3 khách).",
      },
    ],
    actions: [
      "Khen thưởng nóng cho Sale có Win Rate ≥ 33%, Rating ≥ 4.9⭐ và Tốc độ nhận ticket ≤ 60 giây.",
      "Cảnh báo và hỗ trợ phân khu cho Sale có tỷ lệ hoàn thành KPI < 80% hoặc có ≥ 2 ca vi phạm SLA.",
      "Tạm ngưng phân bổ ticket ca mới đối với Sale có 3 ca vi phạm SLA nhận ticket theo Hợp đồng Hợp tác.",
    ],
  },
  prospects: {
    title: "Top Khách Hàng Tiềm Năng (AI Lead Scoring Engine)",
    badge: "AI Predictive Scoring",
    whatIsIt:
      "Hệ thống AI tự động phân tích hành vi và dữ liệu hồ sơ để xếp hạng danh sách khách hàng có xác suất 'xuống tiền' cọc giữ chỗ 2.000.000đ cao nhất trong vòng 24–72 giờ. Giúp Admin phân bổ lead nét cho Top Sale chăm sóc, triệt tiêu thời gian trống phòng cho chủ nhà.",
    formulas: [
      {
        name: "Tổng Điểm AI Lead Score (Thang điểm 100)",
        formula: "Điểm AI = Điểm Ngân Sách (Max 35đ) + Điểm Khẩn Cấp (Max 40đ) + Điểm Tương Tác Số (Max 25đ)",
        explanation: "Thuật toán học máy xếp hạng tự động dựa trên 3 trụ cột dữ liệu khách hàng.",
      },
      {
        name: "1. Điểm Ngân Sách Thực Tế (Tối đa 35 điểm)",
        formula: "Khớp 100% All-in: 35đ | Khớp Giá sàn ủy quyền: 30đ | Lệch ≥ 15%: ≤ 15đ",
        explanation: "So sánh trần ngân sách All-in của khách với giá chào thuê hoặc biên độ giá sàn ủy quyền của giỏ hàng trống.",
      },
      {
        name: "2. Mức độ Khẩn Cấp Cần Vào Ở (Tối đa 40 điểm)",
        formula: "Vào ở 1–3 ngày: 40đ | Vào ở 4–7 ngày: 35đ | Vào ở 8–14 ngày: 20đ | > 30 ngày: 10đ",
        explanation: "Khách cần dọn vào ở trong vòng 3–7 ngày có tỷ lệ chốt cọc cao gấp đôi so với khách tìm trước 1–2 tháng.",
      },
      {
        name: "3. Mức độ Tương Tác Số Trên Nền Tảng (Tối đa 25 điểm)",
        formula: "Đã OTP Zalo (+10đ) + Phản hồi ≤ 5p (+5đ) + Xem ≥ 3 căn hoặc xem ảnh/video 360 (+5đ) + Cư dân uy tín (+5đ)",
        explanation: "Đánh giá mức độ quan tâm nghiêm túc và độ tín nhiệm số của khách thuê.",
      },
    ],
    actions: [
      "🔥 Siêu nóng (≥ 90 điểm): Bắt buộc gán Top Sale liên hệ tư vấn trong 30 phút để chốt cọc trong 24h.",
      "⚡ Nóng (80 – 89 điểm): Gửi Zalo ZNS kèm link 3D/video căn hộ phù hợp và đặt lịch xem trong ngày.",
      "✨ Tiềm năng (70 – 79 điểm): Đưa vào hàng chờ Waitlist F2 tự động chăm sóc bằng AI Chatbot.",
    ],
  },
  campaign: {
    title: "Báo Cáo Hiệu Quả Chiến Dịch Tiếp Thị (Marketing Campaign ROI)",
    badge: "Marketing Performance & CPQL",
    whatIsIt:
      "Báo cáo đo lường hiệu quả chi tiêu ngân sách quảng cáo (Facebook Ads, Google Search, TikTok Ads, Zalo ZNS, Organic/SEO) theo từng phân khu Vinhomes Ocean Park. Giúp Admin tối ưu hóa chi phí thu hút khách hàng (CAC) và tập trung ngân sách vào kênh mang lại khách nét thực sự.",
    formulas: [
      {
        name: "1. Chi phí trên mỗi Lead (Cost per Lead - CPL)",
        formula: "CPL = Tổng ngân sách Ads đã chi / Tổng số Lead thu về (VNĐ)",
        explanation: "Chi phí trung bình để thu thập được 1 thông tin liên hệ của khách hàng tiềm năng qua quảng cáo.",
      },
      {
        name: "2. Khách Nét Đi Xem Thực Địa (Qualified Leads - QL)",
        formula: "Khách nét = Số khách hàng đã xác thực OTP và thực tế có mặt tại sảnh xem phòng",
        explanation: "Loại trừ 100% các click ảo, tin rác hoặc khách không có nhu cầu thật.",
      },
      {
        name: "3. Chi phí trên một Khách Nét (Cost per Qualified Lead - CPQL)",
        formula: "CPQL = Tổng ngân sách Ads đã chi / Số lượng Khách nét thực tế đi xem (VNĐ)",
        explanation: "Chỉ số sống còn của bên sàn: tốn bao nhiêu tiền quảng cáo để có 1 khách chịu xách ba lô đi xem nhà.",
        benchmark: "Mức chuẩn: < 350.000 VNĐ / khách nét.",
      },
      {
        name: "4. Tỷ suất sinh lời ROI chiến dịch (Return on Investment)",
        formula: "ROI (%) = [(Doanh thu hoa hồng mang về – Ngân sách Ads chi) / Ngân sách Ads chi] × 100%",
        explanation: "Tỷ suất lợi nhuận ròng của từng đồng ngân sách marketing chi ra.",
        benchmark: "Mức chuẩn sàn BĐS cho thuê: ROI ≥ 150% (thu về ít nhất gấp 2.5 lần chi phí chạy Ads).",
      },
    ],
    actions: [
      "Dồn ngân sách vào các kênh có CPQL thấp và ROI cao (ví dụ: Zalo ZNS Re-engagement, FB Video Tour).",
      "Tối ưu lại nội dung và tệp đối tượng cho các kênh có CPL rẻ nhưng CPQL cao (nhiều lead ảo không đi xem).",
      "Gắn chuẩn mã utm_source cho từng chiến dịch để đảm bảo dữ liệu đối soát chính xác 100%.",
    ],
  },
  raw: {
    title: "Dữ Liệu Thô Đối Soát Dòng Tiền & Hợp Đồng",
    badge: "Financial Audit & Raw Logs",
    whatIsIt:
      "Sổ nhật ký giao dịch tài chính chi tiết của từng hợp đồng thuê và ca cọc giữ chỗ. Cung cấp dữ liệu nguồn để bộ phận Kế toán - Tài chính đối soát dòng tiền VietQR, phân bổ thù lao dẫn khách cho Host và kết xuất file Excel/CSV.",
    formulas: [
      {
        name: "1. Doanh số tiền thuê hàng tháng (Gross Rental Value - GRV)",
        formula: "GRV = Tổng giá trị tiền thuê hàng tháng theo hợp đồng được ký",
        explanation: "Giá trị hợp đồng thực tế mang lại cho chủ nhà.",
      },
      {
        name: "2. Hoa hồng sàn thu về (Net Revenue)",
        formula: "Net Revenue = 30% – 50% tiền thuê tháng đầu tiên (theo HĐ Ký gửi Độc quyền)",
        explanation: "Khoản doanh thu dịch vụ thực nhận của nền tảng VinStay AI.",
      },
      {
        name: "3. Phân bổ hoa hồng cho Field Host (Commission Payout)",
        formula: "Thù lao Host = (Số lượt dẫn × 50.000đ) + (40% × Hoa hồng sàn từ Deal) + Thưởng nóng",
        explanation: "Chính sách biến phí minh bạch chi trả cho Field Host theo kết quả thực tế.",
      },
      {
        name: "4. Nguyên tắc Cọc giữ chỗ 2.000.000đ qua VietQR",
        formula: "Cọc VietQR = Chuyển đổi 100% thành Tiền Cọc Bảo Đảm Tài Sản (Security Deposit)",
        explanation: "Khoản cọc giữ chỗ 2 triệu khóa căn 48h, khi ký hợp đồng sẽ giữ nguyên suốt kỳ hạn thuê, TUYỆT ĐỐI không khấu trừ vào tiền thuê tháng đầu để bảo vệ quyền lợi chủ nhà.",
      },
    ],
    actions: [
      "Bấm nút 'Xuất Excel (.CSV)' để tải file đầy đủ 14 trường đối soát về đối chiếu với sao kê ngân hàng.",
      "Đối soát dứt điểm hóa đơn tiền điện EVN, nước, phí xe và biên bản kiểm định 10 hạng mục trước khi thanh lý.",
    ],
  },
};

export function AdminReports() {
  const state = useMock();

  // Bộ lọc đa chiều
  const [timeRange, setTimeRange] = useState<TimeRangeKey>("month");
  const [agentId, setAgentId] = useState<string>("all");
  const [teamId, setTeamId] = useState<string>("all");
  const [clientType, setClientType] = useState<ClientType>("all");
  const [activeTab, setActiveTab] = useState<"kpi" | "prospects" | "campaign" | "raw">("kpi");
  const [explaining, setExplaining] = useState<ReportType | null>(null);

  const filter: ReportFilter = useMemo(
    () => ({
      timeRange,
      agentId,
      teamId,
      clientType,
    }),
    [timeRange, agentId, teamId, clientType]
  );

  const report = useMemo(() => computeReportSummary(filter, state), [filter, state]);

  const handleExportCsv = () => {
    exportReportToCsv(report.exportRows, `VinStay_Bao_Cao_${timeRange}_${new Date().toISOString().slice(0, 10)}.csv`);
    toast("Đã xuất file báo cáo Excel (.CSV UTF-8) thành công!", "success");
  };

  const handlePrint = () => {
    window.print();
  };

  return (
    <div className={styles.page}>
      <PageHeader
        title="Báo cáo & Phân tích Đa chiều"
        description="Trích xuất dữ liệu tài chính, đánh giá KPI & năng suất Sale, AI Lead Scoring và hiệu quả chiến dịch tiếp thị."
        actions={
          <div style={{ display: "flex", gap: "8px", flexWrap: "wrap" }}>
            <button
              type="button"
              className="btn btn-secondary"
              onClick={handlePrint}
              style={{ display: "inline-flex", alignItems: "center", gap: 6 }}
            >
              <Printer size={15} /> In / Xuất PDF
            </button>
            <button
              type="button"
              className="btn btn-primary"
              onClick={handleExportCsv}
              style={{ display: "inline-flex", alignItems: "center", gap: 6 }}
            >
              <Download size={15} /> Xuất Excel (.CSV)
            </button>
          </div>
        }
      />

      {/* ─── 1. BỘ LỌC ĐA CHIỀU (MULTI-DIMENSIONAL FILTERING) ───────────────────────── */}
      <section className="card" style={{ padding: "16px 20px" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 12 }}>
          <Filter size={18} className="text-brand" />
          <h3 style={{ margin: 0, fontSize: 16 }}>Bộ lọc dữ liệu đa chiều (Multi-dimensional Filters)</h3>
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))", gap: 12 }}>
          {/* Lọc theo Thời gian */}
          <div>
            <label className="muted xs" style={{ display: "block", marginBottom: 4 }}>
              1. Khung thời gian (Time Range)
            </label>
            <select
              className="select"
              style={{ width: "100%" }}
              value={timeRange}
              onChange={(e) => setTimeRange(e.target.value as TimeRangeKey)}
            >
              <option value="today">Hôm nay</option>
              <option value="week">7 ngày qua</option>
              <option value="month">Tháng này (Tháng 10/2026)</option>
              <option value="quarter">Quý này (Q4/2026)</option>
              <option value="custom">Khoảng ngày tùy chọn...</option>
            </select>
          </div>

          {/* Lọc theo Đội nhóm */}
          <div>
            <label className="muted xs" style={{ display: "block", marginBottom: 4 }}>
              2. Đội nhóm / Phân khu
            </label>
            <select
              className="select"
              style={{ width: "100%" }}
              value={teamId}
              onChange={(e) => setTeamId(e.target.value)}
            >
              {TEAMS.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.name}
                </option>
              ))}
            </select>
          </div>

          {/* Lọc theo Cá nhân Sale */}
          <div>
            <label className="muted xs" style={{ display: "block", marginBottom: 4 }}>
              3. Sale phụ trách (Agent Dimension)
            </label>
            <select
              className="select"
              style={{ width: "100%" }}
              value={agentId}
              onChange={(e) => setAgentId(e.target.value)}
            >
              <option value="all">Tất cả nhân sự Sale</option>
              {HOSTS.map((h) => (
                <option key={h.id} value={h.id}>
                  {h.name} ({h.id})
                </option>
              ))}
            </select>
          </div>

          {/* Lọc theo Khách hàng */}
          <div>
            <label className="muted xs" style={{ display: "block", marginBottom: 4 }}>
              4. Phân loại khách hàng (Client Dimension)
            </label>
            <select
              className="select"
              style={{ width: "100%" }}
              value={clientType}
              onChange={(e) => setClientType(e.target.value as ClientType)}
            >
              <option value="all">Tất cả phân loại khách</option>
              <option value="new">Khách thuê mới (New Tenant)</option>
              <option value="renewal">Khách tái ký (Renewed)</option>
              <option value="corporate">Khách Doanh nghiệp / Chuyên gia</option>
            </select>
          </div>
        </div>
      </section>

      {/* ─── TỔNG HỢP CHỈ SỐ TÀI CHÍNH ĐỐI SOÁT DÒNG TIỀN ─────────────────────────── */}
      <div className={styles.kpis}>
        <StatTile
          label="Tổng Doanh Số Tiền Thuê (GRV)"
          value={vnd(report.financials.totalGrossRentalValue) + "đ"}
          delta={{ text: `${report.financials.totalDeals} HĐ đã ký`, tone: "good", dir: "up" }}
          hero
        />
        <StatTile
          label="Hoa Hồng Sàn Thu Về (Net Revenue)"
          value={vndShort(report.financials.totalNetRevenue)}
          delta={{ text: `Host: ${vndShort(report.financials.totalAgentCommission)}`, tone: "good", dir: "up" }}
        />
        <StatTile
          label="Lượt Dẫn Xem & Tỷ Lệ Chốt"
          value={`${report.financials.totalShowings} lượt`}
          delta={{ text: `Win rate: ${report.financials.avgWinRate}%`, tone: "good", dir: "up" }}
        />
        <StatTile
          label="ROI Chiến Dịch Tiếp Thị"
          value={`+${report.financials.marketingRoi}%`}
          delta={{ text: `Ads: ${vndShort(report.financials.totalAdSpend)}`, tone: "good", dir: "up" }}
        />
      </div>

      {/* ─── TABS ĐIỀU HƯỚNG BÁO CÁO CHI TIẾT ─────────────────────────────────────── */}
      <div className={styles.tabs} role="tablist">
        <button
          type="button"
          role="tab"
          aria-selected={activeTab === "kpi"}
          onClick={() => setActiveTab("kpi")}
          style={{ display: "inline-flex", alignItems: "center", gap: 6 }}
        >
          <Award size={15} /> 2. KPI & Năng Suất Sale ({report.agents.length})
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={activeTab === "prospects"}
          onClick={() => setActiveTab("prospects")}
          style={{ display: "inline-flex", alignItems: "center", gap: 6 }}
        >
          <Flame size={15} /> 3. Top Khách Hàng Tiềm Năng (AI Scoring) ({report.prospects.length})
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={activeTab === "campaign"}
          onClick={() => setActiveTab("campaign")}
          style={{ display: "inline-flex", alignItems: "center", gap: 6 }}
        >
          <Megaphone size={15} /> 4. Hiệu Quả Chiến Dịch Ads (ROI) ({report.campaigns.length})
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={activeTab === "raw"}
          onClick={() => setActiveTab("raw")}
          style={{ display: "inline-flex", alignItems: "center", gap: 6 }}
        >
          <ArrowDownToLine size={15} /> Dữ Liệu Đối Soát Chi Tiết ({report.exportRows.length})
        </button>
      </div>

      {/* ─── PHẦN 2: KPI, THỜI GIAN & NĂNG SUẤT CỦA SALE ──────────────────────────── */}
      {activeTab === "kpi" && (
        <Section
          title="Bảng KPI & Đánh Giá Năng Suất Nhân Sự Sale"
          description="Đo lường chỉ tiêu giao vs thực tế, tốc độ phản hồi (SLA < 15p), chu kỳ chốt hợp đồng và tỷ lệ chuyển đổi phễu."
          actions={
            <button
              type="button"
              className="btn btn-secondary btn-sm"
              onClick={() => setExplaining("kpi")}
              style={{ display: "inline-flex", alignItems: "center", gap: 6 }}
            >
              <HelpCircle size={14} className="text-brand" /> Giải thích & Công thức
            </button>
          }
        >
          <DataTable<AgentKpiMetric>
            columns={[
              {
                key: "agent",
                header: "Nhân Sự Sale",
                render: (a) => (
                  <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                    <div
                      style={{
                        width: 34,
                        height: 34,
                        borderRadius: "50%",
                        backgroundColor: "var(--brand-soft)",
                        color: "var(--brand)",
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                        fontWeight: 700,
                        fontSize: 13,
                      }}
                    >
                      {a.avatar}
                    </div>
                    <div>
                      <b>{a.name}</b>
                      <span className="muted xs" style={{ display: "block" }}>
                        {a.team} · SĐT: {a.phone}
                      </span>
                    </div>
                  </div>
                ),
              },
              {
                key: "speed_sla",
                header: "1. Nhanh Nhận Ticket (SLA < 3p)",
                render: (a) => {
                  const isFast = a.ticketAcceptSec <= 60;
                  return (
                    <div>
                      <span
                        className={`badge ${isFast ? "badge-emerald-soft" : "badge-plain"}`}
                        style={{ display: "inline-flex", alignItems: "center", gap: 4, fontWeight: 700 }}
                      >
                        <Clock size={11} /> {a.ticketAcceptSec} giây
                      </span>
                      <span className="muted xs" style={{ display: "block", marginTop: 2 }}>
                        {a.slaBreachCount > 0 ? (
                          <span className="text-danger">⚠️ {a.slaBreachCount} ca trễ SLA</span>
                        ) : (
                          <span className="text-ok">✓ 0 trôi ca</span>
                        )}
                      </span>
                    </div>
                  );
                },
              },
              {
                key: "rating",
                header: "2. Mức Đánh Giá Từ Khách",
                render: (a) => (
                  <div>
                    <span style={{ fontWeight: 700, fontSize: 14 }}>
                      ⭐ {a.rating}/5
                    </span>
                    <span className="muted xs" style={{ display: "block", marginTop: 2 }}>
                      ({a.totalReviews} lượt đánh giá)
                    </span>
                  </div>
                ),
              },
              {
                key: "deals_revenue",
                header: "3. Căn Chốt Được & Doanh Số",
                render: (a) => (
                  <div>
                    <b style={{ color: "var(--brand)", fontSize: 14 }}>
                      {a.dealsActual} căn chốt
                    </b>
                    <span className="muted xs" style={{ display: "block", marginTop: 2 }}>
                      GRV: {vndShort(a.grvActual)} · Hoa hồng: {vndShort(a.netRevenue)}
                    </span>
                  </div>
                ),
              },
              {
                key: "tours_winrate",
                header: "Lượt Dẫn & Win Rate",
                render: (a) => (
                  <div>
                    <span>
                      <b>{a.toursActual}</b>/{a.toursTarget} lượt xem
                    </span>
                    <span className="muted xs" style={{ display: "block", marginTop: 2 }}>
                      Win rate: <b>{a.tourToDealRate}%</b>
                    </span>
                  </div>
                ),
              },
              {
                key: "kpi_completion",
                header: "4. Tỷ Lệ Hoàn Thành KPI",
                render: (a) => {
                  const isExcellent = a.kpiCompletionRate >= 100;
                  return (
                    <div>
                      <span
                        className={`badge ${isExcellent ? "badge-emerald-soft" : "badge-amber-soft"}`}
                        style={{ fontWeight: 700, fontSize: 13 }}
                      >
                        {a.kpiCompletionRate}% KPI
                      </span>
                      <div
                        style={{
                          width: 80,
                          height: 5,
                          backgroundColor: "var(--line)",
                          borderRadius: 3,
                          marginTop: 4,
                          overflow: "hidden",
                        }}
                      >
                        <div
                          style={{
                            width: `${Math.min(100, a.kpiCompletionRate)}%`,
                            height: "100%",
                            backgroundColor: isExcellent ? "var(--emerald)" : "var(--amber)",
                          }}
                        />
                      </div>
                    </div>
                  );
                },
              },
            ]}
            rows={report.agents}
            empty={<div className="muted p-4">Không có nhân sự nào khớp bộ lọc.</div>}
          />
        </Section>
      )}

      {/* ─── PHẦN 3: TOP KHÁCH HÀNG TIỀM NĂNG (AI LEAD SCORING) ───────────────────── */}
      {activeTab === "prospects" && (
        <Section
          title="Top Khách Hàng Tiềm Năng (AI Lead Scoring Engine)"
          description="Thuật toán AI tự động xếp hạng dựa trên: Ngân sách khớp rổ hàng (35đ), Nhu cầu vào ở gấp 3–7 ngày (40đ), Mức độ tương tác nhanh (25đ)."
          actions={
            <button
              type="button"
              className="btn btn-secondary btn-sm"
              onClick={() => setExplaining("prospects")}
              style={{ display: "inline-flex", alignItems: "center", gap: 6 }}
            >
              <HelpCircle size={14} className="text-brand" /> Giải thích & Công thức
            </button>
          }
        >
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(360px, 1fr))", gap: 16 }}>
            {report.prospects.map((p, idx) => {
              const isSuperHot = p.urgencyLevel === "super_hot";
              const isHot = p.urgencyLevel === "hot";
              return (
                <div
                  key={p.id}
                  className="card"
                  style={{
                    padding: 18,
                    borderLeft: `4px solid ${isSuperHot ? "var(--coral, #e11d48)" : isHot ? "var(--amber, #f59e0b)" : "var(--brand)"}`,
                    display: "flex",
                    flexDirection: "column",
                    gap: 12,
                  }}
                >
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 8 }}>
                    <div>
                      <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                        <span
                          style={{
                            display: "inline-flex",
                            alignItems: "center",
                            justifyContent: "center",
                            width: 24,
                            height: 24,
                            borderRadius: "50%",
                            backgroundColor: "var(--brand-soft)",
                            color: "var(--brand)",
                            fontSize: 12,
                            fontWeight: 700,
                          }}
                        >
                          #{idx + 1}
                        </span>
                        <b style={{ fontSize: 16 }}>{p.name}</b>
                        <span className="muted xs">({p.phoneMasked})</span>
                      </div>
                      <span className="muted xs" style={{ display: "block", marginTop: 2 }}>
                        {p.clientType === "corporate"
                          ? "🏢 Khách Doanh Nghiệp"
                          : p.clientType === "renewal"
                          ? "🔄 Khách Tái Ký Hợp Đồng"
                          : "👤 Khách Thuê Mới"}
                      </span>
                    </div>

                    <div style={{ textAlign: "right" }}>
                      <span
                        className={`badge ${isSuperHot ? "badge-coral-soft" : isHot ? "badge-amber-soft" : "badge-emerald-soft"}`}
                        style={{ fontWeight: 700, fontSize: 13, display: "inline-flex", alignItems: "center", gap: 4 }}
                      >
                        {isSuperHot ? "🔥" : isHot ? "⚡" : "✨"} {p.score} điểm AI
                      </span>
                      <span className="muted xs" style={{ display: "block", marginTop: 2 }}>
                        Vào ở trong <b>{p.urgencyDays} ngày</b>
                      </span>
                    </div>
                  </div>

                  <div
                    style={{
                      display: "grid",
                      gridTemplateColumns: "1fr 1fr",
                      gap: 8,
                      backgroundColor: "var(--bg-muted, #f8fafc)",
                      padding: 10,
                      borderRadius: 8,
                      fontSize: 13,
                    }}
                  >
                    <div>
                      <span className="muted xs">Ngân sách All-in:</span>
                      <div>
                        <b>{vnd(p.budgetMonthly)}đ/tháng</b>
                      </div>
                    </div>
                    <div>
                      <span className="muted xs">Layout mong muốn:</span>
                      <div>
                        <b>{p.preferredLayout}</b>
                      </div>
                    </div>
                    <div>
                      <span className="muted xs">Căn gợi ý khớp ngay:</span>
                      <div>
                        <span className="badge badge-plain">{p.matchedUnitCode}</span>
                      </div>
                    </div>
                    <div>
                      <span className="muted xs">Sale chăm sóc:</span>
                      <div>
                        <b>{p.assignedHostName}</b>
                      </div>
                    </div>
                  </div>

                  <div style={{ fontSize: 13, color: "var(--ink-secondary, #475569)" }}>
                    <p style={{ margin: 0, fontStyle: "italic" }}>🤖 AI Insight: {p.aiNotes}</p>
                  </div>

                  <div style={{ display: "flex", gap: 8, marginTop: "auto", paddingTop: 8 }}>
                    <button
                      type="button"
                      className="btn btn-secondary btn-sm"
                      style={{ flex: 1 }}
                      onClick={() => toast(`Đã chuyển thông tin ${p.name} cho ${p.assignedHostName}`, "success")}
                    >
                      <UserCheck size={13} style={{ marginRight: 4 }} /> Gán Top Sale
                    </button>
                    <button
                      type="button"
                      className="btn btn-primary btn-sm"
                      style={{ flex: 1 }}
                      onClick={() => toast(`Đã gửi Zalo ZNS mời ${p.name} xem căn ${p.matchedUnitCode}`, "success")}
                    >
                      <Zap size={13} style={{ marginRight: 4 }} /> Bắn Zalo 1-Chạm
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        </Section>
      )}

      {/* ─── PHẦN 4: REPORT THEO CAMPAIGN (BÁO CÁO CHIẾN DỊCH TIẾP THỊ) ─────────── */}
      {activeTab === "campaign" && (
        <Section
          title="Báo Cáo Hiệu Quả Chiến Dịch Tiếp Thị (Campaign ROI & CPQL)"
          description="Đo lường chi phí trên một khách nét chịu đi xem thực địa (CPQL) và tỷ suất hoàn vốn hoa hồng (ROI) theo từng kênh quảng cáo."
          actions={
            <button
              type="button"
              className="btn btn-secondary btn-sm"
              onClick={() => setExplaining("campaign")}
              style={{ display: "inline-flex", alignItems: "center", gap: 6 }}
            >
              <HelpCircle size={14} className="text-brand" /> Giải thích & Công thức
            </button>
          }
        >
          <DataTable<CampaignReportRow>
            columns={[
              {
                key: "campaign",
                header: "Chiến Dịch & Phân Khu",
                render: (c) => (
                  <div>
                    <b>{c.name}</b>
                    <span className="muted xs" style={{ display: "block" }}>
                      Kênh: {c.channel} · Phân khu: {c.zone}
                    </span>
                    <span className="muted xs font-mono" style={{ display: "block", color: "var(--brand)" }}>
                      utm_source={c.utmSource}
                    </span>
                  </div>
                ),
              },
              {
                key: "spend",
                header: "Ngân Sách Chi (Ad Spend)",
                render: (c) => <b>{vnd(c.adSpend)}đ</b>,
              },
              {
                key: "leads",
                header: "Lead & Khách Nét Đi Xem",
                render: (c) => (
                  <div>
                    <span>{c.totalLeads} Leads</span>
                    <span className="muted xs" style={{ display: "block" }}>
                      <b>{c.qualifiedLeads} khách nét</b> ({Math.round((c.qualifiedLeads / c.totalLeads) * 100)}%)
                    </span>
                  </div>
                ),
              },
              {
                key: "cpql",
                header: "Chi Phí / Khách Nét (CPQL)",
                render: (c) => (
                  <div>
                    <span className="badge badge-plain" style={{ fontWeight: 600 }}>
                      {vnd(c.costPerQualifiedLead)}đ
                    </span>
                    <span className="muted xs" style={{ display: "block", marginTop: 2 }}>
                      CPL: {vnd(c.costPerLead)}đ
                    </span>
                  </div>
                ),
              },
              {
                key: "results",
                header: "Deals & Doanh Thu Thu Về",
                render: (c) => (
                  <div>
                    <b style={{ color: "var(--brand)" }}>{vndShort(c.netRevenue)}</b>
                    <span className="muted xs" style={{ display: "block" }}>
                      {c.dealsClosed} deals chốt · GRV: {vndShort(c.grossRentalValue)}
                    </span>
                  </div>
                ),
              },
              {
                key: "roi",
                header: "Tỷ Lệ ROI Chiến Dịch",
                render: (c) => (
                  <div>
                    <span
                      className="badge badge-emerald-soft"
                      style={{ fontWeight: 700, fontSize: 13, color: "var(--emerald)" }}
                    >
                      +{c.roiPercent}%
                    </span>
                    <span className="muted xs" style={{ display: "block", marginTop: 2 }}>
                      Lợi nhuận ròng: {vndShort(c.netRevenue - c.adSpend)}
                    </span>
                  </div>
                ),
              },
            ]}
            rows={report.campaigns}
            empty={<div className="muted p-4">Chưa có chiến dịch nào được cấu hình.</div>}
          />
        </Section>
      )}

      {/* ─── TAB DỮ LIỆU ĐỐI SOÁT CHI TIẾT (RAW DEALS EXPORT TABLE) ───────────────── */}
      {activeTab === "raw" && (
        <Section
          title="Dữ Liệu Thô Đối Soát Dòng Tiền & Hợp Đồng"
          description="Danh sách các giao dịch được lọc theo thời gian, nhân sự Sale và phân loại khách hàng để xuất Excel/CSV."
          actions={
            <button
              type="button"
              className="btn btn-secondary btn-sm"
              onClick={() => setExplaining("raw")}
              style={{ display: "inline-flex", alignItems: "center", gap: 6 }}
            >
              <HelpCircle size={14} className="text-brand" /> Giải thích & Quy tắc
            </button>
          }
        >
          <DataTable<RawExportRow>
            columns={[
              {
                key: "deal",
                header: "Mã Giao Dịch",
                render: (r) => (
                  <div>
                    <b>{r.dealCode}</b>
                    <span className="muted xs" style={{ display: "block" }}>
                      {r.createdAt}
                    </span>
                  </div>
                ),
              },
              {
                key: "client",
                header: "Khách Hàng",
                render: (r) => (
                  <div>
                    <b>{r.clientName}</b>
                    <span className="muted xs" style={{ display: "block" }}>
                      {r.clientPhone} · {r.clientType}
                    </span>
                  </div>
                ),
              },
              {
                key: "agent",
                header: "Sale & Đội Nhóm",
                render: (r) => (
                  <div>
                    <b>{r.agentName}</b>
                    <span className="muted xs" style={{ display: "block" }}>
                      {r.team}
                    </span>
                  </div>
                ),
              },
              {
                key: "unit",
                header: "Căn Hộ & Tiền Thuê",
                render: (r) => (
                  <div>
                    <b>{r.unitAddress}</b>
                    <span className="muted xs" style={{ display: "block" }}>
                      {vnd(r.monthlyRent)}đ/tháng · {r.layout}
                    </span>
                  </div>
                ),
              },
              {
                key: "commission",
                header: "Hoa Hồng Sàn",
                render: (r) => <b style={{ color: "var(--brand)" }}>{vnd(r.netRevenue)}đ</b>,
              },
              {
                key: "channel",
                header: "Kênh Nguồn",
                render: (r) => <span className="badge badge-plain">{r.channel}</span>,
              },
              {
                key: "status",
                header: "Trạng Thái",
                render: (r) => <span className="badge badge-emerald-soft">{r.status}</span>,
              },
            ]}
            rows={report.exportRows}
            empty={<div className="muted p-4">Không có giao dịch nào khớp với bộ lọc.</div>}
          />
        </Section>
      )}

      {/* ─── MODAL GIẢI THÍCH CHI TIẾT BÁO CÁO & CÔNG THỨC ĐÁNH GIÁ ───────────────── */}
      {explaining && (
        <Modal
          open={Boolean(explaining)}
          onClose={() => setExplaining(null)}
          title={EXPLANATIONS[explaining].title}
          variant="wide"
          footer={
            <button type="button" className="btn btn-primary" onClick={() => setExplaining(null)}>
              Đã hiểu & Đóng
            </button>
          }
        >
          <div style={{ display: "flex", flexDirection: "column", gap: 18, maxHeight: "75vh", overflowY: "auto", paddingRight: 4 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <span className="badge badge-plain font-mono" style={{ fontSize: 12 }}>
                {EXPLANATIONS[explaining].badge}
              </span>
            </div>

            {/* 1. Báo cáo này là gì? */}
            <div className="card" style={{ padding: 16, backgroundColor: "var(--bg-muted, #f8fafc)", borderLeft: "4px solid var(--brand)" }}>
              <h4 style={{ margin: "0 0 6px 0", fontSize: 15, display: "flex", alignItems: "center", gap: 6, color: "var(--brand)" }}>
                <Info size={16} /> 1. Báo cáo này là gì?
              </h4>
              <p style={{ margin: 0, fontSize: 14, lineHeight: 1.5, color: "var(--ink-secondary, #334155)" }}>
                {EXPLANATIONS[explaining].whatIsIt}
              </p>
            </div>

            {/* 2. Dựa vào công thức đánh giá nào? */}
            <div>
              <h4 style={{ margin: "0 0 10px 0", fontSize: 15, display: "flex", alignItems: "center", gap: 6, color: "var(--ink)" }}>
                <BookOpen size={16} className="text-brand" /> 2. Dựa vào các công thức đánh giá nào?
              </h4>
              <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                {EXPLANATIONS[explaining].formulas.map((f, i) => (
                  <div key={i} className="card" style={{ padding: 12, backgroundColor: "var(--surface)" }}>
                    <b style={{ fontSize: 14, display: "block", marginBottom: 6 }}>{f.name}</b>
                    <div
                      style={{
                        padding: "8px 12px",
                        backgroundColor: "var(--bg-muted, #f1f5f9)",
                        borderRadius: 6,
                        fontFamily: "monospace",
                        fontSize: 13,
                        fontWeight: 600,
                        color: "var(--brand)",
                        marginBottom: 6,
                        border: "1px dashed var(--line)",
                      }}
                    >
                      {f.formula}
                    </div>
                    <p style={{ margin: "0 0 4px 0", fontSize: 13, color: "var(--ink-secondary, #475569)" }}>
                      {f.explanation}
                    </p>
                    {f.benchmark && (
                      <span className="badge badge-emerald-soft" style={{ fontSize: 11, marginTop: 4 }}>
                        {f.benchmark}
                      </span>
                    )}
                  </div>
                ))}
              </div>
            </div>

            {/* 3. Hướng dẫn hành động dành cho Admin / Operations Lead */}
            <div className="card" style={{ padding: 14, borderLeft: "4px solid var(--emerald)", backgroundColor: "var(--surface)" }}>
              <h4 style={{ margin: "0 0 8px 0", fontSize: 15, display: "flex", alignItems: "center", gap: 6, color: "var(--emerald)" }}>
                <Sparkles size={16} /> 3. Hướng dẫn hành động dành cho Operations Lead
              </h4>
              <ul style={{ margin: 0, paddingLeft: 20, fontSize: 13, display: "flex", flexDirection: "column", gap: 6, color: "var(--ink-secondary, #334155)" }}>
                {EXPLANATIONS[explaining].actions.map((act, i) => (
                  <li key={i}>{act}</li>
                ))}
              </ul>
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
}

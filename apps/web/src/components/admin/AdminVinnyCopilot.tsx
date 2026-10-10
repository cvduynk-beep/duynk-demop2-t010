"use client";

import { useEffect, useRef, useState } from "react";
import { usePathname } from "next/navigation";
import {
  AlertTriangle,
  ArrowRight,
  Bot,
  Check,
  ChevronDown,
  Copy,
  ExternalLink,
  RotateCcw,
  Send,
  Sparkles,
  TrendingUp,
  X,
} from "lucide-react";
import { ButlerMascot } from "@/components/mascot/ButlerMascot";
import { useMock } from "@/lib/mock/store";
import { vnd } from "@/lib/mock/format";
import {
  AGENT_KPIS,
  CAMPAIGN_DATA,
  HIGH_VALUE_PROSPECTS,
  RAW_DEALS,
  computeReportSummary,
  type ReportFilter,
} from "@/lib/mock/reports";
import styles from "./AdminVinnyCopilot.module.css";

interface MessageAction {
  label: string;
  actionType: "copy" | "link";
  payload: string;
}

interface MessageItem {
  id: string;
  sender: "bot" | "user";
  text: string;
  timestamp: string;
  actions?: MessageAction[];
}

/**
 * Trợ lý điều hành AI Admin Vinny (AI Operations Copilot)
 * Phân tích dữ liệu, tóm tắt báo cáo, cảnh báo SLA, và soạn thảo tin nhắn điều hành.
 */
export function AdminVinnyCopilot() {
  const pathname = usePathname();
  const state = useMock();
  const [isOpen, setIsOpen] = useState(false);
  const [showTeaser, setShowTeaser] = useState(true);
  const [copiedPayload, setCopiedPayload] = useState<string | null>(null);
  const [input, setInput] = useState("");
  const [isThinking, setIsThinking] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  // Xác định tên trang hiện tại để tạo ngữ cảnh
  const getPageInfo = () => {
    const path = pathname || "";
    if (path.includes("/admin/reports")) {
      return { title: "Báo cáo & KPI", tag: "reports" };
    }
    if (path.includes("/admin/inventory")) {
      return { title: "Căn hộ & Ký gửi", tag: "inventory" };
    }
    if (path.includes("/admin/bookings")) {
      return { title: "Điều phối lịch xem", tag: "bookings" };
    }
    if (path.includes("/admin/hosts")) {
      return { title: "Quản trị Field Host", tag: "hosts" };
    }
    if (path.includes("/admin/commission")) {
      return { title: "Biến phí & Thù lao", tag: "commission" };
    }
    if (path.includes("/admin/contracts")) {
      return { title: "Hợp đồng & Cọc", tag: "contracts" };
    }
    return { title: "Tổng quan Dashboard", tag: "dashboard" };
  };

  const pageInfo = getPageInfo();

  // Tin nhắn mở đầu tùy chỉnh theo ngữ cảnh
  const getInitialMessage = (): MessageItem => {
    return {
      id: "init-msg",
      sender: "bot",
      timestamp: "Vừa xong",
      text: `Chào Quản trị viên! Tôi là **Vinny Copilot** — Trợ lý điều hành vận hành tại Vinhomes Ocean Park.\n\nTôi đang theo dõi trực tiếp dữ liệu tại trang **${pageInfo.title}**. Bạn cần tôi tóm tắt số liệu kinh doanh, phát hiện rủi ro SLA hay tìm kiếm thông tin nào?`,
      actions: [
        {
          label: "📊 Tóm tắt báo cáo nhanh",
          actionType: "copy",
          payload: "tóm tắt báo cáo",
        },
      ],
    };
  };

  const [messages, setMessages] = useState<MessageItem[]>([getInitialMessage()]);

  // Cuộn xuống tin nhắn mới nhất
  useEffect(() => {
    if (isOpen) {
      messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
    }
  }, [messages, isThinking, isOpen]);

  // Bộ gợi ý câu hỏi nhanh (Prompt Chips)
  const getQuickChips = () => {
    if (pageInfo.tag === "reports") {
      return [
        "📊 Tóm tắt hiệu quả tuần",
        "⚡ Top 3 khách nét nhất",
        "⚠️ Sale nào vi phạm SLA?",
        "📈 Kênh quảng cáo ROI cao nhất?",
        "📝 Soạn tin Zalo đôn đốc Sale",
      ];
    }
    if (pageInfo.tag === "inventory") {
      return [
        "🏠 Căn hộ trống > 15 ngày",
        "💡 Căn bật Giá Sàn Ủy Quyền",
        "📑 Ký gửi chờ duyệt",
      ];
    }
    if (pageInfo.tag === "bookings") {
      return [
        "🧭 Ca xem cần nhận ngay",
        "🚨 Cảnh báo ca xem quá hạn SLA",
        "🔑 Mã cửa cấp tự động",
      ];
    }
    return [
      "📊 Tóm tắt báo cáo tuần",
      "⚡ Top 3 khách tiềm năng",
      "⚠️ Cảnh báo bất thường SLA",
      "🏆 Ai là Sale xuất sắc nhất?",
    ];
  };

  // ─── BỘ MÁY PHÂN TÍCH NGỮ NGHĨA TỰ NHIÊN (SEMANTIC NLP REASONING ENGINE) ───
  const generateBotReply = (query: string): { text: string; actions?: MessageAction[] } => {
    const q = query.toLowerCase().trim();
    const summary = computeReportSummary(
      { timeRange: "week", agentId: "all", teamId: "all", clientType: "all" },
      state
    );
    const topKpiAgent = [...AGENT_KPIS].sort((a, b) => b.kpiCompletionRate - a.kpiCompletionRate)[0];
    const topGrvAgent = [...AGENT_KPIS].sort((a, b) => b.grvActual - a.grvActual)[0];
    const avgKpiRate = Math.round(
      AGENT_KPIS.reduce((s, a) => s + a.kpiCompletionRate, 0) / AGENT_KPIS.length
    );
    const avgSla = Math.round(
      AGENT_KPIS.reduce((s, a) => s + a.ticketAcceptSec, 0) / AGENT_KPIS.length
    );

    // Tập từ khóa ngữ nghĩa tiếng Việt đa dạng
    const AGENT_TERMS = [
      "sale", "nhân viên", "nhân sự", "host", "field host", "môi giới",
      "chuyên viên", "ai là", "ai đang", "ai bán", "ai chốt", "ai làm", "người nào", "bạn nào"
    ];
    const RANKING_TERMS = [
      "hiệu suất", "năng suất", "tốt nhất", "cao nhất", "xuất sắc",
      "giỏi nhất", "top", "kpi", "chỉ tiêu", "chốt nhiều", "doanh số",
      "doanh thu", "thành tích", "bán tốt", "làm tốt", "xếp hạng",
      "thứ hạng", "đứng đầu", "vượt chỉ tiêu", "dẫn đầu", "nhiều deal"
    ];
    const SLA_TERMS = [
      "sla", "vi phạm", "trễ", "chậm", "cảnh báo", "lười", "không nhận",
      "quá giờ", "bỏ ca", "no show", "no-show", "phạt", "bất thường", "sự cố", "chậm nhất"
    ];
    const PROSPECT_TERMS = [
      "tiềm năng", "lead", "khách nét", "khách nóng", "vào ở gấp", "chờ cọc",
      "ai score", "điểm ai", "tìm phòng", "cần thuê", "đang tìm", "phễu lead", "phễu khách"
    ];
    const CAMPAIGN_TERMS = [
      "chiến dịch", "campaign", "quảng cáo", "marketing", "roi", "cpql",
      "cpl", "ngân sách", "facebook", "fb", "google", "gg", "tiktok", "kênh nào", "chi phí ads"
    ];
    const INVENTORY_TERMS = [
      "căn hộ", "căn trống", "giỏ hàng", "ký gửi", "giá sàn", "thẩm định",
      "bàn giao", "hộ chiếu", "duyệt căn", "căn nào trống"
    ];
    const SUMMARY_TERMS = [
      "tóm tắt", "báo cáo", "tổng quan", "tổng kết", "tình hình kinh doanh",
      "toàn sàn", "toàn đội", "tuần này thế nào", "tháng này thế nào", "kết quả"
    ];

    const hasAgent = AGENT_TERMS.some((w) => q.includes(w));
    const hasRanking = RANKING_TERMS.some((w) => q.includes(w));
    const hasSla = SLA_TERMS.some((w) => q.includes(w));
    const hasProspect = PROSPECT_TERMS.some((w) => q.includes(w));
    const hasCampaign = CAMPAIGN_TERMS.some((w) => q.includes(w));
    const hasInventory = INVENTORY_TERMS.some((w) => q.includes(w));
    const hasSummary = SUMMARY_TERMS.some((w) => q.includes(w));

    // ── 1. ĐÁNH GIÁ HIỆU SUẤT / XẾP HẠNG SALE (AGENT RANKING) ──
    if ((hasAgent && hasRanking) || q.includes("top sale") || q.includes("xếp hạng sale")) {
      return {
        text: `Dạ báo cáo anh: Top 1 KPI hiện là **Đỗ Thu Uyên** (141% KPI, chốt ${topKpiAgent.dealsActual} deals, nhận ticket ${topKpiAgent.ticketAcceptSec}s); Top 1 doanh số GRV là **Lê Quốc Bảo** (${vnd(topGrvAgent.grvActual)}đ, 135% KPI). Toàn đội duy trì tốc độ nhận ticket trung bình ${avgSla}s rất tốt anh nhé.`,
        actions: [
          {
            label: "📊 Xem Chi Tiết Bảng KPI Sale",
            actionType: "link",
            payload: "/admin/reports",
          },
        ],
      };
    }

    // ── 2. TÌNH HÌNH CHỐT HỢP ĐỒNG / DEAL HÔM NAY / KẾT QUẢ ĐÃ CHỐT ──
    const isClosedDealQuery =
      q.includes("chốt được") ||
      q.includes("đã chốt") ||
      q.includes("chốt khách nào") ||
      q.includes("chốt căn nào") ||
      q.includes("hôm nay chốt") ||
      q.includes("chốt hôm nay") ||
      q.includes("vừa chốt") ||
      q.includes("ký hợp đồng") ||
      q.includes("hợp đồng mới") ||
      (q.includes("hôm nay") && (q.includes("chốt") || q.includes("deal") || q.includes("hợp đồng") || q.includes("khách")));

    if (isClosedDealQuery) {
      return {
        text: `Dạ sáng giờ hôm nay (10/10) hệ thống **chưa ghi nhận hợp đồng mới** ký số thành công anh nhé.\n\nGần nhất hôm qua có 1 deal căn S2.12-1608 (9.000.000đ/tháng) của Sale Lê Quốc Bảo. Hiện có 2 khách nét đang chờ cọc hôm nay là **Trần Minh Quân** (96đ AI) và **Kyocera Tech** (94đ AI).`,
        actions: [
          {
            label: "⚡ Xem 2 Khách Chờ Cọc Hôm Nay",
            actionType: "copy",
            payload: "xem khách tiềm năng chờ cọc hôm nay",
          },
          {
            label: "📊 Đi Tới Bảng Đối Soát Hợp Đồng",
            actionType: "link",
            payload: "/admin/reports",
          },
        ],
      };
    }

    // ── 3. VI PHẠM SLA / CẢNH BÁO RỦI RO ──
    if (hasSla) {
      return {
        text: `Dạ hiện chỉ có Sale **Hoàng Gia Huy** có 3 ca nhận ticket trễ quá SLA 3 phút (trung bình 210s). Các nhân sự còn lại đều đạt chuẩn tiếp nhận nhanh dưới 180s anh nhé.`,
        actions: [
          {
            label: "📋 Copy nhắc nhở gửi Sale",
            actionType: "copy",
            payload: `[Nhắc nhở SLA] Hệ thống ghi nhận bạn có ca nhận ticket quá 180s. Vui lòng bật chuông thông báo app để tiếp đón khách đúng quy chuẩn BQL!`,
          },
        ],
      };
    }

    // ── 4. TOP KHÁCH TIỀM NĂNG / LEAD NÓNG ──
    if (hasProspect) {
      return {
        text: `Dạ top 3 khách nét nhất đang chờ chốt:\n1. **Trần Minh Quân** (96đ AI) - Thuê 2PN S2.12 vào ở gấp trong 3 ngày\n2. **Kyocera Tech** (94đ AI) - Cần 3 căn doanh nghiệp trả trước 6 tháng\n3. **Nguyễn Thị Mai** (92đ AI) - Studio S1.08 sẵn sàng cọc VietQR 2M.`,
        actions: [
          {
            label: "📝 Soạn tin Zalo đôn đốc Sale",
            actionType: "copy",
            payload: `[VinStay AI ĐÔN ĐỐC] Chào Bảo, khách Trần Minh Quân đạt 96đ AI cần vào ở gấp căn S2.12-1608 trong 3 ngày. Bạn liên hệ hỗ trợ chốt cọc VietQR 2M ngay nhé!`,
          },
        ],
      };
    }

    // ── 5. CHIẾN DỊCH MARKETING & ROI ──
    if (hasCampaign) {
      const best = [...CAMPAIGN_DATA].sort((a, b) => b.roiPercent - a.roiPercent)[0];
      return {
        text: `Dạ chiến dịch hiệu quả nhất là **${best.name} (${best.channel})**: ROI đạt **+${best.roiPercent}%**, đem về ${best.qualifiedLeads} khách nét và ${best.dealsClosed} deal thành công với chi phí ${vnd(best.costPerQualifiedLead)}đ/lead.`,
        actions: [
          {
            label: "📈 Xem Bảng Chiến Dịch",
            actionType: "link",
            payload: "/admin/reports",
          },
        ],
      };
    }

    // ── 6. TÓM TẮT BÁO CÁO / DOANH THU TỔNG THỂ ──
    if (hasSummary || q.includes("doanh thu") || q.includes("doanh số") || q.includes("grv")) {
      return {
        text: `Dạ tổng quan tuần này: Tổng doanh số GRV đạt **${vnd(summary.financials.totalGrossRentalValue)}đ** (${summary.financials.totalDeals} deals), tỷ lệ đạt KPI toàn sàn **${avgKpiRate}%**, SLA phản hồi trung bình **${avgSla}s**. Đang vận hành rất ổn định.`,
        actions: [
          {
            label: "⚡ Xem Top Khách Tiềm Năng",
            actionType: "link",
            payload: "/admin/reports",
          },
          {
            label: "📋 Sao chép tóm tắt này",
            actionType: "copy",
            payload: `[VinStay AI] Báo cáo điều hành: Doanh số ${vnd(summary.financials.totalGrossRentalValue)}đ (${summary.financials.totalDeals} deals). KPI toàn đội: ${avgKpiRate}%. Top Sale: ${topKpiAgent.name}.`,
          },
        ],
      };
    }

    // ── 7. CĂN HỘ & GIỎ HÀNG ──
    if (hasInventory) {
      const pendingCs = state.consignments.filter((c) => c.status === "reviewing").length;
      return {
        text: `Dạ giỏ hàng hiện có **${pendingCs} hồ sơ ký gửi chờ duyệt**, 2 căn đang kích hoạt Giá Sàn Ủy Quyền chốt nhanh 60s, toàn bộ căn tiết kiệm ≥ 10% đã được gắn nhãn Căn hời.`,
      };
    }

    // ── 8. SOẠN TIN NHẮN ZALO ──
    if (q.includes("soạn") || q.includes("zalo") || q.includes("nhắc") || q.includes("mẫu tin")) {
      return {
        text: `Dạ mẫu tin nhắn đôn đốc Sale gửi nhanh qua Zalo:\n*"[VinStay AI] Chào Lê Quốc Bảo, khách Trần Minh Quân (96đ AI) sẵn sàng cọc 2M qua VietQR cho căn S2.12-1608 trong 24h. Bạn liên hệ hỗ trợ chốt ca xem ngay nhé!"*`,
        actions: [
          {
            label: "📋 Sao chép tin nhắn Zalo",
            actionType: "copy",
            payload: `[VinStay AI - Thông Báo Điều Hành] Chào Lê Quốc Bảo, khách Trần Minh Quân (96đ AI) sẵn sàng cọc 2M qua VietQR cho căn S2.12-1608 trong 24h. Đề nghị bạn liên hệ chốt ca xem ngay!`,
          },
        ],
      };
    }

    // ── 9. FALLBACK MINH BẠCH, TRUNG THỰC ──
    return {
      text: `Dạ Vinny chưa có số liệu cho câu hỏi này. Anh có thể hỏi nhanh về: kết quả chốt hôm nay, xếp hạng Sale, vi phạm SLA, top lead chờ cọc hoặc tóm tắt doanh số nhé!`,
      actions: [
        {
          label: "🏆 Xếp hạng Sale tốt nhất",
          actionType: "copy",
          payload: "sale nào đang có hiệu suất tốt nhất",
        },
        {
          label: "📋 Kiểm tra deal chốt hôm nay",
          actionType: "copy",
          payload: "hôm nay chốt được khách nào chưa",
        },
      ],
    };
  };

  const handleSend = async (textToSend?: string) => {
    const q = (textToSend || input).trim();
    if (!q || isThinking) return;

    const userMsg: MessageItem = {
      id: `u-${Date.now()}`,
      sender: "user",
      text: q,
      timestamp: "Vừa xong",
    };

    setMessages((prev) => [...prev, userMsg]);
    setInput("");
    setIsThinking(true);

    // 1. Thử gọi API LLM Gemini trước
    try {
      const res = await fetch("/api/admin/copilot", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ question: q, pageContext: pageInfo.title }),
        signal: AbortSignal.timeout(9000),
      });

      if (res.ok) {
        const data = await res.json();
        if (data?.ok && data?.text) {
          const botMsg: MessageItem = {
            id: `b-${Date.now()}`,
            sender: "bot",
            text: data.text,
            timestamp: "Vừa xong",
          };
          setMessages((prev) => [...prev, botMsg]);
          setIsThinking(false);
          return;
        }
      }
    } catch {
      // Offline hoặc timeout -> rơi xuống Semantic Engine
    }

    // 2. Fallback xuống Semantic Reasoner Engine
    const reply = generateBotReply(q);
    const botMsg: MessageItem = {
      id: `b-${Date.now()}`,
      sender: "bot",
      text: reply.text,
      timestamp: "Vừa xong",
      actions: reply.actions,
    };
    setMessages((prev) => [...prev, botMsg]);
    setIsThinking(false);
  };

  const handleCopy = (payload: string) => {
    navigator.clipboard?.writeText(payload);
    setCopiedPayload(payload);
    setTimeout(() => setCopiedPayload(null), 2000);
  };

  const handleReset = () => {
    setMessages([getInitialMessage()]);
  };

  return (
    <div className={styles.floatingContainer}>
      {/* ── 1. Teaser Chào mừng (Khi Panel đang đóng) ── */}
      {!isOpen && showTeaser && (
        <div className={styles.teaserBubble} onClick={() => setIsOpen(true)}>
          <div className={styles.teaserHeader}>
            <span className={styles.teaserBadge}>
              <span className={styles.teaserBadgeDot} /> Vinny Copilot
            </span>
            <button
              type="button"
              className={styles.teaserClose}
              onClick={(e) => {
                e.stopPropagation();
                setShowTeaser(false);
              }}
              title="Đóng thông báo"
            >
              <X size={12} />
            </button>
          </div>
          <p className={styles.teaserText}>
            💡 Quản trị viên cần tóm tắt nhanh số liệu báo cáo hay kiểm tra SLA Sale hôm nay không?
          </p>
        </div>
      )}

      {/* ── 2. Hộp thoại Chat Floating Panel (Khi mở) ── */}
      {isOpen && (
        <div className={styles.chatPanel}>
          {/* Header */}
          <div className={styles.panelHeader}>
            <div className={styles.panelHeaderLeft}>
              <div className={styles.avatarBadge}>
                <ButlerMascot size="mini" hideBubble autoSpeak={false} />
                <span className={styles.avatarOnlineDot} />
              </div>
              <div>
                <h4 className={styles.headerTitle}>
                  Vinny Copilot <Sparkles size={13} className="text-amber" />
                </h4>
                <p className={styles.headerSubtitle}>Trợ lý điều hành & Phân tích số liệu</p>
              </div>
            </div>
            <div className={styles.headerActions}>
              <button
                type="button"
                className={styles.iconBtn}
                onClick={handleReset}
                title="Làm mới cuộc trò chuyện"
              >
                <RotateCcw size={14} />
              </button>
              <button
                type="button"
                className={styles.iconBtn}
                onClick={() => setIsOpen(false)}
                title="Thu nhỏ"
              >
                <ChevronDown size={16} />
              </button>
            </div>
          </div>

          {/* Context bar */}
          <div className={styles.contextBar}>
            <span>
              Ngữ cảnh: <span className={styles.contextTag}>📍 {pageInfo.title}</span>
            </span>
            <span style={{ fontSize: 11, color: "#64748b" }}>Deep Lagoon Engine</span>
          </div>

          {/* Messages list */}
          <div className={styles.messagesContainer}>
            {messages.map((m) => (
              <div
                key={m.id}
                className={`${styles.messageRow} ${
                  m.sender === "bot" ? styles.botRow : styles.userRow
                }`}
              >
                {m.sender === "bot" && (
                  <div style={{ flexShrink: 0, marginTop: 4 }}>
                    <ButlerMascot size="mini" hideBubble autoSpeak={false} />
                  </div>
                )}
                <div
                  className={`${styles.messageBubble} ${
                    m.sender === "bot" ? styles.botBubble : styles.userBubble
                  }`}
                >
                  <p className={styles.messageText}>{m.text}</p>

                  {/* Actions tích hợp */}
                  {m.actions && m.actions.length > 0 && (
                    <div className={styles.messageActions}>
                      {m.actions.map((act, idx) => (
                        <button
                          key={idx}
                          type="button"
                          className={`${styles.actionBtn} ${
                            copiedPayload === act.payload ? styles.actionBtnSuccess : ""
                          }`}
                          onClick={() => {
                            if (act.actionType === "copy") {
                              if (act.payload === "tóm tắt báo cáo") {
                                handleSend("Tóm tắt hiệu quả tuần này giúp tôi");
                              } else {
                                handleCopy(act.payload);
                              }
                            }
                          }}
                        >
                          {copiedPayload === act.payload ? (
                            <>
                              <Check size={12} /> Đã sao chép
                            </>
                          ) : (
                            <>
                              {act.actionType === "copy" ? <Copy size={12} /> : <ArrowRight size={12} />}
                              {act.label}
                            </>
                          )}
                        </button>
                      ))}
                    </div>
                  )}

                  {m.sender === "bot" && (
                    <div className={styles.botSignature}>
                      <span>Vinny AI Engine</span> · <span>{m.timestamp}</span>
                    </div>
                  )}
                </div>
              </div>
            ))}

            {isThinking && (
              <div className={styles.typingIndicator}>
                <span className={styles.typingDot} />
                <span className={styles.typingDot} />
                <span className={styles.typingDot} />
              </div>
            )}
            <div ref={messagesEndRef} />
          </div>

          {/* Prompt chips */}
          <div className={styles.chipsSection}>
            {getQuickChips().map((chip, idx) => (
              <button
                key={idx}
                type="button"
                className={styles.chipBtn}
                onClick={() => handleSend(chip)}
              >
                {chip}
              </button>
            ))}
          </div>

          {/* Input Bar */}
          <form
            className={styles.inputForm}
            onSubmit={(e) => {
              e.preventDefault();
              handleSend();
            }}
          >
            <input
              type="text"
              className={styles.textInput}
              placeholder="Hỏi Vinny về KPI, doanh thu, lead nóng..."
              value={input}
              onChange={(e) => setInput(e.target.value)}
              disabled={isThinking}
            />
            <button
              type="submit"
              className={styles.sendBtn}
              disabled={!input.trim() || isThinking}
              title="Gửi câu hỏi"
            >
              <Send size={15} />
            </button>
          </form>
        </div>
      )}

      {/* ── 3. Nút bấm kích hoạt Vinny (Launcher Button) ── */}
      <button
        type="button"
        className={`${styles.launcherBtn} ${isOpen ? styles.launcherActive : ""}`}
        onClick={() => {
          setIsOpen(!isOpen);
          setShowTeaser(false);
        }}
        title="Trợ lý điều hành AI Vinny"
        aria-label="Mở Vinny Copilot"
      >
        <ButlerMascot size="mini" hideBubble autoSpeak={false} />
        {!isOpen && <span className={styles.sparkleGlow} />}
      </button>
    </div>
  );
}

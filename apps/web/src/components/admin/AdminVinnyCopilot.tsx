"use client";

import { useEffect, useRef, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import {
  ArrowRight,
  Check,
  ChevronDown,
  Copy,
  RotateCcw,
  Send,
  Sparkles,
  X,
} from "lucide-react";
import { ButlerMascot } from "@/components/mascot/ButlerMascot";
import styles from "./AdminVinnyCopilot.module.css";

/** Id tin nhắn (gọi trong handler gửi tin, không phải lúc render). */
function messageId(prefix: "u" | "b"): string {
  return `${prefix}-${Date.now()}`;
}

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
 * Trợ lý điều hành Vinny (Admin): hỏi `/api/admin/copilot` — route đọc số liệu THẬT của báo cáo admin bằng phiên của người
 * hỏi (7 ngày gần nhất) rồi trả lời (Gemini nếu có key, không thì theo luật). Không có dữ liệu mock hay câu trả lời dựng sẵn.
 */
export function AdminVinnyCopilot() {
  const pathname = usePathname();
  const router = useRouter();
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
      text: `Chào Quản trị viên! Tôi là **Vinny Copilot**. Tôi trả lời từ số liệu báo cáo thật 7 ngày gần nhất: căn chốt, doanh số, lượt dẫn, SLA nhận ticket, tiền cọc và thu nhập Host.`,
      actions: [
        {
          label: "📊 Tóm tắt báo cáo nhanh",
          actionType: "copy",
          payload: "tóm tắt báo cáo tuần này",
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

  // Gợi ý câu hỏi: chỉ các chủ đề có số liệu thật trong báo cáo.
  const getQuickChips = () => [
    "📊 Tóm tắt tuần này",
    "🏆 Sale nào dẫn đầu?",
    "⚠️ Vi phạm SLA tuần này",
    "✅ Hôm nay chốt được căn nào?",
    "💰 Thu nhập Host tuần này",
  ];

  const handleSend = async (textToSend?: string) => {
    const q = (textToSend || input).trim();
    if (!q || isThinking) return;

    const userMsg: MessageItem = {
      id: messageId("u"),
      sender: "user",
      text: q,
      timestamp: "Vừa xong",
    };

    setMessages((prev) => [...prev, userMsg]);
    setInput("");
    setIsThinking(true);

    // Route đọc số liệu báo cáo thật (3 báo cáo tuần tự) rồi mới gọi LLM ⇒ cho tối đa 25 giây.
    let reply: { text: string; actions?: MessageAction[] };
    try {
      const res = await fetch("/api/admin/copilot", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ question: q, pageContext: pageInfo.title }),
        signal: AbortSignal.timeout(25_000),
      });
      let data: { ok?: boolean; text?: string; message?: string; actions?: MessageAction[] } = {};
      try {
        data = await res.json();
      } catch {
        data = { message: `máy chủ trả lỗi ${res.status}` };
      }
      reply = res.ok && data.ok && data.text
        ? { text: data.text, actions: data.actions }
        : { text: `Dạ Vinny chưa trả lời được: ${data.message ?? `máy chủ trả lỗi ${res.status}`}` };
    } catch (err) {
      const timedOut = err instanceof DOMException && (err.name === "TimeoutError" || err.name === "AbortError");
      reply = { text: timedOut ? "Dạ máy chủ phản hồi quá lâu, anh thử lại giúp em nhé." : "Dạ không kết nối được máy chủ, anh kiểm tra mạng rồi thử lại nhé." };
    }
    const botMsg: MessageItem = {
      id: messageId("b"),
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
                            if (act.actionType === "link") {
                              router.push(act.payload);
                              setIsOpen(false);
                            } else if (act.payload.length < 60) {
                              // Gợi ý câu hỏi ngắn ⇒ hỏi luôn; nội dung dài (tóm tắt, mẫu tin) ⇒ sao chép.
                              void handleSend(act.payload);
                            } else {
                              handleCopy(act.payload);
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

"use client";

import { useEffect, useRef, useState } from "react";
import { CalendarPlus, Send, Sparkles, X } from "lucide-react";
import type { Unit } from "@/lib/mock/units";
import { answerUnitQuestion, askVinnyConcierge, QUICK_CHIPS } from "@/lib/property/unitConcierge";
import { ButlerMascot } from "@/components/mascot/ButlerMascot";
import styles from "./UnitConciergeDrawer.module.css";

interface MessageItem {
  id: string;
  sender: "user" | "bot";
  text: string;
  suggestBooking?: boolean;
}

interface UnitConciergeDrawerProps {
  unit: Unit;
  open: boolean;
  onOpen?: () => void;
  onClose: () => void;
  onBook: () => void;
}

/**
 * Icon Người đội Vương miện đại diện cho Khách thuê (Cư dân VIP)
 * - Người: Chuẩn tỷ lệ Hình 2 (Đầu tròn rỗng thanh thoát, bờ vai cong mềm mại màu xanh VinStay #0a3d4a).
 * - Vương miện: NẰM HẲN BÊN PHẢI AVATAR, nghiêng lệch sang phải (+20°), bay lơ lửng rời xa phần đầu, có hiệu ứng vàng nhấp nháy.
 */
function UserCrownAvatar({ size = 42 }: { size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 48 48"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden="true"
      style={{ overflow: "visible" }}
    >
      {/* Nhóm Vương miện vàng: NẰM LỆCH HẲN BÊN PHẢI ĐẦU NGƯỜI, bay lơ lửng, nghiêng sang phải */}
      <g className={styles.crownShimmer}>
        {/* Thân vương miện 3 chóp vểnh ra cá tính, độ nghiêng thanh thoát */}
        <path
          d="M22 12.5L20.5 5L25.8 8.3L29.5 1.8L33.8 8.3L38.5 5L37 12.5Z"
          fill="url(#goldCrownDoodle)"
          stroke="#92400e"
          strokeWidth="1.1"
          strokeLinejoin="round"
        />

        {/* 3 quả cầu tròn ở đỉnh chóp */}
        <circle cx="20.5" cy="5" r="1.9" fill="#fde047" stroke="#92400e" strokeWidth="1" />
        <circle cx="29.5" cy="1.8" r="2.1" fill="#fef08a" stroke="#92400e" strokeWidth="1" />
        <circle cx="38.5" cy="5" r="1.9" fill="#fde047" stroke="#92400e" strokeWidth="1" />

        {/* Các chấm nhỏ tinh tế trên thân vương miện */}
        <circle cx="23" cy="7.3" r="0.7" fill="#78350f" />
        <circle cx="29.5" cy="5" r="0.7" fill="#78350f" />
        <circle cx="36" cy="7.3" r="0.7" fill="#78350f" />
        <circle cx="24.5" cy="10.7" r="0.7" fill="#78350f" />
        <circle cx="27" cy="10.9" r="0.7" fill="#78350f" />
        <circle cx="29.5" cy="11" r="0.7" fill="#78350f" />
        <circle cx="32" cy="10.9" r="0.7" fill="#78350f" />
        <circle cx="34.5" cy="10.7" r="0.7" fill="#78350f" />

        {/* Tia sáng vàng lấp lánh (Sparkles) bên phải vương miện */}
        <path d="M40.5 3.5L43.5 6L41.5 7.5Z" fill="#facc15" stroke="#92400e" strokeWidth="0.7" />
        <path d="M43 9L44.5 10.7L43.5 11.3Z" fill="#facc15" />
        <path d="M38 13C40.2 12.5 41.5 14.3 39.8 15.3Z" fill="#facc15" stroke="#92400e" strokeWidth="0.7" />
      </g>

      {/* Đầu người - Vòng tròn rỗng thanh thoát màu xanh Deep Lagoon VinStay (chuẩn Hình 2) */}
      <circle cx="21" cy="25" r="6.6" stroke="#0a3d4a" strokeWidth="2.8" fill="none" />

      {/* Thân người & bờ vai - Nét cong mềm mại tách rời đầu, màu xanh VinStay (chuẩn Hình 2) */}
      <path
        d="M6 45.5C6 37 12 34 21 34C30 34 36 37 36 45.5"
        stroke="#0a3d4a"
        strokeWidth="2.8"
        strokeLinecap="round"
        fill="none"
      />

      <defs>
        <linearGradient id="goldCrownDoodle" x1="20.5" y1="3.2" x2="38.5" y2="14" gradientUnits="userSpaceOnUse">
          <stop stopColor="#fde047" />
          <stop offset="0.6" stopColor="#facc15" />
          <stop offset="1" stopColor="#f59e0b" />
        </linearGradient>
      </defs>
    </svg>
  );
}

/**
 * Widget Quản gia Vinny chuẩn nhận diện VinStay AI (Linh vật ButlerMascot & Phong cách Deep Lagoon)
 */
export function UnitConciergeDrawer({ unit, open, onOpen, onClose, onBook }: UnitConciergeDrawerProps) {
  const handleOpenWidget = () => {
    if (onOpen) onOpen();
    else {
      window.dispatchEvent(new CustomEvent("open-concierge"));
    }
  };

  const [messages, setMessages] = useState<MessageItem[]>([
    {
      id: "welcome",
      sender: "bot",
      text: `Chào bạn! Tôi là Quản gia Vinny tại toà ${unit.building}. Bạn muốn hỏi về khoảng cách ĐH VinUni, trạm VinBus, hay biểu phí căn ${unit.code} này?`,
      suggestBooking: false,
    },
  ]);
  const [input, setInput] = useState("");
  const [isThinking, setIsThinking] = useState(false);
  const [showTeaser, setShowTeaser] = useState(true);
  const scrollRef = useRef<HTMLDivElement>(null);

  // Tự động cuộn xuống tin nhắn mới nhất
  useEffect(() => {
    if (open) {
      scrollRef.current?.scrollIntoView({ behavior: "smooth" });
    }
  }, [messages, isThinking, open]);

  // Đóng bằng phím Escape
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape" && open) onClose();
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [open, onClose]);

  const handleSend = async (textToSend?: string) => {
    const q = (textToSend || input).trim();
    if (!q || isThinking) return;

    const userMsgId = `u-${Date.now()}`;
    setMessages((prev) => [...prev, { id: userMsgId, sender: "user", text: q }]);
    setInput("");
    setIsThinking(true);

    try {
      // Kết nối AI Quản Gia (LLM Gemini Flash + Semantic Engine)
      const ans = await askVinnyConcierge(unit, q);
      const botMsgId = `b-${Date.now()}`;
      setMessages((prev) => [
        ...prev,
        {
          id: botMsgId,
          sender: "bot",
          text: ans.text,
          suggestBooking: ans.suggestBooking,
        },
      ]);
    } finally {
      setIsThinking(false);
    }
  };

  return (
    <div className={styles.conciergeContainer}>
      {/* ── Trạng thái MỞ: Card hội thoại ngắn VinStay AI ── */}
      {open ? (
        <div className={styles.miniChatCard} role="dialog" aria-modal="true" aria-label="Quản gia Vinny VinStay AI">
          {/* Header chuẩn VinStay AI (Deep Lagoon) */}
          <div className={styles.cardHeader}>
            <div className={styles.headerLeft}>
              <div className={styles.headerAvatarMini}>
                <ButlerMascot size="mini" autoSpeak={false} hideBubble={true} />
              </div>
              <div className={styles.headerTextGroup}>
                <span className={styles.headerTitle}>Quản gia Vinny</span>
                <span className={styles.headerSubtitle}>
                  <span className={styles.headerSubtitleDot} />
                  Túc trực toà {unit.building} · VinStay AI
                </span>
              </div>
            </div>
            <button
              type="button"
              className={styles.headerClose}
              onClick={onClose}
              aria-label="Đóng cuộc hội thoại"
            >
              <X size={17} />
            </button>
          </div>

          {/* Vùng tin nhắn mô phỏng hội thoại ngắn */}
          <div className={styles.messagesScroll}>
            {messages.map((m) =>
              m.sender === "user" ? (
                <div key={m.id} className={styles.userRow}>
                  <div className={styles.userBubble}>{m.text}</div>
                  <div className={styles.userAvatar} title="Khách thuê (Cư dân VIP)">
                    <UserCrownAvatar size={42} />
                  </div>
                </div>
              ) : (
                <div key={m.id} className={styles.botRow}>
                  <div className={styles.botAvatarSmall}>
                    <ButlerMascot size="mini" autoSpeak={false} hideBubble={true} />
                  </div>
                  <div className={styles.botBubbleContainer}>
                    <div className={styles.botBubble}>
                      {m.text}
                      {m.suggestBooking && (
                        <div>
                          <button
                            type="button"
                            className={styles.botActionBtn}
                            onClick={() => {
                              onClose();
                              onBook();
                            }}
                          >
                            <CalendarPlus size={14} /> Đặt lịch xem cùng Host
                          </button>
                        </div>
                      )}
                    </div>
                    <div className={styles.botFooterBadge}>
                      <Sparkles size={11} />
                      <span>Phản hồi bởi VinStay AI</span>
                    </div>
                  </div>
                </div>
              )
            )}
            {isThinking && (
              <div className={styles.botRow}>
                <div className={styles.botAvatarSmall}>
                  <ButlerMascot size="mini" mood="thinking" autoSpeak={false} hideBubble={true} />
                </div>
                <div className={styles.botBubbleContainer}>
                  <div className={`${styles.botBubble} ${styles.thinkingBubble}`}>
                    <span className={styles.typingDot} />
                    <span className={styles.typingDot} />
                    <span className={styles.typingDot} />
                  </div>
                </div>
              </div>
            )}
            <div ref={scrollRef} />
          </div>

          {/* Hàng chip câu hỏi nhanh 1-chạm trượt ngang */}
          <div className={styles.chipsContainer}>
            {QUICK_CHIPS.map((chip) => (
              <button
                key={chip}
                type="button"
                className={styles.chipBtn}
                onClick={() => handleSend(chip)}
                disabled={isThinking}
              >
                {chip}
              </button>
            ))}
          </div>

          {/* Ô nhập chat mini */}
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
              placeholder={isThinking ? "Vinny đang phân tích câu hỏi..." : `Hỏi Vinny về căn ${unit.building}...`}
              value={input}
              onChange={(e) => setInput(e.target.value.slice(0, 200))}
              maxLength={200}
              disabled={isThinking}
            />
            <button
              type="submit"
              className={styles.sendBtn}
              disabled={!input.trim() || isThinking}
              aria-label="Gửi tin nhắn"
            >
              <Send size={15} />
            </button>
          </form>
        </div>
      ) : (
        /* ── Trạng thái ĐÓNG: Teaser Bubble trên đầu Vinny ── */
        showTeaser && (
          <div
            className={styles.teaserBubble}
            onClick={handleOpenWidget}
            role="button"
            tabIndex={0}
            aria-label="Mở hội thoại với Quản gia Vinny"
          >
            <div className={styles.teaserHeader}>
              <span className={styles.teaserBadge}>
                <span className={styles.teaserBadgeDot} />
                Quản gia Vinny
              </span>
              <button
                type="button"
                className={styles.teaserClose}
                onClick={(e) => {
                  e.stopPropagation();
                  setShowTeaser(false);
                }}
                aria-label="Tắt gợi ý"
              >
                <X size={13} />
              </button>
            </div>
            <p className={styles.teaserText}>
              👋 Cần giải đáp nhanh về toà {unit.building} (VinUni, trạm xe bus, biểu phí sinh hoạt...)?
            </p>
            <div className={styles.teaserCta}>
              <Sparkles size={12} />
              <span>Chạm vào đây để chat với Vinny</span>
            </div>
            {/* Mũi tên chỉ xuống đầu Robot Vinny */}
            <div className={styles.teaserTail} />
          </div>
        )
      )}

      {/* ── Nút Robot Vinny (Linh vật ButlerMascot chính thức) ── */}
      <button
        type="button"
        className={styles.robotButton}
        onClick={() => {
          if (open) onClose();
          else handleOpenWidget();
        }}
        aria-label="Mở Quản gia Vinny"
      >
        <span className={styles.robotGlowRing} />
        <div className={styles.robotAvatarWrapper}>
          <ButlerMascot size="compact" autoSpeak={false} hideBubble={true} />
          <span className={styles.robotOnlineDot} />
        </div>
      </button>
    </div>
  );
}

/**
 * Giữ export FloatingConciergeBubble để tương thích hoàn toàn với các component khác
 */
export function FloatingConciergeBubble({
  unit,
  onClick,
}: {
  unit: Unit;
  onClick: () => void;
}) {
  useEffect(() => {
    const handleOpen = () => onClick();
    window.addEventListener("open-concierge", handleOpen);
    return () => window.removeEventListener("open-concierge", handleOpen);
  }, [onClick]);

  return null;
}

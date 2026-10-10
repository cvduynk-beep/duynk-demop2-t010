"use client";

import { useEffect, useRef, useState } from "react";
import styles from "./ButlerMascot.module.css";

export type MascotMood = "idle" | "listening" | "thinking" | "happy";

interface ButlerMascotProps {
  size?: "hero" | "compact" | "mini";
  mood?: MascotMood;
  customMessage?: string;
  autoSpeak?: boolean;
  hideBubble?: boolean;
  onClick?: () => void;
  className?: string;
}

export const VINNY_GREETINGS = [
  "Lọc căn nhanh hơn crush 'seen' tin nhắn ⚡ Cho Vinny xin ngân sách của bạn nhé!",
  "Ở đây không có môi giới ép cọc, chỉ có Vinny lọc căn ngon! Bạn tìm căn thế nào nè?",
  "Bạn có ngân sách, Vinny có căn hời. Không chốt là hơi phí đời! Tìm căn mấy triệu bạn ơi",
] as const;

export const VINNY_CURIOSITY_SPEECHES = [
  "Lọc căn nhanh hơn crush 'seen' tin nhắn ⚡ Cho Vinny xin ngân sách của bạn nhé!",
  "Suỵt! Vừa có 1 căn Sapphire rẻ hơn toà 15% mới lên sóng nè... 👀",
  "Ở đây không có môi giới ép cọc, chỉ có Vinny lọc căn ngon! Bạn tìm căn thế nào nè?",
  "Bấm vào Vinny thử đi, có điều bất ngờ cho bạn đó! ✨",
  "Bạn có ngân sách, Vinny có căn hời. Không chốt là hơi phí đời! Tìm căn mấy triệu bạn ơi",
  "Bạn thích view ngắm biển hồ Lagoon hay đón gió ban công Đông Nam? 🌊",
  "72 căn hộ thật tại Ocean Park 1 sẵn sàng, hỏi Vinny lọc trong 30s nha! 🚀",
  "Vinny giữ sẵn thẻ thang máy rồi, bạn có muốn đi xem phòng không? 🔑",
] as const;

export function ButlerMascot({
  size = "hero",
  mood = "idle",
  customMessage,
  autoSpeak,
  hideBubble = false,
  onClick,
  className,
}: ButlerMascotProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [pupilOffset, setPupilOffset] = useState<{ x: number; y: number }>({ x: 0, y: 0 });
  const [isBlinking, setIsBlinking] = useState(false);
  const [isHovered, setIsHovered] = useState(false);
  const [clickedGreeting, setClickedGreeting] = useState<string | null>(null);
  const [autoSpeech, setAutoSpeech] = useState<string | null>(null);
  const speechIdxRef = useRef(0);

  // 1. Mắt đảo nhìn theo trỏ chuột (60fps Mouse Tracking)
  useEffect(() => {
    const handlePointerMove = (e: PointerEvent) => {
      if (mood === "thinking") return; // Khi đang suy nghĩ thì xoay radar
      if (!containerRef.current) return;

      const rect = containerRef.current.getBoundingClientRect();
      const centerX = rect.left + rect.width / 2;
      const centerY = rect.top + rect.height * 0.45; // Tâm điểm đôi mắt

      const dx = e.clientX - centerX;
      const dy = e.clientY - centerY;
      const distance = Math.hypot(dx, dy);

      // Giới hạn bán kính đảo mắt tối đa 6.5px để tròng đen không lệch khỏi màn hình OLED
      const maxRadius = 6.5;
      const scale = distance > 0 ? Math.min(distance * 0.035, maxRadius) / distance : 0;

      // Khi người dùng gõ phím (listening), mắt ưu tiên nhìn xuống dưới về phía bàn phím
      const targetY = mood === "listening" ? Math.max(dy * scale, 2.5) : dy * scale;

      setPupilOffset({
        x: dx * scale,
        y: targetY,
      });
    };

    window.addEventListener("pointermove", handlePointerMove, { passive: true });
    return () => window.removeEventListener("pointermove", handlePointerMove);
  }, [mood]);

  // 2. Chớp mắt ngẫu nhiên tự nhiên (Blinking Engine)
  useEffect(() => {
    let blinkTimer: NodeJS.Timeout;
    const scheduleNextBlink = () => {
      // Khoảng cách giữa các lần chớp mắt từ 3.2s đến 5.8s
      const delay = Math.random() * 2600 + 3200;
      blinkTimer = setTimeout(() => {
        setIsBlinking(true);
        setTimeout(() => {
          setIsBlinking(false);
          scheduleNextBlink();
        }, 160); // Nháy mắt trong 160ms
      }, delay);
    };

    scheduleNextBlink();
    return () => clearTimeout(blinkTimer);
  }, []);

  // 3. Cơ chế Robot Vinny thỉnh thoảng tự nói để tạo tò mò cho người dùng
  useEffect(() => {
    const shouldSpeak = autoSpeak ?? size === "hero";
    if (!shouldSpeak || mood !== "idle") {
      setAutoSpeech(null);
      return;
    }

    let hideTimer: NodeJS.Timeout;
    let nextTimer: NodeJS.Timeout;

    const scheduleNextSpeech = (delayMs: number) => {
      nextTimer = setTimeout(() => {
        const msg = VINNY_CURIOSITY_SPEECHES[speechIdxRef.current % VINNY_CURIOSITY_SPEECHES.length];
        speechIdxRef.current += 1;
        setAutoSpeech(msg);

        // Hiển thị bong bóng trong 5.5 giây rồi ẩn
        hideTimer = setTimeout(() => {
          setAutoSpeech(null);
          // Hẹn lượt nói tiếp theo sau 11s - 18s
          const nextDelay = Math.random() * 7000 + 11000;
          scheduleNextSpeech(nextDelay);
        }, 5500);
      }, delayMs);
    };

    // Lần đầu tự phát biểu sau 3.5 giây khi vào trang
    scheduleNextSpeech(3500);

    return () => {
      clearTimeout(nextTimer);
      clearTimeout(hideTimer);
    };
  }, [autoSpeak, size, mood]);

  // Lời thoại bong bóng tương tác
  const defaultMessages: Record<MascotMood, string> = {
    idle: VINNY_GREETINGS[0],
    listening: "Vinny đang lắng nghe ngân sách của bạn nè 🎧",
    thinking: "Đang quét 71 căn hộ thật tại Ocean Park 1 ⚡",
    happy: "Có căn hời rồi, không chốt là hơi phí đời! 🎉",
  };

  const bubbleText = clickedGreeting || customMessage || autoSpeech || defaultMessages[mood];

  const showBubble = !hideBubble && Boolean(
    isHovered ||
    mood === "thinking" ||
    mood === "happy" ||
    clickedGreeting ||
    customMessage ||
    autoSpeech
  );

  const handleClick = () => {
    const randomGreet = VINNY_GREETINGS[Math.floor(Math.random() * VINNY_GREETINGS.length)];
    setClickedGreeting(randomGreet);
    setTimeout(() => setClickedGreeting(null), 4500);
    onClick?.();
  };

  return (
    <div
      ref={containerRef}
      className={`${styles.mascotWrap} ${styles[size]} ${className || ""}`}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
      onClick={handleClick}
      role="button"
      tabIndex={0}
      aria-label="Linh vật Trợ lý VinStay AI"
    >
      {/* Bong bóng trò chuyện thông minh (Speech Bubble) */}
      {showBubble && (
        <div
          className={`${styles.bubble} ${autoSpeech && !clickedGreeting && !customMessage ? styles.bubbleProactive : ""}`}
          role="status"
        >
          <span className={styles.bubbleEmoji}>
            {mood === "thinking" ? "⚡" : mood === "happy" ? "🎉" : autoSpeech ? "💬" : "🤖"}
          </span>
          <strong>{bubbleText}</strong>
        </div>
      )}

      {/* Vector Linh vật Quản Gia Mini (SVG Butler Bot) */}
      <svg
        viewBox="0 0 100 110"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
        style={{ width: "100%", height: "100%", overflow: "visible" }}
      >
        <defs>
          {/* Gradient vỏ kim loại ngọc trai sang trọng */}
          <linearGradient id="bodyGrad" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor="#ffffff" />
            <stop offset="60%" stopColor="#f1f5f9" />
            <stop offset="100%" stopColor="#cbd5e1" />
          </linearGradient>

          {/* Gradient Màn hình OLED kính cong */}
          <linearGradient id="screenGrad" x1="0%" y1="0%" x2="0%" y2="100%">
            <stop offset="0%" stopColor="#09131f" />
            <stop offset="100%" stopColor="#1e293b" />
          </linearGradient>

          {/* Gradient Đôi mắt Cyber Cyan phát sáng */}
          <linearGradient id="eyeGrad" x1="0%" y1="0%" x2="0%" y2="100%">
            <stop offset="0%" stopColor="#38bdf8" />
            <stop offset="100%" stopColor="#0284c7" />
          </linearGradient>

          {/* Ánh kim Thẻ Cư Dân VinStay */}
          <linearGradient id="cardGrad" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor="#0891b2" />
            <stop offset="100%" stopColor="#0e7490" />
          </linearGradient>

          {/* Chip vàng thẻ từ */}
          <linearGradient id="chipGrad" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor="#fde047" />
            <stop offset="100%" stopColor="#eab308" />
          </linearGradient>

          {/* Đổ bóng mềm dưới chân */}
          <radialGradient id="shadowGrad" cx="50%" cy="50%" r="50%">
            <stop offset="0%" stopColor="#0369a1" stopOpacity="0.4" />
            <stop offset="100%" stopColor="#0369a1" stopOpacity="0" />
          </radialGradient>
        </defs>

        {/* 1. Bóng đổ lơ lửng bên dưới */}
        <ellipse cx="50" cy="104" rx="28" ry="5.5" fill="url(#shadowGrad)" className={styles.shadow} />

        {/* 2. Toàn bộ cơ thể lơ lửng */}
        <g className={`${styles.floatBody} ${mood === "listening" ? styles.tiltListening : mood === "happy" ? styles.happyBounce : ""}`}>
          {/* Tai nghe Quản Gia Công Nghệ & Ăng-ten phát tín hiệu */}
          <g className={styles.antennaGlow}>
            {/* Ăng-ten đỉnh đầu */}
            <path d="M 50 18 L 50 9" stroke="#94a3b8" strokeWidth="2.5" strokeLinecap="round" />
            <circle cx="50" cy="7" r="4.5" fill="#38bdf8" />
            <circle cx="50" cy="7" r="2" fill="#ffffff" />

            {/* Tai nghe hai bên */}
            <rect x="13" y="36" width="6" height="14" rx="3" fill="#0284c7" />
            <circle cx="16" cy="43" r="2.5" fill="#38bdf8" />
            <rect x="81" y="36" width="6" height="14" rx="3" fill="#0284c7" />
            <circle cx="84" cy="43" r="2.5" fill="#38bdf8" />
          </g>

          {/* Đầu tròn Chibi kim loại ngọc trai */}
          <rect
            x="17"
            y="18"
            width="66"
            height="56"
            rx="28"
            fill="url(#bodyGrad)"
            stroke="#e2e8f0"
            strokeWidth="1.5"
            filter="drop-shadow(0 6px 12px rgba(14, 165, 233, 0.15))"
          />

          {/* Màn hình kính OLED vòm mặt */}
          <rect
            x="24"
            y="26"
            width="52"
            height="40"
            rx="18"
            fill="url(#screenGrad)"
            stroke="#334155"
            strokeWidth="1.2"
          />

          {/* Ánh phản chiếu cong trên kính OLED (Glass Sheen) */}
          <path
            d="M 30 30 Q 50 33 70 30"
            stroke="rgba(255, 255, 255, 0.28)"
            strokeWidth="1.6"
            strokeLinecap="round"
          />

          {/* 3. Mắt & Biểu cảm (Eyes & Expression) */}
          {mood === "thinking" ? (
            /* Khi đang phân tích dữ liệu: Mắt xoay Radar */
            <g className={styles.radarRotate}>
              <circle cx="39" cy="44" r="7" stroke="#38bdf8" strokeWidth="2" strokeDasharray="3 3" />
              <circle cx="39" cy="44" r="3" fill="#38bdf8" />
              <circle cx="61" cy="44" r="7" stroke="#38bdf8" strokeWidth="2" strokeDasharray="3 3" />
              <circle cx="61" cy="44" r="3" fill="#38bdf8" />
            </g>
          ) : mood === "happy" ? (
            /* Khi vui sướng / tìm thấy căn: Đôi mắt cười trăng khuyết (^ ^) */
            <g>
              <path
                d="M 32 46 Q 39 36 46 46"
                stroke="#38bdf8"
                strokeWidth="3.6"
                strokeLinecap="round"
                fill="none"
              />
              <path
                d="M 54 46 Q 61 36 68 46"
                stroke="#38bdf8"
                strokeWidth="3.6"
                strokeLinecap="round"
                fill="none"
              />
            </g>
          ) : (
            /* Trạng thái bình thường / lắng nghe: Mắt OLED dõi theo con trỏ chuột */
            <g
              className={`${styles.blinkTop} ${isBlinking ? styles.isBlinking : ""}`}
              style={{ transformOrigin: "50px 44px" }}
            >
              {/* Mắt trái */}
              <g transform={`translate(${pupilOffset.x}, ${pupilOffset.y})`}>
                <ellipse cx="39" cy="44" rx="6.5" ry="8" fill="url(#eyeGrad)" />
                {/* Đốm sáng phản chiếu mắt (Eye sparkle) */}
                <circle cx="37.5" cy="41.5" r="2.2" fill="#ffffff" />
                <circle cx="41.5" cy="46" r="1.1" fill="#ffffff" opacity="0.8" />
              </g>

              {/* Mắt phải */}
              <g transform={`translate(${pupilOffset.x}, ${pupilOffset.y})`}>
                <ellipse cx="61" cy="44" rx="6.5" ry="8" fill="url(#eyeGrad)" />
                {/* Đốm sáng phản chiếu mắt */}
                <circle cx="59.5" cy="41.5" r="2.2" fill="#ffffff" />
                <circle cx="63.5" cy="46" r="1.1" fill="#ffffff" opacity="0.8" />
              </g>
            </g>
          )}

          {/* Má hồng công nghệ dễ thương */}
          <circle cx="31" cy="54" r="3" fill="#f43f5e" opacity="0.32" />
          <circle cx="69" cy="54" r="3" fill="#f43f5e" opacity="0.32" />

          {/* 4. Miệng (Mouth) */}
          {mood === "thinking" ? (
            /* Miệng chữ "o" nhỏ ngạc nhiên/suy nghĩ */
            <circle cx="50" cy="55" r="2.5" fill="#38bdf8" />
          ) : mood === "happy" || isHovered || Boolean(autoSpeech) ? (
            /* Miệng cười tươi hở răng vui sướng / mấp máy khi tự nói chuyện */
            <path
              className={autoSpeech ? styles.talkingMouth : undefined}
              d="M 44 53 Q 50 61 56 53 Z"
              fill="#38bdf8"
              stroke="#0284c7"
              strokeWidth="1"
            />
          ) : (
            /* Miệng mỉm cười thân thiện bình thường */
            <path
              d="M 45 54 Q 50 58 55 54"
              stroke="#38bdf8"
              strokeWidth="2"
              strokeLinecap="round"
              fill="none"
            />
          )}

          {/* 5. Cổ áo nơ Quản Gia (Butler Bowtie) */}
          <g>
            {/* Cổ áo nơ tinh tế */}
            <polygon points="43,73 50,76 43,79" fill="#0284c7" />
            <polygon points="57,73 50,76 57,79" fill="#0284c7" />
            <circle cx="50" cy="76" r="2.5" fill="#38bdf8" />
          </g>

          {/* 6. Thân robot chibi */}
          <rect
            x="32"
            y="76"
            width="36"
            height="22"
            rx="11"
            fill="url(#bodyGrad)"
            stroke="#cbd5e1"
            strokeWidth="1.2"
          />

          {/* Huy hiệu VinStay AI ngực áo */}
          <circle cx="50" cy="85" r="4.5" fill="#0284c7" />
          <path d="M 48 83 L 52 85 L 48 87" stroke="#ffffff" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round" />

          {/* Tay trái ôm lịch sự */}
          <ellipse cx="30" cy="84" rx="4" ry="6" fill="#e2e8f0" stroke="#cbd5e1" strokeWidth="1" />

          {/* 7. Tay phải cầm THẺ CƯ DÂN VINSTAY (Smart Resident Keycard) */}
          <g className={`${styles.cardWave}`}>
            {/* Cánh tay vươn ra */}
            <path d="M 68 83 Q 76 81 81 76" stroke="#cbd5e1" strokeWidth="4.5" strokeLinecap="round" />
            {/* Bàn tay tròn */}
            <circle cx="81" cy="75" r="4" fill="#f1f5f9" stroke="#cbd5e1" strokeWidth="1" />

            {/* Thẻ Cư Dân Thang Máy VinStay (Resident Card) */}
            <g transform="translate(76, 62) rotate(12)">
              {/* Thân thẻ */}
              <rect
                x="0"
                y="0"
                width="16"
                height="22"
                rx="2"
                fill="url(#cardGrad)"
                stroke="#bae6fd"
                strokeWidth="0.8"
                filter="drop-shadow(0 2px 5px rgba(2, 132, 199, 0.35))"
              />
              {/* Chip RFID vàng */}
              <rect x="2.5" y="4" width="4.5" height="4" rx="0.8" fill="url(#chipGrad)" />
              {/* Dải từ / vạch biểu tượng */}
              <line x1="2.5" y1="12" x2="13.5" y2="12" stroke="rgba(255, 255, 255, 0.7)" strokeWidth="1.2" strokeLinecap="round" />
              <line x1="2.5" y1="15" x2="10" y2="15" stroke="rgba(255, 255, 255, 0.5)" strokeWidth="1" strokeLinecap="round" />
              {/* Chấm tròn biểu tượng VinStay */}
              <circle cx="12" cy="6" r="1.5" fill="#38bdf8" />
            </g>
          </g>
        </g>
      </svg>
    </div>
  );
}

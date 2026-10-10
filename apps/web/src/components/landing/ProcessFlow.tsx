"use client";

import { useEffect, useState } from "react";
import { BellRing, Bot, CalendarCheck, FileSignature, KeyRound, QrCode } from "lucide-react";
import styles from "./ProcessFlow.module.css";

const STEPS = [
  {
    step: 1,
    title: "Nói nhu cầu với AI",
    tagline: "AI tính All-in cost trọn gói, trả ngay top 3 căn hời nhất",
    tip: "Loại bỏ 100% căn vượt ngân sách trần, tiết kiệm 90% thời gian tìm kiếm.",
    time: "30 giây",
    Icon: Bot,
  },
  {
    step: 2,
    title: "Đặt lịch, xác thực Zalo",
    tagline: "Chọn ca trực của Host, xác thực OTP 1 chạm loại trừ khách ảo",
    tip: "Field Host phân khu tiếp nhận ticket và chốt lịch trong ≤ 3 phút.",
    time: "≤ 3 phút",
    Icon: CalendarCheck,
  },
  {
    step: 3,
    title: "Nhắc hẹn có nút bấm",
    tagline: "Tin nhắn Zalo kèm nút 'Tôi đã có mặt', không phải chờ sảnh",
    tip: "Hệ thống nhắc hẹn kép trước 10 phút, Host chủ động xuống sảnh đón.",
    time: "T-10 phút",
    Icon: BellRing,
  },
  {
    step: 4,
    title: "Host đón & Mở cửa",
    tagline: "Host quẹt thẻ thang máy, cấp mã mở cửa tức thì trên app",
    tip: "Chủ nhà không phải đi 20-30km mở cửa, tuyệt đối không dùng lockbox.",
    time: "60 giây",
    Icon: KeyRound,
  },
  {
    step: 5,
    title: "Khóa căn VietQR 2.000.000đ",
    tagline: "Quét VietQR động, căn tự động khóa giữ chỗ độc quyền 48h",
    tip: "Gạch nợ tự động vào tài khoản nền tảng, không chuyển khoản cá nhân.",
    time: "48 giờ",
    Icon: QrCode,
  },
  {
    step: 6,
    title: "AI OCR CCCD & Ký số",
    tagline: "AI đọc chip CCCD 5s, ký hợp đồng thuê số bảo mật AES-256",
    tip: "Khoản cọc 2 triệu chuyển thành cọc bảo đảm tài sản suốt kỳ thuê.",
    time: "OTP Zalo",
    Icon: FileSignature,
  },
];

export function ProcessFlow() {
  const [activeStep, setActiveStep] = useState(0);
  const [isPaused, setIsPaused] = useState(false);

  // Tự động xoay vòng bước tạo hiệu ứng sống động
  useEffect(() => {
    if (isPaused) return;
    const interval = setInterval(() => {
      setActiveStep((prev) => (prev + 1) % STEPS.length);
    }, 3800);
    return () => clearInterval(interval);
  }, [isPaused]);

  const current = STEPS[activeStep];
  const progressPercent = ((activeStep + 1) / STEPS.length) * 100;

  return (
    <div
      className={styles.flowWrap}
      onMouseEnter={() => setIsPaused(true)}
      onMouseLeave={() => setIsPaused(false)}
    >
      {/* ─── Cột trái: Tiêu đề & Card trạng thái động ─── */}
      <div className={styles.leftCol}>
        <div>
          <h2 className={styles.heading}>Từ tin nhắn đầu tiên đến chìa khoá</h2>
          <p className={styles.subText}>
            Sáu bước tự động hoá minh bạch. Phần lớn do AI và Field Host lo, bạn chỉ cần có mặt đúng giờ.
          </p>
        </div>

        {/* Card mô tả chi tiết bước đang kích hoạt */}
        <div className={styles.statusCard}>
          <div className={styles.statusHeader}>
            <span className={styles.statusTag}>
              <span className={styles.pulseDot} />
              Bước 0{current.step} / 0{STEPS.length}
            </span>
            <span className="muted xs font-mono">{current.time}</span>
          </div>

          <div>
            <div className={styles.statusStepName}>{current.title}</div>
            <div className={styles.statusTip}>{current.tip}</div>
          </div>

          <div className={styles.progressBar}>
            <div
              className={styles.progressFill}
              style={{ width: `${progressPercent}%` }}
            />
          </div>
        </div>
      </div>

      {/* ─── Cột phải: Timeline 6 bước tương tác ─── */}
      <div className={styles.timeline}>
        {/* Đường beam ánh sáng phát quang chạy dọc */}
        <div className={styles.beamLine}>
          <div className={styles.beamGlow} />
        </div>

        {STEPS.map((s, idx) => {
          const isActive = idx === activeStep;
          const { Icon } = s;

          return (
            <div
              key={s.step}
              className={`${styles.stepCard} ${isActive ? styles.active : ""}`}
              onClick={() => setActiveStep(idx)}
              role="button"
              tabIndex={0}
              onKeyDown={(e) => {
                if (e.key === "Enter" || e.key === " ") setActiveStep(idx);
              }}
              aria-label={`Bước ${s.step}: ${s.title}`}
            >
              <div className={styles.stepCircle}>{s.step}</div>

              <div className={styles.iconWrap}>
                <Icon size={16} />
              </div>

              <div className={styles.stepBody}>
                <div className={styles.stepTitleRow}>
                  <span className={styles.stepTitle}>{s.title}</span>
                </div>
                <div className={styles.stepTagline}>{s.tagline}</div>
              </div>

              <div className={styles.timePill}>{s.time}</div>

              {isActive && <div className={styles.activeTrack} />}
            </div>
          );
        })}
      </div>
    </div>
  );
}

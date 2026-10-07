"use client";

import Link from "next/link";
import { useRef, useState } from "react";
import { Lock, LogIn, Send } from "lucide-react";
import { SAMPLE_PROMPTS, sentenceFromCriteria, hasCriteria } from "@/lib/mock/matchmaker";
import type { CriteriaState } from "@/lib/mock/types";
import { FilterTray } from "./FilterTray";
import styles from "./Composer.module.css";

interface ComposerProps {
  criteria: CriteriaState;
  onCriteria: (c: CriteriaState) => void;
  onSend: (text: string) => void;
  onTyping?: (typing: boolean) => void;
  busy: boolean;
  /** Khách vãng lai đã hết lượt nhắn. */
  locked: boolean;
  guestNotice: boolean;
  variant: "hero" | "rail";
  showPrompts?: boolean;
}

export function Composer({ criteria, onCriteria, onSend, onTyping, busy, locked, guestNotice, variant, showPrompts }: ComposerProps) {
  const [text, setText] = useState("");
  const area = useRef<HTMLTextAreaElement>(null);
  const filtered = hasCriteria(criteria);

  const grow = (el: HTMLTextAreaElement) => {
    el.style.height = "auto";
    el.style.height = `${Math.min(el.scrollHeight, 120)}px`;
  };

  const currentText = text.trim();
  const canSubmit = Boolean(currentText || filtered);

  const submit = (value?: string) => {
    const rawVal = value ?? area.current?.value ?? text;
    const body = (rawVal ?? "").trim() || (filtered ? sentenceFromCriteria(criteria) : "");
    if (!body || busy || locked) return;
    onTyping?.(false);
    onSend(body);
    setText("");
    if (area.current) {
      area.current.value = "";
      area.current.style.height = "auto";
    }
  };

  if (locked) {
    return (
      <div className={styles.lock}>
        <span className={styles.lockIcon}>
          <Lock size={18} />
        </span>
        <div>
          <strong>Bạn đã dùng lượt nhắn miễn phí</strong>
          <p className="muted small">Đăng nhập để chat không giới hạn với VinStay AI. Xem căn, đổi bộ lọc và đặt lịch vẫn dùng được mà không cần tài khoản.</p>
          <Link href="/login?as=tenant" className="btn btn-primary btn-sm">
            <LogIn size={15} /> Đăng nhập để tiếp tục
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className={styles.wrap}>
      <form
        className={styles.shell}
        onSubmit={(e) => {
          e.preventDefault();
          submit();
        }}
      >
        <label htmlFor={`composer-${variant}`} className="sr-only">
          Nhập yêu cầu tìm căn
        </label>
        <textarea
          id={`composer-${variant}`}
          ref={area}
          className={styles.area}
          rows={1}
          placeholder={variant === "hero" ? "Ví dụ: Studio dưới 8 triệu, có điều hòa, gần VinUni…" : "Hỏi tiếp hoặc chỉnh yêu cầu…"}
          value={text}
          disabled={busy}
          onFocus={() => onTyping?.(true)}
          onBlur={() => {
            if (!text.trim()) onTyping?.(false);
          }}
          onChange={(e) => {
            setText(e.target.value);
            grow(e.target);
            onTyping?.(Boolean(e.target.value.trim()));
          }}
          onInput={(e) => {
            const val = (e.target as HTMLTextAreaElement).value;
            setText(val);
            grow(e.target as HTMLTextAreaElement);
            onTyping?.(Boolean(val.trim()));
          }}
          onCompositionEnd={(e) => {
            const val = (e.target as HTMLTextAreaElement).value;
            setText(val);
            onTyping?.(Boolean(val.trim()));
          }}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              if (e.nativeEvent.isComposing) {
                return;
              }
              e.preventDefault();
              submit();
            }
          }}
        />
        <button
          type="submit"
          className={`${styles.send} ${canSubmit ? styles.ready : ""}`}
          disabled={busy || !canSubmit}
          aria-label={currentText ? "Gửi tin nhắn" : "Tìm căn theo bộ lọc"}
        >
          <Send size={18} />
        </button>
      </form>

      {variant === "rail" ? (
        <div className={styles.railToolbar}>
          <FilterTray criteria={criteria} onChange={onCriteria} compact />
          <div className={styles.quickChips} role="group" aria-label="Gợi ý nhanh">
            {["Studio < 8tr", "Rẻ hơn nữa ⚡", "1PN đủ đồ", "2PN view hồ"].map((p) => (
              <button key={p} type="button" className={styles.quickChip} onClick={() => submit(p)} disabled={busy}>
                {p}
              </button>
            ))}
          </div>
        </div>
      ) : (
        <div className={styles.filterRow}>
          <FilterTray criteria={criteria} onChange={onCriteria} compact />
        </div>
      )}
      {variant === "hero" && filtered && <p className={`muted xs ${styles.footHint}`}>Bấm mũi tên để tìm theo bộ lọc, hoặc gõ thêm ý bạn muốn.</p>}

      {showPrompts && (
        <div className={styles.prompts}>
          {SAMPLE_PROMPTS.map((p) => (
            <button key={p} type="button" className={styles.prompt} onClick={() => submit(p)} disabled={busy}>
              {p}
            </button>
          ))}
        </div>
      )}
      {guestNotice && <p className={`muted xs ${styles.guest}`}>💡 VinStay AI hỗ trợ tìm căn và tư vấn miễn phí 24/7 · Không tin ảo, không phí ẩn.</p>}
    </div>
  );
}

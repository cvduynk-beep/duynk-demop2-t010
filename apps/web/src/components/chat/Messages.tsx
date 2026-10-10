"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import { LayoutList, Sparkles } from "lucide-react";
import { Facade } from "@/components/brand/Facade";
import { fmtTime } from "@/lib/mock/format";
import type { ChatMessage } from "@/lib/mock/types";
import { InlineChatUnits } from "./InlineChatUnits";
import styles from "./Messages.module.css";

function highlightKeywords(str: string): ReactNode {
  const parts = str.split(/(S\d+\.\d+\s*·\s*Tầng\s*\d+\s*·\s*Căn\s*\d+|All-in\s*[\d.]+\s*đ\/tháng|thấp hơn mặt bằng toà\s*\d+%|\d+\s*căn)/g);
  return parts.map((part, i) => {
    if (/S\d+\.\d+\s*·\s*Tầng\s*\d+\s*·\s*Căn\s*\d+/.test(part)) {
      return (
        <strong key={i} className={styles.unitHighlight}>
          {part}
        </strong>
      );
    }
    if (/All-in\s*[\d.]+\s*đ\/tháng/.test(part)) {
      return (
        <strong key={i} className={styles.costHighlight}>
          {part}
        </strong>
      );
    }
    if (/thấp hơn mặt bằng toà\s*\d+%/.test(part)) {
      return (
        <span key={i} className={styles.dealHighlight}>
          {part}
        </span>
      );
    }
    if (/^\d+\s*căn$/.test(part)) {
      return (
        <strong key={i} className={styles.numHighlight}>
          {part}
        </strong>
      );
    }
    return part;
  });
}

function formatAiText(text: string) {
  const sentences = text.split(/(?<=[.?!])\s+/).filter(Boolean);
  if (sentences.length <= 1) {
    return <p className={styles.paragraph}>{highlightKeywords(text)}</p>;
  }

  return sentences.map((s, idx) => (
    <p key={idx} className={styles.paragraph}>
      {highlightKeywords(s)}
    </p>
  ));
}

function Typewriter({ text, onTick, onDone }: { text: string; onTick: () => void; onDone: () => void }) {
  const words = text.split(/(\s+)/);
  const [n, setN] = useState(0);

  useEffect(() => {
    if (n >= words.length) return;
    const t = setTimeout(() => setN((x) => x + 2), 28);
    return () => clearTimeout(t);
  }, [n, words.length]);

  useEffect(() => {
    onTick();
    if (n >= words.length) onDone();
  }, [n, words.length, onTick, onDone]);

  return <>{words.slice(0, n).join("")}</>;
}

interface MessagesProps {
  greeting: string;
  messages: ChatMessage[];
  thinking: { steps: string[] } | null;
  freshId: string | null;
  onFreshDone: () => void;
  onShowResults?: (count: number) => void;
  initialUnitIds?: string[];
  hideInlineUnits?: boolean;
}

export function Messages({ greeting, messages, thinking, freshId, onFreshDone, onShowResults, initialUnitIds, hideInlineUnits }: MessagesProps) {
  const end = useRef<HTMLDivElement>(null);
  const scroll = () => {
    end.current?.scrollIntoView({ block: "end", behavior: "smooth" });
  };

  useEffect(() => {
    scroll();
  }, [messages.length, thinking]);

  return (
    <div className={styles.list} role="log" aria-live="polite" aria-label="Cuộc trò chuyện với VinStay AI">
      <div className={`${styles.row} ${styles.ai}`}>
        <span className={styles.avatar} aria-hidden>
          <Sparkles size={18} />
        </span>
        <div className={styles.col}>
          <div className={styles.bubble}>{formatAiText(greeting)}</div>
        </div>
      </div>

      {messages.map((m) => {
        const mine = m.role === "user";
        const fresh = m.id === freshId;
        return (
          <div key={m.id} className={`${styles.row} ${mine ? styles.me : styles.ai}`}>
            {!mine && (
              <span className={styles.avatar} aria-hidden>
                <Sparkles size={18} />
              </span>
            )}
            <div className={styles.col}>
              <div className={`${styles.bubble} ${mine ? styles.mine : ""}`}>
                {fresh ? (
                  <Typewriter text={m.text} onTick={scroll} onDone={onFreshDone} />
                ) : mine ? (
                  m.text
                ) : (
                  formatAiText(m.text)
                )}
              </div>

              {!mine && m.resultIds && m.resultIds.length > 0 && !fresh && !hideInlineUnits && (
                <InlineChatUnits
                  unitIds={m.resultIds}
                  criteria={m.criteria}
                  onShowResults={onShowResults}
                />
              )}
              <span className={styles.time}>{fmtTime(m.at)}</span>
            </div>
          </div>
        );
      })}

      {thinking && (
        <div className={`${styles.row} ${styles.ai}`} aria-label="VinStay AI đang quét danh sách căn">
          <span className={styles.avatar} aria-hidden>
            <Sparkles size={18} />
          </span>
          <div className={`${styles.bubble} ${styles.thinking}`}>
            <div className={styles.miniFacade}>
              <Facade scanning lit={9} label="" />
            </div>
            <ol className={styles.steps}>
              {thinking.steps.map((s, i) => (
                <li key={s} style={{ animationDelay: `${i * 420}ms` }}>
                  {s}
                </li>
              ))}
            </ol>
          </div>
        </div>
      )}
      <div ref={end} />
    </div>
  );
}

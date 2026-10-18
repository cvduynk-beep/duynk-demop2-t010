"use client";

import { useSyncExternalStore } from "react";
import { DEFAULT_HOUSEHOLD } from "@/lib/pricing/cost";
import type { ChatMessage, ChatState, CriteriaState } from "./types";

/**
 * Lịch sử chat + tiêu chí tìm căn của RIÊNG người đang xem (tiện ích theo trình duyệt, không phải dữ liệu nghiệp vụ):
 * lưu localStorage, mất cũng không sao. Danh sách căn luôn lấy lại từ API theo `criteria`. Hạn mức chat của khách vãng
 * lai do backend đếm (`POST /api/v1/chat`, theo IP), không đếm ở đây.
 */
const KEY = "vinstay.chat.v1";
const MAX_MESSAGES = 60;

export const emptyChat = (): ChatState => ({
  messages: [],
  criteria: { layouts: [], zones: [], buildings: [], items: [], household: { ...DEFAULT_HOUSEHOLD } },
  searched: false,
});

const SERVER_SNAPSHOT = emptyChat();
let snapshot: ChatState | null = null;
const listeners = new Set<() => void>();

function read(): ChatState {
  if (snapshot) return snapshot;
  try {
    const raw = window.localStorage.getItem(KEY);
    const parsed = raw ? (JSON.parse(raw) as Partial<ChatState>) : null;
    snapshot =
      parsed && Array.isArray(parsed.messages) && parsed.criteria
        ? {
            messages: parsed.messages.slice(-MAX_MESSAGES),
            criteria: parsed.criteria,
            searched: Boolean(parsed.searched),
            conversationId: typeof parsed.conversationId === "string" ? parsed.conversationId : undefined,
          }
        : emptyChat();
  } catch {
    snapshot = emptyChat();
  }
  return snapshot;
}

function write(next: ChatState) {
  snapshot = { ...next, messages: next.messages.slice(-MAX_MESSAGES) };
  try {
    window.localStorage.setItem(KEY, JSON.stringify(snapshot));
  } catch {
    // Trình duyệt chặn storage (riêng tư) — vẫn chạy trong bộ nhớ.
  }
  for (const l of listeners) l();
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function useChat(): ChatState {
  return useSyncExternalStore(subscribe, read, () => SERVER_SNAPSHOT);
}

let counter = 0;
const messageId = () => `m-${Date.now().toString(36)}${(counter++).toString(36)}`;

export function chatAppend(message: Omit<ChatMessage, "id" | "at">): string {
  const id = messageId();
  const cur = read();
  write({ ...cur, messages: [...cur.messages, { ...message, id, at: new Date().toISOString() }] });
  return id;
}

/** Cập nhật một tin đã có (👍/👎, đã gửi yêu cầu gặp nhân viên). */
export function chatPatch(id: string, patch: Partial<Omit<ChatMessage, "id" | "at">>) {
  const cur = read();
  write({ ...cur, messages: cur.messages.map((m) => (m.id === id ? { ...m, ...patch } : m)) });
}

export function chatSetSearch(criteria: CriteriaState) {
  write({ ...read(), criteria, searched: true });
}

export function chatSetCriteria(criteria: CriteriaState) {
  write({ ...read(), criteria });
}

export function chatSetConversation(conversationId: string) {
  const cur = read();
  if (cur.conversationId !== conversationId) write({ ...cur, conversationId });
}

export function chatReset() {
  write(emptyChat());
}

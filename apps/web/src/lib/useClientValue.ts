"use client";

import { useSyncExternalStore } from "react";

const noopSubscribe = () => () => {};

/**
 * Giá trị chỉ đọc được ở trình duyệt (window, navigator, URL…): server và lần hydrate đầu dùng `serverValue`, sau đó
 * là `read()` — không cần `setState` trong effect và không lệch markup khi hydrate. `read` phải trả giá trị ổn định
 * (primitive hoặc cùng tham chiếu) giữa các lần gọi.
 */
export function useClientValue<T>(read: () => T, serverValue: T): T {
  return useSyncExternalStore(noopSubscribe, read, () => serverValue);
}

const randomIndexes = new Map<number, number>();

/** Chỉ số ngẫu nhiên trong [0, length), cố định cho cả lần tải trang (ổn định giữa các lần render). */
export function clientRandomIndex(length: number): number {
  let value = randomIndexes.get(length);
  if (value === undefined) {
    value = Math.floor(Math.random() * length);
    randomIndexes.set(length, value);
  }
  return value;
}

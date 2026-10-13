"use client";

import { useSyncExternalStore } from "react";
import { Modal } from "@/components/ui/Modal";
import { PhoneVerifyForm } from "./PhoneVerifyForm";

type Retry = () => void;
type Pending = { retry: Retry; description?: string };

const DEFAULT_DESCRIPTION = "Cần xác thực một lần để nhận ca. Xác thực xong, thao tác bạn vừa bấm sẽ tự chạy lại.";

let pending: Pending | null = null;
const listeners = new Set<() => void>();
const emit = () => listeners.forEach((l) => l());
const subscribe = (l: () => void) => {
  listeners.add(l);
  return () => {
    listeners.delete(l);
  };
};

/**
 * Backend trả `phone_not_verified` cho thao tác "nhận việc": mở hộp thoại xác thực SĐT NGAY TẠI CHỖ (không bắt Host
 * rời màn sang trang Tài khoản). Xác thực xong tự chạy lại đúng thao tác vừa bị chặn.
 */
export function requestPhoneVerify(retry: Retry, description?: string) {
  pending = { retry, description };
  emit();
}

const close = () => {
  pending = null;
  emit();
};

/** Gắn MỘT lần trong shell cổng Host. */
export function PhoneVerifyGate() {
  const req = useSyncExternalStore(subscribe, () => pending, () => null);
  return (
    <Modal open={!!req} onClose={close} title="Xác thực số điện thoại" description={req?.description ?? DEFAULT_DESCRIPTION}>
      <PhoneVerifyForm
        onVerified={() => {
          const run = pending?.retry;
          close();
          run?.();
        }}
      />
    </Modal>
  );
}

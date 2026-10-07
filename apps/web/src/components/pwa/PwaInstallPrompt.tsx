"use client";

import { useEffect, useState } from "react";
import { Download, Share, X } from "lucide-react";
import { LogoMark } from "@/components/brand/Logo";
import styles from "./PwaInstallPrompt.module.css";

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed"; platform: string }>;
}

const DISMISS_KEY = "vinstay_pwa_dismissed_until";
const DISMISS_DAYS = 7;

export function PwaInstallPrompt() {
  const [deferredPrompt, setDeferredPrompt] = useState<BeforeInstallPromptEvent | null>(null);
  const [isIos, setIsIos] = useState(false);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    // 1. Đăng ký Service Worker
    if (typeof window !== "undefined" && "serviceWorker" in navigator) {
      navigator.serviceWorker
        .register("/sw.js")
        .catch((err) => console.debug("[PWA] SW register notice:", err));
    }

    // 2. Kiểm tra nếu đã mở ở chế độ App Standalone hoặc đang ở trang Admin thì không hiện prompt
    if (window.location.pathname.startsWith("/admin")) return;

    const isStandalone =
      window.matchMedia("(display-mode: standalone)").matches ||
      (window.navigator as unknown as { standalone?: boolean }).standalone === true;

    if (isStandalone) return;

    // 3. Kiểm tra xem người dùng có từng tắt prompt gần đây không
    const dismissedUntil = localStorage.getItem(DISMISS_KEY);
    if (dismissedUntil && Number(dismissedUntil) > Date.now()) {
      return;
    }

    // 4. Bắt sự kiện cài đặt trên Android / Chrome
    const handleBeforeInstall = (e: Event) => {
      e.preventDefault();
      setDeferredPrompt(e as BeforeInstallPromptEvent);
      setVisible(true);
    };

    window.addEventListener("beforeinstallprompt", handleBeforeInstall);

    // 5. Kiểm tra iOS Safari
    const ua = window.navigator.userAgent.toLowerCase();
    const isIosDevice = /iphone|ipad|ipod/.test(ua);
    const isSafari = ua.includes("safari") && !ua.includes("crios") && !ua.includes("fxios");

    if (isIosDevice && isSafari) {
      setIsIos(true);
      // Hiện banner sau 3 giây để không che khuất màn hình lúc mới vào
      const timer = setTimeout(() => setVisible(true), 3000);
      return () => {
        clearTimeout(timer);
        window.removeEventListener("beforeinstallprompt", handleBeforeInstall);
      };
    }

    return () => {
      window.removeEventListener("beforeinstallprompt", handleBeforeInstall);
    };
  }, []);

  const handleInstallClick = async () => {
    if (!deferredPrompt) return;
    await deferredPrompt.prompt();
    const choice = await deferredPrompt.userChoice;
    if (choice.outcome === "accepted") {
      setVisible(false);
    }
    setDeferredPrompt(null);
  };

  const handleDismiss = () => {
    setVisible(false);
    const expireTime = Date.now() + DISMISS_DAYS * 24 * 60 * 60 * 1000;
    localStorage.setItem(DISMISS_KEY, expireTime.toString());
  };

  if (!visible) return null;

  return (
    <aside className={styles.banner} role="dialog" aria-label="Cài đặt ứng dụng VinStay AI">
      <div className={styles.iconWrap}>
        <LogoMark size={28} inverse />
      </div>

      <div className={styles.content}>
        <p className={styles.title}>Cài đặt VinStay AI</p>
        {isIos ? (
          <p className={styles.desc}>
            Bấm nút Chia sẻ <Share size={12} className={styles.iosHint} /> ở thanh dưới Safari rồi chọn{" "}
            <strong>&ldquo;Thêm vào MH chính&rdquo;</strong> để dùng như ứng dụng.
          </p>
        ) : (
          <p className={styles.desc}>Cài đặt vào màn hình chính để mở nhanh toàn màn hình và nhận thông báo.</p>
        )}
      </div>

      <div className={styles.actions}>
        {!isIos && deferredPrompt && (
          <button type="button" className={styles.installBtn} onClick={handleInstallClick}>
            <Download size={14} /> Cài đặt
          </button>
        )}
        <button
          type="button"
          className={styles.closeBtn}
          onClick={handleDismiss}
          aria-label="Đóng thông báo cài đặt"
        >
          <X size={16} />
        </button>
      </div>
    </aside>
  );
}

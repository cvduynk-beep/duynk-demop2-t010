"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { CalendarClock, Compass, Heart, Sparkles, User } from "lucide-react";
import { useMock } from "@/lib/mock/store";
import styles from "./MobileBottomNav.module.css";

interface MobileBottomNavProps {
  activeTab?: string;
  onTabChange?: (tab: string) => void;
}

export function MobileBottomNav({ activeTab, onTabChange }: MobileBottomNavProps) {
  const pathname = usePathname();
  const store = useMock();
  const savedCount = store.favorites.length;

  const NAV_ITEMS = [
    { id: "explore", label: "Khám phá", href: "/m", icon: Compass },
    { id: "chat", label: "VinStay AI", href: "/", icon: Sparkles },
    { id: "booking", label: "Lịch xem", href: "/booking", icon: CalendarClock },
    { id: "saved", label: "Đã lưu", href: "/account/saved", icon: Heart, badge: savedCount > 0 ? savedCount : null },
    { id: "account", label: "Tài khoản", href: "/account", icon: User },
  ];

  return (
    <nav className={styles.bottomNav} aria-label="Điều hướng chính ứng dụng di động">
      {NAV_ITEMS.map((item) => {
        const Icon = item.icon;
        const isActive = activeTab
          ? activeTab === item.id
          : item.href === "/"
          ? pathname === "/"
          : pathname.startsWith(item.href);

        if (onTabChange) {
          return (
            <button
              key={item.id}
              type="button"
              className={`${styles.navItem} ${isActive ? styles.navItemActive : ""}`}
              onClick={() => onTabChange(item.id)}
              aria-label={item.label}
              aria-current={isActive ? "page" : undefined}
            >
              <div className={styles.iconWrap}>
                <Icon size={20} />
                {item.badge && <span className={styles.badge}>{item.badge}</span>}
              </div>
              <span>{item.label}</span>
              {isActive && <span className={styles.activeIndicator} />}
            </button>
          );
        }

        return (
          <Link
            key={item.id}
            href={item.href}
            className={`${styles.navItem} ${isActive ? styles.navItemActive : ""}`}
            aria-label={item.label}
            aria-current={isActive ? "page" : undefined}
          >
            <div className={styles.iconWrap}>
              <Icon size={20} />
              {item.badge && <span className={styles.badge}>{item.badge}</span>}
            </div>
            <span>{item.label}</span>
            {isActive && <span className={styles.activeIndicator} />}
          </Link>
        );
      })}
    </nav>
  );
}

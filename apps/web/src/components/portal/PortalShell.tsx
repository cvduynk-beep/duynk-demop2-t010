"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import {
  Building2,
  ChevronDown,
  Compass,
  LogOut,
  Radio,
  Settings,
  Shield,
  UserRound,
  type LucideIcon,
} from "lucide-react";
import { Logo } from "@/components/brand/Logo";
import { signOut } from "@/lib/auth/client";
import { initials } from "@/lib/mock/format";
import styles from "./PortalShell.module.css";

export interface PortalNavChild {
  href: string;
  label: string;
  icon?: LucideIcon;
  description?: string;
}

export interface PortalNavItem {
  href: string;
  label: string;
  icon: LucideIcon;
  badge?: number;
  /** Tiền tố đường dẫn khác cũng tính là mục này đang active, vd ["/host/viewing"]. */
  match?: string[];
  /** Danh sách mục con khi hover/click mở dropdown menu. */
  children?: PortalNavChild[];
}

interface PortalShellProps {
  portal: string;
  userName: string;
  userMeta: string;
  nav: PortalNavItem[];
  children: React.ReactNode;
  /** Đích sau đăng xuất. Mặc định "/login". */
  signOutHref?: string;
  /** Nội dung phụ trong thanh công cụ (ví dụ Host Duty và Chuông thông báo). */
  sideSlot?: React.ReactNode;
  /** Đường dẫn trang Cài đặt (nếu có, hiển thị icon ⚙️ ở góc phải). */
  settingsHref?: string;
  /** Ẩn badge tên cổng cạnh Logo để thanh thương hiệu thoáng đãng. */
  hidePortalBadge?: boolean;
  /** Ẩn nút chuyển cổng Khách thuê trên thanh công cụ (đã tích hợp trong User Menu). */
  hideTenantSwitch?: boolean;
  /** Đường dẫn khi nhấp vào Logo. Mặc định "/". */
  logoHref?: string;
  /** Thu gọn logo theo hướng tối giản (1 dòng duy nhất, icon 26px, ẩn subtext dài). */
  compactLogo?: boolean;
  /** Đường dẫn đến trang Tài khoản cá nhân trong User Dropdown (ví dụ: "/host/account"). */
  accountHref?: string;
}

/** Thuần, export để test: active khi khớp href, href/…, hoặc một tiền tố trong match (khớp p hoặc p/…). */
export function isNavActive(
  pathname: string | null | undefined,
  item: Pick<PortalNavItem, "href" | "match" | "children">,
): boolean {
  if (!pathname) return false;
  if (pathname === item.href || pathname.startsWith(`${item.href}/`)) {
    return true;
  }
  if (item.match) {
    for (const prefix of item.match) {
      if (pathname === prefix || pathname.startsWith(`${prefix}/`)) {
        return true;
      }
    }
  }
  if (item.children) {
    for (const child of item.children) {
      if (pathname === child.href || pathname.startsWith(`${child.href}/`)) {
        return true;
      }
    }
  }
  return false;
}

/** Component từng mục điều hướng trên Desktop, hỗ trợ dropdown menu con. */
function DesktopNavItem({
  item,
  pathname,
}: {
  item: PortalNavItem;
  pathname: string;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const active = isNavActive(pathname, item);
  const { href, label, icon: Icon, badge, children } = item;

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  if (!children || children.length === 0) {
    return (
      <Link
        href={href}
        className={`${styles.navLink} ${active ? styles.navLinkActive : ""}`}
        aria-current={active ? "page" : undefined}
      >
        <Icon size={15} />
        <span>{label}</span>
        {typeof badge === "number" && badge > 0 && <i className={styles.badgeCount}>{badge}</i>}
      </Link>
    );
  }

  return (
    <div
      className={styles.navItemWithDropdown}
      ref={ref}
      onMouseEnter={() => setOpen(true)}
      onMouseLeave={() => setOpen(false)}
    >
      <Link
        href={href}
        className={`${styles.navLink} ${active ? styles.navLinkActive : ""}`}
        aria-current={active ? "page" : undefined}
        onClick={() => setOpen(false)}
      >
        <Icon size={15} />
        <span>{label}</span>
        {typeof badge === "number" && badge > 0 && <i className={styles.badgeCount}>{badge}</i>}
        <span
          role="button"
          tabIndex={0}
          aria-label={`Mở danh mục ${label}`}
          className={styles.dropdownChevronWrap}
          onClick={(e) => {
            e.preventDefault();
            e.stopPropagation();
            setOpen((v) => !v);
          }}
          onKeyDown={(e) => {
            if (e.key === "Enter" || e.key === " ") {
              e.preventDefault();
              e.stopPropagation();
              setOpen((v) => !v);
            }
          }}
        >
          <ChevronDown size={13} className={`${styles.dropdownChevron} ${open ? styles.chevronOpen : ""}`} />
        </span>
      </Link>

      {open && (
        <div className={styles.navDropdownMenu} role="menu">
          {children.map((child) => {
            const childActive = pathname === child.href || pathname.startsWith(`${child.href}/`);
            const ChildIcon = child.icon ?? Icon;
            return (
              <Link
                key={child.href}
                href={child.href}
                className={`${styles.navDropdownItem} ${childActive ? styles.navDropdownItemActive : ""}`}
                role="menuitem"
                onClick={() => setOpen(false)}
              >
                <div className={styles.dropdownItemIconWrap}>
                  <ChildIcon size={16} />
                </div>
                <div className={styles.dropdownItemTextWrap}>
                  <strong>{child.label}</strong>
                  {child.description && <span>{child.description}</span>}
                </div>
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}

/** Menu User Dropdown mở khi bấm vào avatar góc phải. */
function UserMenuDropdown({
  userName,
  userMeta,
  portal,
  signOutHref,
  settingsHref,
  accountHref,
  pathname,
}: {
  userName: string;
  userMeta: string;
  portal: string;
  signOutHref?: string;
  settingsHref?: string;
  accountHref?: string;
  pathname?: string;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const shortName = userName.split(" ")[0];

  return (
    <div className={styles.userMenuWrap} ref={ref}>
      <button
        type="button"
        className={`${styles.userTriggerBtn} ${open ? styles.userTriggerActive : ""}`}
        onClick={() => setOpen(!open)}
        aria-expanded={open}
        aria-label="Tài khoản người dùng"
        title={userName}
      >
        <span className={styles.avatarPill}>{initials(userName)}</span>
        <span className={styles.userNameShort}>{shortName}</span>
        <ChevronDown size={13} className={`${styles.userChevron} ${open ? styles.chevronOpen : ""}`} />
      </button>

      {open && (
        <div className={styles.userDropdown} role="menu">
          <div className={styles.userDropdownHeader}>
            <div className={styles.userDropdownAvatar}>{initials(userName)}</div>
            <div className={styles.userDropdownIdentity}>
              <strong className={styles.userDropdownName}>{userName}</strong>
              <span className={styles.userDropdownRole}>{userMeta}</span>
              <span className={styles.userDropdownPortal}>{portal}</span>
            </div>
          </div>

          <div className={styles.userDropdownDivider} />

          {accountHref && (
            <>
              <div className={styles.userDropdownSection}>
                <Link
                  href={accountHref}
                  className={`${styles.userDropdownLink} ${pathname === accountHref ? styles.userDropdownLinkActive : ""}`}
                  onClick={() => setOpen(false)}
                >
                  <UserRound size={15} />
                  <span>Thông tin tài khoản</span>
                </Link>
              </div>
              <div className={styles.userDropdownDivider} />
            </>
          )}

          <div className={styles.userDropdownSection}>
            <span className={styles.userDropdownSectionLabel}>Chuyển cổng giao diện</span>
            <Link href="/" className={styles.userDropdownLink} onClick={() => setOpen(false)}>
              <Compass size={15} />
              <span>Trang Khách thuê (Trang chủ)</span>
            </Link>
            {portal !== "Cổng Field Host" && (
              <Link href="/host/dispatch" className={styles.userDropdownLink} onClick={() => setOpen(false)}>
                <Radio size={15} />
                <span>Cổng Field Host (Thực địa)</span>
              </Link>
            )}
            {portal !== "Cổng chủ nhà" && (
              <Link href="/landlord/dashboard" className={styles.userDropdownLink} onClick={() => setOpen(false)}>
                <Building2 size={15} />
                <span>Cổng Chủ nhà (Ký gửi)</span>
              </Link>
            )}
            {portal !== "Quản trị nền tảng" && (
              <Link href="/admin/dashboard" className={styles.userDropdownLink} onClick={() => setOpen(false)}>
                <Shield size={15} />
                <span>Quản trị nền tảng (Admin)</span>
              </Link>
            )}
          </div>

          {settingsHref && (
            <>
              <div className={styles.userDropdownDivider} />
              <div className={styles.userDropdownSection}>
                <Link href={settingsHref} className={styles.userDropdownLink} onClick={() => setOpen(false)}>
                  <Settings size={15} />
                  <span>Cài đặt hệ thống & Quy chế</span>
                </Link>
              </div>
            </>
          )}

          <div className={styles.userDropdownDivider} />

          <div className={styles.userDropdownSection}>
            <button
              type="button"
              className={styles.userDropdownLogout}
              onClick={() => void signOut(signOutHref ?? "/login")}
            >
              <LogOut size={15} />
              <span>Đăng xuất tài khoản</span>
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

/**
 * Khung giao diện Quản trị / Chủ nhà / Field Host đồng bộ 100% ngôn ngữ thiết kế sang trọng
 * với trang Khách thuê: Thanh điều hướng kính mờ trên cùng (Top Bar), giải phóng không gian
 * toàn màn hình, màu ngọc trai sang trọng, typography mực lagoon và hổ phách.
 */
export function PortalShell({
  portal,
  userName,
  userMeta,
  nav,
  children,
  signOutHref,
  sideSlot,
  settingsHref,
  hidePortalBadge = false,
  hideTenantSwitch = false,
  logoHref,
  compactLogo = false,
  accountHref,
}: PortalShellProps) {
  const pathname = usePathname() || "";

  return (
    <div className={styles.shell}>
      {/* ── Top Bar: Kính mờ siêu thực chuẩn Trang Khách thuê ── */}
      <header className={styles.header}>
        <div className={styles.headerInner}>
          {/* Logo & Portal Badge */}
          <div className={styles.brandGroup}>
            <Logo
              href={logoHref ?? "/"}
              sub={compactLogo ? undefined : "Vinhomes Ocean Park 1"}
              compact={compactLogo}
            />
            {!hidePortalBadge && <span className={styles.portalBadge}>{portal}</span>}
          </div>

          {/* Desktop Navigation Links (Center Dock) */}
          <nav className={styles.desktopNav} aria-label={`Điều hướng ${portal}`}>
            {nav.map((item) => (
              <DesktopNavItem key={item.href} item={item} pathname={pathname} />
            ))}
          </nav>

          {/* Right Group: Host tools + User Menu */}
          <div className={styles.rightGroup}>
            {sideSlot && <div className={styles.sideSlotWrap}>{sideSlot}</div>}

            {!hideTenantSwitch && (
              <Link href="/" className={styles.tenantSwitchBtn} title="Chuyển sang trang Khách thuê">
                <Compass size={15} />
                <span className={styles.tenantSwitchLabel}>Khách thuê</span>
              </Link>
            )}

            <UserMenuDropdown
              userName={userName}
              userMeta={userMeta}
              portal={portal}
              signOutHref={signOutHref}
              settingsHref={settingsHref}
              accountHref={accountHref}
              pathname={pathname}
            />
          </div>
        </div>

        {/* Mobile / Tablet Horizontal Scrollable Nav Strip */}
        <nav className={styles.mobileNavStrip} aria-label={`Điều hướng nhanh ${portal}`}>
          {nav.map((item) => {
            const active = isNavActive(pathname, item);
            const { href, label, icon: Icon, badge, children } = item;
            if (children && children.length > 0) {
              return children.map((child) => {
                const childActive = pathname === child.href || pathname.startsWith(`${child.href}/`);
                const ChildIcon = child.icon ?? Icon;
                return (
                  <Link
                    key={child.href}
                    href={child.href}
                    className={`${styles.mobileNavLink} ${childActive ? styles.mobileNavLinkActive : ""}`}
                    aria-current={childActive ? "page" : undefined}
                  >
                    <ChildIcon size={14} />
                    <span>{child.label}</span>
                  </Link>
                );
              });
            }
            return (
              <Link
                key={href}
                href={href}
                className={`${styles.mobileNavLink} ${active ? styles.mobileNavLinkActive : ""}`}
                aria-current={active ? "page" : undefined}
              >
                <Icon size={14} />
                <span>{label}</span>
                {typeof badge === "number" && badge > 0 && <i className={styles.badgeCount}>{badge}</i>}
              </Link>
            );
          })}
        </nav>
      </header>

      {/* ── Main Canvas: Ambient Pearl Light Background ── */}
      <main className={styles.main}>
        <div className={styles.contentWrap}>{children}</div>
      </main>
    </div>
  );
}

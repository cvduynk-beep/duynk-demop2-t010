"use client";

import { useEffect } from "react";
import { Banknote, Building2, FilePlus2, LayoutDashboard, UserCircle2 } from "lucide-react";
import { loginPathFor } from "@/lib/auth/portals";
import { useSession } from "@/lib/auth/client";
import { queries } from "@/lib/landlord/queries";
import { setLandlordCacheOwner, useLandlordQuery } from "@/lib/landlord/useLandlordQuery";
import { PortalShell } from "./PortalShell";

export function LandlordShell({ children }: { children: React.ReactNode }) {
  const session = useSession();
  // Cache dữ liệu chủ nhà gắn với người đang đăng nhập; đổi tài khoản thì bỏ cache cũ.
  const userId = session.user?.id;
  useEffect(() => setLandlordCacheOwner(userId), [userId]);
  // Số bước xác thực còn thiếu (chưa đủ thì chưa ký gửi được) — hiện trên mục "Tài khoản".
  const verification = useLandlordQuery(queries.verification);
  const missing = verification.state.status === "ready" ? verification.state.data.missing.length : 0;
  return (
    <PortalShell
      portal="Cổng chủ nhà"
      hidePortalBadge
      hideTenantSwitch
      compactLogo
      logoHref="/landlord/dashboard"
      userName={session.user?.fullName ?? session.user?.email ?? "Chủ nhà"}
      userMeta="Ký gửi độc quyền"
      signOutHref={loginPathFor("landlord")}
      nav={[
        { href: "/landlord/dashboard", label: "Tổng quan", icon: LayoutDashboard },
        { href: "/landlord/units", label: "Căn hộ", icon: Building2 },
        { href: "/landlord/finance", label: "Khoản thu", icon: Banknote },
        { href: "/landlord/consign", label: "Ký gửi căn mới", icon: FilePlus2 },
        { href: "/landlord/account", label: "Tài khoản", icon: UserCircle2, badge: missing },
      ]}
    >
      {children}
    </PortalShell>
  );
}

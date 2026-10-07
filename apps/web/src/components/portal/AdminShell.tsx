"use client";

import { Building2, FileSignature, Gauge, Radar, Settings, SlidersHorizontal, Users } from "lucide-react";
import { loginPathFor } from "@/lib/auth/portals";
import { useSession } from "@/lib/auth/client";
import { DEMO_USERS } from "@/lib/mock/actors";
import { contractKpis, contractRows } from "@/lib/mock/contracts";
import { useMock } from "@/lib/mock/store";
import { useNow } from "@/lib/useNow";
import { PortalShell } from "./PortalShell";

export function AdminShell({ children }: { children: React.ReactNode }) {
  const state = useMock();
  const now = useNow(60_000);
  const pendingCs = state.consignments.filter((c) => c.status === "reviewing").length;
  const pendingBk = state.bookings.filter((b) => b.status === "pending").length;
  const contractBadge = now ? contractKpis(contractRows(state, now)).needsAction : 0;
  const session = useSession();
  const u = DEMO_USERS.admin;
  return (
    <PortalShell
      portal="Quản trị nền tảng"
      hidePortalBadge
      hideTenantSwitch
      compactLogo
      logoHref="/admin/dashboard"
      userName={session.user?.fullName ?? session.user?.email ?? u.name}
      userMeta="Operations Lead"
      signOutHref={loginPathFor("admin")}
      settingsHref="/admin/settings"
      nav={[
        { href: "/admin/dashboard", label: "Tổng quan", icon: Gauge },
        { href: "/admin/inventory", label: "Căn hộ & ký gửi", icon: Building2, badge: pendingCs },
        { href: "/admin/bookings", label: "Điều phối lịch", icon: Radar, badge: pendingBk },
        { href: "/admin/contracts", label: "Hợp đồng", icon: FileSignature, badge: contractBadge },
        {
          href: "/admin/hosts",
          label: "Field Host",
          icon: Users,
          match: ["/admin/hosts", "/admin/commission"],
          children: [
            {
              href: "/admin/hosts",
              label: "Danh sách Field Host",
              icon: Users,
              description: "Điều phối, phân quyền & KPI trực sảnh",
            },
            {
              href: "/admin/commission",
              label: "Biến phí & Thù lao",
              icon: SlidersHorizontal,
              description: "Cấu hình hoa hồng deal & thưởng nóng",
            },
          ],
        },
      ]}
    >
      {children}
    </PortalShell>
  );
}


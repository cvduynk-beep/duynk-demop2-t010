"use client";

import { BarChart3, Building2, FileSignature, Gauge, Headset, Radar, SlidersHorizontal, Users } from "lucide-react";
import { loginPathFor } from "@/lib/auth/portals";
import { useSession } from "@/lib/auth/client";
import { useDashboardWorkItems } from "@/lib/admin/dashboard";
import { AdminVinnyCopilot } from "@/components/admin/AdminVinnyCopilot";
import { PortalShell } from "./PortalShell";

export function AdminShell({ children }: { children: React.ReactNode }) {
  // Badge = cùng số với "Việc cần xử lý" trên dashboard (/admin/dashboard/work-items). Đang tải/lỗi ⇒ không hiện số.
  const work = useDashboardWorkItems();
  const w = work.state.status === "ready" ? work.state.data : null;
  const pendingCs = w ? w.consignments.total : undefined;
  const pendingBk = w ? w.dispatch.manualDispatch + w.dispatch.overSla : undefined;
  const contractBadge = w ? w.contracts.needsAction : undefined;
  const session = useSession();
  return (
    <PortalShell
      portal="Quản trị nền tảng"
      hidePortalBadge
      hideTenantSwitch
      compactLogo
      logoHref="/admin/dashboard"
      userName={session.user?.fullName ?? session.user?.email ?? "Quản trị viên"}
      userMeta="Operations Lead"
      signOutHref={loginPathFor("admin")}
      settingsHref="/admin/settings"
      nav={[
        { href: "/admin/dashboard", label: "Tổng quan", icon: Gauge },
        { href: "/admin/reports", label: "Báo cáo & KPI", icon: BarChart3 },
        { href: "/admin/inventory", label: "Căn hộ & ký gửi", icon: Building2, badge: pendingCs },
        { href: "/admin/bookings", label: "Điều phối lịch", icon: Radar, badge: pendingBk },
        { href: "/admin/contracts", label: "Hợp đồng", icon: FileSignature, badge: contractBadge },
        { href: "/admin/support", label: "Yêu cầu hỗ trợ", icon: Headset },
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
      <AdminVinnyCopilot />
    </PortalShell>
  );
}


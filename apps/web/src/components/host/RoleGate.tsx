"use client";

import Link from "next/link";
import { EmptyState } from "@/components/ui/EmptyState";
import { DEMO_USERS } from "@/lib/mock/actors";
import { hostRoles, isHostSuspended } from "@/lib/mock/selectors";
import { useMock } from "@/lib/mock/store";
import type { HostRole } from "@/lib/mock/units";

interface RoleGateProps {
  role: HostRole;
  children: React.ReactNode;
}

export function RoleGate({ role, children }: RoleGateProps) {
  const state = useMock();
  if (!state.ready) return <div className="skeleton" style={{ height: 320 }} />;

  const hostId = DEMO_USERS.host.refId!;

  if (isHostSuspended(state, hostId)) {
    return (
      <EmptyState
        title="Tài khoản đang bị tạm đóng"
        description="Quản trị viên đã tạm đóng tài khoản Field Host của bạn. Toàn bộ quyền truy cập và điều phối đã bị vô hiệu hóa. Vui lòng liên hệ Admin để được hỗ trợ."
      />
    );
  }

  const roles = hostRoles(state, hostId);

  if (roles.includes(role)) {
    return <>{children}</>;
  }

  const roleName = role === "sale" ? "Sale" : "Thẩm định";
  const hasInspector = roles.includes("inspector");

  return (
    <EmptyState
      title={`Tài khoản chưa được gán vai ${roleName}`}
      description="Bạn không có quyền truy cập tính năng này. Vui lòng liên hệ Admin để được phân quyền."
      action={
        role === "sale" && hasInspector ? (
          <Link href="/host/inspections" className="btn btn-primary">
            Tới Thẩm định ký gửi
          </Link>
        ) : undefined
      }
    />
  );
}

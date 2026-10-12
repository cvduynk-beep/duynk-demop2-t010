"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { STATUS_META, type Tone } from "@/components/booking/status";
import { DataTable, type DataTableColumn } from "@/components/ui/DataTable";
import { EmptyState } from "@/components/ui/EmptyState";
import { PageHeader } from "@/components/ui/PageHeader";
import { Section } from "@/components/ui/Section";
import { StatusBadge, type StatusTone } from "@/components/ui/StatusBadge";
import { fmtDateTime, vnd } from "@/lib/format";
import { useApiQuery } from "@/lib/query/useApiQuery";
import { splitBookings } from "@/lib/tenant/bookings";
import { tenantQueries } from "@/lib/tenant/queries";
import type { TenantBooking } from "@/lib/tenant/types";
import { unitAddress } from "@/lib/units";

const TONE_MAP: Record<Tone, StatusTone> = { info: "info", success: "ok", warning: "warn", alert: "danger", muted: "neutral" };

/**
 * `/account/bookings`: lịch xem của tài khoản từ `GET /me/bookings` — CÙNG cache với `/booking` (`tenantQueries.bookings`),
 * nên tạo / huỷ lịch ở đâu (đều gọi `invalidateTenantBookings`) cũng làm mới cả hai màn. Không đọc mock store/localStorage.
 */
export function AccountBookings() {
  const query = useApiQuery(tenantQueries.bookings());
  const [tab, setTab] = useState<"upcoming" | "past">("upcoming");
  const groups = useMemo(() => (query.state.status === "ready" ? splitBookings(query.state.data) : null), [query.state]);

  const columns: DataTableColumn<TenantBooking>[] = [
    { key: "ref", header: "Mã", render: (b) => b.ref },
    { key: "unit", header: "Căn", render: (b) => unitAddress(b.unit) },
    { key: "slot", header: "Thời gian", render: (b) => fmtDateTime(b.slot) },
    { key: "host", header: "Field Host", render: (b) => b.host?.name || <span className="muted">Đang điều phối</span> },
    {
      key: "status",
      header: "Trạng thái",
      render: (b) => <StatusBadge tone={TONE_MAP[STATUS_META[b.status].tone]}>{STATUS_META[b.status].label}</StatusBadge>,
    },
    { key: "rent", header: "Giá thuê/tháng", align: "right", render: (b) => `${vnd(b.unit.rent)}đ` },
  ];

  const header = (
    <PageHeader
      title="Lịch xem của tôi"
      description="Theo dõi mọi lịch hẹn xem phòng đã đặt qua VinStay AI."
      actions={
        <Link href="/units" className="btn btn-primary">
          Tìm thêm căn
        </Link>
      }
    />
  );

  if (query.state.status === "loading") {
    return (
      <div>
        {header}
        <div className="skeleton" style={{ height: 320 }} aria-busy="true" />
      </div>
    );
  }

  if (query.state.status === "error") {
    return (
      <div>
        {header}
        <Section>
          <div role="alert" style={{ textAlign: "center", padding: 24 }}>
            <p>{query.state.message}</p>
            <button type="button" className="btn btn-primary btn-sm" onClick={query.reload}>
              Thử lại
            </button>
          </div>
        </Section>
      </div>
    );
  }

  const rows = groups ? (tab === "upcoming" ? groups.upcoming : groups.past) : [];
  const total = groups ? groups.upcoming.length + groups.past.length : 0;

  return (
    <div>
      {header}

      <div className="tabs" role="tablist" style={{ display: "flex", gap: 8, marginBottom: 16 }}>
        <button type="button" role="tab" aria-selected={tab === "upcoming"} className={`btn btn-sm ${tab === "upcoming" ? "btn-quiet" : "btn-ghost"}`} onClick={() => setTab("upcoming")}>
          Sắp tới ({groups?.upcoming.length ?? 0})
        </button>
        <button type="button" role="tab" aria-selected={tab === "past"} className={`btn btn-sm ${tab === "past" ? "btn-quiet" : "btn-ghost"}`} onClick={() => setTab("past")}>
          Đã qua ({groups?.past.length ?? 0})
        </button>
      </div>

      <Section flush>
        <DataTable
          columns={columns}
          rows={rows}
          rowHref={(b) => `/booking/${b.ref}`}
          empty={
            <EmptyState
              title={total === 0 ? "Bạn chưa có lịch xem nào" : tab === "upcoming" ? "Không có lịch sắp tới" : "Chưa có lịch nào đã qua"}
              description={
                total === 0
                  ? "Tìm một căn ưng ý và đặt lịch xem, Field Host sẽ đón bạn tại sảnh."
                  : tab === "upcoming"
                  ? "Các lịch đã xem, đã huỷ hoặc đã ký hợp đồng nằm ở tab Đã qua."
                  : "Lịch đã xem xong, đã huỷ hoặc đã ký hợp đồng sẽ hiện ở đây."
              }
              action={
                <Link href="/units" className="btn btn-primary">
                  Tìm căn
                </Link>
              }
              art
            />
          }
        />
      </Section>
    </div>
  );
}

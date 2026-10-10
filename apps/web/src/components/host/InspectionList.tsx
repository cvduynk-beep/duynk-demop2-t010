"use client";

import Link from "next/link";
import { PageHeader } from "@/components/ui/PageHeader";
import { Section } from "@/components/ui/Section";
import { StatTile } from "@/components/charts/StatTile";
import { DataTable } from "@/components/ui/DataTable";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { EmptyState } from "@/components/ui/EmptyState";
import { toast } from "@/components/ui/Toast";
import { CONSIGN_STATUS_META } from "@/components/consign/status";
import { hostAcceptInspection } from "@/lib/mock/actions";
import { DEMO_USERS } from "@/lib/mock/actors";
import { fmtDateTime } from "@/lib/mock/format";
import { useEffect, useState } from "react";
import { hostInspections, isInspectOverdue } from "@/lib/mock/selectors-inspection";
import { setMockState, useMock } from "@/lib/mock/store";
import type { Consignment } from "@/lib/mock/types";
import { landlordById, zoneOfBuilding, ZONES, type LayoutKind } from "@/lib/mock/units";
import { useNow } from "@/lib/useNow";

import { useSession } from "@/lib/auth/client";
import { hostRoles, hostZones } from "@/lib/mock/selectors";

const DEFAULT_HOST_ID = DEMO_USERS.host.refId!;

function parseLayoutKind(layout: string): LayoutKind {
  if (layout === "STUDIO" || layout === "Studio") return "Studio";
  if (layout === "ONE_BED_PLUS" || layout === "1PN") return "1PN";
  if (layout === "TWO_BED_ONE_BATH" || layout === "TWO_BED_TWO_BATH" || layout === "2PN") return "2PN";
  if (layout === "THREE_BED" || layout === "3PN") return "3PN";
  return "2PN";
}

export function InspectionList() {
  const state = useMock();
  const session = useSession();
  const now = useNow(10_000);
  const [dbItems, setDbItems] = useState<Consignment[]>([]);
  const [zoneFilter, setZoneFilter] = useState<string>("all");

  // Tự động kéo các căn đã ký gửi thực tế từ Backend Database về
  useEffect(() => {
    let unmounted = false;
    async function loadDbInspections() {
      try {
        const res = await fetch("/api/v1/host/inspections", { credentials: "same-origin" });
        if (!res.ok) return;
        const data = await res.json();
        const list = Array.isArray(data) ? data : data?.data;
        if (!Array.isArray(list) || unmounted) return;

        const mapped: Consignment[] = list.map((item: any) => {
          const parts = (item.unitCode || "").split("-");
          const doorPart = parts[2] || "";
          const doorNum = doorPart.replace(new RegExp(`^${item.floor}`), "") || "01";
          return {
            id: item.consignmentId || item.id,
            landlordId: item.landlordName || "Chủ nhà Ocean Park",
            building: item.building,
            floor: item.floor,
            door: doorNum.padStart(2, "0"),
            layout: parseLayoutKind(item.layout),
            areaM2: item.carpetAreaM2 || 45,
            askRent: item.askRent || 6000000,
            suggestedDeposit: item.askRent || 6000000,
            leaseTerm: "long",
            furnished: true,
            locks: ["smart"],
            auditByHost: true,
            status: (item.status as any) || "awaiting_host",
            createdAt: item.createdAt || new Date().toISOString(),
            signedAt: item.createdAt || new Date().toISOString(),
            hostId: item.hostId || undefined,
            inspectDueAt: new Date(new Date(item.createdAt || Date.now()).getTime() + 48 * 3600000).toISOString(),
            furnishing: item.report?.furnishing || "full",
            lock: "smart",
            items: [],
            note: item.note || undefined,
            report: item.report
              ? {
                  furnishing: item.report.furnishing || "full",
                  netAreaM2: item.report.netAreaM2 || item.carpetAreaM2 || 45,
                  inventory: Array.isArray(item.report.inventory) ? item.report.inventory : [],
                  declared: Array.isArray(item.report.declared)
                    ? item.report.declared
                    : [
                        { field: "identity", ok: true },
                        { field: "layout", ok: true },
                        { field: "areaM2", ok: true },
                        { field: "furnishing", ok: true },
                        { field: "lock", ok: true },
                      ],
                  recommendation: item.report.recommendation || "approve",
                  note: item.report.note || "",
                  submittedAt: item.report.submittedAt || new Date().toISOString(),
                  hostId: item.report.hostId || item.hostId || "host-s2",
                }
              : undefined,
          };
        });

        if (!unmounted) {
          setDbItems(mapped);
          setMockState((s) => {
            const nextConsignments = [...s.consignments];
            for (const m of mapped) {
              const idx = nextConsignments.findIndex((item) => item.id === m.id);
              if (idx >= 0) {
                nextConsignments[idx] = { ...nextConsignments[idx], ...m };
              } else {
                nextConsignments.push(m);
              }
            }
            return { ...s, consignments: nextConsignments };
          });
        }
      } catch {
        // bỏ qua nếu offline
      }
    }
    loadDbInspections();
    return () => {
      unmounted = true;
    };
  }, []);

  // Xác định Host ID hiện tại (từ session hoặc demo user)
  const currentHostId = session.user?.pendingHostId || DEFAULT_HOST_ID;
  const isInspector = hostRoles(state, currentHostId).includes("inspector");
  const myZones = hostZones(state, currentHostId);

  // Hiển thị các ca gán trực tiếp cho Host hoặc thuộc phân khu mà Host có quyền thẩm định
  const validStatuses = new Set([
    "awaiting_host",
    "inspecting",
    "reviewing",
    "approved",
    "rejected",
  ]);

  // Hợp nhất dữ liệu mock và dữ liệu thực từ Database (ưu tiên DB thực)
  const allConsignments = [...state.consignments];
  for (const dbItem of dbItems) {
    const existingIdx = allConsignments.findIndex(
      (c) => c.id === dbItem.id || (c.building === dbItem.building && c.floor === dbItem.floor && c.door === dbItem.door)
    );
    if (existingIdx >= 0) {
      allConsignments[existingIdx] = { ...allConsignments[existingIdx], ...dbItem };
    } else {
      allConsignments.push(dbItem);
    }
  }

  const items = allConsignments
    .filter((c) => {
      if (!validStatuses.has(c.status)) return false;

      // Bộ lọc phân khu do người dùng chọn trên giao diện
      const zone = zoneOfBuilding(c.building);
      if (zoneFilter !== "all") {
        if (zoneFilter === "my") {
          if (!zone || !myZones.includes(zone.id)) return false;
        } else if (zone?.id !== zoneFilter) {
          return false;
        }
      }

      // Khi chọn "all", cho phép xem toàn bộ ca thẩm định để hỗ trợ tiếp nhận nhanh
      if (zoneFilter === "all") return true;

      // 1. Căn hộ gán trực tiếp cho Host hiện tại
      if (c.hostId === currentHostId) return true;

      // 2. Nếu Host có quyền thẩm định (inspector):
      if (isInspector) {
        // (a) Căn hộ thuộc phân khu mà Host này phụ trách
        if (zone && myZones.includes(zone.id)) return true;

        // (b) Căn hộ chưa có ai nhận hoặc gán tạm Host mặc định
        if (!c.hostId || c.hostId === DEFAULT_HOST_ID) return true;

        // (c) Host mặc định (H01) hỗ trợ nhận các ca chờ duyệt
        if (currentHostId === DEFAULT_HOST_ID && c.status === "awaiting_host") return true;
      }
      return false;
    })
    .sort((a, b) => {
      const timeA = new Date(a.signedAt ?? a.createdAt).getTime();
      const timeB = new Date(b.signedAt ?? b.createdAt).getTime();
      return timeB - timeA;
    });

  const awaiting = items.filter((c) => c.status === "awaiting_host");
  const inspecting = items.filter((c) => c.status === "inspecting");
  const reviewing = items.filter((c) => c.status === "reviewing");

  // Section "Cần xử lý" = awaiting_host + inspecting, sắp theo inspectDueAt tăng dần
  const activeItems = [...awaiting, ...inspecting].sort((a, b) => {
    const dueA = a.inspectDueAt ? new Date(a.inspectDueAt).getTime() : 0;
    const dueB = b.inspectDueAt ? new Date(b.inspectDueAt).getTime() : 0;
    return dueA - dueB;
  });

  // Section "Đã nộp" = reviewing | approved | rejected
  const submittedItems = items.filter(
    (c) => c.status === "reviewing" || c.status === "approved" || c.status === "rejected",
  );

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "var(--s-6)" }}>
      <PageHeader
        title="Thẩm định ký gửi"
        description="Kiểm tra thực tế căn chủ nhà ký gửi — thẩm định 1 lần, chi phí 0đ cho chủ nhà."
        actions={
          <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
            <span className="small muted">Phân khu:</span>
            <select
              className="select"
              style={{ minWidth: 160, padding: "4px 10px", fontSize: 13 }}
              value={zoneFilter}
              onChange={(e) => setZoneFilter(e.target.value)}
            >
              <option value="all">Tất cả phân khu ({allConsignments.length} ca)</option>
              <option value="my">Phân khu của tôi</option>
              {ZONES.map((z) => (
                <option key={z.id} value={z.id}>
                  {z.name}
                </option>
              ))}
            </select>
          </div>
        }
      />

      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))",
          gap: "var(--s-3)",
        }}
      >
        <StatTile label="Chờ nhận" value={`${awaiting.length} căn`} />
        <StatTile label="Đang thẩm định" value={`${inspecting.length} căn`} />
        <StatTile label="Chờ Admin duyệt" value={`${reviewing.length} căn`} />
      </div>

      <Section title="Cần xử lý" flush>
        <DataTable<Consignment>
          columns={[
            {
              key: "can",
              header: "Căn hộ",
              render: (c) => (
                <strong>
                  {c.building} · Tầng {c.floor} · Căn {c.door}
                </strong>
              ),
            },
            {
              key: "layout",
              header: "Loại · Diện tích",
              render: (c: Consignment) => `${c.layout} · ${c.areaM2} m² tim tường`,
            },
            {
              key: "landlord",
              header: "Chủ nhà",
              render: (c) => landlordById(c.landlordId)?.name ?? c.landlordId,
            },
            {
              key: "due",
              header: "Hạn thẩm định",
              render: (c) => {
                if (!c.inspectDueAt) return "—";
                const isOverdue = isInspectOverdue(c, now);
                if (isOverdue) {
                  return <StatusBadge tone="warn">Quá hạn</StatusBadge>;
                }
                const diffMs = new Date(c.inspectDueAt).getTime() - now;
                const hours = Math.max(0, Math.ceil(diffMs / 3_600_000));
                return <span style={{ fontSize: "var(--fs-13)" }}>Còn {hours}h</span>;
              },
            },
            {
              key: "status",
              header: "Trạng thái",
              render: (c) => {
                const meta = CONSIGN_STATUS_META[c.status];
                return <StatusBadge tone={meta.tone}>{meta.label}</StatusBadge>;
              },
            },
            {
              key: "action",
              header: "Hành động",
              align: "right",
              render: (c) => {
                if (c.status === "awaiting_host") {
                  return (
                    <button
                      type="button"
                      className="btn btn-primary"
                      style={{ padding: "4px 12px", fontSize: "var(--fs-13)" }}
                      onClick={async (e) => {
                        e.stopPropagation();
                        const acceptHostId = c.hostId || currentHostId;
                        try {
                          await fetch(`/api/v1/host/inspections/${c.id}/accept`, {
                            method: "POST",
                            headers: { "Content-Type": "application/json" },
                            credentials: "same-origin",
                            body: JSON.stringify({ hostId: acceptHostId }),
                          });
                        } catch {
                          // ignore
                        }
                        const res = hostAcceptInspection(c.id, acceptHostId);
                        setDbItems((prev) => prev.map((item) => (item.id === c.id ? { ...item, status: "inspecting" } : item)));
                        toast("Đã nhận thẩm định thành công. Mở phiếu thẩm định khi tới căn.", "success");
                      }}
                    >
                      Nhận thẩm định
                    </button>
                  );
                }
                return (
                  <Link
                    href={`/host/inspections/${c.id}`}
                    className="btn btn-secondary"
                    style={{ padding: "4px 12px", fontSize: "var(--fs-13)" }}
                  >
                    Mở phiếu
                  </Link>
                );
              },
            },
          ]}
          rows={activeItems}
          empty={
            <EmptyState
              title="Không có hồ sơ cần xử lý"
              description="Hiện không có căn nào đang chờ bạn nhận hoặc thẩm định thực tế."
            />
          }
        />
      </Section>

      <Section title="Đã nộp" flush>
        <DataTable<Consignment>
          columns={[
            {
              key: "can",
              header: "Căn hộ",
              render: (c) => (
                <strong>
                  {c.building} · Tầng {c.floor} · Căn {c.door}
                </strong>
              ),
            },
            {
              key: "layout",
              header: "Loại · Diện tích",
              render: (c: Consignment) => `${c.layout} · ${c.areaM2} m² tim tường`,
            },
            {
              key: "landlord",
              header: "Chủ nhà",
              render: (c) => landlordById(c.landlordId)?.name ?? c.landlordId,
            },
            {
              key: "submittedAt",
              header: "Thời điểm nộp",
              render: (c) =>
                c.report?.submittedAt ? fmtDateTime(c.report.submittedAt) : "—",
            },
            {
              key: "status",
              header: "Trạng thái",
              render: (c) => {
                const meta = CONSIGN_STATUS_META[c.status];
                return <StatusBadge tone={meta.tone}>{meta.label}</StatusBadge>;
              },
            },
          ]}
          rows={submittedItems}
          rowHref={(c) => `/host/inspections/${c.id}`}
          empty={
            <EmptyState
              title="Chưa có hồ sơ đã nộp"
              description="Các báo cáo thẩm định bạn đã hoàn tất sẽ hiển thị tại đây."
            />
          }
        />
      </Section>
    </div>
  );
}

"use client";

import { useMemo, useState } from "react";
import { AlertCircle } from "lucide-react";
import { ContractsSubnav } from "@/components/contracts/ContractsSubnav";
import { StatTile } from "@/components/charts/StatTile";
import { CONTRACT_KIND_META } from "@/components/contracts/status";
import { DataTable, type DataTableColumn } from "@/components/ui/DataTable";
import { PageHeader } from "@/components/ui/PageHeader";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { useContractRegistry, type RegistryKind, type RegistryRow } from "@/lib/admin/api";
import { registryKpis } from "@/lib/admin/contracts";
import { fmtDate, vnd, vndShort } from "@/lib/format";
import { useNow } from "@/lib/useNow";
import { AdminQuery } from "./AdminQuery";
import styles from "./Contracts.module.css";

type TabKind = "all" | RegistryKind;

interface AdminContractsProps {
  initialKind?: string;
}

export function AdminContracts({ initialKind }: AdminContractsProps) {
  const query = useContractRegistry();
  return (
    <div className={styles.page}>
      <PageHeader title="Hợp đồng" description="Sổ hợp đồng uỷ quyền, cọc giữ chỗ, thuê căn hộ và đối tác Field Host trên nền tảng." />
      <ContractsSubnav />
      <AdminQuery query={query} title="Không tải được sổ hợp đồng" height={480}>
        {(rows) => <RegistryBody rows={rows} initialKind={initialKind} />}
      </AdminQuery>
    </div>
  );
}

function RegistryBody({ rows: allRows, initialKind }: { rows: RegistryRow[]; initialKind?: string }) {
  const now = useNow(60_000);

  const defaultTab: TabKind =
    initialKind === "mandate" || initialKind === "holding" || initialKind === "lease" || initialKind === "partnership"
      ? initialKind
      : "all";
  const [tab, setTab] = useState<TabKind>(defaultTab);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [onlyNeedsAction, setOnlyNeedsAction] = useState(false);

  const kpis = useMemo(() => registryKpis(allRows, now), [allRows, now]);

  // Tab counts
  const tabCounts = useMemo(() => {
    return {
      all: allRows.length,
      mandate: allRows.filter((r) => r.kind === "mandate").length,
      holding: allRows.filter((r) => r.kind === "holding").length,
      lease: allRows.filter((r) => r.kind === "lease").length,
      partnership: allRows.filter((r) => r.kind === "partnership").length,
    };
  }, [allRows]);

  // Rows in current tab
  const tabRows = useMemo(() => {
    if (tab === "all") return allRows;
    return allRows.filter((r) => r.kind === tab);
  }, [allRows, tab]);

  // Statuses available in current tab
  const availableStatuses = useMemo(() => {
    const map = new Map<string, string>();
    for (const r of tabRows) map.set(r.status, r.statusLabel);
    return Array.from(map.entries());
  }, [tabRows]);

  // Filtered rows
  const filteredRows = useMemo(() => {
    let rows = tabRows;

    if (onlyNeedsAction) {
      rows = rows.filter((r) => r.needsAction);
    }

    if (statusFilter !== "all") {
      rows = rows.filter((r) => r.status === statusFilter);
    }

    if (search.trim()) {
      const q = search.trim().toLowerCase();
      rows = rows.filter((r) => {
        const docMatch = r.docNumber.toLowerCase().includes(q);
        const unitMatch = r.scope.toLowerCase().includes(q) || (r.unitCode ?? "").toLowerCase().includes(q);
        const partyMatch = r.parties.some((p) => p.name.toLowerCase().includes(q));
        return docMatch || unitMatch || partyMatch;
      });
    }

    return rows;
  }, [tabRows, onlyNeedsAction, statusFilter, search]);

  const columns: DataTableColumn<RegistryRow>[] = [
    {
      key: "docId",
      header: "Số hợp đồng",
      render: (r) => (
        <span className={styles.nowrap}>
          {r.needsAction && <span className={styles.warningDot} title={r.needsAction} />}
          <span className={styles.docIdText}>{r.docNumber}</span>
        </span>
      ),
    },
    {
      key: "kind",
      header: "Loại",
      render: (r) => CONTRACT_KIND_META[r.kind].short,
    },
    {
      key: "unitLabel",
      header: "Căn / Phạm vi",
      render: (r) => r.scope,
    },
    {
      key: "parties",
      header: "Các bên",
      render: (r) => (
        <span>{r.parties.map((p) => p.name).join(" · ")}</span>
      ),
    },
    {
      key: "validity",
      header: "Hiệu lực",
      render: (r) => {
        const startStr = r.startAt ? fmtDate(r.startAt) : "";
        const endStr = r.endAt ? fmtDate(r.endAt) : "";
        if (!startStr && !endStr) return <span className="muted">—</span>;
        return (
          <span className={styles.nowrap}>
            {startStr || "—"} {endStr ? `→ ${endStr}` : ""}
          </span>
        );
      },
    },
    {
      key: "amount",
      header: "Giá trị",
      align: "right",
      render: (r) => {
        if (!r.amount) return <span className="muted">—</span>;
        return <span className={styles.nowrap}>{vnd(r.amount)}đ</span>;
      },
    },
    {
      key: "status",
      header: "Trạng thái",
      render: (r) => <StatusBadge tone={r.tone}>{r.statusLabel}</StatusBadge>,
    },
  ];

  return (
    <>
      <div className={styles.kpis}>
        <StatTile
          label="HĐ thuê hiệu lực"
          value={String(kpis.activeLeases)}
        />
        <StatTile
          label="Sắp hết hạn ≤ 30 ngày"
          value={String(kpis.expiringLeases)}
        />
        <StatTile
          label="Tiền cọc đang giữ"
          value={`${vndShort(kpis.heldDeposits)}đ`}
        />
        <StatTile
          label="Uỷ quyền đang thoát"
          value={String(kpis.exitingMandates)}
        />
      </div>

      <div className={styles.tabs} role="tablist">
        <button
          type="button"
          role="tab"
          aria-selected={tab === "all"}
          className={`${styles.tabBtn} ${tab === "all" ? styles.tabActive : ""}`}
          onClick={() => {
            setTab("all");
            setStatusFilter("all");
          }}
        >
          Tất cả <span className={styles.tabCount}>{tabCounts.all}</span>
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={tab === "mandate"}
          className={`${styles.tabBtn} ${tab === "mandate" ? styles.tabActive : ""}`}
          onClick={() => {
            setTab("mandate");
            setStatusFilter("all");
          }}
        >
          Uỷ quyền <span className={styles.tabCount}>{tabCounts.mandate}</span>
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={tab === "holding"}
          className={`${styles.tabBtn} ${tab === "holding" ? styles.tabActive : ""}`}
          onClick={() => {
            setTab("holding");
            setStatusFilter("all");
          }}
        >
          Cọc giữ chỗ <span className={styles.tabCount}>{tabCounts.holding}</span>
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={tab === "lease"}
          className={`${styles.tabBtn} ${tab === "lease" ? styles.tabActive : ""}`}
          onClick={() => {
            setTab("lease");
            setStatusFilter("all");
          }}
        >
          HĐ thuê <span className={styles.tabCount}>{tabCounts.lease}</span>
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={tab === "partnership"}
          className={`${styles.tabBtn} ${tab === "partnership" ? styles.tabActive : ""}`}
          onClick={() => {
            setTab("partnership");
            setStatusFilter("all");
          }}
        >
          Đối tác Host <span className={styles.tabCount}>{tabCounts.partnership}</span>
        </button>
      </div>

      <div className={styles.tools}>
        <div className={styles.search}>
          <input
            type="search"
            className="input"
            placeholder="Tìm theo số HĐ, căn hộ, tên các bên..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            aria-label="Tìm hợp đồng"
          />
        </div>

        <select
          className="select"
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value)}
          aria-label="Lọc trạng thái"
        >
          <option value="all">Mọi trạng thái ({tabRows.length})</option>
          {availableStatuses.map(([st, label]) => (
            <option key={st} value={st}>
              {label} ({tabRows.filter((r) => r.status === st).length})
            </option>
          ))}
        </select>

        <button
          type="button"
          className={`${styles.chipBtn} ${onlyNeedsAction ? styles.chipActive : ""}`}
          onClick={() => setOnlyNeedsAction((v) => !v)}
          aria-pressed={onlyNeedsAction}
        >
          <AlertCircle size={14} />
          Cần xử lý ({kpis.needsAction})
        </button>
      </div>

      <DataTable
        columns={columns}
        rows={filteredRows}
        rowHref={(r) => `/admin/contracts/${r.key}`}
        empty="Không có hợp đồng khớp bộ lọc."
      />
    </>
  );
}

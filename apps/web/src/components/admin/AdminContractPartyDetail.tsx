"use client";

import { useMemo } from "react";
import Link from "next/link";
import { ExternalLink } from "lucide-react";
import { ContractsSubnav } from "@/components/contracts/ContractsSubnav";
import { CONTRACT_KIND_META } from "@/components/contracts/status";
import { StatTile } from "@/components/charts/StatTile";
import { DataTable, type DataTableColumn } from "@/components/ui/DataTable";
import { PageHeader } from "@/components/ui/PageHeader";
import { Section } from "@/components/ui/Section";
import { StatusBadge } from "@/components/ui/StatusBadge";
import {
  TEMPLATE_TYPE_META,
  templatesForParty,
  type ContractTemplate,
} from "@/lib/mock/contract-templates";
import { useContractRegistry, type RegistryRow } from "@/lib/admin/api";
import {
  contractsOfParty,
  isLive,
  parsePartyKey,
  partiesFromRegistry,
  usePartyContact,
  type PartyRelation,
  type PartyRole,
} from "@/lib/admin/contracts";
import { fmtDate, fmtPhone } from "@/lib/format";
import { AdminQuery } from "./AdminQuery";
import styles from "./Contracts.module.css";

interface Props {
  partyKey: string;
}

const ROLE_LABELS: Record<PartyRole, string> = {
  landlord: "Chủ nhà",
  tenant: "Khách thuê",
  host: "Field Host",
};

export function AdminContractPartyDetail({ partyKey }: Props) {
  const query = useContractRegistry();
  return (
    <div className={styles.page}>
      <AdminQuery query={query} title="Không tải được sổ hợp đồng" height={420}>
        {(rows) => <PartyBody rows={rows} partyKey={partyKey} />}
      </AdminQuery>
    </div>
  );
}

function PartyBody({ rows, partyKey }: { rows: RegistryRow[]; partyKey: string }) {
  const parsed = parsePartyKey(partyKey);
  const party = useMemo(() => partiesFromRegistry(rows).find((p) => p.key === partyKey), [rows, partyKey]);
  const relatedContracts = useMemo(() => (parsed ? contractsOfParty(rows, parsed.role, parsed.id) : []), [rows, parsed]);
  // Liên hệ chỉ cho chủ nhà / khách thuê; Field Host xem ở hồ sơ Host.
  const contact = usePartyContact(parsed?.id ?? "-", !!parsed && parsed.role !== "host");
  const partyTemplates = useMemo(() => (party ? templatesForParty(party.role) : []), [party]);

  const groupedTemplates = useMemo(() => {
    const map = new Map<string, ContractTemplate[]>();
    for (const t of partyTemplates) {
      const list = map.get(t.type) ?? [];
      list.push(t);
      map.set(t.type, list);
    }
    return map;
  }, [partyTemplates]);

  if (!party) {
    return (
      <>
        <PageHeader title="Không tìm thấy bên ký" description={`Không có văn bản nào trong sổ gắn với ${partyKey}.`} back={{ href: "/admin/contracts/parties", label: "Danh sách theo bên ký" }} />
        <ContractsSubnav />
      </>
    );
  }

  const c = contact.state.status === "ready" ? contact.state.data : null;
  const contactText = party.role === "host" ? "Field Host" : [c?.phone ? fmtPhone(c.phone) : null, c?.email].filter(Boolean).join(" · ") || "Chưa có liên hệ";
  const liveCount = relatedContracts.filter((x) => isLive(x.row)).length;

  const contractColumns: DataTableColumn<{ row: RegistryRow; relation: PartyRelation }>[] = [
    {
      key: "docId",
      header: "Số HĐ",
      render: (item) => (
        <span className={styles.docIdText}>
          {item.row.docNumber}
        </span>
      ),
    },
    {
      key: "kind",
      header: "Loại",
      render: (item) => (
        <span className={styles.nowrap}>
          {CONTRACT_KIND_META[item.row.kind]?.short ?? item.row.kind}
        </span>
      ),
    },
    {
      key: "unitLabel",
      header: "Căn / Phạm vi",
      render: (item) => item.row.scope,
    },
    {
      key: "relation",
      header: "Quan hệ",
      render: (item) => (
        <StatusBadge tone={item.relation === "signatory" ? "ok" : "info"}>
          {item.relation === "signatory" ? "Bên ký" : "Host phụ trách"}
        </StatusBadge>
      ),
    },
    {
      key: "dates",
      header: "Hiệu lực",
      render: (item) => {
        const start = item.row.startAt ? fmtDate(item.row.startAt) : "—";
        const end = item.row.endAt ? fmtDate(item.row.endAt) : "—";
        return (
          <span className="muted small fontMono">
            {start} → {end}
          </span>
        );
      },
    },
    {
      key: "status",
      header: "Trạng thái",
      render: (item) => <StatusBadge tone={item.row.tone}>{item.row.statusLabel}</StatusBadge>,
    },
  ];

  return (
    <>
      <PageHeader
        title={party.name}
        description={`${ROLE_LABELS[party.role]} · ${contactText}`}
        back={{ href: `/admin/contracts/parties?role=${party.role}`, label: "Danh sách theo bên ký" }}
        actions={
          party.role === "host" ? (
            <Link href={`/admin/hosts/${party.id}`} className="btn btn-secondary btn-sm">
              Hồ sơ Field Host <ExternalLink size={13} />
            </Link>
          ) : undefined
        }
      />

      <ContractsSubnav />

      {/* 3 StatTile KPI */}
      <div className={styles.kpis}>
        <StatTile
          label="Tổng hợp đồng"
          value={String(party.total)}
          delta={{ text: `${party.total} hồ sơ`, tone: "flat" }}
        />
        <StatTile
          label="Đang hiệu lực"
          value={String(liveCount)}
          delta={{ text: `${liveCount} HĐ`, tone: "good" }}
        />
        <StatTile
          label="Cần xử lý"
          value={String(party.needsAction)}
          delta={{
            text: party.needsAction > 0 ? "Cần can thiệp" : "Bình thường",
            tone: party.needsAction > 0 ? "bad" : "flat",
          }}
        />
      </div>

      {/* Danh sách hợp đồng của bên này */}
      <Section
        title={`Hợp đồng liên quan (${relatedContracts.length})`}
        description="Toàn bộ các hợp đồng bên này trực tiếp ký kết hoặc được phân công phụ trách"
      >
        <DataTable
          columns={contractColumns}
          rows={relatedContracts}
          rowHref={(item) => `/admin/contracts/${item.row.key}`}
          empty="Bên này hiện chưa có hợp đồng nào trong hệ thống."
        />
      </Section>

      {/* Danh mục mẫu văn bản áp dụng cho vai này */}
      <Section
        title="Mẫu áp dụng cho vai này"
        description={`Các hợp đồng, phụ lục và chính sách bảo vệ quyền lợi dành riêng cho ${ROLE_LABELS[party.role]}`}
      >
        <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
          {Array.from(groupedTemplates.entries()).map(([type, tList]) => (
            <div key={type}>
              <div
                style={{
                  fontSize: 13,
                  fontWeight: 600,
                  color: "var(--muted)",
                  textTransform: "uppercase",
                  letterSpacing: "0.5px",
                  marginBottom: 8,
                }}
              >
                {TEMPLATE_TYPE_META[type as keyof typeof TEMPLATE_TYPE_META]?.label ?? type}
              </div>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(280px, 1fr))", gap: 10 }}>
                {tList.map((t) => (
                  <Link
                    key={t.id}
                    href={`/admin/contracts/templates/${t.id}`}
                    style={{
                      display: "flex",
                      flexDirection: "column",
                      gap: 4,
                      padding: "10px 14px",
                      borderRadius: "var(--radius-sm, 6px)",
                      background: "var(--surface)",
                      border: "1px solid var(--line)",
                      textDecoration: "none",
                    }}
                  >
                    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                      <span className={styles.docIdText}>{t.id}</span>
                      <ExternalLink size={13} className="muted" />
                    </div>
                    <div style={{ fontSize: 13, fontWeight: 500, color: "var(--ink)" }}>{t.title}</div>
                    {t.refCode && <div className="muted small fontMono">{t.refCode}</div>}
                  </Link>
                ))}
              </div>
            </div>
          ))}
        </div>
      </Section>
    </>
  );
}

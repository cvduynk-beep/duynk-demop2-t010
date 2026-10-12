"use client";

import Link from "next/link";
import type { ReactNode } from "react";
import { Building2, IdCard, ShieldCheck } from "lucide-react";
import { KeyValue } from "@/components/ui/KeyValue";
import { PageHeader } from "@/components/ui/PageHeader";
import { Section } from "@/components/ui/Section";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { fmtDate } from "@/lib/format";
import { queries } from "@/lib/landlord/queries";
import { unitLabel } from "@/lib/landlord/labels";
import type { LandlordVerification } from "@/lib/landlord/types";
import { useLandlordQuery } from "@/lib/landlord/useLandlordQuery";
import { QueryView } from "./QueryView";
import styles from "./Landlord.module.css";

export function LandlordAccount() {
  const profile = useLandlordQuery(queries.profile);
  const units = useLandlordQuery(queries.units);
  const verification = useLandlordQuery(queries.verification);

  return (
    <div className={styles.page}>
      <PageHeader title="Tài khoản" description="Thông tin liên hệ và hợp đồng uỷ quyền của bạn." />

      <Section title="Thông tin chủ nhà">
        <QueryView query={profile} skeleton="form">
          {(p) => (
            <KeyValue
              items={[
                { label: "Họ tên", value: p.fullName ?? "—" },
                {
                  label: "Số điện thoại",
                  value: p.isPhoneVerified ? (
                    <span style={{ display: "inline-flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                      <span className="tnum">{p.phone ? maskPhone(p.phone) : "—"}</span>
                      <StatusBadge tone="ok">Đã xác thực</StatusBadge>
                    </span>
                  ) : (
                    <span style={{ display: "inline-flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                      <StatusBadge tone="warn">Chưa xác thực</StatusBadge>
                      <Link href="/landlord/verify" className="small">Xác thực ngay</Link>
                    </span>
                  ),
                },
                { label: "Email", value: p.email ?? "—" },
                { label: "Tham gia từ", value: fmtDate(p.createdAt) },
              ]}
            />
          )}
        </QueryView>
      </Section>

      <QueryView query={verification} skeleton="cards">
        {(v) => (
          <Section
            title="Xác thực tài khoản"
            description="Định danh chính chủ để ký gửi và nhận tiền thuê. Dữ liệu được mã hoá AES-256, chỉ hiển thị dạng che."
            actions={
              <>
                <StatusBadge tone={v.ready ? "ok" : "warn"}>{v.ready ? "Đủ điều kiện ký gửi" : `Còn ${v.missing.length}/3 bước`}</StatusBadge>
                <Link href="/landlord/verify" className="btn btn-primary btn-sm">
                  <ShieldCheck size={15} /> {v.ready ? "Cập nhật xác thực" : "Xác thực ngay"}
                </Link>
              </>
            }
          >
            <VerificationCards v={v} />
          </Section>
        )}
      </QueryView>

      <Section title="Hợp đồng uỷ quyền" description="Hợp đồng ký gửi độc quyền đã ký cho từng căn." flush>
        <QueryView query={units}>
          {(rows) => {
            const signed = rows.filter((r) => r.mandate?.signedAt && r.mandate.status !== "ended");
            return (
              <div className={styles.contractList}>
                {signed.map((r) => (
                  <div key={r.id} className={styles.contractRow}>
                    <div>
                      <b>{unitLabel(r)}</b>
                      <p className="muted small" style={{ margin: 0 }}>
                        Ký ngày {fmtDate(r.mandate!.signedAt!)}
                      </p>
                    </div>
                  </div>
                ))}
                {signed.length === 0 && <p className="muted small" style={{ padding: "16px 20px" }}>Chưa có hợp đồng ký gửi nào.</p>}
              </div>
            );
          }}
        </QueryView>
      </Section>
    </div>
  );
}

/** `0912345478` ⇒ `0912 *** 478` — cùng dạng che với backend. */
const maskPhone = (phone: string) => {
  const d = phone.replace(/\D/g, "");
  return d.length >= 7 ? `${d.slice(0, 4)} *** ${d.slice(-3)}` : phone;
};

interface VerifyCardProps {
  icon: ReactNode;
  title: string;
  verified: boolean;
  rows: { label: string; value: ReactNode }[];
  empty: string;
}

function VerifyCard({ icon, title, verified, rows, empty }: VerifyCardProps) {
  return (
    <article className={styles.verifyCard}>
      <header className={styles.verifyCardHead}>
        <span className={styles.verifyIcon}>{icon}</span>
        <b>{title}</b>
        <StatusBadge tone={verified ? "ok" : "warn"}>{verified ? "Đã xác thực" : "Chưa xác thực"}</StatusBadge>
      </header>
      {verified ? (
        <dl className={styles.verifyRows}>
          {rows.map((r) => (
            <div key={r.label}>
              <dt>{r.label}</dt>
              <dd>{r.value}</dd>
            </div>
          ))}
        </dl>
      ) : (
        <p className="muted small" style={{ margin: 0 }}>{empty}</p>
      )}
    </article>
  );
}

/** CCCD + tài khoản nhận tiền (SĐT đã nằm ở "Thông tin chủ nhà"); sửa ở trang /landlord/verify. */
function VerificationCards({ v }: { v: LandlordVerification }) {
  const acc = v.payout.account;
  return (
    <div className={styles.verifyGrid}>
      <VerifyCard
        icon={<IdCard size={18} />}
        title="Căn cước công dân (eKYC)"
        verified={v.identity.verified}
        empty="Chụp CCCD 2 mặt để định danh Bên ủy quyền trên hợp đồng ký gửi."
        rows={[
          { label: "Họ và tên", value: v.identity.fullName },
          { label: "Số CCCD", value: <span className="tnum">{v.identity.idNumberMasked}</span> },
          { label: "Nơi thường trú", value: v.identity.address },
          { label: "Ngày xác thực", value: v.identity.verifiedAt ? fmtDate(v.identity.verifiedAt) : "—" },
        ]}
      />
      <VerifyCard
        icon={<Building2 size={18} />}
        title="Tài khoản nhận tiền"
        verified={v.payout.verified && !!acc}
        empty="Thêm tài khoản ngân hàng đứng tên bạn để nhận tiền thuê hằng tháng."
        rows={[
          { label: "Ngân hàng", value: acc?.bankName },
          { label: "Số tài khoản", value: <span className="tnum">{acc?.bankAccountMasked}</span> },
          { label: "Chủ tài khoản", value: acc?.bankAccountHolder },
          { label: "Ngày xác thực", value: v.payout.verifiedAt ? fmtDate(v.payout.verifiedAt) : "—" },
        ]}
      />
    </div>
  );
}

"use client";

import { useState } from "react";
import Link from "next/link";
import { DataTable, type DataTableColumn } from "@/components/ui/DataTable";
import { KeyValue } from "@/components/ui/KeyValue";
import { PageHeader } from "@/components/ui/PageHeader";
import { Section } from "@/components/ui/Section";
import { toast } from "@/components/ui/Toast";
import { apiErrorText } from "@/lib/apiClient";
import { adminApi, useAdminDepositPolicy } from "@/lib/admin/api";
import {
  invalidateSettings,
  updateDefaultHoldHours,
  useFeeRates,
  useHoldPolicy,
  validateDepositPolicy,
  validateHoldHours,
  type HoldAuditEntry,
  type HoldPolicy,
} from "@/lib/admin/settings";
import { useSession } from "@/lib/auth/client";
import { fmtDateTime, vnd } from "@/lib/format";
import { AdminQuery } from "./AdminQuery";
import styles from "./Admin.module.css";

/** Cài đặt: tài khoản quản trị và tham số vận hành nền tảng (đọc/ghi backend, mọi thay đổi có Audit Log). */
export function AdminSettings() {
  const { user } = useSession();
  const hold = useHoldPolicy();

  return (
    <div className={styles.page}>
      <PageHeader title="Cài đặt" description="Tài khoản quản trị và các tham số vận hành nền tảng." />

      <Section title="Tài khoản quản trị">
        <KeyValue
          items={[
            { label: "Họ và tên", value: user?.fullName ?? "—" },
            { label: "Email", value: user?.email ?? "—" },
            { label: "Vai trò", value: user?.role === "ops_admin" ? "Quản trị vận hành" : (user?.role ?? "—") },
          ]}
        />
      </Section>

      <Section
        title="Thời hạn giữ chỗ toàn sàn"
        description="Căn khoá trạng thái giữ chỗ sau khi khách chuyển cọc 2.000.000đ. Chỉ áp cho cọc mới; căn có mức riêng (chỉnh ở chi tiết căn) không đổi."
      >
        <AdminQuery query={hold} title="Không tải được thời hạn giữ chỗ" height={120}>
          {(p) => <HoldHoursForm key={p.defaultHours} policy={p} />}
        </AdminQuery>
      </Section>

      <Section title="Nhật ký thay đổi thời hạn giữ chỗ (10 lần gần nhất)" flush>
        <AdminQuery query={hold} title="Không tải được nhật ký" height={160}>
          {(p) => <HoldAuditTable rows={p.history} />}
        </AdminQuery>
      </Section>

      <DepositPolicySection />

      <FeeRatesSection />

      <Section title="Tham số nền tảng cố định" description="Thay đổi các tham số này cần phê duyệt của ban điều hành.">
        <KeyValue
          items={[
            { label: "Tiền giữ chỗ", value: "2.000.000 đ (chuyển 100% thành cọc bảo đảm khi ký HĐ thuê)" },
            { label: "SLA nhận ca", value: "3 phút" },
            { label: "Open Pool bán kính", value: "500 m" },
            { label: "Báo trước thoát uỷ quyền", value: "15 ngày" },
            { label: "Ngưỡng Căn hời", value: "≥ 10%" },
            { label: "Ngưỡng OCR nhập tay", value: "< 85%" },
          ]}
        />
        <p className="small muted" style={{ marginTop: 12 }}>
          Thù lao và hoa hồng Field Host chỉnh được tại{" "}
          <Link href="/admin/commission" className="link">
            Biến phí Host
          </Link>
          .
        </p>
      </Section>
    </div>
  );
}

function HoldHoursForm({ policy }: { policy: HoldPolicy }) {
  const [hours, setHours] = useState(String(policy.defaultHours));
  const [reason, setReason] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    const invalid = validateHoldHours(hours, policy.min, policy.max);
    if (invalid) return setError(invalid);
    if (!reason.trim()) return setError("Bắt buộc nhập lý do thay đổi.");
    setBusy(true);
    const res = await updateDefaultHoldHours(Number(hours), reason.trim());
    setBusy(false);
    if (!res.ok) return setError(apiErrorText(res, "Chưa lưu được thời hạn giữ chỗ."));
    toast("Đã cập nhật thời hạn giữ chỗ mặc định toàn sàn.", "success");
    setReason("");
    setError("");
    invalidateSettings();
  };

  return (
    <form onSubmit={submit} style={{ maxWidth: 520, display: "flex", flexDirection: "column", gap: 8 }}>
      <p className="small muted" style={{ margin: 0 }}>
        Đang áp dụng: <b>{policy.defaultHours} giờ</b> {policy.source === "default" ? "(chưa cấu hình, dùng mặc định hệ thống)" : ""}
      </p>
      <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
        <input
          type="number"
          min={policy.min}
          max={policy.max}
          step={1}
          className="input"
          value={hours}
          onChange={(e) => {
            setHours(e.target.value);
            setError("");
          }}
          style={{ width: 120 }}
          aria-label={`Thời hạn giữ chỗ mặc định (${policy.min} – ${policy.max} giờ)`}
        />
        <span className="small muted">
          giờ ({policy.min} – {policy.max})
        </span>
      </div>
      <input className="input" placeholder="Lý do thay đổi (lưu Audit)" value={reason} onChange={(e) => setReason(e.target.value)} />
      <div>
        <button type="submit" className="btn btn-primary btn-sm" disabled={busy}>
          {busy ? "Đang lưu…" : "Lưu cài đặt"}
        </button>
      </div>
      {error && <p className="xs" style={{ color: "var(--danger)", margin: 0 }}>{error}</p>}
    </form>
  );
}

function HoldAuditTable({ rows }: { rows: HoldAuditEntry[] }) {
  const columns: DataTableColumn<HoldAuditEntry>[] = [
    { key: "at", header: "Thời gian", render: (a) => fmtDateTime(a.at) },
    { key: "by", header: "Người thực hiện", render: (a) => a.by },
    {
      key: "scope",
      header: "Phạm vi",
      render: (a) =>
        a.scope === "default" ? (
          <b>Mặc định toàn sàn</b>
        ) : a.unitId ? (
          <Link href={`/admin/inventory/${a.unitId}`} className="link">
            Riêng căn {a.unitCode ?? a.unitId}
          </Link>
        ) : (
          "Riêng căn"
        ),
    },
    {
      key: "change",
      header: "Thay đổi",
      render: (a) => (
        <span>
          {a.from !== null ? `${a.from}h` : "—"} → <b>{a.to !== null ? `${a.to}h` : "—"}</b>
          {a.reset && <span className="muted"> (về mặc định)</span>}
        </span>
      ),
    },
    { key: "reason", header: "Lý do", render: (a) => <span className="small muted">{a.reason ?? "—"}</span> },
  ];
  return <DataTable<HoldAuditEntry> columns={columns} rows={rows} empty={<span className="muted">Chưa có lịch sử thay đổi thời hạn giữ chỗ.</span>} />;
}

/** Quy định Tiền cọc bảo đảm (tính theo số tháng tiền thuê) — chủ nhà đề xuất cọc trong khoảng này khi ký gửi. */
function DepositPolicySection() {
  const query = useAdminDepositPolicy();
  return (
    <Section
      title="Quy định Tiền cọc bảo đảm"
      description="Tỷ lệ theo giá thuê tháng (1,0 = 1 tháng). Chủ nhà chỉ đề xuất được mức cọc trong khoảng tối thiểu – tối đa khi ký gửi."
    >
      <AdminQuery query={query} title="Không tải được quy định tiền cọc" height={120}>
        {(p) => <DepositPolicyForm key={`${p.minRatio}-${p.maxRatio}-${p.defaultRatio}`} initial={p} />}
      </AdminQuery>
    </Section>
  );
}

function DepositPolicyForm({ initial }: { initial: { minRatio: number; maxRatio: number; defaultRatio: number } }) {
  const [vals, setVals] = useState({ minRatio: String(initial.minRatio), maxRatio: String(initial.maxRatio), defaultRatio: String(initial.defaultRatio) });
  const [reason, setReason] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    const input = { minRatio: Number(vals.minRatio), maxRatio: Number(vals.maxRatio), defaultRatio: Number(vals.defaultRatio) };
    const invalid = validateDepositPolicy(input);
    if (invalid) return setError(invalid);
    if (!reason.trim()) return setError("Bắt buộc nhập lý do thay đổi.");
    setBusy(true);
    const res = await adminApi.updateDepositPolicy({ ...input, reason: reason.trim() });
    setBusy(false);
    if (!res.ok) return setError(apiErrorText(res, "Chưa lưu được quy định tiền cọc."));
    toast("Đã cập nhật quy định tiền cọc bảo đảm.", "success");
    setReason("");
    setError("");
    invalidateSettings();
  };

  const field = (key: keyof typeof vals, label: string) => (
    <label className="field" style={{ flex: 1, minWidth: 140 }}>
      <span className="label">{label}</span>
      <input
        type="number"
        step={0.1}
        min={0.1}
        max={10}
        className="input"
        value={vals[key]}
        onChange={(e) => {
          setVals((v) => ({ ...v, [key]: e.target.value }));
          setError("");
        }}
      />
    </label>
  );

  return (
    <form onSubmit={submit} style={{ maxWidth: 560, display: "flex", flexDirection: "column", gap: 8 }}>
      <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
        {field("minRatio", "Tối thiểu (× tiền thuê)")}
        {field("defaultRatio", "Khuyến nghị")}
        {field("maxRatio", "Tối đa")}
      </div>
      <input className="input" placeholder="Lý do thay đổi (lưu Audit)" value={reason} onChange={(e) => setReason(e.target.value)} />
      <div>
        <button type="submit" className="btn btn-primary btn-sm" disabled={busy}>
          {busy ? "Đang lưu…" : "Lưu quy định cọc"}
        </button>
      </div>
      {error && <p className="xs" style={{ color: "var(--danger)", margin: 0 }}>{error}</p>}
    </form>
  );
}

function FeeRatesSection() {
  const query = useFeeRates();
  return (
    <Section
      title="Biểu phí tính All-in"
      description="Đơn giá chung dùng khi căn chưa có biểu phí tòa do Field Host xác minh lúc thẩm định. Cùng nguồn với AI Matchmaker."
    >
      <AdminQuery query={query} title="Không tải được biểu phí" height={120}>
        {(r) => (
          <KeyValue
            items={[
              { label: "Phí quản lý BQL", value: `${vnd(r.mgmtFeePerM2)}đ/m²/tháng` },
              { label: "Gửi xe máy", value: `${vnd(r.motorbike)}đ/xe/tháng` },
              { label: "Gửi ô tô", value: `${vnd(r.car)}đ/xe/tháng` },
              { label: "Điện nước", value: `${vnd(r.utilityPerPerson)}đ/người/tháng` },
              {
                label: "Hộ tham chiếu (màn Admin)",
                value: `${r.referenceHousehold.motorbikes} xe máy · ${r.referenceHousehold.cars} ô tô · ${r.referenceHousehold.occupants} người`,
              },
            ]}
          />
        )}
      </AdminQuery>
    </Section>
  );
}

"use client";

import { useEffect, useState, type FormEvent } from "react";
import { Field } from "@/components/ui/Field";
import { PageHeader } from "@/components/ui/PageHeader";
import { Section } from "@/components/ui/Section";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { toast } from "@/components/ui/Toast";
import { accountApi } from "@/lib/apiClient";
import { refreshSession, useSession } from "@/lib/auth/client";
import { fmtDate, fmtPhone } from "@/lib/mock/format";
import { tenantLatestKyc, tenantLatestRefundAccount } from "@/lib/mock/selectors-tenant";
import { setTenantProfile, deleteTenantRefundAccount } from "@/lib/mock/actions";
import { useMock } from "@/lib/mock/store";

export function AccountProfile() {
  const state = useMock();
  const { user } = useSession();
  // SĐT chỉ có khi khách đã nhập và xác thực OTP Zalo (lúc đặt lịch xem). Chưa có thì để trống, không điền số giả.
  const phone = state.tenantProfile?.phone ?? "";
  const [name, setName] = useState(user?.fullName ?? "");
  const [saving, setSaving] = useState(false);
  const [phoneVerified, setPhoneVerified] = useState(false);

  useEffect(() => {
    accountApi.getProfile().then((res) => {
      if (!res.ok || !res.data) return;
      if (res.data.fullName) setName(res.data.fullName);
      setPhoneVerified(Boolean(res.data.isPhoneVerified));
    });
  }, []);

  if (!state.ready) return <div className="skeleton" style={{ height: 320 }} />;

  const kyc = phone ? tenantLatestKyc(state, phone) : undefined;
  const refundAccount = phone ? tenantLatestRefundAccount(state, phone) : undefined;
  const email = user?.email ?? "";

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault();
    const fullName = name.trim();
    if (!fullName) return;
    setSaving(true);
    const res = await accountApi.updateProfile({ fullName });
    setSaving(false);
    if (!res.ok) return toast("Không lưu được thay đổi. Thử lại sau.");
    if (phone) setTenantProfile({ name: fullName, phone }); // giữ tên mặc định khi đặt lịch ở bản mock
    await refreshSession();
    toast("Đã lưu thay đổi", "success");
  };

  return (
    <div>
      <PageHeader title="Hồ sơ của bạn" description="Thông tin dùng để đặt lịch xem và ký hợp đồng." />

      <Section title="Thông tin cá nhân">
        <form className="stack" onSubmit={onSubmit}>
          <Field label="Họ tên">
            <input className="input" value={name} onChange={(e) => setName(e.target.value)} maxLength={100} required />
          </Field>
          <Field
            label="Số điện thoại"
            hint={phone ? undefined : "Bạn sẽ nhập và xác thực số (OTP Zalo) ở lần đặt lịch xem đầu tiên."}
          >
            <div className="row" style={{ display: "flex", alignItems: "center", gap: 10 }}>
              <input className="input" value={phone ? fmtPhone(phone) : ""} placeholder="Chưa có số điện thoại" disabled />
              {phone && (
                <StatusBadge tone={phoneVerified ? "ok" : "warn"}>{phoneVerified ? "Đã xác thực Zalo" : "Chưa xác thực"}</StatusBadge>
              )}
            </div>
          </Field>
          <Field label="Email" hint="Email đăng nhập, không thể thay đổi.">
            <input className="input" type="email" value={email} disabled />
          </Field>
          <button type="submit" className="btn btn-primary" disabled={saving}>
            {saving ? "Đang lưu…" : "Lưu thay đổi"}
          </button>
        </form>
      </Section>

      <Section title="Xác minh danh tính" description="Áp dụng khi bạn đặt cọc giữ chỗ căn hộ.">
        {kyc ? (
          <p>
            <StatusBadge tone="ok">Đã xác minh CCCD ngày {fmtDate(kyc.verifiedAt)}</StatusBadge>
          </p>
        ) : (
          <p>
            <StatusBadge tone="neutral">Chưa xác minh — sẽ làm khi đặt cọc</StatusBadge>
          </p>
        )}
      </Section>

      <Section title="Tài khoản ngân hàng nhận hoàn cọc" description="Thông tin dùng để hoàn cọc tự động khi thanh lý hợp đồng.">
        {refundAccount ? (
          <div style={{ display: "flex", flexDirection: "column", gap: 6, fontSize: 13.5 }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", flexWrap: "wrap", gap: 8 }}>
              <div>
                <div>
                  Ngân hàng: <b>{refundAccount.bankName}</b> · Số tài khoản: <b>{refundAccount.accountNo}</b>
                </div>
                <div>
                  Chủ tài khoản: <b>{refundAccount.holderName}</b>
                </div>
              </div>
              <button
                type="button"
                className="btn btn-quiet btn-xs"
                style={{ color: "var(--danger)" }}
                onClick={() => {
                  deleteTenantRefundAccount(phone);
                  toast("Đã xóa tài khoản nhận hoàn cọc", "success");
                }}
              >
                Xóa tài khoản đã lưu
              </button>
            </div>
            <p className="muted small" style={{ margin: "4px 0 0", color: "var(--kelp)" }}>
              ✓ Thông tin tài khoản đã được lưu và sẽ tự động điền khi bạn thuê thêm căn hộ mới.
            </p>
          </div>
        ) : (
          <p>
            <StatusBadge tone="neutral">Chưa lưu — hệ thống sẽ tự động lưu sau lần đầu bạn nhập khi ký hợp đồng thuê</StatusBadge>
          </p>
        )}
      </Section>
    </div>
  );
}

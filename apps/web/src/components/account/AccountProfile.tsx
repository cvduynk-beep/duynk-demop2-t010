"use client";

import { useMemo, useState, type FormEvent } from "react";
import { Field } from "@/components/ui/Field";
import { PageHeader } from "@/components/ui/PageHeader";
import { Section } from "@/components/ui/Section";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { toast } from "@/components/ui/Toast";
import { accountApi, apiErrorText, type ApiProfile } from "@/lib/apiClient";
import { refreshSession } from "@/lib/auth/client";
import { fmtDate, fmtPhone } from "@/lib/format";
import { primeApiData, useApiQuery } from "@/lib/query/useApiQuery";
import { errorText } from "@/lib/tenant/api";
import { latestKyc } from "@/lib/tenant/bookings";
import { validateFullName } from "@/lib/account/profile";
import { tenantQueries } from "@/lib/tenant/queries";

/** Cùng khoá cache với BookingSheet (điền sẵn họ tên / SĐT khi đặt lịch). */
const profileQuery = { key: "tenant:me:profile", fetch: accountApi.getProfile, errorText: (res: Parameters<typeof errorText>[0]) => errorText(res, "Không tải được hồ sơ.") };

/**
 * `/account`: hồ sơ từ `GET /me/profile` (họ tên, email, SĐT + trạng thái xác thực OTP), eKYC từ lịch hẹn
 * (`GET /me/bookings` → `kyc.verifiedAt`). Không đọc mock store. TK hoàn cọc chưa có chỗ lưu trong DB ⇒ ẩn.
 */
export function AccountProfile() {
  const query = useApiQuery<ApiProfile>(profileQuery);
  const bookings = useApiQuery(tenantQueries.bookings());
  const [nameInput, setNameInput] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const kyc = useMemo(() => (bookings.state.status === "ready" ? latestKyc(bookings.state.data) : null), [bookings.state]);

  const header = <PageHeader title="Hồ sơ của bạn" description="Thông tin dùng để đặt lịch xem và ký hợp đồng." />;

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

  const profile = query.state.data;
  const name = nameInput ?? profile.fullName ?? "";
  const phone = profile.phone ?? "";

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (saving) return;
    // Cùng luật với server (2–100 ký tự sau khi bỏ khoảng trắng thừa); server vẫn kiểm lại.
    const fullName = name.trim().replace(/\s+/g, " ");
    const local = validateFullName(fullName);
    setFieldErrors(local ? { fullName: local } : {});
    if (local) return;
    setSaving(true);
    const res = await accountApi.updateProfile({ fullName });
    setSaving(false);
    if (!res.ok) {
      const errs = Object.fromEntries(Object.entries(res.errors ?? {}).filter(([, v]) => typeof v === "string")) as Record<string, string>;
      if (Object.keys(errs).length) setFieldErrors(errs);
      return toast(apiErrorText(res, "Không lưu được thay đổi. Thử lại sau."));
    }
    primeApiData(profileQuery.key, { ...profile, ...(res.data as ApiProfile), fullName });
    setNameInput(null);
    await refreshSession();
    toast("Đã lưu thay đổi", "success");
  };

  return (
    <div>
      {header}

      <Section title="Thông tin cá nhân">
        <form className="stack" onSubmit={onSubmit}>
          <Field label="Họ tên" error={fieldErrors.fullName}>
            <input
              className="input"
              value={name}
              onChange={(e) => {
                setNameInput(e.target.value);
                if (fieldErrors.fullName) setFieldErrors(({ fullName: _drop, ...rest }) => rest);
              }}
              maxLength={100}
              aria-invalid={Boolean(fieldErrors.fullName)}
            />
          </Field>
          <Field label="Số điện thoại" hint={phone ? "Đổi số điện thoại qua bước xác thực OTP khi đặt lịch xem." : "Bạn sẽ nhập và xác thực số (OTP Zalo) ở lần đặt lịch xem đầu tiên."}>
            <div className="row" style={{ display: "flex", alignItems: "center", gap: 10 }}>
              <input className="input" value={phone ? fmtPhone(phone) : ""} placeholder="Chưa có số điện thoại" disabled />
              {phone && <StatusBadge tone={profile.isPhoneVerified ? "ok" : "warn"}>{profile.isPhoneVerified ? "Đã xác thực Zalo" : "Chưa xác thực"}</StatusBadge>}
            </div>
          </Field>
          <Field label="Email" hint="Email đăng nhập, không thể thay đổi.">
            <input className="input" type="email" value={profile.email ?? ""} disabled />
          </Field>
          <button type="submit" className="btn btn-primary" disabled={saving}>
            {saving ? "Đang lưu…" : "Lưu thay đổi"}
          </button>
        </form>
      </Section>

      <Section title="Xác minh danh tính" description="Thực hiện trong thời gian giữ chỗ, trước khi ký hợp đồng thuê.">
        {bookings.state.status === "error" ? (
          <p className="small" role="alert">
            {bookings.state.message}{" "}
            <button type="button" className="btn btn-quiet btn-xs" onClick={bookings.reload}>
              Thử lại
            </button>
          </p>
        ) : bookings.state.status === "loading" ? (
          <p className="muted small">Đang tải…</p>
        ) : kyc ? (
          <p>
            <StatusBadge tone="ok">Đã xác minh CCCD ngày {fmtDate(kyc.verifiedAt)}</StatusBadge>
          </p>
        ) : (
          <p>
            <StatusBadge tone="neutral">Chưa xác minh — sẽ làm sau khi đặt cọc chốt căn</StatusBadge>
          </p>
        )}
      </Section>
    </div>
  );
}

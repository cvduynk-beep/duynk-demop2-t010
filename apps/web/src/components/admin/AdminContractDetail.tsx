"use client";

import { useState } from "react";
import Link from "next/link";
import { ExternalLink } from "lucide-react";
import { ContractsSubnav } from "@/components/contracts/ContractsSubnav";
import { CONTRACT_KIND_META } from "@/components/contracts/status";
import { KeyValue } from "@/components/ui/KeyValue";
import { Modal } from "@/components/ui/Modal";
import { PageHeader } from "@/components/ui/PageHeader";
import { Section } from "@/components/ui/Section";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { toast } from "@/components/ui/Toast";
import { apiErrorText } from "@/lib/apiClient";
import { parseRegistryKey, useContractRegistryDetail, type RegistryDetail } from "@/lib/admin/api";
import { contractActions, invalidateContracts, VOID_NOTE_MAX, VOID_NOTE_MIN } from "@/lib/admin/contracts";
import { templatesForKind } from "@/lib/mock/contract-templates";
import { fmtDate, fmtDateTime, vnd } from "@/lib/format";
import { useNow } from "@/lib/useNow";
import { AdminQuery } from "./AdminQuery";
import styles from "./Contracts.module.css";

interface Props {
  contractKey: string;
}

const ROLE_LABELS: Record<RegistryDetail["parties"][number]["role"], string> = {
  landlord: "Bên Cho Thuê (Chủ nhà)",
  tenant: "Bên Thuê (Khách thuê)",
  host: "Đối tác thực địa (Field Host)",
  platform: "Đơn vị vận hành & làm chứng",
};

const SIGNER_LABELS: Record<string, string> = { landlord: "Chủ nhà", tenant: "Khách thuê", host: "Field Host", platform: "Nền tảng" };

/** Khoá `kind-<id>`; nhận cả dạng cũ `kind.<id>` của link mock. */
const normalizeKey = (key: string) => key.replace(/^(mandate|holding|lease|partnership)\./, "$1-");

export function AdminContractDetail({ contractKey }: Props) {
  const { kind, id } = parseRegistryKey(normalizeKey(contractKey));
  const query = useContractRegistryDetail(kind, id);
  return (
    <div className={styles.page}>
      <AdminQuery query={query} title="Không tải được hợp đồng" height={480}>
        {(d) => <DetailBody d={d} />}
      </AdminQuery>
    </div>
  );
}

function DetailBody({ d }: { d: RegistryDetail }) {
  const now = useNow(60_000);
  const [modal, setModal] = useState<"exit" | "void" | null>(null);
  const [busy, setBusy] = useState(false);
  const kindMeta = CONTRACT_KIND_META[d.kind];
  const exitDue = d.kind === "mandate" && d.status === "EXIT_REQUESTED" && !!d.endAt && now > 0 && Date.parse(d.endAt) <= now;
  const exiting = d.kind === "mandate" && d.status === "EXIT_REQUESTED" && !exitDue;
  const expiringLease = d.kind === "lease" && d.status === "ACTIVE" && !!d.needsAction;

  const remind = async () => {
    setBusy(true);
    const res = await contractActions.remindRenewal(d.id);
    setBusy(false);
    if (!res.ok) return toast(apiErrorText(res, "Chưa gửi được nhắc gia hạn."));
    toast("Đã gửi nhắc gia hạn cho Chủ nhà và Khách thuê.", "success");
  };

  return (
    <>
      <PageHeader
        title={d.docNumber}
        description={`${kindMeta.label} · ${d.scope}`}
        back={{ href: "/admin/contracts", label: "Sổ hợp đồng" }}
        actions={<StatusBadge tone={d.tone}>{d.statusLabel}</StatusBadge>}
      />

      <ContractsSubnav />

      <div className={styles.detailLayout}>
        <div className={styles.mainCol}>
          <Section title="Điều khoản chính">
            <KeyValue items={d.facts.map((f) => ({ label: f.label, value: f.value }))} />
            {d.kind === "holding" && (
              <p className={styles.infoBox} style={{ marginTop: 12 }}>
                Khi ký HĐ thuê chính thức, 100% khoản cọc chốt căn chuyển đổi thành Tiền cọc bảo đảm tài sản — tuyệt đối KHÔNG khấu trừ vào
                tiền thuê tháng đầu tiên.
              </p>
            )}
            {d.kind === "partnership" && (
              <p className="small muted" style={{ marginTop: 12 }}>
                Thù lao cấu hình tại{" "}
                <Link href="/admin/commission" className="link">
                  Biến phí Host →
                </Link>{" "}
                · Hồ sơ{" "}
                <Link href={`/admin/hosts/${d.id}`} className="link">
                  Field Host →
                </Link>
              </p>
            )}
          </Section>

          <Section title="Mốc tiến trình hợp đồng">
            <ul className={styles.events}>
              {d.timeline.map((ev) => (
                <li key={ev.label} className={`${styles.eventItem} ${ev.at ? styles.eventDoneItem : styles.eventPending}`}>
                  <span className={`${styles.eventDot} ${ev.at ? styles.eventDone : ""}`} />
                  <div className={styles.eventContent}>
                    <span className={styles.eventLabel}>{ev.label}</span>
                    <span className={styles.eventTime}>{ev.at ? fmtDateTime(ev.at) : "Chưa thực hiện"}</span>
                  </div>
                </li>
              ))}
            </ul>
          </Section>
        </div>

        <div className={styles.sideCol}>
          {d.needsAction && !exitDue && !expiringLease && (
            <div className={styles.actionSection}>
              <div className={styles.actionTitle}>Cần xử lý</div>
              <p className={styles.actionDesc}>{d.needsAction}</p>
            </div>
          )}

          {exitDue && (
            <div className={`${styles.actionSection} ${styles.actionDue}`}>
              <div className={styles.actionTitle}>Hoàn tất thoát uỷ quyền</div>
              <p className={styles.actionDesc}>Đã đủ 15 ngày báo trước. Xác nhận để chấm dứt uỷ quyền và ngừng niêm yết căn.</p>
              <button type="button" className="btn btn-danger btn-block" onClick={() => setModal("exit")}>
                Hoàn tất thoát uỷ quyền
              </button>
            </div>
          )}

          {exiting && (
            <div className={styles.actionSection}>
              <div className={styles.actionTitle}>Đang đếm ngược 15 ngày</div>
              <p className={styles.actionDesc}>
                Căn vẫn hiển thị để đón nốt khách. Nút hoàn tất mở vào ngày {d.endAt ? fmtDate(d.endAt) : "—"}.
              </p>
              <button type="button" className="btn btn-secondary btn-block" disabled>
                Hoàn tất thoát uỷ quyền (mở khi hết 15 ngày)
              </button>
            </div>
          )}

          {expiringLease && (
            <div className={`${styles.actionSection} ${styles.actionExpiring}`}>
              <div className={styles.actionTitle}>Hợp đồng thuê sắp hết hạn</div>
              <p className={styles.actionDesc}>Còn ≤ 30 ngày. Gửi nhắc đồng thời cho Chủ nhà và Khách thuê để chủ động gia hạn hoặc tìm khách mới.</p>
              <button type="button" className="btn btn-primary btn-block" disabled={busy} onClick={remind}>
                Gửi nhắc gia hạn
              </button>
            </div>
          )}

          {d.kind === "holding" && d.status === "PAID_HOLDING" && (
            <div className={`${styles.actionSection} ${styles.actionDue}`}>
              <div className={styles.actionTitle}>Huỷ cọc chốt căn (Admin)</div>
              <p className={styles.actionDesc}>
                Chủ nhà không giữ cam kết (phạt cọc) hoặc bất khả kháng (hoàn 100%) theo Điều 328 BLDS. Hệ thống ghi nhận yêu cầu, Ops quyết phương án xử lý tiền.
              </p>
              <button type="button" className="btn btn-danger btn-block" onClick={() => setModal("void")}>
                Huỷ cọc chốt căn...
              </button>
            </div>
          )}

          <Section title="Các bên tham gia">
            <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
              {d.parties.map((p, i) => (
                <div key={`${p.role}-${p.id ?? i}`} style={{ borderBottom: i < d.parties.length - 1 ? "1px solid var(--line)" : "none", paddingBottom: 8 }}>
                  <div className="muted small">{d.kind === "holding" && p.role === "host" ? "Host chốt cọc" : ROLE_LABELS[p.role]}</div>
                  <div style={{ fontWeight: 600, color: "var(--ink)", marginTop: 2 }}>
                    {p.id && p.role !== "platform" ? (
                      <Link href={`/admin/contracts/parties/${p.role}.${p.id}`} className="link">
                        {p.name}
                      </Link>
                    ) : (
                      p.name
                    )}
                  </div>
                </div>
              ))}
            </div>
          </Section>

          <Section title="Chứng cứ ký số điện tử">
            {d.evidence ? (
              <div style={{ display: "flex", flexDirection: "column", gap: 8, fontSize: 13 }}>
                <div>
                  <span className="muted">Số định danh: </span>
                  <strong>{d.docNumber}</strong>
                </div>
                <div>
                  <span className="muted">SHA-256: </span>
                  <span className="fontMono" style={{ wordBreak: "break-all" }}>
                    {d.evidence.sha256 ?? "—"}
                  </span>
                </div>
                <div>
                  <span className="muted">Dấu thời gian (TSA): </span>
                  <span>{d.evidence.tsaTime ? fmtDateTime(d.evidence.tsaTime) : "—"}</span>
                </div>
                {d.evidence.signatures.length > 0 ? (
                  d.evidence.signatures.map((sg) => (
                    <div key={`${sg.role}-${sg.signedAt}`}>
                      <span className="muted">{SIGNER_LABELS[sg.role] ?? sg.role} ký: </span>
                      <span>
                        {fmtDateTime(sg.signedAt)} · {sg.method}
                      </span>
                    </div>
                  ))
                ) : (
                  <div className="muted">Chưa có chữ ký nào.</div>
                )}
              </div>
            ) : (
              <p className="small muted">{d.kind === "partnership" ? "Thoả thuận đối tác chưa có bản ký số trong hệ thống." : "Chưa có văn bản ký số."}</p>
            )}
          </Section>

          <Section title="Mẫu áp dụng">
            {(() => {
              const { primary, attached } = templatesForKind(d.kind);
              return (
                <div style={{ display: "flex", flexDirection: "column", gap: 12, fontSize: 13 }}>
                  <div>
                    <div className="muted small" style={{ marginBottom: 4 }}>
                      Mẫu ký chính:
                    </div>
                    <Link href={`/admin/contracts/templates/${primary.id}`} style={{ display: "inline-flex", flexDirection: "column", gap: 2, textDecoration: "none" }}>
                      <div style={{ fontWeight: 600, color: "var(--lagoon)" }}>
                        {primary.id} · {primary.title}
                      </div>
                      {primary.refCode && <div className="muted small fontMono">{primary.refCode}</div>}
                    </Link>
                  </div>
                  {attached.length > 0 && (
                    <div>
                      <div className="muted small" style={{ marginBottom: 6 }}>
                        Văn bản kèm ({attached.length}):
                      </div>
                      <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                        {attached.map((att) => (
                          <Link key={att.id} href={`/admin/contracts/templates/${att.id}`} className="link" style={{ fontSize: 13 }}>
                            <strong>{att.id}</strong> — {att.title}
                          </Link>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              );
            })()}
          </Section>

          {d.unitId && (
            <Section title="Liên kết kho căn hộ">
              <Link href={`/admin/inventory/${d.unitId}`} className="link" style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
                Xem căn {d.scope} trên kho <ExternalLink size={14} />
              </Link>
            </Section>
          )}
        </div>
      </div>

      <CompleteExitModal open={modal === "exit"} d={d} onClose={() => setModal(null)} />
      <VoidHoldModal open={modal === "void"} d={d} onClose={() => setModal(null)} />
    </>
  );
}

function CompleteExitModal({ open, d, onClose }: { open: boolean; d: RegistryDetail; onClose: () => void }) {
  const [busy, setBusy] = useState(false);
  const submit = async () => {
    setBusy(true);
    const res = await contractActions.completeExit(d.id);
    setBusy(false);
    if (!res.ok) return toast(apiErrorText(res, "Chưa hoàn tất được thoát uỷ quyền."));
    toast("Đã chấm dứt uỷ quyền, căn chuyển Ngừng niêm yết.", "success");
    invalidateContracts();
    onClose();
  };
  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Xác nhận hoàn tất thoát uỷ quyền"
      footer={
        <div style={{ display: "flex", gap: 10, justifyContent: "flex-end", width: "100%" }}>
          <button type="button" className="btn btn-secondary" onClick={onClose}>
            Đóng
          </button>
          <button type="button" className="btn btn-danger" disabled={busy} onClick={submit}>
            Xác nhận chấm dứt uỷ quyền
          </button>
        </div>
      }
    >
      <div style={{ display: "flex", flexDirection: "column", gap: 12, fontSize: 14 }}>
        <p>
          Chấm dứt uỷ quyền độc quyền cho căn <strong>{d.scope}</strong>.
        </p>
        <ul style={{ paddingLeft: 20, display: "flex", flexDirection: "column", gap: 6 }}>
          <li>
            Căn chuyển <strong>Ngừng niêm yết</strong>, không còn hiển thị cho Field Host và khách thuê.
          </li>
          <li>Hệ thống từ chối nếu căn đang giữ chỗ hoặc còn hợp đồng thuê hiệu lực.</li>
        </ul>
      </div>
    </Modal>
  );
}

function VoidHoldModal({ open, d, onClose }: { open: boolean; d: RegistryDetail; onClose: () => void }) {
  const [reason, setReason] = useState<"landlord_breach" | "force_majeure">("landlord_breach");
  const [note, setNote] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const amount = d.amount ?? 0;

  const submit = async () => {
    const n = note.trim();
    if (n.length < VOID_NOTE_MIN || n.length > VOID_NOTE_MAX) return setError(`Ghi chú bắt buộc, từ ${VOID_NOTE_MIN} đến ${VOID_NOTE_MAX} ký tự.`);
    setBusy(true);
    const res = await contractActions.voidHold(d.id, reason, n);
    setBusy(false);
    if (!res.ok) return setError(apiErrorText(res, "Chưa ghi nhận được yêu cầu huỷ cọc."));
    toast(res.data.message ?? "Đã ghi nhận yêu cầu huỷ cọc.", "success");
    invalidateContracts();
    setNote("");
    setError("");
    onClose();
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Huỷ cọc chốt căn (Điều 328 BLDS)"
      footer={
        <div style={{ display: "flex", gap: 10, justifyContent: "flex-end", width: "100%" }}>
          <button type="button" className="btn btn-secondary" onClick={onClose}>
            Đóng
          </button>
          <button type="button" className="btn btn-danger" disabled={busy} onClick={submit}>
            Gửi yêu cầu huỷ cọc
          </button>
        </div>
      }
    >
      <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
        <div className="field">
          <span className="label">Lý do huỷ cọc</span>
          <div style={{ display: "flex", flexDirection: "column", gap: 8, marginTop: 4 }}>
            <label style={{ display: "flex", gap: 8, alignItems: "center", cursor: "pointer" }}>
              <input type="radio" name="adminVoidReason" checked={reason === "landlord_breach"} onChange={() => setReason("landlord_breach")} />
              <span>
                <b>Chủ nhà không giữ cam kết</b> (phạt cọc: hoàn {vnd(amount * 2)}đ cho khách)
              </span>
            </label>
            <label style={{ display: "flex", gap: 8, alignItems: "center", cursor: "pointer" }}>
              <input type="radio" name="adminVoidReason" checked={reason === "force_majeure"} onChange={() => setReason("force_majeure")} />
              <span>
                <b>Sự kiện bất khả kháng</b> (hoàn 100% cọc {vnd(amount)}đ cho khách)
              </span>
            </label>
          </div>
        </div>

        <label className="field">
          <span className="label">
            Ghi chú xử lý (bắt buộc, {VOID_NOTE_MIN} – {VOID_NOTE_MAX} ký tự)
          </span>
          <textarea
            className="textarea"
            value={note}
            maxLength={VOID_NOTE_MAX}
            onChange={(e) => {
              setNote(e.target.value);
              if (error) setError("");
            }}
            placeholder="Nêu rõ lý do huỷ và căn cứ chứng từ..."
            rows={3}
          />
          {error && <span className="field-error">{error}</span>}
        </label>
      </div>
    </Modal>
  );
}

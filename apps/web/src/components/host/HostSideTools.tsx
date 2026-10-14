"use client";

import { useState } from "react";
import { Bell } from "lucide-react";
import { Modal } from "@/components/ui/Modal";
import { toast } from "@/components/ui/Toast";
import { hostApi, refreshHost, useHostBoard } from "@/lib/host/api";
import { hostErrorText } from "@/lib/host/logic";
import { accountApi } from "@/lib/apiClient";
import { useApiQuery } from "@/lib/query/useApiQuery";
import styles from "./HostSideTools.module.css";

export function HostSideTools({ sale }: { sale: boolean }) {
  const board = useHostBoard(sale);
  const notifications = useApiQuery({ key: "host-notifications", fetch: accountApi.getNotifications });
  const [bell, setBell] = useState(false);
  const [busy, setBusy] = useState(false);
  const duty = board.state.status === "ready" ? board.state.data.dutyStatus : null;
  const guiding = duty === "BUSY_VIEWING";
  const onDuty = duty === "ONLINE_AVAILABLE" || guiding;
  const noticeRows = notifications.state.status === "ready" ? notifications.state.data : [];

  async function toggle() {
    if (!duty || guiding || busy) return;
    setBusy(true);
    const res = await hostApi.setDuty(onDuty ? "OFF_DUTY" : "ONLINE_AVAILABLE");
    setBusy(false);
    if (!res.ok) toast(hostErrorText(res));
    else toast("Đã cập nhật trạng thái trực.", "success");
    refreshHost();
  }

  return (
    <div className={styles.tools}>
      {sale && (
        <button
          type="button"
          className={`${styles.duty} ${onDuty ? styles.dutyOn : ""}`}
          aria-pressed={onDuty}
          disabled={!duty || guiding || busy}
          title={guiding ? "Đang dẫn khách — chưa tắt trực được" : undefined}
          onClick={() => void toggle()}
        >
          <span className={styles.dot} />
          <span>{!duty ? "Đang tải…" : guiding ? "Đang dẫn khách" : onDuty ? "Đang trực" : "Nghỉ ca"}</span>
        </button>
      )}

      <button
        type="button"
        className={styles.bell}
        aria-label="Thông báo"
        aria-expanded={bell}
        onClick={() => setBell(true)}
      >
        <Bell size={18} />
        <span>Thông báo</span>
        {noticeRows.length > 0 && <i className={styles.badge}>{noticeRows.length}</i>}
      </button>

      <Modal open={bell} onClose={() => setBell(false)} title="Thông báo" variant="center">
        {notifications.state.status === "error" ? (
          <p role="alert" className="small">{notifications.state.message}</p>
        ) : notifications.state.status === "loading" ? (
          <p className={`small muted ${styles.empty}`}>Đang tải thông báo…</p>
        ) : (
          <ul className={styles.list}>
            {noticeRows.length === 0 && <li className={`small muted ${styles.empty}`}>Chưa có thông báo.</li>}
            {noticeRows.map((item, index) => {
              const row = item as Record<string, unknown>;
              const title = typeof row.title === "string" ? row.title : "Thông báo";
              const body = typeof row.body === "string" ? row.body : "";
              const tone = typeof row.tone === "string" ? row.tone : "info";
              return (
                <li key={String(row.id ?? index)} className={`${styles.item} ${styles[`tone-${tone}`] || ""}`}>
                  <b>{title}</b>
                  {body && <p>{body}</p>}
                </li>
              );
            })}
          </ul>
        )}
      </Modal>
    </div>
  );
}

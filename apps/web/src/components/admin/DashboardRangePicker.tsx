"use client";

import { useState } from "react";
import { RANGE_PRESETS, validateRange, type RangeInput } from "@/lib/admin/dashboard";
import styles from "./Admin.module.css";

export type RangeChoice = { mode: "preset"; days: number } | { mode: "custom"; from: string; to: string };

/** Chọn nhanh 7/30/90 ngày hoặc khoảng tuỳ chọn (kiểm trước khi gọi API, tối đa 90 ngày; backend kiểm lại). */
export function DashboardRangePicker({ value, current, today, onChange }: { value: RangeChoice; current: RangeInput; today: string; onChange: (v: RangeChoice) => void }) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState<RangeInput>(current);
  const [errors, setErrors] = useState<Partial<Record<"from" | "to", string>>>({});

  const apply = () => {
    const e = validateRange(draft);
    setErrors(e ?? {});
    if (e) return;
    onChange({ mode: "custom", from: draft.from, to: draft.to });
    setEditing(false);
  };

  return (
    <div className={styles.rangePicker}>
      <div className={styles.rangePresets} role="group" aria-label="Khoảng thời gian">
        {RANGE_PRESETS.map((d) => (
          <button
            key={d}
            type="button"
            className={`btn btn-sm ${value.mode === "preset" && value.days === d ? "btn-primary" : "btn-quiet"}`}
            aria-pressed={value.mode === "preset" && value.days === d}
            onClick={() => {
              setEditing(false);
              setErrors({});
              onChange({ mode: "preset", days: d });
            }}
          >
            {d} ngày
          </button>
        ))}
        <button
          type="button"
          className={`btn btn-sm ${value.mode === "custom" ? "btn-primary" : "btn-quiet"}`}
          aria-pressed={value.mode === "custom"}
          aria-expanded={editing}
          onClick={() => {
            setDraft(current);
            setErrors({});
            setEditing((x) => !x);
          }}
        >
          Tuỳ chọn
        </button>
      </div>
      {editing && (
        <form
          className={styles.rangeForm}
          onSubmit={(e) => {
            e.preventDefault();
            apply();
          }}
          noValidate
        >
          <label>
            <span className="xs muted">Từ ngày</span>
            <input type="date" className="input" value={draft.from} max={today} aria-invalid={!!errors.from} onChange={(e) => setDraft({ ...draft, from: e.target.value })} />
            {errors.from && <span className={`xs ${styles.fieldError}`}>{errors.from}</span>}
          </label>
          <label>
            <span className="xs muted">Đến ngày</span>
            <input type="date" className="input" value={draft.to} max={today} aria-invalid={!!errors.to} onChange={(e) => setDraft({ ...draft, to: e.target.value })} />
            {errors.to && <span className={`xs ${styles.fieldError}`}>{errors.to}</span>}
          </label>
          <button type="submit" className="btn btn-primary btn-sm">
            Áp dụng
          </button>
        </form>
      )}
    </div>
  );
}

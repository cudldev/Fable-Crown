import type { CSSProperties } from "react";
import "./action-cycle.css";

/** The authoritative action duration, drawn as a ring with native progress semantics. */
export function ActionCycle({ label, value, max }: { label: string; value: number; max: number }) {
  return <span className="action-cycle" style={{ "--cycle-progress": Math.max(0, Math.min(1, value / Math.max(1, max))) } as CSSProperties}>
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <circle className="action-cycle-track" cx="12" cy="12" r="9" />
      <circle className="action-cycle-fill" cx="12" cy="12" r="9" pathLength="1" />
      <circle className="action-cycle-centre" cx="12" cy="12" r="2" />
    </svg>
    <progress aria-label={label} value={value} max={max} />
  </span>;
}

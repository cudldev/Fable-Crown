import type { IntentionView } from "./types";
import "./intention-readout.css";

interface Props {
  view: IntentionView;
  waiting: boolean;
  onThoughts: () => void;
  onFocus: () => void;
  onWait: () => void;
}

export function IntentionReadout({
  view,
  waiting,
  onThoughts,
  onFocus,
  onWait,
}: Props) {
  return (
    <section
      className="thought-peek intention-readout"
      aria-label="Alden's current plan"
      data-phase={view.phase}
    >
      <button
        className="plan-open"
        aria-label="Open thoughts"
        onClick={onThoughts}
      >
        <small className="plan-source">
          {waiting
            ? "ALDEN IS PAUSED"
            : view.source === "player"
              ? "YOUR ORDER"
              : "ALDEN’S PLAN"}
          <em>Thoughts ›</em>
        </small>
        <strong className="plan-now">
          <b>Now</b> {view.title}
        </strong>
        <span className="plan-why">
          <b>Why</b> {view.reason}
        </span>
        <span className="plan-next">
          <b>Next</b> {view.next}
        </span>
        {view.progress && (
          <span className="plan-progress">
            {view.phase === "travel" ? (
              <small>{view.progress.label}</small>
            ) : (
              <progress
                aria-label={view.progress.label}
                value={view.progress.value}
                max={view.progress.max}
              />
            )}
          </span>
        )}
      </button>
      <div className="plan-controls">
        <button
          aria-label="Show Alden's destination"
          disabled={!view.targetPosition}
          onClick={onFocus}
        >
          ⌖ Destination
        </button>
        <button
          aria-label={waiting ? "Resume Alden" : "Pause Alden"}
          onClick={onWait}
        >
          {waiting ? "Resume" : "Pause"}
        </button>
      </div>
    </section>
  );
}

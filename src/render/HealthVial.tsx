import { useId } from "react";
import "./health-vial.css";

/** Separate glass and liquid surfaces keep reflections over the empty tube too. */
export function HealthVial({ label, value, max }: { label: string; value: number; max: number }) {
  const id = useId(), liquid = `${id}-liquid`, glass = `${id}-glass`, clip = `${id}-clip`;
  const fraction = Math.max(0, Math.min(1, value / Math.max(1, max)));
  return <span className="health-vial">
    <svg viewBox="0 0 100 12" preserveAspectRatio="none" aria-hidden="true">
      <defs>
        <radialGradient id={liquid} cx=".5" cy=".55" r=".65">
          <stop offset="0" className="vial-liquid-depth" />
          <stop offset=".48" className="vial-liquid-body" />
          <stop offset="1" className="vial-liquid-edge" />
        </radialGradient>
        <linearGradient id={glass} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="white" stopOpacity=".42" />
          <stop offset=".36" stopColor="white" stopOpacity=".03" />
          <stop offset=".65" stopColor="#04161a" stopOpacity=".12" />
          <stop offset="1" stopColor="#04161a" stopOpacity=".6" />
        </linearGradient>
        <clipPath id={clip}><rect x="1.5" y="1.5" width="97" height="9" rx="4.5" /></clipPath>
      </defs>
      <rect className="vial-shell" x=".5" y=".5" width="99" height="11" rx="5.5" />
      <g clipPath={`url(#${clip})`}>
        <rect className="vial-liquid" x="1.5" y="1.5" width={97 * fraction} height="9" rx="4.5" fill={`url(#${liquid})`} />
      </g>
      <rect x="1" y="1" width="98" height="10" rx="5" fill={`url(#${glass})`} />
      <path className="vial-upper-rim" d="M3 4 Q3.5 1.5 7 1.5 H93 Q96.5 1.5 97 4" />
      <path className="vial-lower-rim" d="M4 8 Q5 10.5 8 10.5 H92 Q95 10.5 96 8" />
      <ellipse className="vial-reflection-soft" cx="72" cy="3.3" rx="11" ry="1.6" />
      <ellipse className="vial-reflection-core" cx="72" cy="2.9" rx="3.4" ry="1.15" />
    </svg>
    <progress aria-label={label} value={value} max={max} />
  </span>;
}

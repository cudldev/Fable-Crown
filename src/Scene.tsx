import { useRef, useState } from "react";
import type { GameState, Person } from "./types";
const ink = "#635b45";
function Tree({
  x,
  y,
  s = 1,
  t = 0,
}: {
  x: number;
  y: number;
  s?: number;
  t?: number;
}) {
  return (
    <g transform={`translate(${x} ${y}) scale(${s})`}>
      <ellipse cy="9" rx="30" ry="9" fill="#496b4d" opacity=".12" />
      <path
        d="M-5 8Q1-27-2-59L7-58Q3-25 13 10M2-30-16-54M4-45 20-67"
        fill="#99764e"
        stroke="#655e40"
        strokeWidth="1.4"
      />
      <path
        d={
          t % 2
            ? "M-34-37Q-50-43-43-58Q-55-76-31-84Q-27-106-9-102Q3-126 24-103Q42-106 41-85Q59-71 44-57Q53-40 32-33Q12-19-2-32Q-19-20-34-37Z"
            : "M-37-27Q-22-39-27-45L-36-43Q-23-55-17-70L-24-65Q-11-87 1-116Q15-95 19-81L14-80Q25-66 30-59L24-58Q35-43 45-29Q32-22 16-26Q0-17-12-25Q-27-19-37-27Z"
        }
        fill={["#718350", "#4e7559", "#899357"][t % 3]}
        stroke="#465e43"
        strokeWidth="1.3"
      />
      {Array.from({ length: 8 }, (_, i) => (
        <path
          key={i}
          d={`M${-24 + ((i * 17) % 50)} ${-40 - ((i * 19) % 56)}q${-9 + (i % 3) * 4}-12 8-17q13 0 11 11q-8 13-19 6Z`}
          fill={i % 3 ? "#bdc080" : "#355f48"}
          opacity={i % 3 ? 0.24 : 0.15}
          stroke="none"
        />
      ))}
      <path
        d="M-32-40q11 5 19-1m22 6 21-5M-17-73q10 3 17-4m9-18 9 8"
        fill="none"
        stroke="#c8c48b"
        opacity=".5"
        strokeWidth="2"
        strokeLinecap="round"
      />
      <path
        d="M-9-35 0-49 14-38M1-56 9-73"
        fill="none"
        stroke="#365a42"
        strokeWidth="1.5"
        opacity=".4"
      />
    </g>
  );
}
function Building({
  x,
  y,
  kind,
}: {
  x: number;
  y: number;
  kind: "manor" | "storage" | "forge" | "house";
}) {
  const manor = kind === "manor",
    w = manor ? 150 : 100;
  return (
    <g transform={`translate(${x} ${y})`}>
      <ellipse cy="8" rx={w * 0.7} ry="18" fill="#505e4b" opacity=".18" />
      <path
        d={`M${-w / 2}-65 V0 L15 20 ${w / 2 + 35}-7 V-72`}
        fill="url(#plaster)"
        stroke={ink}
        strokeWidth="2"
      />
      <path d={`M15-65 V20 L${w / 2 + 35}-7 V-72`} fill="#b9aa82" />
      <path
        d={`M${-w / 2 - 15}-66 ${-w / 2 + 25}-${manor ? 127 : 104} ${w / 2 + 14}-${manor ? 135 : 114} ${w / 2 + 47}-71 15-52Z`}
        fill={manor ? "#5d7e95" : kind === "forge" ? "#aa684a" : "#b07850"}
        stroke={ink}
        strokeWidth="2.5"
      />
      <path
        d={`M${-w / 2 + 25}-${manor ? 127 : 104} 15-52 ${w / 2 + 47}-71 M15-52 V18 M${-w / 2}-40 15-23 ${w / 2 + 35}-45`}
        fill="none"
        stroke={ink}
        strokeWidth="3"
      />
      {[-28, 3, 33].map((v, i) => (
        <path
          key={i}
          d={`M${v - 19}-${manor ? 90 : 74} 4-${manor ? 70 : 57}`}
          stroke="#ead6aa"
          opacity=".24"
        />
      ))}
      <path
        d="M-25 6 V-25 Q-13-38-1-22 V14"
        fill="#554c3d"
        stroke={ink}
        strokeWidth="2"
      />
      <path
        d="M29-30v18l17-6v-18Z"
        fill={kind === "forge" ? "#e6a354" : "#768b89"}
        stroke={ink}
      />
      {Array.from({ length: 4 }, (_, i) => (
        <path
          key={`tile-${i}`}
          d={`M${-w / 2 + 16 + i * 5} ${-82 - i * 10}Q-1 ${-70 - i * 10} ${w / 2 + 22 - i * 5} ${-80 - i * 11}`}
          fill="none"
          stroke={manor ? "#b5c0b1" : "#e1b080"}
          strokeWidth="1"
          opacity=".42"
        />
      ))}
      <path
        d={`M${-w / 2 + 10}-59V1M-38-20-2-48M26-25 52-56M15-25V16`}
        fill="none"
        stroke="#716044"
        strokeWidth="3"
        opacity=".7"
      />
      <path
        d="M-28 5V-24Q-14-39-1-22V13M-23-22V3M-15-25V7M-6-22V10"
        fill="none"
        stroke="#b79563"
        strokeWidth="1.2"
      />
      <path
        d="M32-32v14m8-17v15m-11-6 17-6"
        fill="none"
        stroke="#d3c89b"
        strokeWidth="1"
      />
      <path
        d={`M${-w / 2 - 2}-63 14-48 ${w / 2 + 38}-68`}
        fill="none"
        stroke="#d4b584"
        strokeWidth="2"
        opacity=".7"
      />
      {kind === "house" && (
        <>
          <path d="M30-9V0L53-8V-18Z" fill="#a48d53" stroke={ink} />
          <path
            d="M30-15q7-14 11-3 9-19 12-4"
            fill="none"
            stroke="#66805b"
            strokeWidth="4"
          />
        </>
      )}
      {manor && (
        <>
          <path
            d="M-66-91v-75l29-6v92"
            fill="#b5baa8"
            stroke={ink}
            strokeWidth="2"
          />
          <path
            d="m-77-164 25-32 27 26Z"
            fill="#526b7b"
            stroke={ink}
            strokeWidth="2"
          />
          <path d="M-51-193v-35" stroke={ink} />
          <path d="m-50-226 32 4-7 14-25-3" fill="#466681" stroke="#c0a56a" />
          <path d="M-58-138v-12q8-12 12-1v11" fill="#526372" />
        </>
      )}
      {kind === "forge" && (
        <>
          <path
            d="M29-92v-58l20-4v59"
            fill="#9f947b"
            stroke={ink}
            strokeWidth="2"
          />
          <path d="M-42-15q12-29 25 0" fill="#e5a65f" />
          <path
            className="smoke"
            d="M40-157q-23-16 0-31t-2-29"
            fill="none"
            stroke="#eeebd8"
            strokeWidth="12"
            opacity=".65"
          />
        </>
      )}
      {kind === "storage" && (
        <>
          <path d="M-67 7v-29l17-4 11 8v29Z" fill="#a78350" stroke={ink} />
          <path d="M-67-15-39 5m-28 0 28-20" stroke={ink} />
          <ellipse cx="54" cy="2" rx="12" ry="17" fill="#ac8e61" stroke={ink} />
        </>
      )}
    </g>
  );
}
function Actor({
  person: p,
  selected,
  onSelect,
}: {
  person: Person;
  selected: boolean;
  onSelect: () => void;
}) {
  const color =
    p.role === "prince"
      ? "#345f89"
      : p.role === "woodcutter"
        ? "#6c7950"
        : p.role === "miner"
          ? "#75828b"
          : p.role === "smith"
            ? "#a35e42"
            : "#aa8358";
  return (
    <g
      transform={`translate(${p.x} ${p.y})`}
      className="actor"
      tabIndex={0}
      role="button"
      aria-label={`Inspect ${p.name}, ${p.role}`}
      onClick={(e) => {
        e.stopPropagation();
        onSelect();
      }}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") onSelect();
      }}
    >
      <title>
        {p.name} · {p.action}
      </title>
      <circle r="24" cy="-12" fill="transparent" />
      {selected && (
        <ellipse
          rx="16"
          ry="8"
          cy="3"
          fill="none"
          stroke="#f4d48b"
          strokeWidth="2.5"
        />
      )}
      <ellipse rx="10" ry="4" cy="2" fill="#263c37" opacity=".23" />
      <g
        className={
          p.action.toLowerCase().includes("walk") || p.x !== p.targetX
            ? "walking"
            : ""
        }
      >
        <path
          d="m-5-7-2 10m12-10 3 10"
          stroke="#514d42"
          strokeWidth="3"
          strokeLinecap="round"
        />
        <path
          d={
            p.role === "prince"
              ? "M-6-27Q-16-15-14-2L3-5 12-1 7-26Z"
              : "M-6-24-10-6 10-6 6-24Z"
          }
          fill={color}
          stroke={ink}
          strokeWidth="1.3"
        />
        {p.role === "prince" && (
          <path
            d="M-6-25-11-4 3-8"
            fill="none"
            stroke="#d8b766"
            strokeWidth="2"
          />
        )}
        <circle cy="-30" r="6" fill="#ddba8e" stroke={ink} strokeWidth=".8" />
        <path
          d="M-7-31q0-12 13-4l1 5-5-4-8 5"
          fill={p.role === "prince" ? "#a47543" : "#675a43"}
        />
        {p.role === "prince" ? (
          <path d="m-5-38 1-5 4 3 4-4 2 6" fill="#dcbe70" stroke={ink} />
        ) : (
          <path d="m7-18 10-14" stroke="#74644d" strokeWidth="2" />
        )}
        {p.carry && (
          <>
            <path
              d="m5-16 11-2 3 10-11 2Z"
              fill={p.carry.resource === "timber" ? "#9d7546" : "#9faaa3"}
              stroke={ink}
            />
            <circle cx="14" cy="-24" r="2.5" fill="#dfc47a" />
          </>
        )}
      </g>
    </g>
  );
}
export default function Scene({
  state,
  selected,
  onSelect,
  onLandmark,
}: {
  state: GameState;
  selected: number;
  onSelect: (id: number) => void;
  onLandmark: (id: string) => void;
}) {
  const [camera, setCamera] = useState({ x: 0, y: 0, z: 1 });
  const points = useRef(new Map<number, { x: number; y: number }>());
  const pinch = useRef(0);
  const last = useRef({ x: 0, y: 0 });
  const trees = Array.from({ length: 45 }, (_, i) => ({
    x: 60 + ((i * 79) % 290),
    y: 155 + ((i * 67) % 370),
    s: 0.6 + (i % 5) * 0.12,
  }));
  return (
    <div className="world" data-testid="world">
      <svg
        viewBox="0 0 1100 740"
        aria-label="Oakrest village map"
        onPointerDown={(e) => {
          points.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
          last.current = { x: e.clientX, y: e.clientY };
          if (points.current.size === 2) {
            const [a, b] = [...points.current.values()];
            pinch.current = Math.hypot(a.x - b.x, a.y - b.y);
          }
        }}
        onPointerUp={(e) => {
          points.current.delete(e.pointerId);
        }}
        onPointerCancel={(e) => points.current.delete(e.pointerId)}
        onPointerMove={(e) => {
          if (!points.current.has(e.pointerId)) return;
          points.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
          if (points.current.size === 2) {
            const [a, b] = [...points.current.values()];
            const d = Math.hypot(a.x - b.x, a.y - b.y);
            setCamera((c) => ({
              ...c,
              z: Math.max(0.8, Math.min(2.3, (c.z * d) / (pinch.current || d))),
            }));
            pinch.current = d;
          } else {
            const dx = (e.clientX - last.current.x) * 1.1,
              dy = (e.clientY - last.current.y) * 1.1;
            setCamera((c) => ({
              ...c,
              x: Math.max(-300, Math.min(300, c.x + dx)),
              y: Math.max(-200, Math.min(200, c.y + dy)),
            }));
            last.current = { x: e.clientX, y: e.clientY };
          }
        }}
        onWheel={(e) =>
          setCamera((c) => ({
            ...c,
            z: Math.max(0.8, Math.min(2.3, c.z - e.deltaY * 0.001)),
          }))
        }
      >
        <defs>
          <linearGradient id="plaster" x2=".8" y2="1">
            <stop stopColor="#efe0b3" />
            <stop offset=".55" stopColor="#d8c796" />
            <stop offset="1" stopColor="#bdad84" />
          </linearGradient>
          <linearGradient id="land" x2=".2" y2="1">
            <stop stopColor="#dde0bf" />
            <stop offset=".5" stopColor="#c8d1a5" />
            <stop offset="1" stopColor="#b9c393" />
          </linearGradient>
          <linearGradient id="water" x2="1" y2="1">
            <stop stopColor="#b6d0bd" />
            <stop offset=".4" stopColor="#80aaa5" />
            <stop offset="1" stopColor="#779c9f" />
          </linearGradient>
          <filter id="paper">
            <feTurbulence
              type="fractalNoise"
              baseFrequency=".65"
              numOctaves="3"
              stitchTiles="stitch"
            />
            <feColorMatrix type="saturate" values="0" />
            <feComponentTransfer>
              <feFuncA type="linear" slope=".12" />
            </feComponentTransfer>
          </filter>
          <filter id="wash">
            <feTurbulence
              type="fractalNoise"
              baseFrequency=".03"
              numOctaves="2"
              result="noise"
            />
            <feDisplacementMap
              in="SourceGraphic"
              in2="noise"
              scale="3.5"
              result="paint"
            />
          </filter>
        </defs>
        <rect width="1100" height="740" fill="#e9e7cf" />
        <g
          transform={`translate(${550 + camera.x} ${370 + camera.y}) scale(${camera.z}) translate(-550 -370)`}
        >
          <g filter="url(#wash)">
            <path
              d="M-80 210 45 106 95 140 216 44 300 136 430 62 510 158 643 48 767 124 850 66 1010 151 1180 74V400H-80Z"
              fill="#a7c0bb"
            />
            <path
              d="m55 167 161-123 84 92-71-36-28 25-20-14Zm455-9L643 48l124 76-96-37-28 26-21-18Z"
              fill="#e4e6d3"
            />
            <path
              d="M-80 264Q120 172 270 226T560 201 900 207 1190 170V850H-80Z"
              fill="url(#land)"
            />
            <path
              d="M-80 285Q180 192 365 261T716 232 1190 255"
              fill="none"
              stroke="#e9e6c5"
              strokeWidth="22"
              opacity=".45"
            />
            <path
              d="M-60 400Q150 321 340 391T635 391 1140 367M-60 550Q180 462 370 520T770 535 1160 480"
              fill="none"
              stroke="#91ad83"
              strokeWidth="48"
              opacity=".12"
            />
            {Array.from({ length: 18 }, (_, i) => (
              <ellipse
                key={`wash-${i}`}
                cx={50 + ((i * 131) % 1050)}
                cy={260 + ((i * 83) % 400)}
                rx={30 + (i % 3) * 20}
                ry={9 + (i % 4) * 6}
                fill={i % 2 ? "#e8dfad" : "#759964"}
                opacity=".1"
              />
            ))}
            <path
              d="M-60 641Q210 505 430 613T1130 671V820H-60Z"
              fill="#c5c5a1"
            />
            <path
              d="M-30 568Q111 513 290 589T625 663 839 631 1160 665"
              fill="none"
              stroke="#c9d4b7"
              strokeWidth="108"
            />
            <path
              d="M-30 568Q111 513 290 589T625 663 839 631 1160 665"
              fill="none"
              stroke="url(#water)"
              strokeWidth="76"
            />
            <path
              d="M-30 555Q111 500 290 576T625 650 839 618 1160 652"
              fill="none"
              stroke="#dce1c9"
              strokeWidth="2"
              opacity=".6"
            />
            <path
              d="M210 350Q390 454 510 410T850 260 M520 230Q440 324 510 410T615 470 815 530 M510 410 420 600"
              fill="none"
              stroke="#919774"
              strokeWidth="34"
              opacity=".28"
            />
            <path
              d="M210 350Q390 454 510 410T850 260 M520 230Q440 324 510 410T615 470 815 530 M510 410 420 600"
              fill="none"
              stroke="#ead8ac"
              strokeWidth="25"
              strokeLinecap="round"
            />
            {Array.from({ length: 14 }, (_, i) => (
              <path
                key={`ripple-${i}`}
                d={`M${30 + i * 76} ${573 + Math.sin(i * 0.6) * 27 + i * 6}q14-4 30 2m-21 6 10 1`}
                fill="none"
                stroke="#dce6cb"
                strokeWidth="1.4"
                opacity=".45"
              />
            ))}
            <path
              d="M706 131q6-9 13-2 6-8 13-2M746 105q4-7 9-1 4-6 9-2M901 155q5-7 11-1 4-6 10-2"
              fill="none"
              stroke="#7f968f"
              strokeWidth="1.6"
              opacity=".6"
            />
            {Array.from({ length: 100 }, (_, i) => (
              <path
                key={i}
                d={`m${((i * 167) % 1200) - 50} ${230 + ((i * 89) % 470)} 4-6 3 7 5-5`}
                stroke={i % 3 ? "#7c936b" : "#e3d7ad"}
                opacity=".45"
                fill="none"
              />
            ))}
            {trees
              .filter((t) => t.y < 320)
              .map((t, i) => (
                <Tree key={i} {...t} t={i} />
              ))}
            <Building x={520} y={230} kind="manor" />
            <g transform="translate(865 267)">
              <path
                d="m-65-14 9-45 40-35 38 7 47 65 12 30-61 14Z"
                fill="#9b9f8c"
                stroke="#697768"
                strokeWidth="2"
              />
              <path
                d="m-25 6 3-32q21-39 47-4L38 1Z"
                fill="#46574f"
                stroke="#7d8171"
                strokeWidth="5"
              />
              <path
                d="m-37-49 23-29 22 21m23 0 20 35"
                fill="none"
                stroke="#c6c5ad"
                strokeWidth="4"
              />
              <path
                d="M-16 4 7-9 35 2M-16 4 6 17 35 2"
                fill="none"
                stroke="#8b7557"
                strokeWidth="3"
              />
            </g>
            <Building x={394} y={329} kind="house" />
            <Building x={660} y={310} kind="house" />
            <Building x={615} y={470} kind="storage" />
            <g
              onClick={() => onLandmark("workshop")}
              className="landmark"
              role="button"
              tabIndex={0}
              aria-label="Inspect blacksmith workshop"
              onKeyDown={(e) => {
                if (e.key === "Enter") onLandmark("workshop");
              }}
            >
              {state.workshop.complete ? (
                <Building x={815} y={530} kind="forge" />
              ) : (
                <g transform="translate(815 530)">
                  <path
                    d="m-68-8 74-28 68 30-76 28Z"
                    fill="#bcb69a"
                    stroke="#807e63"
                    strokeWidth="2"
                    strokeDasharray="5 4"
                  />
                  <path
                    d="M-60-10v-52m60 77v-67m63 44v-54M-60-48 0-23 63-48"
                    stroke="#99794e"
                    strokeWidth="5"
                    fill="none"
                  />
                  <path
                    d="M-60-39 0-14 63-39"
                    stroke="#c5a371"
                    strokeWidth="2"
                    fill="none"
                  />
                  {state.workshop.labor > 0 && (
                    <path
                      d="m-68-62 43-43 60-4 42 47-75 26Z"
                      fill="#a47f5b"
                      opacity={Math.min(1, state.workshop.labor / 48)}
                      stroke={ink}
                    />
                  )}
                  <path
                    d="m-50 8 26-8 19 7-25 9Zm-4 8 26-8 19 7-25 9Z"
                    fill="#9f7b50"
                    stroke={ink}
                  />
                </g>
              )}
            </g>
            <path
              d="m389 583 65 12-3 47-65-12Z"
              fill="#c5bd9f"
              stroke="#7b806a"
              strokeWidth="3"
            />
            <path
              d="m389 583 65 12m-66 1 65 12m-65 2 65 12m-65 2 65 12"
              stroke="#e2d7b9"
              strokeWidth="3"
            />
            {trees
              .filter((t) => t.y >= 320)
              .map((t, i) => (
                <Tree key={i} {...t} t={i} />
              ))}
            {[0, 1, 2, 3, 4, 5].map((i) => (
              <Tree
                key={i}
                x={1000 + (i % 2) * 50}
                y={300 + i * 47}
                s={0.9 + (i % 3) * 0.1}
                t={i}
              />
            ))}
            {[...state.people]
              .sort((a, b) =>
                a.id === selected ? 1 : b.id === selected ? -1 : a.y - b.y,
              )
              .map((p) => (
                <Actor
                  key={p.id}
                  person={p}
                  selected={p.id === selected}
                  onSelect={() => onSelect(p.id)}
                />
              ))}
          </g>
          <g className="map-labels">
            {[
              { x: 520, y: 263, t: "Alden’s manor", id: "manor" },
              { x: 200, y: 405, t: "Whispering wood", id: "forest" },
              { x: 867, y: 310, t: "Stonefall mine", id: "mine" },
              { x: 615, y: 515, t: "Village store", id: "storage" },
              {
                x: 815,
                y: 579,
                t: state.workshop.complete
                  ? "The first forge"
                  : "Workshop site",
                id: "workshop",
              },
            ].map((l) => (
              <g
                key={l.id}
                transform={`translate(${l.x} ${l.y})`}
                onClick={() => onLandmark(l.id)}
                className="landmark"
                tabIndex={0}
                role="button"
                aria-label={`Inspect ${l.t}`}
                onKeyDown={(e) => {
                  if (e.key === "Enter") onLandmark(l.id);
                }}
              >
                <rect
                  x="-79"
                  y="-12"
                  width="158"
                  height="25"
                  rx="4"
                  fill="#f1ead4"
                  opacity=".9"
                  stroke="#b1aa87"
                />
                <text
                  textAnchor="middle"
                  y="5"
                  fill="#514d3c"
                  fontSize="14"
                  fontFamily="Georgia,serif"
                >
                  {l.t}
                </text>
              </g>
            ))}
          </g>
        </g>
        <rect
          width="1100"
          height="740"
          fill="#faf4d7"
          filter="url(#paper)"
          opacity=".32"
          pointerEvents="none"
        />
        <g transform="translate(1020 88)" opacity=".65">
          <path
            d="M0-32V32M-24 0H24M0-32-6-5 0-10 6-5Z"
            stroke="#586354"
            fill="#586354"
          />
          <text textAnchor="middle" y="-40" fill="#586354" fontFamily="Georgia">
            N
          </text>
        </g>
      </svg>
      <div className="map-tools">
        <span>Drag to explore · pinch to zoom</span>
        <button
          aria-label="Zoom in"
          onClick={() =>
            setCamera((c) => ({ ...c, z: Math.min(2.3, c.z + 0.2) }))
          }
        >
          +
        </button>
        <button
          aria-label="Zoom out"
          onClick={() =>
            setCamera((c) => ({ ...c, z: Math.max(0.8, c.z - 0.2) }))
          }
        >
          −
        </button>
        <button
          aria-label="Reset map view"
          onClick={() => setCamera({ x: 0, y: 0, z: 1 })}
        >
          ⌖
        </button>
      </div>
    </div>
  );
}

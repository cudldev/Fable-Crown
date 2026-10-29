import {
  useEffect,
  useRef,
  useState,
  type ReactNode,
  type PointerEvent as ReactPointerEvent,
} from "react";
import { BILL, TICK_MS, type GameState, type Point } from "./types";
import type { CameraState, WorldSelection } from "./view-types";
import {
  BLOCKERS,
  BUILDINGS,
  REGIONS,
  ROADS,
  SETTLEMENTS,
  TARGETS,
  WORLD,
} from "./world";
import "./scene.css";

const base = import.meta.env.BASE_URL;
const limit = (n: number, low: number, high: number) =>
  Math.max(low, Math.min(high, n));
const path = (points: Point[]) =>
  points.map((p, i) => `${i ? "L" : "M"}${p.x},${p.y}`).join(" ");
const mix = (a: Point, b: Point, t: number): Point => ({
  x: a.x + (b.x - a.x) * t,
  y: a.y + (b.y - a.y) * t,
});
function Art({
  name,
  x,
  y,
  width,
  height,
  opacity = 1,
}: {
  name: string;
  x: number;
  y: number;
  width: number;
  height: number;
  opacity?: number;
}) {
  return (
    <image
      href={`${base}art/${name}.webp`}
      x={x}
      y={y}
      width={width}
      height={height}
      opacity={opacity}
      onError={(e) => {
        e.currentTarget.style.visibility = "hidden";
      }}
    />
  );
}
interface Props {
  state: GameState;
  camera: CameraState;
  onCameraChange: (camera: CameraState) => void;
  selection: WorldSelection | null;
  onSelect: (selection: WorldSelection) => void;
}
interface GesturePoint extends Point {
  start: Point;
}

export default function Scene({
  state,
  camera,
  onCameraChange,
  selection,
  onSelect,
}: Props) {
  const root = useRef<HTMLDivElement>(null);
  const [size, setSize] = useState({ width: 1200, height: 800 });
  const [clock, setClock] = useState(() => performance.now());
  const [reducedMotion, setReducedMotion] = useState(false);
  const snapshots = useRef({
    tick: state.tick,
    at: performance.now(),
    from: new Map(state.people.map((p) => [p.id, { x: p.x, y: p.y }])),
    to: new Map(state.people.map((p) => [p.id, { x: p.x, y: p.y }])),
  });
  const gestures = useRef(new Map<number, GesturePoint>());
  const dragged = useRef(false);
  const pinch = useRef<{ distance: number; middle: Point } | null>(null);
  const callbacks = useRef({ onCameraChange, onSelect });
  callbacks.current = { onCameraChange, onSelect };

  useEffect(() => {
    const element = root.current;
    if (!element) return;
    const observer = new ResizeObserver(([entry]) =>
      setSize({
        width: entry.contentRect.width,
        height: entry.contentRect.height,
      }),
    );
    observer.observe(element);
    const preference = matchMedia("(prefers-reduced-motion: reduce)");
    const update = () => setReducedMotion(preference.matches);
    update();
    preference.addEventListener("change", update);
    return () => {
      observer.disconnect();
      preference.removeEventListener("change", update);
    };
  }, []);
  useEffect(() => {
    let frame = 0;
    const animate = (now: number) => {
      setClock(now);
      frame = requestAnimationFrame(animate);
    };
    frame = requestAnimationFrame(animate);
    return () => cancelAnimationFrame(frame);
  }, []);

  const now = performance.now();
  // Interpolate received authoritative positions, never the full trip endpoint.
  if (snapshots.current.tick !== state.tick) {
    const old = snapshots.current;
    const t = reducedMotion ? 1 : limit((now - old.at) / TICK_MS, 0, 1);
    snapshots.current = {
      tick: state.tick,
      at: now,
      from: new Map(
        state.people.map((p) => [
          p.id,
          mix(old.from.get(p.id) || p, old.to.get(p.id) || p, t),
        ]),
      ),
      to: new Map(state.people.map((p) => [p.id, { x: p.x, y: p.y }])),
    };
  }
  const fraction = reducedMotion
    ? 1
    : limit((clock - snapshots.current.at) / TICK_MS, 0, 1);
  const people = state.people.map((p) => ({
    ...p,
    ...mix(snapshots.current.from.get(p.id) || p, p, fraction),
  }));
  const fit =
    Math.min(size.width / WORLD.width, size.height / WORLD.height) * 0.95;
  const followed = people.find((p) => p.id === camera.followId);
  const zoom = camera.overview ? fit : limit(camera.zoom, 0.08, 1.8);
  function clamp(c: CameraState): CameraState {
    const halfWidth = size.width / c.zoom / 2,
      halfHeight = size.height / c.zoom / 2;
    return {
      ...c,
      x:
        halfWidth >= WORLD.width / 2
          ? WORLD.width / 2
          : limit(c.x, halfWidth, WORLD.width - halfWidth),
      y:
        halfHeight >= WORLD.height / 2
          ? WORLD.height / 2
          : limit(c.y, halfHeight, WORLD.height - halfHeight),
    };
  }
  const view = camera.overview
    ? { ...camera, x: WORLD.width / 2, y: WORLD.height / 2, zoom }
    : clamp({
        ...camera,
        zoom,
        ...(followed
          ? {
              x: followed.x,
              y: followed.y + Math.min(80, size.height * 0.09) / zoom,
            }
          : {}),
      });
  const currentView = useRef(view);
  currentView.current = view;
  const left = view.x - size.width / zoom / 2,
    top = view.y - size.height / zoom / 2;
  const screen = (p: Point): Point => ({
    x: (p.x - left) * zoom,
    y: (p.y - top) * zoom,
  });
  const visible = (p: Point, margin = 250) =>
    p.x > left - margin &&
    p.x < left + size.width / zoom + margin &&
    p.y > top - margin &&
    p.y < top + size.height / zoom + margin;
  function relative(client: Point): Point {
    const rect = root.current!.getBoundingClientRect();
    return { x: client.x - rect.left, y: client.y - rect.top };
  }
  function ground(client: Point): Point {
    const p = relative(client),
      c = currentView.current;
    return {
      x: limit(c.x + (p.x - size.width / 2) / c.zoom, 20, WORLD.width - 20),
      y: limit(c.y + (p.y - size.height / 2) / c.zoom, 20, WORLD.height - 20),
    };
  }
  function zoomAt(
    client: Point,
    factor: number,
    drift: Point = { x: 0, y: 0 },
  ) {
    const c = currentView.current,
      p = relative(client),
      z = limit(c.zoom * factor, 0.08, 1.8);
    const next = clamp({
      ...c,
      zoom: z,
      followId: null,
      overview: false,
      x: c.x + (p.x - size.width / 2) * (1 / c.zoom - 1 / z) - drift.x / z,
      y: c.y + (p.y - size.height / 2) * (1 / c.zoom - 1 / z) - drift.y / z,
    });
    currentView.current = next;
    callbacks.current.onCameraChange(next);
  }
  const wheel = useRef<(event: WheelEvent) => void>(() => {});
  wheel.current = (event) => {
    event.preventDefault();
    zoomAt(
      { x: event.clientX, y: event.clientY },
      Math.exp(-event.deltaY * 0.0015),
    );
  };
  useEffect(() => {
    const element = root.current;
    const listener = (event: WheelEvent) => wheel.current(event);
    element?.addEventListener("wheel", listener, { passive: false });
    return () => element?.removeEventListener("wheel", listener);
  }, []);
  function pointerDown(e: ReactPointerEvent<HTMLDivElement>) {
    if (e.button !== 0) return;
    if (gestures.current.size === 0) dragged.current = false;
    const point = { x: e.clientX, y: e.clientY };
    gestures.current.set(e.pointerId, { ...point, start: point });
    if (gestures.current.size === 2) {
      dragged.current = true;
      const [a, b] = [...gestures.current.values()];
      pinch.current = {
        distance: Math.hypot(a.x - b.x, a.y - b.y),
        middle: mix(a, b, 0.5),
      };
      for (const id of gestures.current.keys())
        root.current?.setPointerCapture(id);
    }
  }
  function pointerMove(e: ReactPointerEvent<HTMLDivElement>) {
    const old = gestures.current.get(e.pointerId);
    if (!old) return;
    const point = { x: e.clientX, y: e.clientY };
    gestures.current.set(e.pointerId, { ...point, start: old.start });
    if (gestures.current.size >= 2) {
      const [a, b] = [...gestures.current.values()];
      const distance = Math.hypot(a.x - b.x, a.y - b.y),
        middle = mix(a, b, 0.5);
      if (pinch.current)
        zoomAt(
          pinch.current.middle,
          distance / Math.max(1, pinch.current.distance),
          {
            x: middle.x - pinch.current.middle.x,
            y: middle.y - pinch.current.middle.y,
          },
        );
      pinch.current = { distance, middle };
      return;
    }
    if (
      !dragged.current &&
      Math.hypot(point.x - old.start.x, point.y - old.start.y) < 8
    )
      return;
    const wasDragging = dragged.current;
    dragged.current = true;
    root.current?.setPointerCapture(e.pointerId);
    const c = currentView.current,
      origin = wasDragging ? old : old.start;
    const next = clamp({
      ...c,
      followId: null,
      overview: false,
      x: c.x - (point.x - origin.x) / c.zoom,
      y: c.y - (point.y - origin.y) / c.zoom,
    });
    currentView.current = next;
    onCameraChange(next);
  }
  function pointerEnd(e: ReactPointerEvent<HTMLDivElement>) {
    gestures.current.delete(e.pointerId);
    if (gestures.current.size < 2) pinch.current = null;
    if (e.type === "pointercancel") dragged.current = true;
    if (root.current?.hasPointerCapture(e.pointerId))
      root.current.releasePointerCapture(e.pointerId);
  }
  function select(value: WorldSelection, keyboard: boolean) {
    if (keyboard || !dragged.current) onSelect(value);
  }

  const scenery: { key: string; y: number; node: ReactNode }[] = [];
  for (const b of BUILDINGS) {
    if (!visible(b)) continue;
    const foot = b.y + b.height + 12,
      cx = b.x + b.width / 2;
    const progress = state.workshop.labor / BILL.labor;
    scenery.push({
      key: b.id,
      y: foot,
      node: (
        <g>
          <ellipse
            cx={cx}
            cy={foot - 8}
            rx={105}
            ry={22}
            fill="#354b36"
            opacity=".14"
          />
          {b.kind === "workshop" && !state.workshop.complete ? (
            <>
              <path
                d={`M${b.x - 8},${b.y}h${b.width + 16}v${b.height}h-${b.width + 16}Z`}
                fill="#c9b99b"
                fillOpacity=".65"
                stroke="#8c795a"
                strokeWidth="3"
                strokeDasharray="8 7"
              />
              <Art
                name="workshop"
                x={cx - 135}
                y={foot - 245}
                width={270}
                height={250}
                opacity={progress * 0.8}
              />
              <path
                d={`M${b.x},${foot}v-90m${b.x + b.width},${foot}v-90m${cx},${foot - 12}v-105M${b.x},${foot - 75}L${cx},${foot - 110}L${b.x + b.width},${foot - 75}`}
                fill="none"
                stroke="#967246"
                strokeWidth="7"
                strokeLinecap="round"
              />
              <text
                className="fc-building-progress"
                x={cx}
                y={foot + 25}
                textAnchor="middle"
              >
                {state.workshop.timber}/{BILL.timber} timber ·{" "}
                {state.workshop.stone}/{BILL.stone} stone ·{" "}
                {Math.floor(progress * 100)}%
              </text>
            </>
          ) : (
            <Art
              name={b.kind}
              x={cx - 135}
              y={foot - 245}
              width={270}
              height={250}
            />
          )}
        </g>
      ),
    });
  }
  for (const t of TARGETS) {
    if (
      !visible(t) ||
      !["forest", "mine", "landmark"].includes(t.kind) ||
      t.id.includes("bridge")
    )
      continue;
    const name =
      t.kind === "forest" ? "forest" : t.kind === "mine" ? "ore" : "ruins";
    scenery.push({
      key: t.id,
      y: t.y - 25,
      node: (
        <Art name={name} x={t.x - 160} y={t.y - 270} width={320} height={280} />
      ),
    });
  }
  for (const p of people) {
    if (camera.overview || !visible(p, 130)) continue;
    const active = selection?.kind === "person" && selection.id === p.id;
    const moving = p.path.length > 0;
    scenery.push({
      key: `person-${p.id}`,
      y: p.y,
      node: (
        <g transform={`translate(${p.x} ${p.y})`}>
          <ellipse cy="0" rx="18" ry="7" fill="#253d36" opacity=".22" />
          {(active || p.id === 0) && (
            <ellipse
              className={active ? "fc-selected-ring" : "fc-prince-ring"}
              cy="1"
              rx="24"
              ry="10"
              fill="none"
              strokeWidth={active ? 3 : 2}
            />
          )}
          <g
            className={
              moving
                ? "fc-actor-walk"
                : p.remaining > 0 && !p.action.includes("Waiting")
                  ? "fc-actor-work"
                  : ""
            }
            style={{ animationDelay: `${-p.id * 0.13}s` }}
          >
            <Art name={p.role} x={-55} y={-100} width={110} height={110} />
          </g>
          {p.carry && (
            <g transform="translate(28 -48)">
              <rect
                x="-3"
                y="-11"
                width="72"
                height="20"
                rx="8"
                fill="#f3ead0"
                stroke="#95815f"
              />
              <text className="fc-carry-text" x="33" y="3" textAnchor="middle">
                {p.carry.amount} {p.carry.resource}
              </text>
            </g>
          )}
        </g>
      ),
    });
  }
  scenery.sort((a, b) => a.y - b.y);
  const hero = people.find((p) => p.id === 0);
  const destination =
    hero && hero.path.length ? hero.path[hero.path.length - 1] : null;

  return (
    <div
      ref={root}
      className="world fc-world"
      data-testid="world"
      onPointerDown={pointerDown}
      onPointerMove={pointerMove}
      onPointerUp={pointerEnd}
      onPointerCancel={pointerEnd}
      onClick={(e) => {
        if (!dragged.current && e.detail > 0)
          onSelect({
            kind: "ground",
            point: ground({ x: e.clientX, y: e.clientY }),
          });
      }}
    >
      <svg
        className="fc-landscape"
        width="100%"
        height="100%"
        viewBox={`${left} ${top} ${size.width / zoom} ${size.height / zoom}`}
        aria-label="The Fable Crown frontier"
        role="img"
      >
        <defs>
          <linearGradient id="fc-river" x1="0" x2="1">
            <stop stopColor="#81aaa4" />
            <stop offset=".5" stopColor="#bed1bc" />
            <stop offset="1" stopColor="#7fa6a2" />
          </linearGradient>
        </defs>
        <rect width={WORLD.width} height={WORLD.height} fill="#cbd2ad" />
        <image
          href={`${base}art/overview.webp`}
          width={WORLD.width}
          height={WORLD.height}
          preserveAspectRatio="none"
        />
        {!camera.overview &&
          REGIONS.filter(
            (r) =>
              r.x < left + size.width / zoom + 320 &&
              r.x + r.width > left - 320 &&
              r.y < top + size.height / zoom + 320 &&
              r.y + r.height > top - 320,
          ).map((r) => (
            <image
              key={r.id}
              href={`${base}${r.image}`}
              x={r.x}
              y={r.y}
              width={r.width}
              height={r.height}
              preserveAspectRatio="none"
              onError={(e) => {
                e.currentTarget.style.visibility = "hidden";
              }}
            />
          ))}
        <g style={{ display: camera.overview ? "none" : undefined }}>
          <path d="M3000,0V4440" stroke="#c5d1ad" strokeWidth="202" />
          <path d="M3000,0V4440" stroke="url(#fc-river)" strokeWidth="160" />
          {[2940, 2990, 3050].map((x, i) => (
            <path
              key={x}
              d={`M${x},0q${i % 2 ? 25 : -20},250 0,500t0,500t0,500t0,500t0,500t0,500t0,500t0,500t0,500`}
              stroke="#e3e5cb"
              strokeWidth="3"
              opacity=".35"
              fill="none"
            />
          ))}
          {ROADS.map((road, i) => (
            <g key={i}>
              <path d={path(road)} className="fc-road-edge" />
              <path d={path(road)} className="fc-road" />
            </g>
          ))}
          {TARGETS.filter(
            (t) => t.kind !== "landmark" && t.kind !== "settlement",
          ).map((t) => {
            const town = SETTLEMENTS.find((s) => s.id === t.settlementId)!;
            return (
              <path
                key={t.id}
                d={`M${town.x},${town.y}L${t.x},${t.y}`}
                className="fc-local-road"
              />
            );
          })}
          {[1100, 3000].map((y) => (
            <g key={y}>
              <path
                d={`M2890,${y - 65}h220v130h-220Z`}
                fill="#c8b596"
                stroke="#6e7567"
                strokeWidth="5"
              />
              {[-45, -15, 15, 45].map((d) => (
                <path
                  key={d}
                  d={`M2890,${y + d}h220`}
                  stroke="#e6dbc0"
                  strokeWidth="7"
                />
              ))}
              <path
                d={`M2880,${y - 69}h240M2880,${y + 69}h240`}
                stroke="#706e5d"
                strokeWidth="10"
              />
              <Art
                name="bridge"
                x={2860}
                y={y - 170}
                width={280}
                height={230}
              />
            </g>
          ))}
          {BLOCKERS.filter(
            (b) => b.id.includes("cliff") && visible(b, 500),
          ).map((b) => (
            <g key={b.id}>
              <ellipse
                cx={b.x + b.width / 2}
                cy={b.y + b.height / 2}
                rx={b.width * 0.55}
                ry={b.height * 0.6}
                fill="#606d59"
                opacity=".3"
              />
              {[0, 1, 2].map((i) => (
                <Art
                  key={i}
                  name="ore"
                  x={b.x - 60 + (i * b.width) / 3}
                  y={b.y - 95 + (i % 2) * 45}
                  width={b.width * 0.7}
                  height={b.height + 150}
                />
              ))}
            </g>
          ))}
        </g>
        {camera.overview &&
          ROADS.map((road, i) => (
            <path
              key={`map-road-${i}`}
              d={path(road)}
              fill="none"
              stroke="#f6e1ab"
              strokeWidth={2 / zoom}
              strokeDasharray={`${4 / zoom} ${5 / zoom}`}
              opacity=".65"
            />
          ))}
        {hero && destination && (
          <g className="fc-route">
            <path
              d={path([hero, ...hero.path])}
              fill="none"
              stroke="#f7e3a0"
              strokeWidth={3 / zoom}
              strokeDasharray={`${7 / zoom} ${8 / zoom}`}
              opacity=".9"
            />
            <circle
              cx={destination.x}
              cy={destination.y}
              r={13 / zoom}
              fill="#e0bc68"
              fillOpacity=".3"
              stroke="#faf0c2"
              strokeWidth={2 / zoom}
            />
            <path
              d={`M${destination.x - 6 / zoom},${destination.y}h${12 / zoom}m-${6 / zoom},-${6 / zoom}v${12 / zoom}`}
              stroke="#f9ecc1"
              strokeWidth={2 / zoom}
            />
          </g>
        )}
        {selection?.kind === "target" &&
          (() => {
            const t = TARGETS.find((t) => t.id === selection.id);
            return (
              t && (
                <g>
                  <ellipse
                    cx={t.x}
                    cy={t.y}
                    rx={38}
                    ry={17}
                    className="fc-selected-ring"
                    fill="none"
                    strokeWidth={3 / zoom}
                  />
                  <path
                    d={`M${t.x},${t.y - 35}v-22`}
                    stroke="#f7da86"
                    strokeWidth={3 / zoom}
                  />
                </g>
              )
            );
          })()}
        {!camera.overview && scenery.map((s) => <g key={s.key}>{s.node}</g>)}
      </svg>
      <div className="fc-hit-layer">
        {TARGETS.filter((t) =>
          camera.overview
            ? t.kind === "settlement" || t.id.includes("bridge")
            : visible(t, 20),
        ).map((t) => {
          const at = screen(t),
            selected = selection?.kind === "target" && selection.id === t.id;
          return (
            <button
              key={t.id}
              className={`fc-target-hit ${t.kind === "settlement" ? "fc-town-hit" : ""} ${selected ? "fc-is-selected" : ""}`}
              style={{ left: at.x, top: at.y }}
              aria-label={`Inspect ${t.name}`}
              aria-pressed={selected}
              onClick={(e) => {
                e.stopPropagation();
                select({ kind: "target", id: t.id }, e.detail === 0);
              }}
            >
              <span>
                {t.kind === "workshop" && !state.workshop.complete
                  ? "Workshop site"
                  : t.name}
              </span>
            </button>
          );
        })}
        {!camera.overview &&
          [...people]
            .sort((a, b) => (a.id === 0 ? 1 : b.id === 0 ? -1 : a.y - b.y))
            .filter((p) => visible(p, 80))
            .map((p) => {
              const at = screen(p),
                selected =
                  selection?.kind === "person" && selection.id === p.id;
              return (
                <button
                  key={p.id}
                  className={`fc-person-hit ${selected ? "fc-is-selected" : ""} ${p.id === 0 ? "fc-hero-hit" : ""}`}
                  style={{
                    left: at.x,
                    top: at.y - 38 * zoom,
                    height: Math.max(44, 80 * zoom),
                    width: Math.max(44, 48 * zoom),
                  }}
                  aria-label={`Inspect ${p.name}, ${p.role}, ${p.action}`}
                  aria-pressed={selected}
                  onClick={(e) => {
                    e.stopPropagation();
                    select({ kind: "person", id: p.id }, e.detail === 0);
                  }}
                >
                  <span>{p.name}</span>
                </button>
              );
            })}
      </div>
      <span className="fc-map-compass" aria-hidden="true">
        N<span>↑</span>
      </span>
      {camera.overview && (
        <span className="fc-overview-caption">
          THE FRONTIER · 3 SETTLEMENTS
        </span>
      )}
    </div>
  );
}

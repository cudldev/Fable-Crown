import { useEffect, useRef, useState, type PointerEvent } from "react";
import type { RpgState, TilePosition, WorldObject } from "../rpg/types";
import { WORLD } from "../rpg/world";
import { artFrames } from "../art-frames";
import { tileToScreen, screenToTile } from "./iso";
import "./tile-scene.css";
export interface TileCamera {
  x: number;
  y: number;
  zoom: number;
  follow: boolean;
  overview: boolean;
  grid: boolean;
}
export type TileSelection =
  | { kind: "object"; id: string }
  | { kind: "actor"; id: number }
  | { kind: "tile"; position: TilePosition };
interface Props {
  state: RpgState;
  camera: TileCamera;
  onCamera: (c: TileCamera) => void;
  selection: TileSelection | null;
  onSelect: (s: TileSelection) => void;
}
const base = import.meta.env.BASE_URL;
const assetNames = [
  "prince",
  "woodcutter",
  "miner",
  "builder",
  "smith",
  "manor",
  "store",
  "house",
  "workshop",
  "forest",
  "ore",
  "bridge",
  "ruins",
  "tile-grass",
  "tile-dirt",
  "tile-stone",
  "tile-water",
];
const terrainAsset = {
  grass: "tile-grass",
  dirt: "tile-dirt",
  stone: "tile-stone",
  sand: "tile-dirt",
  water: "tile-water",
};
const clamp = (n: number, a: number, b: number) => Math.max(a, Math.min(b, n));
export default function TileScene({
  state,
  camera,
  onCamera,
  selection,
  onSelect,
}: Props) {
  const root = useRef<HTMLDivElement>(null),
    canvas = useRef<HTMLCanvasElement>(null),
    images = useRef(new Map<string, HTMLImageElement>()),
    chunks = useRef(new Map<string, HTMLCanvasElement>()),
    overview = useRef<HTMLCanvasElement | null>(null);
  const [size, setSize] = useState({ width: 1200, height: 800 }),
    [now, setNow] = useState(0),
    [artVersion, setArtVersion] = useState(0);
  const stamp = useRef({ tick: state.tick, at: performance.now() });
  if (stamp.current.tick !== state.tick)
    stamp.current = { tick: state.tick, at: performance.now() };
  const pointers = useRef(
      new Map<
        number,
        { x: number; y: number; startX: number; startY: number }
      >(),
    ),
    dragged = useRef(false),
    pinch = useRef(0);
  const callbacks = useRef({ onCamera, onSelect });
  callbacks.current = { onCamera, onSelect };
  useEffect(() => {
    const observer = new ResizeObserver(([e]) =>
      setSize({ width: e.contentRect.width, height: e.contentRect.height }),
    );
    if (root.current) observer.observe(root.current);
    return () => observer.disconnect();
  }, []);
  useEffect(() => {
    let alive = true;
    for (const name of assetNames) {
      const img = new Image();
      img.src = `${base}art/${name}.webp`;
      img.onload = () => {
        if (alive) {
          images.current.set(name, img);
          chunks.current.clear();
          overview.current = null;
          setArtVersion((v) => v + 1);
        }
      };
    }
    return () => {
      alive = false;
    };
  }, []);
  useEffect(() => {
    let id = 0;
    const frame = (t: number) => {
      setNow(t);
      id = requestAnimationFrame(frame);
    };
    id = requestAnimationFrame(frame);
    return () => cancelAnimationFrame(id);
  }, []);
  const reduced =
    typeof matchMedia !== "undefined" &&
    matchMedia("(prefers-reduced-motion: reduce)").matches;
  const f = reduced ? 1 : clamp((now - stamp.current.at) / 600, 0, 1);
  const people = [state.player, ...state.npcs].map((p) => ({
    ...p,
    draw: {
      x: p.previousPosition.x + (p.position.x - p.previousPosition.x) * f,
      y: p.previousPosition.y + (p.position.y - p.previousPosition.y) * f,
    },
  }));
  const hero = people[0]!,
    fit =
      Math.min(
        size.width / (WORLD.width + WORLD.height) / 32,
        size.height / (WORLD.width + WORLD.height) / 16,
      ) * 0.92;
  const view = {
    ...camera,
    ...(camera.overview
      ? { x: WORLD.width / 2, y: WORLD.height / 2, zoom: fit }
      : camera.follow
        ? { x: hero.draw.x, y: hero.draw.y + 2 / Math.max(0.2, camera.zoom) }
        : {}),
  };
  const viewRef = useRef(view);
  viewRef.current = view;
  const center = tileToScreen(view);
  const project = (p: { x: number; y: number }) => {
    const iso = tileToScreen(p);
    return {
      x: (iso.x - center.x) * view.zoom + size.width / 2,
      y: (iso.y - center.y) * view.zoom + size.height / 2,
    };
  };
  const unproject = (p: { x: number; y: number }) =>
    screenToTile({
      x: (p.x - size.width / 2) / view.zoom + center.x,
      y: (p.y - size.height / 2) / view.zoom + center.y,
    });
  const visible = (p: { x: number; y: number }, margin = 220) => {
    const at = project(p);
    return (
      at.x > -margin &&
      at.y > -margin &&
      at.x < size.width + margin &&
      at.y < size.height + margin
    );
  };
  function diamond(ctx: CanvasRenderingContext2D, x: number, y: number) {
    ctx.beginPath();
    ctx.moveTo(x, y - 16);
    ctx.lineTo(x + 32, y);
    ctx.lineTo(x, y + 16);
    ctx.lineTo(x - 32, y);
    ctx.closePath();
  }
  function groundChunk(cx: number, cy: number): HTMLCanvasElement {
    const key = `${cx},${cy}`;
    const hit = chunks.current.get(key);
    if (hit) {
      chunks.current.delete(key);
      chunks.current.set(key, hit);
      return hit;
    }
    const c = document.createElement("canvas");
    c.width = 1024;
    c.height = 512;
    const ctx = c.getContext("2d")!;
    ctx.scale(0.5, 0.5);
    ctx.translate(1024, 16);
    for (let sum = 0; sum < 63; sum++)
      for (let lx = 0; lx < 32; lx++) {
        const ly = sum - lx;
        if (ly < 0 || ly >= 32) continue;
        const x = cx * 32 + lx,
          y = cy * 32 + ly;
        if (x >= WORLD.width || y >= WORLD.height) continue;
        const terrain = WORLD.terrain[y * WORLD.width + x]!,
          p = tileToScreen({ x: lx, y: ly });
        ctx.save();
        diamond(ctx, p.x, p.y);
        ctx.clip();
        ctx.fillStyle = {
          grass: "#b6be86",
          dirt: "#d8bf91",
          stone: "#ddccb0",
          water: "#83a9aa",
          sand: "#d8cfad",
        }[terrain];
        ctx.fill();
        const img = images.current.get(terrainAsset[terrain]);
        if (img) {
          ctx.globalAlpha = 0.9;
          ctx.drawImage(img, p.x - 33, p.y - 17, 66, 34);
          ctx.globalAlpha = 1;
          if (terrain === "dirt") {
            ctx.fillStyle = "#d7bb8744";
            ctx.fillRect(p.x - 32, p.y - 16, 64, 32);
          }
        } else if (terrain === "water") {
          ctx.strokeStyle = "#dae0cb66";
          ctx.lineWidth = 1.5;
          ctx.beginPath();
          ctx.moveTo(p.x - 15, p.y + 2);
          ctx.quadraticCurveTo(p.x, p.y - 4, p.x + 14, p.y + 1);
          ctx.stroke();
        }
        ctx.restore();
      }
    if (chunks.current.size >= 12)
      chunks.current.delete(chunks.current.keys().next().value!);
    chunks.current.set(key, c);
    return c;
  }
  useEffect(() => {
    const c = canvas.current;
    if (!c) return;
    const dpr = Math.min(devicePixelRatio || 1, 2);
    if (c.width !== size.width * dpr || c.height !== size.height * dpr) {
      c.width = size.width * dpr;
      c.height = size.height * dpr;
    }
    const ctx = c.getContext("2d")!;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, size.width, size.height);
    ctx.fillStyle = "#c3c7aa";
    ctx.fillRect(0, 0, size.width, size.height);
    ctx.translate(
      size.width / 2 - center.x * view.zoom,
      size.height / 2 - center.y * view.zoom,
    );
    ctx.scale(view.zoom, view.zoom);
    if (view.overview) {
      if (!overview.current) {
        const out = document.createElement("canvas");
        out.width = (WORLD.width + WORLD.height) * 3.2;
        out.height = (WORLD.width + WORLD.height) * 1.6 + 8;
        const oc = out.getContext("2d")!;
        oc.scale(0.1, 0.1);
        oc.translate(WORLD.height * 32, 16);
        for (let cy = 0; cy < WORLD.height / 32; cy++)
          for (let cx = 0; cx < WORLD.width / 32; cx++) {
            const p = tileToScreen({ x: cx * 32, y: cy * 32 });
            oc.drawImage(groundChunk(cx, cy), p.x - 1024, p.y - 16, 2048, 1024);
          }
        overview.current = out;
      }
      ctx.drawImage(
        overview.current,
        -WORLD.height * 32,
        -16,
        overview.current.width * 10,
        overview.current.height * 10,
      );
    } else {
      const corners = [
        unproject({ x: -160, y: -200 }),
        unproject({ x: size.width + 160, y: -200 }),
        unproject({ x: -160, y: size.height + 200 }),
        unproject({ x: size.width + 160, y: size.height + 200 }),
      ];
      const minX = clamp(
          Math.floor(Math.min(...corners.map((p) => p.x)) / 32),
          0,
          7,
        ),
        maxX = clamp(
          Math.floor(Math.max(...corners.map((p) => p.x)) / 32),
          0,
          7,
        ),
        minY = clamp(
          Math.floor(Math.min(...corners.map((p) => p.y)) / 32),
          0,
          5,
        ),
        maxY = clamp(
          Math.floor(Math.max(...corners.map((p) => p.y)) / 32),
          0,
          5,
        );
      for (let sum = minX + minY; sum <= maxX + maxY; sum++)
        for (let cx = minX; cx <= maxX; cx++) {
          const cy = sum - cx;
          if (cy < minY || cy > maxY) continue;
          const p = tileToScreen({ x: cx * 32, y: cy * 32 });
          ctx.drawImage(groundChunk(cx, cy), p.x - 1024, p.y - 16, 2048, 1024);
        }
    }
    if (camera.grid && !view.overview) {
      const tl = unproject({ x: -100, y: -100 }),
        br = unproject({ x: size.width + 100, y: size.height + 100 });
      const radius = Math.ceil((size.width + size.height) / view.zoom / 64);
      ctx.strokeStyle = "#40594233";
      ctx.lineWidth = 1 / view.zoom;
      for (
        let y = Math.max(0, Math.floor(view.y - radius));
        y < Math.min(WORLD.height, view.y + radius);
        y++
      )
        for (
          let x = Math.max(0, Math.floor(view.x - radius));
          x < Math.min(WORLD.width, view.x + radius);
          x++
        ) {
          const p = tileToScreen({ x, y });
          diamond(ctx, p.x, p.y);
          ctx.stroke();
        }
      void tl;
      void br;
    }
    function art(
      name: string,
      p: { x: number; y: number },
      w: number,
      h: number,
      alpha = 1,
    ) {
      const img = images.current.get(name);
      if (!img) return;
      const frame = artFrames[name];
      ctx.globalAlpha = alpha;
      if (frame) {
        const scale = Math.min(w / frame.boundsWidth, h / frame.boundsHeight);
        ctx.drawImage(
          img,
          p.x - frame.pivotX * scale,
          p.y - frame.pivotY * scale,
          img.width * scale,
          img.height * scale,
        );
      } else ctx.drawImage(img, p.x - w / 2, p.y - h, w, h);
      ctx.globalAlpha = 1;
    }
    const drawables: { depth: number; draw: () => void }[] = [];
    for (const o of WORLD.objects) {
      const foot = {
        x: o.position.x + (o.width - 1) / 2,
        y: o.position.y + o.height - 1,
      };
      if (!view.overview && !visible(foot, 350)) continue;
      const p = tileToScreen(foot);
      drawables.push({
        depth: foot.x + foot.y,
        draw: () => {
          if (o.art) {
            const w =
                o.kind === "tree"
                  ? 170
                  : o.kind === "rock"
                    ? 100
                    : o.kind === "bridge"
                      ? 290
                      : Math.max(170, (o.width + o.height) * 32),
              h =
                o.kind === "tree"
                  ? 170
                  : o.kind === "rock"
                    ? 90
                    : Math.max(140, w * 0.8);
            art(
              o.art!,
              p,
              w,
              h,
              state.resources[o.id]?.available === false ? 0.4 : 1,
            );
          } else if (o.kind !== "landmark") {
            ctx.fillStyle =
              o.kind === "fish"
                ? "#447d8599"
                : o.kind === "quest"
                  ? "#dbb66a"
                  : "#756c59";
            ctx.beginPath();
            ctx.ellipse(
              p.x,
              p.y - 6,
              o.kind === "anvil" ? 17 : 12,
              7,
              0,
              0,
              Math.PI * 2,
            );
            ctx.fill();
            if (o.kind === "range") {
              ctx.fillStyle = "#de9b55";
              ctx.fillRect(p.x - 8, p.y - 25, 16, 20);
            }
          }
        },
      });
    }
    if (!view.overview)
      for (const p of people)
        if (visible(p.draw)) {
          const at = tileToScreen(p.draw);
          drawables.push({
            depth: p.draw.x + p.draw.y + 0.1,
            draw: () => {
              ctx.fillStyle = "#2b433833";
              ctx.beginPath();
              ctx.ellipse(at.x, at.y, 13, 5, 0, 0, Math.PI * 2);
              ctx.fill();
              if (
                p.id === 0 ||
                (selection?.kind === "actor" && selection.id === p.id)
              ) {
                ctx.strokeStyle = "#f3d98c";
                ctx.lineWidth = 2;
                ctx.beginPath();
                ctx.ellipse(at.x, at.y, 19, 8, 0, 0, Math.PI * 2);
                ctx.stroke();
              }
              const name = assetNames.includes(p.role) ? p.role : "builder";
              art(name, at, 90, 90);
            },
          });
        }
    drawables.sort((a, b) => a.depth - b.depth).forEach((d) => d.draw());
    if (state.player.path.length) {
      ctx.strokeStyle = "#f7d797";
      ctx.lineWidth = 2 / view.zoom;
      ctx.setLineDash([4 / view.zoom, 6 / view.zoom]);
      ctx.beginPath();
      [state.player.position, ...state.player.path].forEach((p, i) => {
        const at = tileToScreen(p);
        i ? ctx.lineTo(at.x, at.y) : ctx.moveTo(at.x, at.y);
      });
      ctx.stroke();
      ctx.setLineDash([]);
    }
    if (selection?.kind === "tile") {
      const p = tileToScreen(selection.position);
      diamond(ctx, p.x, p.y);
      ctx.strokeStyle = "#f8dfa1";
      ctx.lineWidth = 2 / view.zoom;
      ctx.stroke();
    }
  }, [state, now, camera, size, artVersion]);
  function local(p: { x: number; y: number }) {
    const r = root.current!.getBoundingClientRect();
    return { x: p.x - r.left, y: p.y - r.top };
  }
  function zoomAt(point: { x: number; y: number }, factor: number) {
    const c = viewRef.current,
      z = clamp(c.zoom * factor, 0.12, 2);
    const d = screenToTile({
      x: (point.x - size.width / 2) * (1 / c.zoom - 1 / z),
      y: (point.y - size.height / 2) * (1 / c.zoom - 1 / z),
    });
    callbacks.current.onCamera({
      ...c,
      zoom: z,
      overview: false,
      follow: false,
      x: clamp(c.x + d.x, 0, WORLD.width),
      y: clamp(c.y + d.y, 0, WORLD.height),
    });
  }
  const wheel = useRef<(e: WheelEvent) => void>(() => {});
  wheel.current = (e) => {
    e.preventDefault();
    zoomAt(local({ x: e.clientX, y: e.clientY }), Math.exp(-e.deltaY * 0.0015));
  };
  useEffect(() => {
    const el = root.current,
      handler = (e: WheelEvent) => wheel.current(e);
    el?.addEventListener("wheel", handler, { passive: false });
    return () => el?.removeEventListener("wheel", handler);
  }, [size]);
  function down(e: PointerEvent) {
    if (e.button !== 0) return;
    if (!pointers.current.size) dragged.current = false;
    pointers.current.set(e.pointerId, {
      x: e.clientX,
      y: e.clientY,
      startX: e.clientX,
      startY: e.clientY,
    });
    if (pointers.current.size === 2) {
      dragged.current = true;
      const [a, b] = [...pointers.current.values()];
      pinch.current = Math.hypot(a.x - b.x, a.y - b.y);
    }
  }
  function move(e: PointerEvent) {
    const p = pointers.current.get(e.pointerId);
    if (!p) return;
    pointers.current.set(e.pointerId, { ...p, x: e.clientX, y: e.clientY });
    if (pointers.current.size >= 2) {
      const [a, b] = [...pointers.current.values()],
        d = Math.hypot(a.x - b.x, a.y - b.y);
      if (pinch.current)
        zoomAt(
          local({ x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 }),
          d / pinch.current,
        );
      pinch.current = d;
      return;
    }
    if (
      !dragged.current &&
      Math.hypot(e.clientX - p.startX, e.clientY - p.startY) < 8
    )
      return;
    dragged.current = true;
    root.current?.setPointerCapture(e.pointerId);
    const d = screenToTile({
      x: (e.clientX - p.x) / viewRef.current.zoom,
      y: (e.clientY - p.y) / viewRef.current.zoom,
    });
    callbacks.current.onCamera({
      ...viewRef.current,
      follow: false,
      overview: false,
      x: clamp(viewRef.current.x - d.x, 0, WORLD.width),
      y: clamp(viewRef.current.y - d.y, 0, WORLD.height),
    });
  }
  function up(e: PointerEvent) {
    pointers.current.delete(e.pointerId);
    if (pointers.current.size < 2) pinch.current = 0;
    if (e.type === "pointercancel") dragged.current = true;
  }
  const objectButtons = WORLD.objects.filter(
    (o) =>
      visible(o.position, 80) &&
      (!camera.overview ||
        (o.kind === "landmark" &&
          ["oakrest", "briarford", "stonehaven"].includes(o.id))),
  );
  return (
    <div
      className="tile-world"
      data-testid="rpg-world"
      ref={root}
      onPointerDown={down}
      onPointerMove={move}
      onPointerUp={up}
      onPointerCancel={up}
      onClick={(e) => {
        if (!dragged.current && e.detail) {
          const p = unproject(local({ x: e.clientX, y: e.clientY }));
          onSelect({
            kind: "tile",
            position: {
              worldId: WORLD.id,
              plane: 0,
              x: Math.round(p.x),
              y: Math.round(p.y),
            },
          });
        }
      }}
    >
      <canvas ref={canvas} aria-label="The tile-built Fable Crown frontier" />
      <div className="tile-hit-layer">
        {objectButtons.map((o) => {
          const at = project({
            x: o.position.x + (o.width - 1) / 2,
            y: o.position.y + o.height - 1,
          });
          return (
            <button
              key={o.id}
              className={`tile-object ${["tree", "rock"].includes(o.kind) ? "resource" : ""}`}
              aria-label={`Inspect ${o.name}`}
              title={o.name}
              style={{ left: at.x, top: at.y }}
              onClick={(e) => {
                e.stopPropagation();
                if (!dragged.current || e.detail === 0)
                  onSelect({ kind: "object", id: o.id });
              }}
            >
              <span>
                {[
                  "bank",
                  "shop",
                  "quest",
                  "furnace",
                  "anvil",
                  "range",
                ].includes(o.kind) || camera.overview
                  ? o.name
                  : ""}
              </span>
            </button>
          );
        })}
        {!camera.overview &&
          people
            .filter((p) => visible(p.draw, 50))
            .map((p) => {
              const at = project(p.draw);
              return (
                <button
                  key={p.id}
                  className="tile-actor"
                  aria-label={`Inspect ${p.name}`}
                  style={{ left: at.x, top: at.y - 35 * view.zoom }}
                  onClick={(e) => {
                    e.stopPropagation();
                    if (!dragged.current || e.detail === 0)
                      onSelect({ kind: "actor", id: p.id });
                  }}
                />
              );
            })}
      </div>
      <span className="tile-location">
        {camera.overview
          ? "THE FRONTIER · 256 × 192 TILES"
          : `${state.player.position.x}, ${state.player.position.y} · 600 ms ticks`}
      </span>
    </div>
  );
}

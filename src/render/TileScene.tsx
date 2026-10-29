import { useEffect, useRef, useState, type PointerEvent } from "react";
import type { RpgState, TilePosition, WorldObject, SimulationEffect } from "../rpg/types";
import { worldForState } from "../rpg/world";
import { ENEMIES } from "../rpg/content";
import { artFrames } from "../art-frames";
import { tileToScreen, screenToTile } from "./iso";
import "./tile-scene.css";
import type { FeedbackFloater } from "./feedback";
import { actorAtlas, type Facing } from "./actor-atlas";
import {
  actorFrameKey,
  actorFrameGeometry,
  facingFromMotion,
  observeActorMotion,
  sampleActorMotion,
  resolveActorFrameKey,
  type MotionTimeline,
  consumeEffects,
  committedImpact,
  observeWorkContact,
  observeFootstep,
  workStroke,
  resourceArt,
  districtProp,
  objectHitTarget,
  type EffectCursor,
  type WorkContactCursor,
  type FootstepCursor,
} from "./presentation";
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
  | { kind: "enemy" | "drop"; id: string }
  | { kind: "grave" }
  | { kind: "tile"; position: TilePosition };
interface Props {
  state: RpgState;
  camera: TileCamera;
  onCamera: (c: TileCamera) => void;
  selection: TileSelection | null;
  onSelect: (s: TileSelection) => void;
  feedback?: FeedbackFloater[];
  previewRoute?: TilePosition[];
  presentationEpoch?: number;
  onWorkContact?: (kind: string) => void;
  onFootstep?: (mode: "walk" | "run") => void;
}
const base = import.meta.env.BASE_URL;
const assetNames = [
  "prince",
  "woodcutter",
  "miner",
  "builder",
  "smith",
  "actor-fisher",
  "enemy-boar",
  "enemy-rock-mite",
  "enemy-bandit",
  "anvil",
  "cooking-range",
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
  "iso-house",
  "iso-store",
  "iso-workshop",
  "iso-manor",
  "iso-tree",
  "iso-oak",
  "iso-willow",
  "prop-stump", "prop-exhausted-ore",
  "prop-fence", "prop-gate-closed", "prop-gate-open", "prop-sign", "prop-crops", "prop-supplies",
];
const terrainAsset = {
  grass: "tile-grass",
  dirt: "tile-dirt",
  stone: "tile-stone",
  sand: "tile-dirt",
  water: "tile-water",
};
const clamp = (n: number, a: number, b: number) => Math.max(a, Math.min(b, n));
const architectural = (object: WorldObject) =>
  object.kind === "building" ||
  object.cutaway ||
  [
    "house",
    "store",
    "workshop",
    "manor",
    "iso-house",
    "iso-store",
    "iso-workshop",
    "iso-manor",
  ].includes(object.art ?? "");
const objectFoot = (object: WorldObject) => ({
  x:
    object.position.x +
    (architectural(object) ? object.width - 1 : (object.width - 1) / 2),
  y: object.position.y + object.height - 1,
});
export default function TileScene({
  state,
  camera,
  onCamera,
  selection,
  onSelect,
  feedback = [],
  previewRoute = [],
  presentationEpoch = 0,
  onWorkContact,
  onFootstep,
}: Props) {
  const world = worldForState(state);
  const cachedWorld = useRef(world);
  const root = useRef<HTMLDivElement>(null),
    canvas = useRef<HTMLCanvasElement>(null),
    images = useRef(new Map<string, HTMLCanvasElement>()),
    materials = useRef(new Map<string, HTMLCanvasElement>()),
    hitElements = useRef(new Map<string, HTMLButtonElement>()),
    chunks = useRef(new Map<string, HTMLCanvasElement>()),
    overview = useRef<HTMLCanvasElement | null>(null);
  const farTrees = useRef<HTMLCanvasElement | null>(null);
  const farTreeAvailability = useRef("");
  const depletedTrees = world.objects
    .filter(
      (object) =>
        (object.kind === "tree" || object.kind === "rock") &&
        state.resources[object.id]?.available === false,
    )
    .map((object) => object.id)
    .join("|");
  if (farTreeAvailability.current !== depletedTrees) {
    farTreeAvailability.current = depletedTrees;
    farTrees.current = null;
  }
  const atlasSources = useRef(new Map<string, HTMLImageElement>());
  const actorFrames = useRef(new Map<string, HTMLCanvasElement>());
  const facings = useRef(new Map<number, Facing>());
  const motionTimelines = useRef(new Map<number, MotionTimeline>());
  const effectCursor = useRef<EffectCursor | undefined>(undefined);
  const liveEffects = useRef<(SimulationEffect & { startedAt: number })[]>([]);
  const workContact = useRef<WorkContactCursor | undefined>(undefined);
  const footstep = useRef<FootstepCursor | undefined>(undefined);
  const incoming = consumeEffects(state, presentationEpoch, effectCursor.current);
  effectCursor.current = incoming.cursor;
  if (incoming.reset) { liveEffects.current = []; workContact.current = undefined; footstep.current = undefined; }
  if (incoming.effects.length) {
    const time = performance.now();
    liveEffects.current = [...liveEffects.current.filter(effect => time - effect.startedAt < 1200), ...incoming.effects.map(effect => ({ ...effect, startedAt: time }))].slice(-64);
  }
  if (cachedWorld.current !== world) {
    cachedWorld.current = world;
    chunks.current.clear();
    overview.current = null;
    farTrees.current = null;
  }
  const [size, setSize] = useState({ width: 1200, height: 800 }),
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
  const callbacks = useRef({ onCamera, onSelect, onWorkContact, onFootstep });
  callbacks.current = { onCamera, onSelect, onWorkContact, onFootstep };
  useEffect(() => {
    const observer = new ResizeObserver(([e]) =>
      setSize({ width: e.contentRect.width, height: e.contentRect.height }),
    );
    if (root.current) observer.observe(root.current);
    return () => observer.disconnect();
  }, []);
  useEffect(() => {
    let alive = true;
    for (const sheet of new Set(
      Object.values(actorAtlas).map((frame) => frame.sheet),
    )) {
      const img = new Image();
      img.onload = () => {
        if (!alive) return;
        atlasSources.current.set(sheet, img);
        actorFrames.current.clear();
        setArtVersion((v) => v + 1);
      };
      img.src = `${base}art/${sheet}.webp`;
    }
    for (const name of assetNames) {
      const img = new Image();
      img.src = `${base}art/${name}.webp`;
      img.onload = () => {
        if (alive) {
          const source = document.createElement("canvas");
          const ratio = Math.min(1, 512 / Math.max(img.width, img.height));
          source.width = Math.max(1, Math.round(img.width * ratio));
          source.height = Math.max(1, Math.round(img.height * ratio));
          source
            .getContext("2d")!
            .drawImage(img, 0, 0, source.width, source.height);
          images.current.set(name, source);
          materials.current.clear();
          chunks.current.clear();
          overview.current = null;
          farTrees.current = null;
          setArtVersion((v) => v + 1);
        }
      };
    }
    return () => {
      alive = false;
    };
  }, []);
  const now = performance.now();
  const reduced =
    typeof matchMedia !== "undefined" &&
    matchMedia("(prefers-reduced-motion: reduce)").matches;
  const f = reduced ? 1 : clamp((now - stamp.current.at) / 600, 0, 1);
  const people = [state.player, ...state.npcs].map((p) => {
    const timeline = observeActorMotion(p, state.tick, presentationEpoch, now, motionTimelines.current.get(p.id));
    motionTimelines.current.set(p.id, timeline);
    const motion = sampleActorMotion(timeline, now, reduced);
    return { ...p, timeline, motion, draw: { x: motion.position.x, y: motion.position.y } };
  });
  function samplePerson(actor: (typeof people)[number], time: number) {
    actor.motion = sampleActorMotion(actor.timeline, time, reduced);
    actor.draw.x = actor.motion.position.x;
    actor.draw.y = actor.motion.position.y;
    let facing = actor.timeline.segments.length ? actor.motion.facing : facings.current.get(actor.id) ?? actor.motion.facing;
    if (
      !actor.path.length &&
      !actor.motion.moving &&
      actor.action?.targetId
    ) {
      const target =
        world.objects.find((object) => object.id === actor.action?.targetId)
          ?.position ??
        state.enemies.find((enemy) => enemy.id === actor.action?.targetId)
          ?.position;
      if (target) facing = facingFromMotion(actor.position, target, facing);
    }
    actor.motion.facing = facing;
    facings.current.set(actor.id, facing);
  }
  for (const actor of people) samplePerson(actor, now);
  const enemyFrames = useRef({
    tick: state.tick,
    positions: new Map(state.enemies.map((e) => [e.id, e.position])),
    previous: new Map(state.enemies.map((e) => [e.id, e.position])),
  });
  if (enemyFrames.current.tick !== state.tick) {
    enemyFrames.current = {
      tick: state.tick,
      previous: enemyFrames.current.positions,
      positions: new Map(state.enemies.map((e) => [e.id, e.position])),
    };
  }
  const enemies = state.enemies
    .filter((e) => e.health > 0)
    .map((enemy) => {
      const previous =
        enemyFrames.current.previous.get(enemy.id) ?? enemy.position;
      const moving =
        Math.abs(previous.x - enemy.position.x) +
          Math.abs(previous.y - enemy.position.y) <=
        2;
      return {
        ...enemy,
        definition: ENEMIES[enemy.definitionId],
        draw: moving
          ? {
              x: previous.x + (enemy.position.x - previous.x) * f,
              y: previous.y + (enemy.position.y - previous.y) * f,
            }
          : enemy.position,
      };
    });
  const drops = state.drops.filter(
    (d) => (d.expiresAt === 0 || d.expiresAt > state.tick) && d.items.length,
  );
  const hero = people[0]!,
    fit =
      Math.min(
        size.width / (world.width + world.height) / 32,
        size.height / (world.width + world.height) / 16,
      ) * 0.92;
  const view = {
    ...camera,
    ...(camera.overview
      ? { x: world.width / 2, y: world.height / 2, zoom: fit }
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
        if (x >= world.width || y >= world.height) continue;
        const terrain = world.terrain[y * world.width + x]!,
          p = tileToScreen({ x: lx, y: ly });
        let material = materials.current.get(terrain);
        if (!material) {
          material = document.createElement("canvas");
          material.width = 66;
          material.height = 34;
          const mc = material.getContext("2d")!;
          diamond(mc, 33, 17);
          mc.clip();
          mc.fillStyle = {
            grass: "#b6be86",
            dirt: "#d8bf91",
            stone: "#ddccb0",
            water: "#83a9aa",
            sand: "#d8cfad",
          }[terrain];
          mc.fill();
          const image = images.current.get(terrainAsset[terrain]);
          if (image) {
            mc.globalAlpha = 0.9;
            mc.drawImage(image, 0, 0, 66, 34);
            mc.globalAlpha = 1;
            if (terrain === "dirt") {
              mc.fillStyle = "#d7bb8744";
              mc.fillRect(1, 1, 64, 32);
            }
          } else if (terrain === "water") {
            mc.strokeStyle = "#dae0cb66";
            mc.lineWidth = 1.5;
            mc.beginPath();
            mc.moveTo(18, 19);
            mc.quadraticCurveTo(33, 13, 47, 18);
            mc.stroke();
          }
          materials.current.set(terrain, material);
        }
        ctx.drawImage(material, p.x - 33, p.y - 17);
      }
    // Bounded 48 MiB terrain LRU; distant views use a single ~4 MiB composite.
    if (chunks.current.size >= 24)
      chunks.current.delete(chunks.current.keys().next().value!);
    chunks.current.set(key, c);
    return c;
  }
  useEffect(() => {
    const c = canvas.current;
    if (!c) return;
    let frameId = 0;
    const paint = (time: number) => {
      const fraction = reduced
        ? 1
        : clamp((time - stamp.current.at) / 600, 0, 1);
      for (const actor of people) {
        samplePerson(actor, time);
      }
      const step = observeFootstep(footstep.current, hero.motion, hero.timeline, presentationEpoch);
      footstep.current = step.cursor;
      if (step.mode) callbacks.current.onFootstep?.(step.mode);
      const contact = observeWorkContact(workContact.current, workStroke(hero, state.tick, time - stamp.current.at,
        world.objects.find(object => object.id === hero.action?.targetId), hero.motion), presentationEpoch);
      workContact.current = contact.cursor;
      if (contact.contact && contact.cursor.stroke && ["mine", "cut", "fish", "smith", "cook"].includes(contact.cursor.stroke.pose)) callbacks.current.onWorkContact?.(contact.cursor.stroke.pose);
      for (const enemy of enemies) {
        const previous =
          enemyFrames.current.previous.get(enemy.id) ?? enemy.position;
        if (
          Math.abs(previous.x - enemy.position.x) +
            Math.abs(previous.y - enemy.position.y) <=
          2
        )
          enemy.draw = {
            x: previous.x + (enemy.position.x - previous.x) * fraction,
            y: previous.y + (enemy.position.y - previous.y) * fraction,
          };
      }
      if (camera.follow && !camera.overview) {
        view.x = hero.draw.x;
        view.y = hero.draw.y + 2 / Math.max(0.2, view.zoom);
        Object.assign(center, tileToScreen(view));
      }
      for (const actor of people) {
        const el = hitElements.current.get(`actor-${actor.id}`),
          at = project(actor.draw);
        if (el) {
          el.style.left = `${at.x}px`;
          el.style.top = `${at.y - 35 * view.zoom}px`;
        }
      }
      for (const object of world.objects) {
        const el = hitElements.current.get(`object-${object.id}`);
        if (el) {
          const at = project(objectFoot(object));
          el.style.left = `${at.x}px`;
          el.style.top = `${at.y}px`;
        }
      }
      for (const drop of drops) {
        const el = hitElements.current.get(`drop-${drop.id}`),
          at = project(drop.position);
        if (el) {
          el.style.left = `${at.x}px`;
          el.style.top = `${at.y - 10 * view.zoom}px`;
        }
      }
      if (state.grave) {
        const el = hitElements.current.get("grave"),
          at = project(state.grave.position);
        if (el) {
          el.style.left = `${at.x}px`;
          el.style.top = `${at.y - 20 * view.zoom}px`;
        }
      }
      for (const enemy of enemies) {
        const el = hitElements.current.get(`enemy-${enemy.id}`),
          at = project(enemy.draw);
        if (el) {
          el.style.left = `${at.x}px`;
          el.style.top = `${at.y - 30 * view.zoom}px`;
        }
      }
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
      // Keep the entire visible working set within the terrain cache budget.
      if (
        view.overview ||
        view.zoom < 0.35 ||
        (maxX - minX + 1) * (maxY - minY + 1) > 24
      ) {
        if (!overview.current) {
          const out = document.createElement("canvas");
          out.width = (world.width + world.height) * 3.2;
          out.height = (world.width + world.height) * 1.6 + 8;
          const oc = out.getContext("2d")!;
          oc.scale(0.1, 0.1);
          oc.translate(world.height * 32, 16);
          for (let cy = 0; cy < world.height / 32; cy++)
            for (let cx = 0; cx < world.width / 32; cx++) {
              const p = tileToScreen({ x: cx * 32, y: cy * 32 });
              oc.drawImage(
                groundChunk(cx, cy),
                p.x - 1024,
                p.y - 16,
                2048,
                1024,
              );
            }
          overview.current = out;
        }
        ctx.drawImage(
          overview.current,
          -world.height * 32,
          -16,
          overview.current.width * 10,
          overview.current.height * 10,
        );
      } else {
        for (let sum = minX + minY; sum <= maxX + maxY; sum++)
          for (let cx = minX; cx <= maxX; cx++) {
            const cy = sum - cx;
            if (cy < minY || cy > maxY) continue;
            const p = tileToScreen({ x: cx * 32, y: cy * 32 });
            ctx.drawImage(
              groundChunk(cx, cy),
              p.x - 1024,
              p.y - 16,
              2048,
              1024,
            );
          }
      }
      if (camera.grid && !view.overview && view.zoom >= 0.35) {
        ctx.strokeStyle = "#40594233";
        ctx.lineWidth = 1 / view.zoom;
        // Shared tile edges need only one path, rather than a stroke per cell.
        ctx.beginPath();
        for (let x = -0.5; x <= world.width - 0.5; x++) {
          const a = tileToScreen({ x, y: -0.5 }),
            b = tileToScreen({ x, y: world.height - 0.5 });
          ctx.moveTo(a.x, a.y);
          ctx.lineTo(b.x, b.y);
        }
        for (let y = -0.5; y <= world.height - 0.5; y++) {
          const a = tileToScreen({ x: -0.5, y }),
            b = tileToScreen({ x: world.width - 0.5, y });
          ctx.moveTo(a.x, a.y);
          ctx.lineTo(b.x, b.y);
        }
        ctx.stroke();
      }
      function art(
        name: string,
        p: { x: number; y: number },
        w: number,
        h: number,
        alpha = 1,
        widthOnly = false,
        flipX = false,
      ) {
        const img = images.current.get(name);
        if (!img) return;
        // The source image is released after baking; frame geometry stays full-size.
        const frame = artFrames[name];
        if (flipX) {
          ctx.save();
          ctx.translate(p.x * 2, 0);
          ctx.scale(-1, 1);
        }
        ctx.globalAlpha = alpha;
        if (frame) {
          const scale = widthOnly
            ? w / frame.boundsWidth
            : Math.min(w / frame.boundsWidth, h / frame.boundsHeight);
          ctx.drawImage(
            img,
            p.x - frame.pivotX * scale,
            p.y - frame.pivotY * scale,
            frame.width * scale,
            frame.height * scale,
          );
        } else ctx.drawImage(img, p.x - w / 2, p.y - h, w, h);
        if (flipX) ctx.restore();
        ctx.globalAlpha = 1;
      }
      function princeFrame(key: string, p: { x: number; y: number }): boolean {
        key = resolveActorFrameKey(key, actorAtlas);
        const frame = actorAtlas[key];
        const source = frame && atlasSources.current.get(frame.sheet);
        if (!frame || !source) return false;
        // Tools may extend above a pose: preserve body size across every cell.
        const reference = actorAtlas[`${key.split(":")[0]}:idle`];
        const geometry = actorFrameGeometry(frame, reference?.bodyHeight ?? reference?.boundsHeight);
        let baked = actorFrames.current.get(key);
        if (baked) {
          actorFrames.current.delete(key);
          actorFrames.current.set(key, baked);
        } else {
          // Extract the cell before resampling, at twice gameplay scale for close zoom.
          baked = document.createElement("canvas");
          baked.width = geometry.bakeWidth;
          baked.height = geometry.bakeHeight;
          const bakeContext = baked.getContext("2d")!;
          if (geometry.flipX) {
            bakeContext.translate(baked.width, 0);
            bakeContext.scale(-1, 1);
          }
          bakeContext.drawImage(
              source,
              frame.x,
              frame.y,
              frame.width,
              frame.height,
              0,
              0,
              baked.width,
              baked.height,
            );
          if (actorFrames.current.size >= 96)
            actorFrames.current.delete(
              actorFrames.current.keys().next().value!,
            );
          actorFrames.current.set(key, baked);
        }
        ctx.drawImage(
          baked,
          p.x + geometry.x,
          p.y + geometry.y,
          geometry.width,
          geometry.height,
        );
        return true;
      }
      const treeArt = (object: WorldObject) => {
        const name = `iso-${object.resourceId === "oak" ? "oak" : object.resourceId === "willow" ? "willow" : "tree"}`;
        return resourceArt(object.kind, state.resources[object.id]?.available !== false, images.current.has(name) ? name : (object.art ?? "forest"));
      };
      function depletedProp(object: WorldObject, at: { x: number; y: number }) {
        const name = resourceArt(object.kind, false, object.art ?? "ore");
        if (images.current.has(name)) art(name, at, object.kind === "tree" ? 54 : 90, object.kind === "tree" ? 38 : 50);
        else {
          ctx.fillStyle = object.kind === "tree" ? "#8d724d" : "#7d8175";
          ctx.strokeStyle = object.kind === "tree" ? "#5f5139" : "#555e54"; ctx.lineWidth = 2;
          ctx.beginPath(); ctx.ellipse(at.x, at.y - 8, object.kind === "tree" ? 14 : 28, object.kind === "tree" ? 10 : 14, 0, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
        }
      }
      const distant = view.overview || view.zoom < 0.35;
      if (distant) {
        if (!farTrees.current) {
          const out = document.createElement("canvas");
          out.width = Math.ceil((world.width + world.height) * 3.2);
          out.height = Math.ceil((world.width + world.height) * 1.6 + 8);
          const oc = out.getContext("2d")!;
          oc.scale(0.1, 0.1);
          oc.translate(world.height * 32, 16);
          for (const object of world.objects.filter(
            (object) => object.kind === "tree" || object.kind === "rock",
          )) {
            const available = state.resources[object.id]?.available !== false;
            const name = object.kind === "tree" ? treeArt(object) : resourceArt(object.kind, available, object.art ?? "ore"),
              img = images.current.get(name),
              frame = artFrames[name];
            const at = tileToScreen(objectFoot(object));
            if (!img || !frame) {
              if (!available) { oc.fillStyle = object.kind === "tree" ? "#8d724d" : "#7d8175"; oc.beginPath(); oc.ellipse(at.x, at.y - 8, object.kind === "tree" ? 14 : 28, 10, 0, 0, Math.PI * 2); oc.fill(); }
              continue;
            }
            const variation =
              0.95 +
              ((object.position.x * 17 + object.position.y * 31) % 11) / 100;
            const width = object.kind === "tree" ? available ? 110 : 54 : available ? 100 : 90;
            const height = object.kind === "tree" ? available ? 130 : 38 : available ? 90 : 50;
            const scale = Math.min(width / frame.boundsWidth, height / frame.boundsHeight) * (object.kind === "tree" ? variation : 1);
            oc.drawImage(
              img,
              at.x - frame.pivotX * scale,
              at.y - frame.pivotY * scale,
              frame.width * scale,
              frame.height * scale,
            );
          }
          farTrees.current = out;
        }
        ctx.drawImage(
          farTrees.current,
          -world.height * 32,
          -16,
          farTrees.current.width * 10,
          farTrees.current.height * 10,
        );
      }
      const drawables: { depth: number; draw: () => void }[] = [];
      for (const o of world.objects) {
        const foot = objectFoot(o);
        const selected = selection?.kind === "object" && selection.id === o.id;
        const prop = districtProp(o, state.gates);
        if (prop && distant) continue;
        if ((o.kind === "tree" || o.kind === "rock") && distant && !selected) continue;
        if (!view.overview && !visible(foot, 350)) continue;
        const p = tileToScreen(foot);
        const inside =
          !!o.cutaway &&
          hero.draw.x >= o.position.x - 0.5 &&
          hero.draw.x < o.position.x + o.width - 0.5 &&
          hero.draw.y >= o.position.y - 0.5 &&
          hero.draw.y < o.position.y + o.height - 0.5;
        if (inside) {
          // Interior floors are below actors; the faded shell sorts at its front corner.
          for (let y = 0; y < o.height; y++)
            for (let x = 0; x < o.width; x++) {
              const tile = tileToScreen({
                x: o.position.x + x,
                y: o.position.y + y,
              });
              diamond(ctx, tile.x, tile.y);
              ctx.fillStyle = (x + y) % 2 ? "#cbb88c" : "#d7c69e";
              ctx.fill();
              ctx.strokeStyle = "#89755088";
              ctx.lineWidth = 1;
              ctx.stroke();
            }
          const interior = tileToScreen({
            x: o.position.x + (o.width - 1) / 2,
            y: o.position.y + 0.5,
          });
          if (o.kind === "bank" || o.serviceId?.includes("bank")) {
            ctx.fillStyle = "#a47743";
            ctx.strokeStyle = "#614c34";
            ctx.lineWidth = 2;
            ctx.fillRect(interior.x - 16, interior.y - 20, 32, 20);
            ctx.strokeRect(interior.x - 16, interior.y - 20, 32, 20);
            ctx.fillStyle = "#e7cc7c";
            ctx.fillRect(interior.x - 3, interior.y - 14, 6, 7);
          } else if (o.art?.includes("workshop"))
            art("anvil", interior, 65, 65);
          else if (o.kind === "shop") {
            ctx.fillStyle = "#8c6d48";
            ctx.strokeStyle = "#594a35";
            ctx.lineWidth = 2;
            ctx.fillRect(interior.x - 25, interior.y - 17, 50, 17);
            ctx.strokeRect(interior.x - 25, interior.y - 17, 50, 17);
          }
        }
        drawables.push({
          depth: foot.x + foot.y,
          draw: () => {
            if (prop) {
              if (selected) {
                ctx.strokeStyle = "#f3d98c";
                ctx.lineWidth = 2 / view.zoom;
                ctx.beginPath();
                ctx.ellipse(p.x, p.y, 26, 13, 0, 0, Math.PI * 2);
                ctx.stroke();
              }
              art(prop.art, p, prop.width, prop.height, 1, false, prop.flipX);
            } else if ((o.kind === "tree" || o.kind === "rock") && distant) {
              // Its sprite is already in the composite; selection adds only a ring.
              ctx.strokeStyle = "#f3d98c";
              ctx.lineWidth = 2 / view.zoom;
              ctx.beginPath();
              ctx.ellipse(p.x, p.y, 20, 9, 0, 0, Math.PI * 2);
              ctx.stroke();
            } else if ((o.kind === "tree" || o.kind === "rock") && state.resources[o.id]?.available === false) {
              depletedProp(o, p);
            } else if (o.kind === "quest") {
              const name =
                o.id === "quest-forge"
                  ? "smith"
                  : o.id === "quest-supper"
                    ? "actor-fisher"
                    : "builder";
              art(name, p, 90, 90);
              ctx.fillStyle = "#f5df9f";
              ctx.strokeStyle = "#66522f";
              ctx.lineWidth = 2;
              ctx.beginPath();
              ctx.arc(p.x, p.y - 106, 11, 0, Math.PI * 2);
              ctx.fill();
              ctx.stroke();
              ctx.fillStyle = "#493925";
              ctx.font = "bold 18px Georgia";
              ctx.textAlign = "center";
              ctx.fillText("!", p.x, p.y - 100);
            } else if (
              (o.kind === "anvil" || o.kind === "range") &&
              images.current.has(o.kind === "anvil" ? "anvil" : "cooking-range")
            ) {
              art(
                o.kind === "anvil" ? "anvil" : "cooking-range",
                p,
                110,
                o.kind === "anvil" ? 90 : 110,
              );
            } else if (o.kind === "clue") {
              ctx.fillStyle = "#f4dfa8";
              ctx.strokeStyle = "#8d7147";
              ctx.lineWidth = 2;
              ctx.beginPath();
              ctx.moveTo(p.x - 9, p.y - 20);
              ctx.lineTo(p.x + 8, p.y - 24);
              ctx.lineTo(p.x + 11, p.y - 7);
              ctx.lineTo(p.x - 7, p.y - 3);
              ctx.closePath();
              ctx.fill();
              ctx.stroke();
              ctx.beginPath();
              ctx.moveTo(p.x - 4, p.y - 15);
              ctx.lineTo(p.x + 4, p.y - 17);
              ctx.moveTo(p.x - 3, p.y - 10);
              ctx.lineTo(p.x + 3, p.y - 12);
              ctx.stroke();
            } else if (o.kind === "target") {
              ctx.strokeStyle = "#765c3f";
              ctx.lineWidth = 7;
              ctx.beginPath();
              ctx.moveTo(p.x, p.y);
              ctx.lineTo(p.x, p.y - 48);
              ctx.moveTo(p.x - 22, p.y - 30);
              ctx.lineTo(p.x + 22, p.y - 30);
              ctx.stroke();
              ctx.fillStyle = "#bc9b63";
              ctx.strokeStyle = "#73583c";
              ctx.lineWidth = 2;
              ctx.beginPath();
              ctx.ellipse(p.x, p.y - 43, 17, 24, 0, 0, Math.PI * 2);
              ctx.fill();
              ctx.stroke();
              ctx.strokeStyle = "#9c4d3d";
              ctx.beginPath();
              ctx.ellipse(p.x, p.y - 43, 9, 14, 0, 0, Math.PI * 2);
              ctx.stroke();
            } else if (o.kind === "ferry") {
              ctx.fillStyle = "#9b7954";
              ctx.strokeStyle = "#594d3b";
              ctx.lineWidth = 3;
              ctx.beginPath();
              ctx.moveTo(p.x - 42, p.y - 12);
              ctx.quadraticCurveTo(p.x, p.y + 20, p.x + 42, p.y - 12);
              ctx.quadraticCurveTo(p.x, p.y - 36, p.x - 42, p.y - 12);
              ctx.fill();
              ctx.stroke();
              ctx.beginPath();
              ctx.moveTo(p.x - 25, p.y - 13);
              ctx.lineTo(p.x + 24, p.y - 13);
              ctx.moveTo(p.x - 12, p.y - 22);
              ctx.lineTo(p.x - 12, p.y + 1);
              ctx.moveTo(p.x + 12, p.y - 22);
              ctx.lineTo(p.x + 12, p.y + 1);
              ctx.stroke();
            } else if (o.art) {
              const building = architectural(o);
              const isoName = o.art.startsWith("iso-") ? o.art : `iso-${o.art}`;
              const name =
                o.kind === "tree"
                  ? treeArt(o)
                  : images.current.has(isoName)
                    ? isoName
                    : o.art;
              const variation =
                0.95 + ((o.position.x * 17 + o.position.y * 31) % 11) / 100;
              const w =
                  o.kind === "tree"
                    ? 110 * variation
                    : o.kind === "rock"
                      ? 100
                      : o.kind === "bridge"
                        ? 290
                        : (o.width + o.height) * 32,
                h =
                  o.kind === "tree"
                    ? 130 * variation
                    : o.kind === "rock"
                      ? 90
                      : Math.max(140, w * 0.8);
              art(
                name,
                p,
                w,
                h,
                inside ? 0.18 : 1,
                !!building,
              );
            } else if (o.kind !== "landmark") {
              ctx.fillStyle = o.kind === "fish" ? "#447d8599" : "#756c59";
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
                const name =
                  p.role === "fisher"
                    ? "actor-fisher"
                    : assetNames.includes(p.role)
                      ? p.role
                      : "builder";
                if (p.id === 0) {
                  const key = actorFrameKey(
                    p,
                    facings.current.get(p.id) ?? "se",
                    time - stamp.current.at,
                    reduced,
                    world.objects.find(
                      (object) => object.id === p.action?.targetId,
                    ),
                    p.motion,
                  );
                  if (!princeFrame(key, at)) art("prince", at, 90, 90);
                } else art(name, at, 90, 90);
              },
            });
          }
      if (!view.overview) {
        for (const enemy of enemies) {
          if (!visible(enemy.draw)) continue;
          const at = tileToScreen(enemy.draw);
          const targeted =
            (selection?.kind === "enemy" && selection.id === enemy.id) ||
            (state.control.active?.type === "attack" &&
              state.control.active.enemyId === enemy.id);
          drawables.push({
            depth: enemy.draw.x + enemy.draw.y + 0.1,
            draw: () => {
              ctx.fillStyle = "#493b343b";
              ctx.beginPath();
              ctx.ellipse(at.x, at.y, 19, 7, 0, 0, Math.PI * 2);
              ctx.fill();
              if (targeted) {
                ctx.strokeStyle = "#b14537";
                ctx.lineWidth = 2 / view.zoom;
                ctx.stroke();
              }
              const name = `enemy-${enemy.definitionId}`;
              if (images.current.has(name)) art(name, at, 92, 86);
              else {
                ctx.fillStyle =
                  enemy.definitionId === "rock-mite" ? "#7b8074" : "#886449";
                ctx.strokeStyle = "#493c34";
                ctx.lineWidth = 2;
                ctx.beginPath();
                ctx.ellipse(at.x, at.y - 15, 22, 14, -0.12, 0, Math.PI * 2);
                ctx.fill();
                ctx.stroke();
              }
              const health = clamp(
                enemy.health / (enemy.definition?.health ?? enemy.health),
                0,
                1,
              );
              ctx.fillStyle = "#302e29";
              ctx.fillRect(at.x - 22, at.y - 95, 44, 6);
              ctx.fillStyle = targeted ? "#db8c68" : "#8da36e";
              ctx.fillRect(at.x - 21, at.y - 94, 42 * health, 4);
            },
          });
        }
        for (const drop of drops) {
          if (!visible(drop.position, 80)) continue;
          const at = tileToScreen(drop.position);
          drawables.push({
            depth: drop.position.x + drop.position.y + 0.2,
            draw: () => {
              ctx.fillStyle = "#51483944";
              ctx.beginPath();
              ctx.ellipse(at.x, at.y, 13, 5, 0, 0, Math.PI * 2);
              ctx.fill();
              ctx.fillStyle = "#b98b52";
              ctx.strokeStyle = "#564735";
              ctx.lineWidth = 2;
              ctx.beginPath();
              ctx.moveTo(at.x - 5, at.y - 25);
              ctx.lineTo(at.x + 5, at.y - 25);
              ctx.bezierCurveTo(
                at.x + 3,
                at.y - 17,
                at.x + 17,
                at.y - 5,
                at.x + 8,
                at.y - 2,
              );
              ctx.quadraticCurveTo(at.x, at.y + 2, at.x - 9, at.y - 3);
              ctx.quadraticCurveTo(at.x - 15, at.y - 8, at.x - 5, at.y - 25);
              ctx.fill();
              ctx.stroke();
              ctx.beginPath();
              ctx.moveTo(at.x - 6, at.y - 20);
              ctx.lineTo(at.x + 6, at.y - 20);
              ctx.stroke();
            },
          });
        }
        if (state.grave && visible(state.grave.position, 80)) {
          const at = tileToScreen(state.grave.position);
          drawables.push({
            depth: state.grave.position.x + state.grave.position.y + 0.2,
            draw: () => {
              ctx.fillStyle = "#68796f";
              ctx.strokeStyle = "#394d48";
              ctx.lineWidth = 2;
              ctx.beginPath();
              ctx.moveTo(at.x - 13, at.y);
              ctx.lineTo(at.x - 10, at.y - 30);
              ctx.quadraticCurveTo(at.x, at.y - 40, at.x + 10, at.y - 30);
              ctx.lineTo(at.x + 13, at.y);
              ctx.closePath();
              ctx.fill();
              ctx.stroke();
              ctx.strokeStyle = "#e5ce89";
              ctx.beginPath();
              ctx.moveTo(at.x, at.y - 27);
              ctx.lineTo(at.x, at.y - 9);
              ctx.moveTo(at.x - 5, at.y - 22);
              ctx.lineTo(at.x + 5, at.y - 22);
              ctx.stroke();
            },
          });
        }
      }
      if (!view.overview) for (const effect of liveEffects.current) {
        const age = time - effect.startedAt;
        if (age < 0) continue;
        if (effect.kind === "projectile" && effect.targetPosition && age < 150 && !reduced) {
          const from = tileToScreen(effect.position), to = tileToScreen(effect.targetPosition), fraction = age / 150;
          const x = from.x + (to.x - from.x) * fraction, y = from.y + (to.y - from.y) * fraction - 45;
          const angle = Math.atan2(to.y - from.y, to.x - from.x);
          drawables.push({ depth: effect.targetPosition.x + effect.targetPosition.y + 0.3, draw: () => {
            ctx.save(); ctx.translate(x, y); ctx.rotate(angle);
            ctx.strokeStyle = "#674b32"; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(-12, 0); ctx.lineTo(8, 0); ctx.stroke();
            ctx.fillStyle = "#e7dcc2"; ctx.beginPath(); ctx.moveTo(12, 0); ctx.lineTo(5, -3); ctx.lineTo(5, 3); ctx.closePath(); ctx.fill(); ctx.restore();
          } });
        }
        if (effect.kind === "defeat" && effect.targetPosition && age < 600) {
          const at = tileToScreen(effect.targetPosition);
          const victim = state.enemies.find(enemy => enemy.id === effect.targetId);
          const name = effect.targetId === "player" ? "prince" : victim ? `enemy-${victim.definitionId}` : "";
          if (name) drawables.push({ depth: effect.targetPosition.x + effect.targetPosition.y + 0.15, draw: () => art(name, at, 90, 90, reduced ? 0.3 : 0.7 * (1 - age / 600)) });
        }
        const impact = committedImpact(effect);
        if (impact?.hit && age < 180) {
          const at = tileToScreen(impact.position);
          drawables.push({ depth: impact.position.x + impact.position.y + 0.2, draw: () => {
            ctx.strokeStyle = "#be6957bb"; ctx.lineWidth = 3; ctx.beginPath(); ctx.ellipse(at.x, at.y - 24, 21, 25, 0, 0, Math.PI * 2); ctx.stroke();
          } });
        }
        if (effect.kind === "action-result" && age < 260) {
          const at = tileToScreen(effect.targetPosition ?? effect.position);
          drawables.push({ depth: (effect.targetPosition ?? effect.position).x + (effect.targetPosition ?? effect.position).y + 0.2, draw: () => {
            ctx.fillStyle = effect.success ? "#e7c675" : "#d2c6a8";
            for (let i = 0; i < 3; i++) { ctx.beginPath(); ctx.arc(at.x + (i - 1) * 9, at.y - 20 - (i % 2) * 7, 2.5, 0, Math.PI * 2); ctx.fill(); }
          } });
        }
      }
      drawables.sort((a, b) => a.depth - b.depth).forEach((d) => d.draw());
      if (!view.overview)
        for (const actor of people) {
          const action = actor.action;
          if (
            !action ||
            actor.path.length ||
            !visible(actor.draw) ||
            (actor.id !== 0 &&
              !(selection?.kind === "actor" && selection.id === actor.id))
          )
            continue;
          const at = tileToScreen(actor.draw);
          const progress = clamp(
            (action.duration - action.remaining + fraction) /
              Math.max(1, action.duration),
            0,
            1,
          );
          const ringY = at.y + 8 / view.zoom,
            radius = 18 / view.zoom;
          ctx.strokeStyle = "#273f3ba8";
          ctx.lineWidth = 4 / view.zoom;
          ctx.beginPath();
          ctx.arc(at.x, ringY, radius, 0, Math.PI * 2);
          ctx.stroke();
          const target = world.objects.find(
            (object) => object.id === action.targetId,
          );
          ctx.strokeStyle =
            target?.kind === "rock"
              ? "#afcce0"
              : target?.kind === "tree"
                ? "#bbd09a"
                : "#edba74";
          ctx.beginPath();
          ctx.arc(
            at.x,
            ringY,
            radius,
            -Math.PI / 2,
            -Math.PI / 2 + Math.PI * 2 * progress,
          );
          ctx.stroke();
        }
      ctx.save();
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      for (const effect of liveEffects.current) {
        const hit = committedImpact(effect);
        const age = time - effect.startedAt;
        if (!hit) continue;
        if (age < 0 || age > 1200 || view.overview) continue;
        const at = project(hit.position);
        const y = at.y - 42 - (reduced ? 0 : age / 55);
        ctx.globalAlpha = Math.min(1, (1200 - age) / 250);
        ctx.fillStyle = hit.hit ? "#923c36" : "#596765";
        ctx.strokeStyle = "#f7dfbb";
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.ellipse(at.x, y, hit.hit ? 14 : 22, 14, 0, 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();
        ctx.fillStyle = "#fff0d7";
        ctx.font = "bold 15px Georgia";
        ctx.textAlign = "center";
        ctx.fillText(hit.text, at.x, y + 5);
      }
      ctx.globalAlpha = 1;
      for (const [index, entry] of feedback.slice(-8).entries()) {
        const duration = reduced ? 1000 : 1800,
          age = time - entry.startedAt;
        if (age < 0 || age >= duration || view.overview) continue;
        const at = project(entry.position);
        ctx.globalAlpha = Math.min(1, (duration - age) / 400);
        ctx.font = "bold 15px Georgia";
        ctx.textAlign = "center";
        ctx.lineWidth = 3;
        ctx.strokeStyle = "#24362b";
        ctx.fillStyle =
          entry.tone === "level"
            ? "#ffe09a"
            : entry.tone === "xp"
              ? "#bbdef0"
              : "#eff4d3";
        const y = at.y - 65 - index * 19 - (reduced ? 0 : age / 55);
        ctx.strokeText(entry.text, at.x, y);
        ctx.fillText(entry.text, at.x, y);
      }
      ctx.restore();
      if (previewRoute.length) {
        ctx.strokeStyle = "#8ee1e5";
        ctx.lineWidth = 3 / view.zoom;
        ctx.setLineDash([9 / view.zoom, 6 / view.zoom]);
        ctx.beginPath();
        [state.player.position, ...previewRoute].forEach((p, i) => {
          const at = tileToScreen(p);
          i ? ctx.lineTo(at.x, at.y) : ctx.moveTo(at.x, at.y);
        });
        ctx.stroke();
        ctx.setLineDash([]);
      }
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
      frameId = requestAnimationFrame(paint);
    };
    frameId = requestAnimationFrame(paint);
    return () => cancelAnimationFrame(frameId);
  }, [
    state,
    camera,
    size,
    artVersion,
    selection,
    feedback,
    previewRoute,
    presentationEpoch,
  ]);
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
      x: clamp(c.x + d.x, 0, world.width),
      y: clamp(c.y + d.y, 0, world.height),
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
      x: clamp(viewRef.current.x - d.x, 0, world.width),
      y: clamp(viewRef.current.y - d.y, 0, world.height),
    });
  }
  function up(e: PointerEvent) {
    pointers.current.delete(e.pointerId);
    if (pointers.current.size < 2) pinch.current = 0;
    if (e.type === "pointercancel") dragged.current = true;
  }
  const objectButtons = world.objects.filter(
    (o) =>
      visible(objectFoot(o), 80) &&
      objectHitTarget(o, view.zoom, camera.overview, selection?.kind === "object" && selection.id === o.id),
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
              worldId: world.id,
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
          const at = project(objectFoot(o));
          return (
            <button
              key={o.id}
              ref={(el) => {
                if (el) hitElements.current.set(`object-${o.id}`, el);
                else hitElements.current.delete(`object-${o.id}`);
              }}
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
                ].includes(o.kind) || camera.overview ||
                ((o.kind === "sign" || o.kind === "gate") &&
                  ((selection?.kind === "object" && selection.id === o.id) || view.zoom >= 1.1))
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
                  ref={(el) => {
                    if (el) hitElements.current.set(`actor-${p.id}`, el);
                    else hitElements.current.delete(`actor-${p.id}`);
                  }}
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
        {!camera.overview &&
          enemies
            .filter((enemy) => visible(enemy.draw, 50))
            .map((enemy) => {
              const at = project(enemy.draw);
              const selected =
                selection?.kind === "enemy" && selection.id === enemy.id;
              return (
                <button
                  key={`enemy-${enemy.id}`}
                  ref={(el) => {
                    if (el) hitElements.current.set(`enemy-${enemy.id}`, el);
                    else hitElements.current.delete(`enemy-${enemy.id}`);
                  }}
                  className={`tile-enemy ${selected ? "selected" : ""}`}
                  aria-label={`Inspect ${enemy.definition?.name ?? enemy.definitionId}, ${enemy.health} health`}
                  aria-pressed={selected}
                  title={`${enemy.definition?.name ?? enemy.definitionId} · ${enemy.health} health`}
                  style={{ left: at.x, top: at.y - 30 * view.zoom }}
                  onClick={(e) => {
                    e.stopPropagation();
                    if (!dragged.current || e.detail === 0)
                      onSelect({ kind: "enemy", id: enemy.id });
                  }}
                >
                  <span>{enemy.definition?.name ?? enemy.definitionId}</span>
                </button>
              );
            })}
        {!camera.overview &&
          drops
            .filter((drop) => visible(drop.position, 50))
            .map((drop) => {
              const at = project(drop.position);
              return (
                <button
                  key={`drop-${drop.id}`}
                  ref={(el) => {
                    if (el) hitElements.current.set(`drop-${drop.id}`, el);
                    else hitElements.current.delete(`drop-${drop.id}`);
                  }}
                  className="tile-drop"
                  aria-label={`Inspect loot bag, ${drop.items.length} item types`}
                  title="Loot bag"
                  style={{ left: at.x, top: at.y - 10 * view.zoom }}
                  onClick={(e) => {
                    e.stopPropagation();
                    if (!dragged.current || e.detail === 0)
                      onSelect({ kind: "drop", id: drop.id });
                  }}
                >
                  <span>Loot</span>
                </button>
              );
            })}
        {!camera.overview &&
          state.grave &&
          visible(state.grave.position, 50) &&
          (() => {
            const at = project(state.grave.position);
            return (
              <button
                ref={(el) => {
                  if (el) hitElements.current.set("grave", el);
                  else hitElements.current.delete("grave");
                }}
                className="tile-grave"
                aria-label="Inspect your backpack grave"
                title="Recover backpack"
                style={{ left: at.x, top: at.y - 20 * view.zoom }}
                onClick={(e) => {
                  e.stopPropagation();
                  if (!dragged.current || e.detail === 0)
                    onSelect({ kind: "grave" });
                }}
              >
                <span>Backpack grave</span>
              </button>
            );
          })()}
      </div>
      <div className="tile-progress-accessible">
        {people
          .filter(
            (actor) =>
              actor.action &&
              !actor.path.length &&
              (actor.id === 0 ||
                (selection?.kind === "actor" && selection.id === actor.id)),
          )
          .map((actor) => {
            const action = actor.action!;
            const object = world.objects.find((o) => o.id === action.targetId);
            const label =
              action.kind === "gather"
                ? object?.kind === "rock"
                  ? "Mining"
                  : object?.kind === "tree"
                    ? "Woodcutting"
                    : "Fishing"
                : action.kind === "craft"
                  ? action.recipeId?.includes("cook")
                    ? "Cooking"
                    : "Crafting"
                  : action.kind;
            return (
              <span
                key={actor.id}
                role="progressbar"
                aria-label={`${label} action progress`}
                aria-valuemin={0}
                aria-valuemax={action.duration}
                aria-valuenow={action.duration - action.remaining}
                aria-valuetext={`${actor.name}: ${action.duration - action.remaining} of ${action.duration} ticks`}
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

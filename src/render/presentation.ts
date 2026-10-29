import type {
  ActorState,
  RpgState,
  TilePosition,
  WorldObject,
  MovementTrace,
} from "../rpg/types";
import type { ActorAtlasFrame, Facing } from "./actor-atlas";

type Point = Pick<TilePosition, "x" | "y">;
/** Compass octants after the actual 2:1 isometric projection. */
export function facingFromMotion(
  from: Point,
  to: Point,
  previous: Facing = "se",
): Facing {
  const dx = to.x - from.x,
    dy = to.y - from.y;
  if (!dx && !dy) return previous;
  const octants: Facing[] = ["e", "se", "s", "sw", "w", "nw", "n", "ne"];
  const octant = Math.round(Math.atan2((dx + dy) * 16, (dx - dy) * 32) / (Math.PI / 4));
  return octants[(octant + 8) % 8]!;
}

export function diagonalFacing(facing: Facing): Facing {
  return ({ n: "ne", e: "se", s: "sw", w: "nw" } as Partial<Record<Facing, Facing>>)[facing] ?? facing;
}

const sameTile = (a: TilePosition, b: TilePosition) => a.worldId === b.worldId && a.plane === b.plane && a.x === b.x && a.y === b.y;
export interface MotionTimeline {
  tick: number; epoch: number; at: number; signature: string;
  position: TilePosition; trace: MovementTrace | null; gaitBase: number; facing: Facing;
  segments: MotionSegment[];
}
export interface MotionSegment { from: TilePosition; to: TilePosition; mode: "walk" | "run"; at: number; gaitStart: number }
const segmentDuration = (segment: Pick<MotionSegment, "mode">) => segment.mode === "run" ? 300 : 600;
const segmentEnd = (segment: MotionSegment) => segment.at + segmentDuration(segment);
export interface MotionSample {
  position: Point; facing: Facing; moving: boolean; mode: "walk" | "run";
  /** Continuous distance in legal tile steps, independent of rendering frequency. */
  gaitDistance: number;
}
function validTrace(actor: ActorState, tick: number): MovementTrace | null {
  const trace = actor.movement;
  if (!trace || trace.tick !== tick || !["walk", "run"].includes(trace.mode) || trace.tiles.length < 2 || trace.tiles.length > 3 ||
    !sameTile(trace.tiles[0]!, actor.previousPosition) || !sameTile(trace.tiles.at(-1)!, actor.position)) return null;
  for (let i = 1; i < trace.tiles.length; i++) {
    const from = trace.tiles[i - 1]!, to = trace.tiles[i]!;
    if (from.worldId !== to.worldId || from.plane !== to.plane || !Number.isInteger(to.x) || !Number.isInteger(to.y) ||
      Math.max(Math.abs(to.x - from.x), Math.abs(to.y - from.y)) !== 1) return null;
  }
  return trace;
}
/** Observe new simulation snapshots; command-only renders retain the same clock. */
export function observeActorMotion(actor: ActorState, tick: number, epoch: number, now: number, previous?: MotionTimeline): MotionTimeline {
  const candidate = validTrace(actor, tick);
  const signature = JSON.stringify([actor.position.worldId, actor.position.plane, actor.position.x, actor.position.y, candidate]);
  if (previous?.tick === tick && previous.epoch === epoch && previous.signature === signature) return previous;
  const continuous = previous && previous.tick + 1 === tick && previous.epoch === epoch &&
    previous.position.worldId === actor.position.worldId && previous.position.plane === actor.position.plane;
  const connected = continuous && (candidate ? sameTile(previous.position, candidate.tiles[0]!) : sameTile(previous.position, actor.position));
  const trace = connected ? candidate : null;
  const previousSteps = previous?.trace ? previous.trace.tiles.length - 1 : 0;
  const gaitBase = connected ? previous.gaitBase + previousSteps : 0;
  let carry = connected ? previous.segments.filter(segment => segmentEnd(segment) > now) : [];
  if (carry.length > 2) {
    // Bound backlog to two old legal steps; discard older debt rather than growing latency.
    let at = now;
    carry = carry.slice(-2).map(segment => {
      const rebased = { ...segment, at };
      at = segmentEnd(rebased);
      return rebased;
    });
  }
  const segments = [...carry];
  let at = segments.length ? segmentEnd(segments.at(-1)!) : now;
  if (trace) for (let i = 1; i < trace.tiles.length; i++) {
    const segment = { from: trace.tiles[i - 1]!, to: trace.tiles[i]!, mode: trace.mode, at, gaitStart: gaitBase + i - 1 };
    segments.push(segment);
    at = segmentEnd(segment);
  }
  return {
    tick, epoch, at: now, signature, position: { ...actor.position }, trace,
    gaitBase, segments,
    facing: previous?.segments.length ? facingFromMotion(previous.segments.at(-1)!.from, previous.segments.at(-1)!.to, previous.facing) : previous?.facing ?? "se",
  };
}
export function sampleActorMotion(timeline: MotionTimeline, now: number, reducedMotion = false): MotionSample {
  const last = timeline.segments.at(-1);
  if (!last) return { position: timeline.position, facing: timeline.facing, moving: false, mode: "walk", gaitDistance: timeline.gaitBase };
  const segment = reducedMotion ? last : timeline.segments.find(segment => segmentEnd(segment) > now) ?? last;
  const progress = reducedMotion ? 1 : Math.max(0, Math.min(1, (now - segment.at) / segmentDuration(segment)));
  const { from, to } = segment;
  const position = reducedMotion ? timeline.position : { x: from.x + (to.x - from.x) * progress, y: from.y + (to.y - from.y) * progress };
  return { position, facing: facingFromMotion(from, to, timeline.facing), moving: !reducedMotion && now < segmentEnd(last), mode: segment.mode, gaitDistance: segment.gaitStart + progress };
}

/** Body scale and anatomical ground anchor remain unchanged by the bake resolution. */
export function actorFrameGeometry(frame: ActorAtlasFrame, referenceBodyHeight?: number) {
  const scale = 90 / (frame.bodyHeight ?? referenceBodyHeight ?? frame.boundsHeight);
  const pivotX = frame.flipX ? frame.width - frame.pivotX : frame.pivotX;
  const width = frame.width * scale, height = frame.height * scale;
  const bakeScale = Math.min(2, 256 / width, 256 / height);
  return { x: -pivotX * scale, y: -frame.pivotY * scale, width, height, flipX: !!frame.flipX,
    bakeWidth: Math.min(256, Math.max(1, Math.ceil(width * bakeScale))), bakeHeight: Math.min(256, Math.max(1, Math.ceil(height * bakeScale))) };
}

export function resolveActorFrameKey(key: string, frames: Readonly<Record<string, unknown>>): string {
  if (frames[key]) return key;
  const [direction, pose, index] = key.split(":");
  const facing = diagonalFacing(direction as Facing);
  const candidate = `${facing}:${pose}${index === undefined ? "" : `:${index}`}`;
  if (frames[candidate]) return candidate;
  if (pose === "walk" || pose === "run") {
    const oldWalk = `${facing}:walk:${Number(index ?? 0) % 3}`;
    if (frames[oldWalk]) return oldWalk;
  }
  return `${facing}:idle`;
}

export function actionPose(actor: ActorState, target?: WorldObject): string {
  const action = actor.action;
  if (!action) return "idle";
  if (action.kind === "practice") return "bow";
  if (action.kind === "gather")
    return target?.kind === "rock"
      ? "mine"
      : target?.kind === "tree"
        ? "cut"
        : "fish";
  if (action.kind === "craft")
    return target?.kind === "range" || action.recipeId?.includes("cook")
      ? "cook"
      : "smith";
  // A future ranged contract can use bow equipment without granting animation authority.
  if (action.kind === "fight")
    return actor.equipment.weapon?.includes("bow") ? "bow" : "melee";
  return "idle";
}

export function actorFrameKey(
  actor: ActorState,
  facing: Facing,
  elapsedMs: number,
  reducedMotion: boolean,
  target?: WorldObject,
  motion?: MotionSample,
): string {
  if (motion?.moving)
    return `${facing}:${motion.mode}:${reducedMotion ? 0 : Math.floor(Math.max(0, motion.gaitDistance) * 2) % 4}`;
  if (actor.path.length) return `${facing}:idle`;
  const pose = actionPose(actor, target);
  const actionFacing = pose === "idle" ? facing : diagonalFacing(facing);
  return `${actionFacing}:${reducedMotion || Math.floor(Math.max(0, elapsedMs) / 280) % 2 === 0 ? pose : "idle"}`;
}

export interface HealthObservation {
  tick: number;
  calendar: string;
  epoch: number;
  entities: Map<string, { health: number; position: TilePosition }>;
}
export interface ObservedHit {
  id: string;
  damage: number;
  position: TilePosition;
}
export function observeHealth(state: RpgState, epoch = 0): HealthObservation {
  return {
    tick: state.tick,
    calendar: state.calendar,
    epoch,
    entities: new Map([
      [
        "player",
        { health: state.player.health, position: state.player.position },
      ] as const,
      ...state.enemies.map(
        (enemy) =>
          [
            enemy.id,
            { health: enemy.health, position: enemy.position },
          ] as const,
      ),
    ]),
  };
}
/** Only losses across adjacent observed ticks count; load/catch-up/teleport never invent hits. */
export function observedHits(
  previous: HealthObservation,
  next: HealthObservation,
): ObservedHit[] {
  if (
    next.tick !== previous.tick + 1 ||
    next.calendar !== previous.calendar ||
    next.epoch !== previous.epoch
  )
    return [];
  const hits: ObservedHit[] = [];
  for (const [id, entity] of next.entities) {
    const old = previous.entities.get(id);
    if (
      !old ||
      old.position.worldId !== entity.position.worldId ||
      old.position.plane !== entity.position.plane ||
      Math.max(
        Math.abs(old.position.x - entity.position.x),
        Math.abs(old.position.y - entity.position.y),
      ) > 2
    )
      continue;
    const damage = old.health - entity.health;
    if (damage > 0) hits.push({ id, damage, position: entity.position });
  }
  return hits;
}

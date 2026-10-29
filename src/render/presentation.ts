import type {
  ActorState,
  RpgState,
  TilePosition,
  WorldObject,
} from "../rpg/types";
import type { Facing } from "./actor-atlas";

type Point = Pick<TilePosition, "x" | "y">;
/** Isometric screen quadrants. Standing actors keep their last heading. */
export function facingFromMotion(
  from: Point,
  to: Point,
  previous: Facing = "se",
): Facing {
  const dx = to.x - from.x,
    dy = to.y - from.y;
  if (!dx && !dy) return previous;
  if (Math.abs(dx) >= Math.abs(dy)) return dx > 0 ? "se" : "nw";
  return dy > 0 ? "sw" : "ne";
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
): string {
  const distance = Math.max(
    Math.abs(actor.position.x - actor.previousPosition.x),
    Math.abs(actor.position.y - actor.previousPosition.y),
  );
  const moving = distance > 0 && distance <= 2 && elapsedMs < 600;
  if (moving)
    return `${facing}:walk:${reducedMotion ? 0 : Math.floor(Math.max(0, elapsedMs) / (distance > 1 ? 95 : 170)) % 3}`;
  if (actor.path.length) return `${facing}:idle`;
  const pose = actionPose(actor, target);
  return `${facing}:${reducedMotion || Math.floor(Math.max(0, elapsedMs) / 280) % 2 === 0 ? pose : "idle"}`;
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

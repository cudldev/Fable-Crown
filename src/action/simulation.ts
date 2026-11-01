import { ACTION_DT, type ActionEnemy, type ActionEvent, type ActionInput, type ActionState, type ActionTarget, type ActionWorld } from "./contracts";

const QUANTA = 1024;
const WALK_SPEED = 3;
const SWING_FRAMES = 36;
const SWING_CONTACT = 24;
const REACH = 1.65;
const ENEMY_REACH = 1.5;
const ENEMY_SPEED = 1.5;
const ENEMY_LEASH = 8;
const q = (value: number): number => Math.round(value * QUANTA) / QUANTA;
const distance = (ax: number, az: number, bx: number, bz: number): number => Math.hypot(ax - bx, az - bz);
const finite = (value: number): number => Number.isFinite(value) ? value : 0;

export function idleActionInput(): ActionInput {
  return { moveX: 0, moveZ: 0, strike: false, block: false, tool: false };
}

export function createActionState(x: number, z: number, maxHealth = 10): ActionState {
  const health = Math.max(1, finite(maxHealth));
  return {
    frame: 0, strikeHeld: false, swingTool: false, enemies: [],
    player: {
      x: q(finite(x)), z: q(finite(z)), height: 0, facingX: 0, facingZ: 1,
      health, maxHealth: health, guard: 100, guardDelay: 0, guardBroken: 0,
      swing: 0, blocking: false, moveRemainderX: 0, moveRemainderZ: 0,
    },
  };
}

/** One live fixed step only. Calendar/offline reconciliation must never call this. */
export function stepAction(state: ActionState, input: ActionInput, world: ActionWorld): ActionEvent[] {
  const events: ActionEvent[] = [];
  const p = state.player;
  state.frame += 1;
  const pressed = input.strike && !state.strikeHeld;
  state.strikeHeld = input.strike;
  if (p.health <= 0) {
    p.blocking = false;
    return events;
  }

  if (p.guardDelay > 0) p.guardDelay -= 1;
  if (p.guardBroken > 0) p.guardBroken -= 1;
  p.blocking = input.block && p.guardBroken === 0 && p.guard > 0 && p.swing === 0;
  // Holding guard continually resets the rest period, even without a hit.
  if (input.block) p.guardDelay = 45;
  if (p.guardDelay === 0 && p.guardBroken === 0 && !input.block) {
    p.guard = Math.min(100, p.guard + 20 * ACTION_DT);
  }

  let mx = finite(input.moveX), mz = finite(input.moveZ);
  const magnitude = Math.hypot(mx, mz);
  if (magnitude > 1) { mx /= magnitude; mz /= magnitude; }
  if (magnitude > 0) {
    // Guard keeps the shield facing stable so retreat and strafing remain useful.
    if (!p.blocking && p.swing === 0) { p.facingX = mx / Math.hypot(mx, mz); p.facingZ = mz / Math.hypot(mx, mz); }
    const speed = WALK_SPEED * (p.blocking ? 0.5 : 1) * ACTION_DT;
    const rawX = mx * speed + p.moveRemainderX;
    const rawZ = mz * speed + p.moveRemainderZ;
    const dx = q(rawX), dz = q(rawZ);
    p.moveRemainderX = rawX - dx;
    p.moveRemainderZ = rawZ - dz;
    const nx = q(p.x + dx), nz = q(p.z + dz);
    if (world.canOccupy(nx, nz, p.x, p.z)) { p.x = nx; p.z = nz; }
    else {
      // Fixed X-then-Z slide order is part of replay determinism.
      if (world.canOccupy(nx, p.z, p.x, p.z)) p.x = nx;
      else p.moveRemainderX = 0;
      if (world.canOccupy(p.x, nz, p.x, p.z)) p.z = nz;
      else p.moveRemainderZ = 0;
    }
  } else { p.moveRemainderX = 0; p.moveRemainderZ = 0; }
  p.height = q(finite(world.groundHeight(p.x, p.z)));

  if (pressed && p.swing === 0 && !p.blocking) {
    state.swingTool = input.tool;
    p.swing = SWING_FRAMES;
    const target = findTarget(state, world, state.swingTool);
    if (target) {
      const dx = target.x - p.x, dz = target.z - p.z;
      const length = Math.hypot(dx, dz);
      if (length > 0) {
        const fx = p.facingX * 0.65 + dx / length * 0.35;
        const fz = p.facingZ * 0.65 + dz / length * 0.35;
        const facingLength = Math.hypot(fx, fz);
        p.facingX = fx / facingLength; p.facingZ = fz / facingLength;
      }
    }
  }
  if (p.swing > 0) {
    p.swing -= 1;
    if (p.swing === SWING_CONTACT) {
      const target = findTarget(state, world, state.swingTool);
      if (target?.kind === "resource") events.push({ kind: "resource-hit", targetId: target.id });
      else if (target) {
        const enemy = state.enemies.find((candidate) => candidate.id === target.id);
        if (enemy && !enemy.defeated && enemy.health > 0) {
          enemy.aggressive = true;
          const damage=Math.min(3,enemy.health);
          enemy.health = Math.max(0, enemy.health - damage);
          events.push({ kind: "enemy-hit", targetId: enemy.id, damage });
          if (enemy.health === 0) {
            enemy.defeated = true; enemy.windup = 0;
            events.push({ kind: "enemy-defeat", targetId: enemy.id });
          }
        }
      }
    }
  }

  // Stable array order defines simultaneous hit order and guard-break behavior.
  for (const enemy of state.enemies) {
    if (enemy.defeated || enemy.health <= 0) continue;
    stepEnemy(enemy, state, world, events);
    if (p.health <= 0) break;
  }
  return events;
}

function findTarget(state: ActionState, world: ActionWorld, tool: boolean): ActionTarget | undefined {
  const p = state.player;
  const candidates: readonly ActionTarget[] = tool
    ? world.targets.filter((target) => target.kind === "resource")
    : state.enemies.filter((enemy) => !enemy.defeated && enemy.health > 0 && !world.isSafe(p.x, p.z) && !world.isSafe(enemy.x, enemy.z))
      .map((enemy) => ({ id: enemy.id, x: enemy.x, z: enemy.z, kind: "enemy" as const }));
  return candidates.filter((target) => {
    const dx = target.x - p.x, dz = target.z - p.z, range = Math.hypot(dx, dz);
    return range <= REACH && (range === 0 || (dx * p.facingX + dz * p.facingZ) / range >= 0.5)
      && (tool || outsideSafeSegment(p.x, p.z, target.x, target.z, world));
  }).sort((a, b) => distance(a.x, a.z, p.x, p.z) - distance(b.x, b.z, p.x, p.z) || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0))[0];
}

function stepEnemy(enemy: ActionEnemy, state: ActionState, world: ActionWorld, events: ActionEvent[]): void {
  const p = state.player;
  if (enemy.cooldown > 0) enemy.cooldown -= 1;
  const safe = !outsideSafeSegment(p.x, p.z, enemy.x, enemy.z, world);
  const leashed = distance(p.x, p.z, enemy.homeX, enemy.homeZ) > ENEMY_LEASH;
  if (!enemy.aggressive || safe || leashed) {
    enemy.windup = 0;
    moveEnemy(enemy, enemy.homeX, enemy.homeZ, world);
    return;
  }
  const range = distance(enemy.x, enemy.z, p.x, p.z);
  if (enemy.windup === 0 && enemy.cooldown === 0 && range <= ENEMY_REACH) enemy.windup = 36;
  if (enemy.windup > 0) {
    enemy.windup -= 1;
    if (enemy.windup === 0) {
      enemy.cooldown = 60;
      if (range > ENEMY_REACH || !world.canOccupy(p.x, p.z, enemy.x, enemy.z)) return;
      const dx = enemy.x - p.x, dz = enemy.z - p.z;
      const frontal = range === 0 || (dx * p.facingX + dz * p.facingZ) / range >= 0.5;
      if (p.blocking && frontal) {
        p.guard = Math.max(0, p.guard - 25); p.guardDelay = 45;
        events.push({ kind: "block", targetId: enemy.id });
        if (p.guard === 0) { p.guardBroken = 45; p.blocking = false; }
      } else {
        const damage = Math.max(0, finite(enemy.damage));
        p.health = Math.max(0, p.health - damage);
        events.push({ kind: "player-hit", targetId: enemy.id, damage });
        if (p.health === 0) events.push({ kind: "player-defeat" });
      }
    }
  } else if (range > ENEMY_REACH) moveEnemy(enemy, p.x, p.z, world);
}

function moveEnemy(enemy: ActionEnemy, x: number, z: number, world: ActionWorld): void {
  const dx = x - enemy.x, dz = z - enemy.z, length = Math.hypot(dx, dz);
  if (length === 0) return;
  const scale = Math.min(length, ENEMY_SPEED * ACTION_DT) / length;
  const nx = q(enemy.x + dx * scale), nz = q(enemy.z + dz * scale);
  if (outsideSafeSegment(enemy.x, enemy.z, nx, nz, world) && world.canOccupy(nx, nz, enemy.x, enemy.z)) { enemy.x = nx; enemy.z = nz; }
}

function outsideSafeSegment(ax: number, az: number, bx: number, bz: number, world: ActionWorld): boolean {
  const samples = Math.max(1, Math.ceil(distance(ax, az, bx, bz) * 8));
  for (let i = 0; i <= samples; i += 1) {
    const t = i / samples;
    if (world.isSafe(ax + (bx - ax) * t, az + (bz - az) * t)) return false;
  }
  return true;
}

import { describe, expect, it } from "vitest";
import type { ActionEnemy, ActionEvent, ActionInput, ActionState, ActionWorld } from "../src/action/contracts";
import { createActionState, idleActionInput, stepAction } from "../src/action/simulation";

function world(overrides: Partial<ActionWorld> = {}): ActionWorld {
  return { canOccupy: () => true, groundHeight: () => 0, isSafe: () => false, targets: [], ...overrides };
}
function enemy(id = "wolf", overrides: Partial<ActionEnemy> = {}): ActionEnemy {
  return { id, x: 0, z: 1, homeX: 0, homeZ: 1, health: 6, maxHealth: 6, cooldown: 0, windup: 0, damage: 2, aggressive: true, defeated: false, ...overrides };
}
function advance(state: ActionState, frames: number, input: Partial<ActionInput> = {}, surface = world()): ActionEvent[] {
  const events: ActionEvent[] = [];
  for (let i = 0; i < frames; i += 1) events.push(...stepAction(state, { ...idleActionInput(), ...input }, surface));
  return events;
}

describe("continuous fixed action simulation", () => {
  it("travels exactly3m per second and normalizes diagonal input", () => {
    const straight = createActionState(0, 0), diagonal = createActionState(0, 0);
    advance(straight, 60, { moveX: 1 });
    advance(diagonal, 60, { moveX: 1, moveZ: 1 });
    expect(straight.player.x).toBe(3);
    expect(Math.hypot(diagonal.player.x, diagonal.player.z)).toBeCloseTo(3, 3);
    expect(diagonal.player.facingX).toBeCloseTo(Math.SQRT1_2);
    expect(Number.isInteger(diagonal.player.x * 1024)).toBe(true);
  });

  it("slides along walls, samples final terrain height and never accumulates blocked motion", () => {
    const state = createActionState(0, 0);
    const surface = world({ canOccupy: (x) => x <= 0, groundHeight: (_x, z) => z / 2 });
    advance(state, 60, { moveX: 1, moveZ: 1 }, surface);
    expect(state.player.x).toBe(0);
    expect(state.player.z).toBeCloseTo(3 / Math.sqrt(2), 3);
    expect(state.player.height).toBe(Math.round(state.player.z / 2 * 1024) / 1024);
    advance(state, 1, { moveX: 1 }, world());
    expect(state.player.x).toBeLessThanOrEqual(0.051);
  });

  it("contacts on frame12, holds36frames cooldown and requires a fresh press", () => {
    const state = createActionState(0, 0);
    const surface = world({ isSafe: () => true, targets: [{ id: "oak", x: 0, z: 1, kind: "resource" }] });
    expect(advance(state, 11, { strike: true, tool: true }, surface)).toEqual([]);
    expect(advance(state, 1, { strike: true, tool: true }, surface)).toEqual([{ kind: "resource-hit", targetId: "oak" }]);
    expect(advance(state, 100, { strike: true, tool: true }, surface)).toEqual([]);
    expect(state.player.swing).toBe(0);
    advance(state, 1, {}, surface);
    expect(advance(state, 12, { strike: true, tool: true }, surface)).toHaveLength(1);
  });

  it("consumes presses during cooldown without queueing and latches the tool at swing start", () => {
    const state = createActionState(0, 0);
    const surface = world({ targets: [{ id: "oak", x: 0, z: 1, kind: "resource" }] });
    advance(state, 1, { strike: true, tool: true }, surface);
    advance(state, 1, {}, surface);
    expect(advance(state, 10, { strike: true, tool: false }, surface)).toEqual([{ kind: "resource-hit", targetId: "oak" }]);
    expect(advance(state, 60, { strike: true }, surface)).toEqual([]);
  });

  it("gently assists only forward targets and emits a single defeat per enemy", () => {
    const state = createActionState(0, 0);
    state.enemies = [enemy("behind", { z: -1, aggressive: false }), enemy("front", { x: 0.7, z: 1, health: 3, aggressive: false, homeX: 0.7 })];
    advance(state, 1, { strike: true });
    expect(state.player.facingX).toBeGreaterThan(0);
    expect(state.player.facingX).toBeLessThan(0.4);
    const events = advance(state, 11, { strike: true });
    expect(events).toEqual([{ kind: "enemy-hit", targetId: "front", damage: 3 }, { kind: "enemy-defeat", targetId: "front" }]);
    expect(state.enemies[0].health).toBe(6);
    expect(advance(state, 100, { strike: true })).toEqual([]);
  });

  it("winds up36frames, blocks a frontal hit for25guard, and halves guarded speed", () => {
    const state = createActionState(0, 0);
    state.enemies = [enemy()];
    expect(advance(state, 35, { block: true })).toEqual([]);
    expect(advance(state, 1, { block: true })).toEqual([{ kind: "block", targetId: "wolf" }]);
    expect(state.player.health).toBe(10);
    expect(state.player.guard).toBe(75);
    state.enemies = [];
    advance(state, 60, { moveX: 1, block: true });
    expect(state.player.x).toBe(1.5);
    expect(state.player.facingZ).toBe(1);
  });

  it("provokes a surviving peaceful enemy only after the sword connects", () => {
    const state = createActionState(0, 0);
    state.enemies = [enemy("peaceful", { aggressive: false })];
    advance(state, 11, { strike: true });
    expect(state.enemies[0].aggressive).toBe(false);
    expect(advance(state, 1, { strike: true })).toEqual([{ kind: "enemy-hit", targetId: "peaceful", damage: 3 }]);
    expect(state.enemies[0].aggressive).toBe(true);
    expect(advance(state, 34)).toEqual([]);
    expect(advance(state, 1)).toEqual([{ kind: "player-hit", targetId: "peaceful", damage: 2 }]);
  });

  it("waits45frames after guard release to regenerate, even when no hit occurred", () => {
    const state = createActionState(0, 0);
    state.player.guard = 50;
    advance(state, 100, { block: true });
    expect(state.player.guard).toBe(50);
    advance(state, 44);
    expect(state.player.guard).toBe(50);
    advance(state, 1);
    expect(state.player.guard).toBeCloseTo(50 + 1 / 3);
    advance(state, 59);
    expect(state.player.guard).toBeCloseTo(70);
  });

  it("takes rear hits, breaks guard for45frames and regenerates20guard per second", () => {
    const rear = createActionState(0, 0);
    rear.enemies = [enemy("rear", { z: -1, homeZ: -1 })];
    expect(advance(rear, 36, { block: true })).toEqual([{ kind: "player-hit", targetId: "rear", damage: 2 }]);
    expect(rear.player.guard).toBe(100);

    const state = createActionState(0, 0);
    state.enemies = [enemy("a"), enemy("b"), enemy("c"), enemy("d")];
    expect(advance(state, 36, { block: true }).filter((event) => event.kind === "block")).toHaveLength(4);
    expect(state.player.guard).toBe(0);
    expect(state.player.guardBroken).toBe(45);
    state.enemies = [];
    advance(state, 44);
    expect(state.player.guardBroken).toBe(1);
    expect(state.player.guard).toBe(0);
    advance(state, 60);
    expect(state.player.guardBroken).toBe(0);
    expect(state.player.guard).toBeCloseTo(20);
  });

  it("cancels attacks upon safe-valley entry and never attacks across a safe strip", () => {
    const state = createActionState(0, 0);
    state.enemies = [enemy()];
    advance(state, 35);
    expect(state.enemies[0].windup).toBe(1);
    expect(advance(state, 1, {}, world({ isSafe: (_x, z) => z <= 0 }))).toEqual([]);
    expect(state.enemies[0].windup).toBe(0);
    expect(state.player.health).toBe(10);
    const strip = world({ isSafe: (_x, z) => z > 0.4 && z < 0.6 });
    expect(advance(state, 80, { strike: true }, strip)).toEqual([]);
    expect(state.enemies[0].health).toBe(6);
  });
  it("requires releasing block before guard recovers after a break",()=>{
    const state=createActionState(0,0);state.player.guard=0;state.player.guardBroken=45;
    advance(state,180,{block:true});expect(state.player.guardBroken).toBe(0);expect(state.player.guard).toBe(0);
    advance(state,44);expect(state.player.guard).toBe(0);advance(state,1);expect(state.player.guard).toBeCloseTo(1/3);
  });

  it("leashes enemies home and never moves them into safe terrain", () => {
    const state = createActionState(20, 0);
    state.enemies = [enemy("wolf", { x: 7, z: 0, homeX: 0, homeZ: 0 })];
    advance(state, 300, {}, world({ isSafe: (x) => x < 2 }));
    expect(state.enemies[0].x).toBeGreaterThanOrEqual(2);
    expect(state.enemies[0].x).toBeLessThan(2.1);
    expect(state.enemies[0].windup).toBe(0);
  });

  it("emits player defeat once and reproduces exactly across serialized checkpoints", () => {
    const dead = createActionState(0, 0, 2);
    dead.enemies = [enemy()];
    expect(advance(dead, 36)).toEqual([{ kind: "player-hit", targetId: "wolf", damage: 2 }, { kind: "player-defeat" }]);
    expect(advance(dead, 120)).toEqual([]);

    const state = createActionState(0, 0), surface = world();
    advance(state, 19, { moveX: 0.4, moveZ: 0.8, strike: true });
    const copy = JSON.parse(JSON.stringify(state)) as ActionState;
    const eventsA: ActionEvent[] = [], eventsB: ActionEvent[] = [];
    for (let frame = 0; frame < 240; frame += 1) {
      const input = { moveX: Math.sin(frame / 13), moveZ: Math.cos(frame / 17), strike: frame % 41 < 5, block: frame % 31 < 3, tool: false };
      eventsA.push(...stepAction(state, input, surface));
      eventsB.push(...stepAction(copy, input, surface));
    }
    expect(copy).toEqual(state);
    expect(eventsB).toEqual(eventsA);
  });
});

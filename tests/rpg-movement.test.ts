import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { applyRpgCommand, createRpg, reconcileRpg, stepRpg, validateRpgSave } from "../src/rpg/engine";
import { addItems, itemCount } from "../src/rpg/inventory";
import { canStep, findPath, interactionTiles, isWalkable, objectById, tile, WORLD } from "../src/rpg/world";
import type { RpgCommand, RpgState } from "../src/rpg/types";
const NOW = Date.UTC(2026, 9, 29, 12);
function fresh() { const s = createRpg(NOW, 1); s.control.thinkingUntil = 1e9; return s; }
function at(s: RpgState, id: string) { s.player.position = { ...interactionTiles(objectById(id)!)[0] }; s.player.previousPosition = { ...s.player.position }; s.player.path = []; s.player.movement = null; }
function accept(s: RpgState, command: RpgCommand) { expect(applyRpgCommand(s, command).ok).toBe(true); }
function valid(s: RpgState) { expect(validateRpgSave(s), `tick ${s.tick}: ${JSON.stringify(s.control)} / ${JSON.stringify(s.player.movement)}`).not.toBeNull(); }

describe("authoritative movement traces", () => {
  it("records both legal run segments through a turn rather than an endpoint shortcut", () => {
    const s = fresh(), path = findPath(s.player.position, tile(60, 100))!;
    const tiles = [s.player.position, ...path];
    const index = tiles.findIndex((p, i) => i > 0 && i < tiles.length - 1 &&
      (p.x - tiles[i - 1].x !== tiles[i + 1].x - p.x || p.y - tiles[i - 1].y !== tiles[i + 1].y - p.y));
    expect(index).toBeGreaterThan(0);
    s.player.position = { ...tiles[index - 1] }; s.player.previousPosition = { ...s.player.position };
    s.player.path = tiles.slice(index, index + 2).map((p) => ({ ...p }));
    s.control.active = { type: "move", position: { ...tiles[index + 1] } }; s.control.source = "player";
    const expected = tiles.slice(index - 1, index + 2);
    stepRpg(s);
    expect(s.player.movement).toEqual({ tick: 1, mode: "run", tiles: expected });
    expect(s.player.previousPosition).toEqual(expected[0]); expect(s.player.position).toEqual(expected[2]);
    for (let i = 1; i < expected.length; i++) expect(canStep(expected[i - 1], expected[i])).toBe(true);
    valid(s);
  });
  it.each([[-1, -1], [0, -1], [1, -1], [-1, 0], [1, 0], [-1, 1], [0, 1], [1, 1]])("records one walking step in direction %i,%i", (dx, dy) => {
    const s = fresh(); s.player.position = tile(64, 108); s.player.previousPosition = { ...s.player.position };
    accept(s, { type: "run", enabled: false }); const start = { ...s.player.position }, destination = tile(start.x + dx, start.y + dy);
    expect(canStep(start, destination)).toBe(true); accept(s, { type: "move", position: destination }); stepRpg(s);
    expect(s.player.movement).toEqual({ tick: 1, mode: "walk", tiles: [start, destination] }); valid(s);
  });
  it("retains run mode for the final single run step, then clears a stationary trace", () => {
    const s = fresh(); s.player.runEnergy = 60; const start = { ...s.player.position }, destination = findPath(start, tile(60, 100))![0];
    accept(s, { type: "move", position: destination }); stepRpg(s);
    expect(s.control.running).toBe(false); expect(s.player.runEnergy).toBe(0);
    expect(s.player.movement).toEqual({ tick: 1, mode: "run", tiles: [start, destination] }); valid(s);
    stepRpg(s); expect(s.player.movement).toBeNull(); expect(s.player.previousPosition).toEqual(s.player.position); valid(s);
  });
  it("preserves the current trace through same-tick commands and clears it immediately on Wait", () => {
    const s = fresh(); accept(s, { type: "move", position: tile(60, 100) }); stepRpg(s);
    const trace = structuredClone(s.player.movement);
    accept(s, { type: "run", enabled: false }); accept(s, { type: "style", skill: "strength" });
    accept(s, { type: "move", position: tile(61, 100) }); expect(s.player.movement).toEqual(trace); valid(s);
    accept(s, { type: "enqueue", order: { type: "move", position: tile(62, 100) } });
    const queue = structuredClone(s.control.queue); accept(s, { type: "wait" });
    expect(s.player.movement).toBeNull(); expect(s.player.previousPosition).toEqual(s.player.position);
    stepRpg(s, 3); expect(s.player.movement).toBeNull(); expect(s.control.queue).toEqual(queue); valid(s);
    accept(s, { type: "resume" }); expect(s.control.thinkingUntil).toBe(s.tick + 1);
  });
  it("rejects malformed, stale, overspeed and illegal-corner native traces without accepting a repaired V5", () => {
    const s = fresh(); accept(s, { type: "move", position: tile(60, 100) }); stepRpg(s); valid(s);
    for (const mutate of [
      (state: RpgState) => { delete (state.player as Partial<typeof state.player>).movement; },
      (state: RpgState) => { state.player.movement!.tick = 0; },
      (state: RpgState) => { state.player.movement!.mode = "walk"; },
      (state: RpgState) => { state.player.movement!.tiles[0] = tile(0, 0); },
      (state: RpgState) => { state.player.movement!.tiles[1] = tile(118, 95); },
      (state: RpgState) => { state.player.movement!.tiles.push(tile(60, 100)); },
      (state: RpgState) => { state.player.movement!.tiles.at(-1)!.x++; },
    ]) { const bad = structuredClone(s); mutate(bad); expect(validateRpgSave(bad)).toBeNull(); }
    const before = JSON.stringify(s); expect(applyRpgCommand(s, { type: "move", position: tile(0, 0) }).ok).toBe(false); expect(JSON.stringify(s)).toBe(before);
  });
});

describe("next eligible tick control", () => {
  it("prepares direct gather, craft, service and quest routes at acceptance without doing work", () => {
    const commands: RpgCommand[] = [
      { type: "gather", objectId: "oakrest-ore-0", quantity: 1 }, { type: "craft", recipeId: "bronze-bar", quantity: 1 },
      { type: "bank", objectId: "oakrest-bank" }, { type: "quest", questId: "forge" },
      { type: "interact", objectId: "forge-charcoal", verb: "inspect" },
    ];
    for (const command of commands) {
      const s = fresh(); addItems(s.player.inventory, "copper-ore", 1); addItems(s.player.inventory, "tin-ore", 1);
      const start = { ...s.player.position }, before = structuredClone(s.player.inventory);
      accept(s, command); expect(s.player.path.length).toBeGreaterThan(0); expect(s.player.position).toEqual(start);
      expect(s.player.inventory).toEqual(before); stepRpg(s);
      expect(s.player.position).not.toEqual(start); expect(s.player.movement?.tiles[0]).toEqual(start); valid(s);
    }
    const s = fresh(); at(s, "oakrest-ore-0"); accept(s, { type: "gather", objectId: "oakrest-ore-0", quantity: 1 }); stepRpg(s);
    expect(s.player.action).toMatchObject({ kind: "gather", remaining: 7 }); expect(s.player.movement).toBeNull();
  });
  it("executes a rapid bow→ammo→attack prefix in order and allows later world overrides", () => {
    const s = fresh(); addItems(s.player.inventory, "shortbow", 1); addItems(s.player.inventory, "bronze-arrow", 30);
    const goal = structuredClone(s.control.goal);
    accept(s, { type: "equip", itemId: "shortbow" }); accept(s, { type: "equip", itemId: "bronze-arrow" });
    accept(s, { type: "attack", enemyId: "boar-0" });
    expect(s.control.active).toEqual({ type: "equip", itemId: "shortbow" }); expect(s.control.queue.map((o) => o.type)).toEqual(["equip", "attack"]);
    stepRpg(s); expect(s.player.equipment.weapon).toBe("shortbow"); expect(s.player.ammo).toBeNull(); valid(s);
    stepRpg(s); expect(s.player.ammo).toEqual({ itemId: "bronze-arrow", quantity: 30 }); expect(s.control.goal).toEqual(goal); valid(s);
    stepRpg(s); expect(s.control.active).toMatchObject({ type: "attack", enemyId: "boar-0" }); expect(s.player.movement).not.toBeNull(); valid(s);
    accept(s, { type: "move", position: tile(60, 100) }); expect(s.control.active).toMatchObject({ type: "move" });
    expect(s.player.equipment.weapon).toBe("shortbow"); expect(s.player.ammo?.quantity).toBe(30); valid(s);
  });
  it("replaces only the deferred direct world click while preserving the inventory prefix and explicit queue", () => {
    const s = fresh(); addItems(s.player.inventory, "shortbow", 1); addItems(s.player.inventory, "bronze-arrow", 30);
    const explicit = { type: "quest" as const, questId: "forge" };
    accept(s, { type: "equip", itemId: "shortbow" }); accept(s, { type: "enqueue", order: explicit });
    accept(s, { type: "equip", itemId: "bronze-arrow" }); accept(s, { type: "attack", enemyId: "boar-0" });
    const latest = { type: "move" as const, position: tile(60, 100) };
    accept(s, latest);
    expect(s.control.queue).toEqual([{ type: "equip", itemId: "bronze-arrow" }, latest, explicit]);
    expect(s.control.directOrderIndex).toBe(1); valid(s);
    stepRpg(s); expect(s.player.equipment.weapon).toBe("shortbow"); expect(s.control.directOrderIndex).toBe(1);
    stepRpg(s); expect(s.player.ammo?.quantity).toBe(30); expect(s.control.directOrderIndex).toBe(0); valid(s);
    stepRpg(s); expect(s.control.active).toEqual(latest); expect(s.control.directOrderIndex).toBeUndefined();
    expect(s.control.queue).toEqual([explicit]); expect(s.player.movement).not.toBeNull(); valid(s);
  });
  it("keeps the direct-origin marker correct across reorder, cancel and native validation", () => {
    const s = fresh(); addItems(s.player.inventory, "shortbow", 1); addItems(s.player.inventory, "bronze-arrow", 30);
    accept(s, { type: "equip", itemId: "shortbow" }); accept(s, { type: "equip", itemId: "bronze-arrow" });
    accept(s, { type: "move", position: tile(60, 100) }); accept(s, { type: "enqueue", order: { type: "quest", questId: "forge" } });
    accept(s, { type: "reorder-order", index: 1, direction: 1 }); expect(s.control.directOrderIndex).toBe(2); valid(s);
    accept(s, { type: "move", position: tile(61, 100) }); expect(s.control.queue[1]).toEqual({ type: "quest", questId: "forge" });
    expect(s.control.queue[2]).toEqual({ type: "move", position: tile(61, 100) });
    for (const index of [-1, .5, 8, 0]) {
      const bad = structuredClone(s); bad.control.directOrderIndex = index;
      expect(validateRpgSave(bad)).toBeNull();
    }
    accept(s, { type: "cancel-order", index: 0 }); expect(s.control.directOrderIndex).toBe(1); valid(s);
    accept(s, { type: "cancel-order", index: 1 }); expect(s.control.directOrderIndex).toBeUndefined();
    expect(s.control.queue).toEqual([{ type: "quest", questId: "forge" }]); valid(s);
  });
  it("keeps the eight-pending cap and atomic inventory outcomes", () => {
    const s = fresh(); addItems(s.player.inventory, "shortbow", 1); addItems(s.player.inventory, "bronze-arrow", 30);
    accept(s, { type: "equip", itemId: "shortbow" });
    for (let i = 0; i < 8; i++) accept(s, { type: "equip", itemId: "bronze-arrow" });
    const before = JSON.stringify(s); expect(applyRpgCommand(s, { type: "equip", itemId: "bronze-arrow" }).ok).toBe(false); expect(JSON.stringify(s)).toBe(before);
    stepRpg(s, 9); expect(s.player.ammo).toEqual({ itemId: "bronze-arrow", quantity: 30 });
    expect(itemCount(s.player.inventory, "bronze-arrow")).toBe(0); expect(s.control.queue).toEqual([]); valid(s);
  });
  it("eats on the next tick while preserving the same engagement and three-tick attack delay", () => {
    const s = fresh(), enemy = s.enemies.find((e) => e.id === "ironcoat-0")!;
    s.player.position = { ...enemy.position, x: enemy.position.x - 1 }; s.player.previousPosition = { ...s.player.position };
    s.player.health = 6; accept(s, { type: "attack", enemyId: enemy.id }); stepRpg(s);
    const goal = structuredClone(s.control.goal), meals = itemCount(s.player.inventory, "cooked-shrimp");
    accept(s, { type: "eat", itemId: "cooked-shrimp" }); expect(s.control.active).toMatchObject({ type: "attack", enemyId: enemy.id });
    stepRpg(s); expect(itemCount(s.player.inventory, "cooked-shrimp")).toBe(meals - 1);
    expect(s.control.active).toMatchObject({ type: "attack", enemyId: enemy.id }); expect(s.control.goal).toEqual(goal);
    const ready = s.control.eatReadyAt, health = enemy.health; stepRpg(s, 2);
    expect(s.tick).toBe(ready - 1); expect(enemy.health).toBe(health); expect(s.player.action).toBeNull(); valid(s);
    stepRpg(s); expect(s.player.action?.kind).toBe("fight"); valid(s);
  });
});

describe("V5 copy migration and strict new fields", () => {
  it.each([3, 4])("copies the real V%i archive without dropping legal goals, routes or pending intentions", (version) => {
    const raw = JSON.parse(readFileSync(new URL(`./fixtures/rpg-v${version}-original.json`, import.meta.url), "utf8"));
    raw.control.active = { type: "move", position: tile(60, 100) }; raw.control.source = "player"; raw.control.waiting = false;
    raw.player.path = findPath(raw.player.position, tile(60, 100)); raw.player.action = null;
    raw.control.queue = [{ type: "gather", objectId: "oakrest-ore-0", quantity: 3 }];
    const before = JSON.stringify(raw), migrated = validateRpgSave(raw)!;
    expect(migrated).not.toBeNull(); expect(migrated.version).toBe(5); expect(JSON.stringify(raw)).toBe(before);
    expect(migrated.player.inventory).toEqual(raw.player.inventory); expect(migrated.player.equipment).toEqual(raw.player.equipment);
    expect(migrated.player.position).toEqual(raw.player.position); expect(migrated.player.path).toEqual(raw.player.path);
    expect(migrated.control.goal).toEqual(raw.control.goal); expect(migrated.control.active).toEqual(raw.control.active); expect(migrated.control.queue).toEqual(raw.control.queue);
    expect([migrated.player, ...migrated.npcs].every((p) => p.movement === null)).toBe(true);
    expect(migrated.effects).toEqual([]); expect(migrated.effectSequence).toBe(0); expect(migrated.messages).toEqual([]); expect(migrated.messageSequence).toBe(0);
    const loaded = validateRpgSave(JSON.parse(JSON.stringify(migrated)))!; expect(loaded).not.toBeNull();
    reconcileRpg(migrated, NOW + 24000); reconcileRpg(loaded, NOW + 24000); expect(loaded).toEqual(migrated); valid(loaded);
  });
  it("requires all native V5 fields and validates bounded sequenced effect/message schemas without emitting any", () => {
    const s = fresh(); stepRpg(s, 100); expect(s.effects).toEqual([]); expect(s.messages).toEqual([]); valid(s);
    for (const mutate of [
      (state: RpgState) => { delete (state as Partial<RpgState>).effects; },
      (state: RpgState) => { state.effectSequence = -1; },
      (state: RpgState) => { state.effects = Array(65).fill({ id: 1 }); },
      (state: RpgState) => { delete (state as Partial<RpgState>).messages; },
      (state: RpgState) => { state.messageSequence = 1.5; },
      (state: RpgState) => { state.messages = [{ id: 1, tick: 100, category: "event", key: "bad", text: "Bad", count: 0 }]; state.messageSequence = 1; },
      (state: RpgState) => { state.effects = [{ id: 1, tick: 101, kind: "hit", actorId: "player", position: { ...WORLD.spawns[0] }, amount: 1 }]; state.effectSequence = 1; },
    ]) { const bad = structuredClone(s); mutate(bad); expect(validateRpgSave(bad)).toBeNull(); }
    expect(isWalkable(s.player.position)).toBe(true);
  });
});

import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { applyRpgCommand, createRpg, stepRpg, validateRpgSave } from "../src/rpg/engine";
import { DEFAULT_GATES, GATE_IDS, WORLD, canStep, findPath, interactionTiles, isWalkable, objectById, tile, worldForState, worldVariantKey } from "../src/rpg/world";
import { QUESTS } from "../src/rpg/content";
import { itemCount } from "../src/rpg/inventory";
import { TICK_MS, type RpgCommand, type RpgState, type WorldDefinition } from "../src/rpg/types";
const NOW = Date.UTC(2026, 9, 29, 12);
function fresh() { const s = createRpg(NOW, 7); s.control.thinkingUntil = 1e9;
  for (const npc of s.npcs) { npc.inventory = []; npc.path = []; npc.action = null; } return s; }
function place(s: RpgState, x: number, y: number) { s.player.position = tile(x, y); s.player.previousPosition = { ...s.player.position }; s.player.path = []; s.player.movement = null; }
function accept(s: RpgState, command: RpgCommand) { expect(applyRpgCommand(s, command).ok).toBe(true); }
function valid(s: RpgState) { expect(validateRpgSave(s), `tick${s.tick}: ${JSON.stringify(s.control)}`).not.toBeNull(); }
function connected(world: WorldDefinition) {
  const reached = new Uint8Array(world.width * world.height), queue = [WORLD.spawns[0]];
  reached[queue[0].y * world.width + queue[0].x] = 1;
  for (let head = 0; head < queue.length; head++) for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
    const from = queue[head], next = tile(from.x + dx, from.y + dy), index = next.y * world.width + next.x;
    if (!reached[index] && canStep(from, next, world)) { reached[index] = 1; queue.push(next); }
  }
  for (const object of world.objects) expect(interactionTiles(object, world).some((p) => reached[p.y * world.width + p.x]), object.id).toBe(true);
}

describe("authored Oakrest district", () => {
  it("preserves the full world and240 single trees with sparse functional plots, signs and starter choices", () => {
    const s = createRpg(NOW), props = WORLD.objects.filter((o) => ["fence", "gate", "sign", "decor"].includes(o.kind));
    expect(WORLD.width).toBe(256); expect(WORLD.height).toBe(192); expect(WORLD.objects.filter((o) => o.kind === "tree")).toHaveLength(240);
    expect(props.length).toBeLessThanOrEqual(100); expect(WORLD.objects.filter((o) => o.kind === "fence").length).toBeLessThanOrEqual(70);
    expect(GATE_IDS).toHaveLength(3); expect(s.gates).toEqual(DEFAULT_GATES); expect(Object.values(s.gates).every(Boolean)).toBe(true);
    for (const prop of props) { expect(prop.width).toBe(1); expect(prop.height).toBe(1); expect(prop.position.x).toBeGreaterThanOrEqual(8); expect(prop.position.x).toBeLessThanOrEqual(119); expect(prop.position.y).toBeGreaterThanOrEqual(48); expect(prop.position.y).toBeLessThanOrEqual(143); }
    expect(objectById("oakrest-bank")!.position).toEqual(tile(57, 97)); expect(objectById("oakrest-manor")!.position).toEqual(tile(49, 82));
    expect(s.worldRevision).toBe(2); expect(s.control.thought).toMatchObject({ id: "starter-oakrest", expiresAt: 34 });
    expect(s.control.thought!.choices.map((choice) => choice.id)).toEqual(["starter-forge", "starter-hunt", "starter-trade"]);
    expect(s.control.goal).toEqual(s.control.thought!.choices[0].goal); stepRpg(s, 34); expect(s.control.thought).toBeNull(); expect(s.quests.forge.accepted).toBe(true); valid(s);
  });
  it("keeps every service, resource and plot reachable with every gate open or every gate closed", () => {
    const s = fresh(); connected(worldForState(s));
    s.gates = Object.fromEntries(GATE_IDS.map((id) => [id, false])); connected(worldForState(s)); valid(s);
  });
  it("separates immutable gate/road variants and object-route caches with alternate passages", () => {
    const before = JSON.stringify(WORLD), open = fresh(); place(open, 52, 89);
    accept(open, { type: "interact", objectId: "oakrest-manor", verb: "inspect" });
    const original = structuredClone(open.player.path); expect(original).toContainEqual(tile(52, 88));
    for (const id of GATE_IDS) {
      const closed = fresh(); closed.gates[id] = false;
      expect(worldVariantKey(closed)).not.toBe(worldVariantKey(open)); expect(worldForState(closed)).not.toBe(worldForState(open));
      expect(isWalkable(objectById(id)!.position, worldForState(closed))).toBe(false);
      expect(isWalkable(objectById(id)!.position, WORLD)).toBe(true);
      expect(worldForState(closed)).toBe(worldForState({ quests: closed.quests, gates: { ...closed.gates } }));
    }
    const closed = fresh(); closed.gates["oakrest-manor-gate"] = false; place(closed, 52, 89);
    accept(closed, { type: "interact", objectId: "oakrest-manor", verb: "inspect" });
    expect(closed.player.path).not.toContainEqual(tile(52, 88)); expect(closed.player.path.length).toBeGreaterThan(original.length);
    let previous = closed.player.position; for (const next of closed.player.path) { expect(canStep(previous, next, worldForState(closed))).toBe(true); previous = next; }
    closed.quests.road.complete = true; expect(worldVariantKey(closed)).not.toBe(worldVariantKey({ quests: open.quests, gates: closed.gates }));
    const restored = fresh(); place(restored, 52, 89); accept(restored, { type: "interact", objectId: "oakrest-manor", verb: "inspect" }); expect(restored.player.path).toEqual(original);
    expect(JSON.stringify(WORLD)).toBe(before);
  });
});

describe("deterministic gates and actual sign reads", () => {
  it("rejects unknown/malformed gates and occupied closing atomically for actors, enemies, drops and graves", () => {
    for (const occupant of ["player", "npc", "enemy", "drop", "grave"]) {
      const s = fresh(), gate = objectById("oakrest-workshop-gate")!; place(s, 65, 104);
      if (occupant === "player") place(s, gate.position.x, gate.position.y);
      if (occupant === "npc") { s.npcs[0].position = { ...gate.position }; s.npcs[0].previousPosition = { ...gate.position }; }
      if (occupant === "enemy") s.enemies.find((e) => e.id === "boar-0")!.position = { ...gate.position };
      if (occupant === "drop") s.drops = [{ id: "loot-boar-0", position: { ...gate.position }, items: [{ itemId: "logs", quantity: 1 }], expiresAt: 0 }];
      if (occupant === "grave") s.grave = { position: { ...gate.position }, items: [{ itemId: "logs", quantity: 1 }], attempts: 0, retryAt: 0 };
      valid(s); const before = JSON.stringify(s);
      expect(applyRpgCommand(s, { type: "gate", objectId: gate.id, open: false }).ok, occupant).toBe(false); expect(JSON.stringify(s)).toBe(before);
    }
    const s = fresh();
    for (const command of [{ type: "gate", objectId: "invented", open: false }, { type: "gate", objectId: GATE_IDS[0], open: "closed" }]) {
      const before = JSON.stringify(s); expect(applyRpgCommand(s, command as RpgCommand).ok).toBe(false); expect(JSON.stringify(s)).toBe(before);
    }
  });
  it("closes deterministically after a run trace, invalidates obstructed NPC routes, and preserves goals/queue", () => {
    const s = fresh(); place(s, 52, 89); accept(s, { type: "move", position: tile(52, 87) }); stepRpg(s);
    expect(s.player.movement!.tiles).toContainEqual(tile(52, 88)); const goal = structuredClone(s.control.goal);
    const queued = { type: "move" as const, position: tile(60, 100) }; accept(s, { type: "enqueue", order: queued });
    const npc = s.npcs[0]; npc.position = tile(52, 87); npc.previousPosition = tile(52, 89);
    npc.path = [tile(52, 88), tile(52, 89)]; npc.movement = { tick: s.tick, mode: "run", tiles: [tile(52, 89), tile(52, 88), tile(52, 87)] }; valid(s);
    accept(s, { type: "gate", objectId: "oakrest-manor-gate", open: false }); stepRpg(s);
    expect(s.gates["oakrest-manor-gate"]).toBe(false); expect(s.player.movement).toBeNull(); expect(npc.path).toEqual([]);
    expect(s.control.goal).toEqual(goal); expect(s.control.queue).toEqual([queued]); valid(s);
    accept(s, { type: "gate", objectId: "oakrest-manor-gate", open: true }); stepRpg(s); expect(s.gates["oakrest-manor-gate"]).toBe(true); valid(s);
  });
  it("checks late occupancy at execution and only logs a sign after actually reaching it", () => {
    const s = fresh(); place(s, 65, 104); accept(s, { type: "gate", objectId: "oakrest-workshop-gate", open: false });
    s.npcs[0].position = tile(64, 104); s.npcs[0].previousPosition = tile(64, 104); stepRpg(s);
    expect(s.gates["oakrest-workshop-gate"]).toBe(true); expect(s.messages.some((m) => m.key.startsWith("gate-"))).toBe(false); valid(s);
    const sign = objectById("oakrest-sign-square")!, originalQuest = structuredClone(s.quests); place(s, 49, 96);
    accept(s, { type: "interact", objectId: sign.id, verb: "inspect" }); expect(s.messages.some((m) => m.key === `sign-${sign.id}`)).toBe(false);
    for (let i = 0; i < 50 && s.control.active; i++) stepRpg(s);
    const read = s.messages.find((m) => m.key === `sign-${sign.id}`)!; expect(read.category).toBe("dialogue"); expect(read.text).toContain(sign.description);
    accept(s, { type: "interact", objectId: sign.id, verb: "inspect" }); stepRpg(s); expect(read.count).toBe(2); expect(s.quests).toEqual(originalQuest); valid(s);
  });
});

describe("additive Oakrest migration and measured journey", () => {
  it("copies the real Gate2 V5 chronicle and repairs new collisions without losing personal or historical facts", () => {
    const raw = JSON.parse(readFileSync(new URL("./fixtures/rpg-v5-feel.json", import.meta.url), "utf8"));
    expect(raw.worldRevision).toBeUndefined(); raw.player.position = tile(53, 119); raw.player.previousPosition = tile(53, 119); raw.player.path = []; raw.player.movement = null;
    const before = JSON.stringify(raw), migrated = validateRpgSave(raw)!; expect(migrated).not.toBeNull(); expect(JSON.stringify(raw)).toBe(before);
    expect(migrated.worldRevision).toBe(2); expect(migrated.gates).toEqual(DEFAULT_GATES); expect(isWalkable(migrated.player.position, worldForState(migrated))).toBe(true);
    for (const field of ["inventory", "equipment", "ammo", "skills", "bank"] as const) expect(migrated.player[field]).toEqual(raw.player[field]);
    expect(migrated.bank).toEqual(raw.bank); expect(migrated.quests).toEqual(raw.quests); expect(migrated.rewards).toEqual(raw.rewards);
    expect(migrated.messages).toEqual(raw.messages); expect(migrated.effects).toEqual(raw.effects); expect(migrated.control.goal).toEqual(raw.control.goal); expect(migrated.control.queue).toEqual(raw.control.queue);
    for (const patch of [{ worldRevision: 1 }, { gates: {} }, { gates: { ...DEFAULT_GATES, invented: true } },
      { gates: { ...DEFAULT_GATES, [GATE_IDS[0]]: "open" } }]) {
      const bad = { ...structuredClone(migrated), ...patch }; expect(validateRpgSave(bad)).toBeNull();
    }
    valid(migrated);
  });
  it.each([1, 7, 981])("completes the unchanged forge delivery with all gates closed for seed %i", (seed) => {
    let s = createRpg(NOW, seed); s.gates = Object.fromEntries(GATE_IDS.map((id) => [id, false]));
    let gathering = false, crafting = false, moving = false;
    for (let i = 0; i < 5000 && !s.quests.forge.complete; i++) {
      stepRpg(s); gathering ||= s.player.action?.kind === "gather"; crafting ||= s.player.action?.kind === "craft"; moving ||= s.player.movement !== null;
      if (s.player.action?.kind === "gather") expect([4, 8]).toContain(s.player.action.duration);
      if (s.player.action?.kind === "craft") expect(s.player.action.duration).toBe(5);
      if (s.player.movement) {
        const trace = s.player.movement; expect(trace.tick).toBe(s.tick);
        for (let j = 1; j < trace.tiles.length; j++) expect(canStep(trace.tiles[j - 1], trace.tiles[j], worldForState(s))).toBe(true);
      }
      if (i % 50 === 0) { const loaded = validateRpgSave(JSON.parse(JSON.stringify(s))); expect(loaded, `seed${seed} tick${s.tick}`).not.toBeNull(); s = loaded!; }
    }
    expect(s.quests.forge.complete, s.control.reason).toBe(true); expect(gathering && crafting && moving).toBe(true);
    expect(s.messages.filter((m) => m.key === "quest-completed-forge")).toHaveLength(1);
    expect(QUESTS.forge.items).toEqual([{ itemId: "logs", quantity: 6 }, { itemId: "bronze-bar", quantity: 6 }]);
    expect(TICK_MS).toBe(600); expect(s.player.skills.smithing).toBe(3372); expect(itemCount(s.player.inventory, "logs")).toBe(0);
    console.info(`Oakrest forge seed${seed}: ${s.tick} ticks = ${(s.tick * .6 / 60).toFixed(2)} simulated minutes; gates closed, original600ms/action/XP rules.`);
    valid(s);
  });
});

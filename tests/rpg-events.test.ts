import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { applyRpgCommand, createRpg, reconcileRpg, stepRpg, validateRpgSave } from "../src/rpg/engine";
import { appendGameMessage, appendSimulationEffect } from "../src/rpg/events";
import { addItems, itemCount } from "../src/rpg/inventory";
import { findPath, interactionTiles, objectById, tile, WORLD } from "../src/rpg/world";
import type { RpgCommand, RpgState } from "../src/rpg/types";
const NOW = Date.UTC(2026, 9, 29, 12);
function fresh() { const s = createRpg(NOW, 1); s.control.thinkingUntil = 1e9;
  for (const npc of s.npcs) { npc.inventory = []; npc.path = []; npc.action = null; } return s; }
function at(s: RpgState, id: string) { s.player.position = { ...interactionTiles(objectById(id)!)[0] }; s.player.previousPosition = { ...s.player.position }; s.player.path = []; s.player.movement = null; }
function accept(s: RpgState, command: RpgCommand) { expect(applyRpgCommand(s, command).ok).toBe(true); }
function valid(s: RpgState) { expect(validateRpgSave(s), `tick${s.tick}: ${JSON.stringify(s.effects.slice(-4))}`).not.toBeNull(); }

describe("bounded historical effects and prominent messages", () => {
  it("keeps64 monotonic effect snapshots, including unwalkable target tiles, without retaining mutable references", () => {
    const s = fresh(); s.tick = 1;
    const source = { ...s.player.position }, target = { ...objectById("oakrest-ore-0")!.position };
    appendSimulationEffect(s, { kind: "action-start", actorId: "player", position: source, targetId: "oakrest-ore-0", targetPosition: target, actionKind: "gather" });
    source.x++; target.y++; expect(s.effects[0].position).toEqual(s.player.position); expect(s.effects[0].targetPosition).toEqual(objectById("oakrest-ore-0")!.position);
    valid(s);
    for (let i = 1; i < 130; i++) appendSimulationEffect(s, { kind: "hit", actorId: "player", position: s.player.position,
      targetId: "boar-0", targetPosition: tile(65, 112), actionKind: "fight", success: false, amount: 0 });
    expect(s.effects).toHaveLength(64); expect(s.effects[0].id).toBe(67); expect(s.effects.at(-1)!.id).toBe(130); expect(s.effectSequence).toBe(130); valid(s);
  });
  it("merges only consecutive identical messages within50ticks, preserving IDs and bounding history to100", () => {
    const s = fresh(); s.tick = 1; appendGameMessage(s, "event", "repeat", "A useful event.");
    s.tick = 51; appendGameMessage(s, "event", "repeat", "A useful event.");
    expect(s.messages).toEqual([{ id: 1, tick: 51, category: "event", key: "repeat", text: "A useful event.", count: 2 }]);
    expect(s.messageSequence).toBe(1);
    s.tick = 102; appendGameMessage(s, "event", "repeat", "A useful event."); expect(s.messages).toHaveLength(2);
    appendGameMessage(s, "event", "other", "Something else happened."); appendGameMessage(s, "event", "repeat", "A useful event.");
    appendGameMessage(s, "dialogue", "repeat", "A useful event."); expect(s.messages).toHaveLength(5);
    for (let i = 0; i < 120; i++) appendGameMessage(s, "event", `unique-${i}`, `Event ${i}.`);
    expect(s.messages).toHaveLength(100); expect(s.messages[0].id).toBe(26); expect(s.messages.at(-1)!.id).toBe(125); expect(s.messageSequence).toBe(125); valid(s);
  });
  it("does not turn private NPC work, banking or trades into effect/message floods", () => {
    const s = createRpg(NOW); accept(s, { type: "wait" }); stepRpg(s, 600);
    expect(s.npcs.some((npc) => npc.completed > 0)).toBe(true); expect(s.effects).toEqual([]); expect(s.messages).toEqual([]);
    s.control.visited = ["oakrest"]; at(s, "oakrest-bank"); accept(s, { type: "bank", objectId: "oakrest-bank" }); stepRpg(s);
    accept(s, { type: "withdraw", itemId: "coins", quantity: 25 }); stepRpg(s);
    at(s, "oakrest-shop"); accept(s, { type: "buy", shopId: "oakrest-shop", itemId: "bronze-pickaxe", quantity: 1 }); stepRpg(s);
    expect(s.effects).toEqual([]); expect(s.messages).toEqual([]); valid(s);
  });
});

describe("authoritative work outcomes", () => {
  it("emits one gather start/result, and only a real level-up reaches the prominent log", () => {
    const s = fresh(); at(s, "oakrest-ore-0"); s.player.skills.mining = 800;
    accept(s, { type: "gather", objectId: "oakrest-ore-0", quantity: 1 }); stepRpg(s, 7);
    expect(s.effects).toHaveLength(1); expect(s.effects[0]).toMatchObject({ kind: "action-start", tick: 1, actionKind: "gather", actorId: "player", targetId: "oakrest-ore-0" });
    expect(s.player.skills.mining).toBe(800); stepRpg(s);
    expect(s.effects).toHaveLength(2); expect(s.effects[1]).toMatchObject({ kind: "action-result", tick: 8, success: true, amount: 1 });
    expect(itemCount(s.player.inventory, "copper-ore")).toBe(1); expect(s.player.skills.mining).toBe(975);
    expect(s.messages.filter((m) => m.key === "level-mining-2")).toHaveLength(1);
    expect(s.messages.every((m) => m.key.startsWith("discovery-") || m.key.startsWith("level-"))).toBe(true); valid(s);
  });
  it("records an actual failed gathering attempt without inventing items, XP or rewards", () => {
    const s = fresh(); at(s, "oakrest-tree-0"); s.seed = 1000;
    accept(s, { type: "gather", objectId: "oakrest-tree-0", quantity: 1 }); stepRpg(s, 4);
    expect(s.effects.map((e) => e.kind)).toEqual(["action-start", "action-result"]);
    expect(s.effects[1]).toMatchObject({ actionKind: "gather", success: false, amount: 0 });
    expect(itemCount(s.player.inventory, "logs")).toBe(0); expect(s.player.skills.woodcutting).toBe(0); expect(s.rewards).toEqual([]); valid(s);
  });
  it("binds successful crafting and burned cooking to their real transactions", () => {
    const success = fresh(); at(success, "oakrest-furnace"); addItems(success.player.inventory, "copper-ore", 1); addItems(success.player.inventory, "tin-ore", 1);
    accept(success, { type: "craft", recipeId: "bronze-bar", quantity: 1 }); stepRpg(success, 5);
    expect(success.effects.map((e) => e.kind)).toEqual(["action-start", "action-result"]);
    expect(success.effects[1]).toMatchObject({ actionKind: "craft", success: true, amount: 1, targetId: "oakrest-furnace" });
    expect(success.player.skills.smithing).toBe(62); valid(success);
    const failed = fresh(); at(failed, "oakrest-range"); addItems(failed.player.inventory, "raw-shrimp", 1); failed.seed = 1500;
    accept(failed, { type: "craft", recipeId: "cooked-shrimp", quantity: 1 }); stepRpg(failed, 4);
    expect(failed.effects[1]).toMatchObject({ kind: "action-result", actionKind: "craft", success: false, amount: 0 });
    expect(itemCount(failed.player.inventory, "burnt-shrimp")).toBe(1); expect(failed.player.skills.cooking).toBe(0); expect(failed.rewards).toEqual([]); valid(failed);
  });
  it("records three real practice cycles and leaves Ranged XP untouched", () => {
    const s = fresh(); s.quests.bowyer.accepted = true; s.quests.bowyer.stageId = "practice";
    addItems(s.player.inventory, "training-bow", 1); addItems(s.player.inventory, "training-arrow", 6); at(s, "bowyer-target");
    for (let i = 0; i < 3; i++) { accept(s, { type: "interact", objectId: "bowyer-target", verb: "practice" }); stepRpg(s, 4); }
    expect(s.effects.filter((e) => e.kind === "action-start")).toHaveLength(3); expect(s.effects.filter((e) => e.kind === "action-result")).toHaveLength(3);
    expect(s.effects.every((e) => e.actionKind === "practice")).toBe(true); expect(s.player.skills.ranged).toBe(0);
    expect(s.quests.bowyer.counters?.practice).toBe(3); valid(s);
  });
});

describe("combat facts and historical positions", () => {
  it("records actual capped player damage and enemy defeat from the same source, without overkill XP", () => {
    const s = fresh(), enemy = s.enemies.find((e) => e.id === "boar-0")!;
    s.player.skills.attack = 130344310; s.player.skills.strength = 130344310;
    s.player.position = { ...enemy.position, x: enemy.position.x - 1 }; s.player.previousPosition = { ...s.player.position }; enemy.cooldown = 5; s.seed = 7;
    const start = s.player.skills.attack, victim = { ...enemy.position }; accept(s, { type: "attack", enemyId: enemy.id }); stepRpg(s, 4);
    expect(enemy.health).toBe(0); expect(s.effects.map((e) => e.kind)).toEqual(["action-start", "hit", "defeat"]);
    expect(s.effects[1]).toMatchObject({ actorId: "player", targetId: enemy.id, amount: 8, success: true, targetPosition: victim });
    expect(s.effects[2]).toMatchObject({ actorId: "player", targetId: enemy.id, targetPosition: victim });
    expect(s.player.skills.attack - start).toBe(320); expect(s.messages.filter((m) => m.key === "defeat-boar")).toHaveLength(1); valid(s);
  });
  it("records melee and ranged misses with amount0 while ammunition still follows the simulation", () => {
    const melee = fresh(), mite = melee.enemies.find((e) => e.id === "rock-mite-0")!;
    melee.player.position = { ...mite.position, x: mite.position.x - 1 }; melee.player.previousPosition = { ...melee.player.position }; mite.cooldown = 5; melee.seed = 1000;
    accept(melee, { type: "attack", enemyId: mite.id }); stepRpg(melee, 4);
    expect(melee.effects.map((e) => e.kind)).toEqual(["action-start", "hit"]);
    expect(melee.effects[1]).toMatchObject({ actorId: "player", targetId: mite.id, success: false, amount: 0 });
    expect(melee.player.skills.attack).toBe(0); expect(melee.rewards).toEqual([]); valid(melee);
    const ranged = fresh(); addItems(ranged.player.inventory, "shortbow", 1); addItems(ranged.player.inventory, "bronze-arrow", 30);
    accept(ranged, { type: "equip", itemId: "shortbow" }); stepRpg(ranged); accept(ranged, { type: "equip", itemId: "bronze-arrow" }); stepRpg(ranged);
    const boar = ranged.enemies.find((e) => e.id === "boar-0")!; ranged.player.position = { ...boar.position, x: boar.position.x - 1 }; ranged.player.previousPosition = { ...ranged.player.position }; boar.cooldown = 5; ranged.seed = 1000;
    accept(ranged, { type: "attack", enemyId: boar.id }); stepRpg(ranged, 4);
    expect(ranged.effects.map((e) => e.kind)).toEqual(["action-start", "projectile", "hit"]);
    expect(ranged.effects.slice(1).every((e) => e.amount === 0 && e.success === false && e.actorId === "player" && e.targetId === boar.id)).toBe(true);
    expect(ranged.player.ammo?.quantity).toBe(29); expect(ranged.player.skills.ranged).toBe(0); expect(ranged.rewards).toEqual([]); valid(ranged);
  });
  it("records enemy projectiles, capped damage and defeat before teleporting the victim, then logs real recovery", () => {
    const s = fresh(), enemy = s.enemies.find((e) => e.id === "reedbow-0")!;
    s.player.position = { ...enemy.position, x: enemy.position.x - 1 }; s.player.previousPosition = { ...s.player.position }; s.player.health = 1; s.seed = 5;
    const victim = { ...s.player.position }; accept(s, { type: "attack", enemyId: enemy.id }); stepRpg(s);
    expect(s.effects.map((e) => e.kind)).toEqual(["action-start", "projectile", "hit", "defeat"]);
    expect(s.effects.every((e) => e.actorId === enemy.id && e.targetId === "player")).toBe(true);
    expect(s.effects[2]).toMatchObject({ amount: 1, success: true, targetPosition: victim });
    expect(s.effects[3].targetPosition).toEqual(victim); expect(s.player.position).not.toEqual(victim); expect(s.grave).not.toBeNull();
    expect(s.messages.filter((m) => m.key === "defeat-player")).toHaveLength(1); valid(s);
    s.player.position = { ...s.grave!.position }; s.player.previousPosition = { ...s.player.position }; s.player.movement = null;
    accept(s, { type: "recover" }); stepRpg(s);
    expect(s.grave).toBeNull(); expect(s.messages.filter((m) => m.key === "recovery-complete")).toHaveLength(1); valid(s);
  });
});

describe("prominent quest facts and bounded replay", () => {
  it("logs acceptance, actual dialogue, stages and completion/unlock once; rejected repeat claims stay non-mutating", () => {
    const s = fresh(); at(s, "quest-forge"); accept(s, { type: "quest", questId: "forge" }); stepRpg(s);
    expect(s.messages.some((m) => m.key === "quest-accepted-forge")).toBe(true); expect(s.messages.some((m) => m.category === "dialogue" && m.text.startsWith("Master smith Ren:"))).toBe(true);
    addItems(s.player.inventory, "logs", 6); addItems(s.player.inventory, "bronze-bar", 6);
    accept(s, { type: "goal", goal: { id: "forge", kind: "quest", questId: "forge", title: "Forge supplies" } });
    for (let i = 0; i < 1000 && !s.quests.forge.complete; i++) stepRpg(s);
    expect(s.quests.forge.complete).toBe(true); expect(s.messages.filter((m) => m.key === "quest-completed-forge")).toHaveLength(1);
    expect(s.messages.find((m) => m.key === "quest-completed-forge")!.text).toContain("Unlocked frontier anvils");
    expect(s.messages.filter((m) => m.key.startsWith("quest-stage-forge-"))).toHaveLength(4);
    const before = JSON.stringify(s); expect(applyRpgCommand(s, { type: "quest", questId: "forge" }).ok).toBe(false); expect(JSON.stringify(s)).toBe(before); valid(s);
    s.quests.letters.accepted = true; s.quests.letters.stageId = "route"; at(s, "quest-letters");
    accept(s, { type: "goal", goal: { id: "letters", title: "River Letters", kind: "quest", questId: "letters" } }); stepRpg(s);
    const pending = JSON.stringify(s); expect(applyRpgCommand(s, { type: "dialogue-choice", choiceId: "invented" }).ok).toBe(false); expect(JSON.stringify(s)).toBe(pending);
    accept(s, { type: "dialogue-choice", choiceId: "scout" });
    expect(s.messages.some((m) => m.key === "quest-choice-letters-route-scout" && m.category === "dialogue")).toBe(true); valid(s);
  });
  it("logs first discoveries once and an actual objective blocker, without logging repeated planning attempts", () => {
    const s = fresh(); s.player.inventory = [];
    accept(s, { type: "goal", goal: { id: "blocked-forge", title: "My forge", kind: "quest", questId: "forge" } });
    for (let i = 0; i < 2500 && !(s.control.progress?.failures); i++) stepRpg(s);
    expect(s.messages.filter((m) => m.key === "discovery-oakrest")).toHaveLength(1);
    expect(s.messages.filter((m) => m.key === "blocker-blocked-forge")).toHaveLength(1);
    expect(s.messages.length).toBeLessThan(12); valid(s);
  });
  it("keeps offline effects/messages bounded and deterministic across reload; legacy imports replay no history", () => {
    const s = createRpg(NOW, 7); stepRpg(s, 40); const copy = validateRpgSave(JSON.parse(JSON.stringify(s)))!; expect(copy).not.toBeNull();
    reconcileRpg(s, NOW + 24 * 3600000); reconcileRpg(copy, NOW + 24 * 3600000);
    expect(copy).toEqual(s); expect(s.effects.length).toBeLessThanOrEqual(64); expect(s.messages.length).toBeLessThanOrEqual(100);
    expect(s.effects.at(-1)?.id).toBe(s.effectSequence); expect(s.messages.at(-1)?.id).toBe(s.messageSequence); valid(s);
    const raw = JSON.parse(readFileSync(new URL("./fixtures/rpg-v4-original.json", import.meta.url), "utf8")), before = JSON.stringify(raw);
    const migrated = validateRpgSave(raw)!; expect(migrated).not.toBeNull(); expect(JSON.stringify(raw)).toBe(before);
    expect(migrated.effects).toEqual([]); expect(migrated.messages).toEqual([]);
    expect(validateRpgSave(JSON.parse(JSON.stringify(migrated)))!.messages).toEqual([]);
  }, 15000);
});

describe("ordinary villager dialogue", () => {
  it("logs a nearby role/home greeting only after Talk executes, merges repeats and preserves goal/queue", () => {
    const s = fresh(), npc = s.npcs[0], goal = structuredClone(s.control.goal);
    const inventory = structuredClone(s.player.inventory), skills = { ...s.player.skills };
    const pending = { type: "move" as const, position: tile(60, 100) };
    accept(s, { type: "enqueue", order: pending }); accept(s, { type: "talk-actor", actorId: npc.id });
    expect(s.messages).toEqual([]); stepRpg(s);
    const greeting = s.messages.find((m) => m.key === `talk-actor-${npc.id}`)!;
    expect(greeting).toMatchObject({ category: "dialogue", count: 1 });
    expect(greeting.text).toContain(`${npc.name}:`); expect(greeting.text).toContain(npc.role); expect(greeting.text).toContain("Oakrest");
    expect(s.control.goal).toEqual(goal); expect(s.control.queue).toEqual([pending]);
    accept(s, { type: "talk-actor", actorId: npc.id }); stepRpg(s);
    expect(s.messages.filter((m) => m.key === greeting.key)).toHaveLength(1); expect(greeting.count).toBe(2);
    expect(s.player.inventory).toEqual(inventory); expect(s.player.skills).toEqual(skills); expect(s.rewards).toEqual([]);
    accept(s, { type: "enqueue", order: { type: "talk-actor", actorId: 2 } });
    expect(s.control.queue).toEqual([pending, { type: "talk-actor", actorId: 2 }]); valid(s);
  });
  it("moves before speaking and replans for a moving villager deterministically across reload", () => {
    const s = fresh(), npc = s.npcs[0]; npc.position = tile(64, 108); npc.previousPosition = { ...npc.position };
    npc.path = findPath(npc.position, tile(80, 108))!;
    accept(s, { type: "talk-actor", actorId: npc.id }); const firstEndpoint = { ...s.player.path.at(-1)! };
    stepRpg(s); expect(s.player.movement).not.toBeNull(); expect(s.messages.some((m) => m.key === `talk-actor-${npc.id}`)).toBe(false);
    const loaded = validateRpgSave(JSON.parse(JSON.stringify(s)))!; expect(loaded).not.toBeNull();
    stepRpg(s); stepRpg(loaded); expect(s.player.path.at(-1)).not.toEqual(firstEndpoint);
    for (let i = 0; i < 1000 && s.control.active; i++) { stepRpg(s); stepRpg(loaded); }
    expect(s.control.active).toBeNull(); expect(loaded).toEqual(s);
    expect(s.messages.filter((m) => m.key === `talk-actor-${npc.id}`)).toHaveLength(1);
    expect(Math.max(Math.abs(s.player.position.x - npc.position.x), Math.abs(s.player.position.y - npc.position.y))).toBeLessThanOrEqual(1); valid(s);
  });
  it("rejects unknown or dead villagers without mutation and handles a disappearing accepted target gracefully", () => {
    const s = fresh(); accept(s, { type: "move", position: tile(60, 100) });
    for (const id of [0, -1, 1.5, 24, 999]) {
      const before = JSON.stringify(s); expect(applyRpgCommand(s, { type: "talk-actor", actorId: id }).ok).toBe(false); expect(JSON.stringify(s)).toBe(before);
    }
    s.npcs[0].health = 0; const dead = JSON.stringify(s);
    expect(applyRpgCommand(s, { type: "talk-actor", actorId: 1 }).ok).toBe(false); expect(JSON.stringify(s)).toBe(dead); s.npcs[0].health = 10;
    const goal = structuredClone(s.control.goal), pending = { type: "move" as const, position: tile(61, 100) };
    accept(s, { type: "enqueue", order: pending }); accept(s, { type: "talk-actor", actorId: 9 });
    const actors = [...s.npcs]; s.npcs = s.npcs.filter((actor) => actor.id !== 9); stepRpg(s);
    expect(s.control.active).toBeNull(); expect(s.control.goal).toEqual(goal); expect(s.control.queue).toEqual([pending]);
    expect(s.messages.some((m) => m.key === "talk-actor-9")).toBe(false);
    s.npcs = actors; valid(s);
  });
});

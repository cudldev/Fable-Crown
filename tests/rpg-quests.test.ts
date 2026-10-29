import { describe, it, expect } from "vitest";
import {
  createRpg,
  stepRpg,
  applyRpgCommand,
  validateRpgSave,
  stationAvailable,
} from "../src/rpg/engine";
import { QUESTS } from "../src/rpg/content";
import {
  WORLD,
  worldForState,
  objectById,
  interactionTiles,
  findPath,
  tile,
} from "../src/rpg/world";
import { addItems, itemCount } from "../src/rpg/inventory";
import { XP_THRESHOLDS } from "../src/rpg/skills";
import type { RpgState } from "../src/rpg/types";
const NOW = Date.UTC(2026, 9, 29);
function fresh() {
  const s = createRpg(NOW);
  s.control.thinkingUntil = 1e9;
  return s;
}
function at(s: RpgState, id: string) {
  s.player.position = { ...interactionTiles(objectById(id)!)[0] };
  s.player.previousPosition = { ...s.player.position };
  s.player.path = [];
}
function quest(s: RpgState, id: string) {
  expect(applyRpgCommand(s, { type: "quest", questId: id }).ok).toBe(true);
  for (let i = 0; i < 1000 && s.control.active; i++) stepRpg(s);
  expect(s.control.active).toBeNull();
  s.control.thinkingUntil = 1e9;
  expect(validateRpgSave(s)).not.toBeNull();
}
describe("original service and route quest chains", () => {
  it("accepts at the giver, consumes forge supplies once and awards useful local anvil access", () => {
    const s = fresh();
    const start = { ...s.player.position };
    applyRpgCommand(s, { type: "quest", questId: "forge" });
    stepRpg(s);
    expect(s.quests.forge.accepted).toBe(false);
    expect(s.player.path.length).toBeGreaterThan(0);
    expect(s.player.position).toEqual(start);
    at(s, "quest-forge");
    quest(s, "forge");
    expect(s.quests.forge.accepted).toBe(true);
    expect(s.quests.forge.complete).toBe(false);
    expect(stationAvailable(s, objectById("oakrest-anvil")!)).toBe(true);
    expect(stationAvailable(s, objectById("briarford-anvil")!)).toBe(false);
    expect(stationAvailable(s, objectById("stonehaven-furnace")!)).toBe(true);
    addItems(s.player.inventory, "logs", 6);
    addItems(s.player.inventory, "bronze-bar", 6);
    const coins = itemCount(s.player.inventory, "coins");
    quest(s, "forge");
    expect(s.quests.forge.complete).toBe(true);
    expect(itemCount(s.player.inventory, "logs")).toBe(0);
    expect(itemCount(s.player.inventory, "bronze-bar")).toBe(0);
    expect(itemCount(s.player.inventory, "coins")).toBe(coins + 80);
    expect(s.player.skills.smithing).toBe(3000);
    expect(s.player.skills.mining).toBe(3000);
    expect(stationAvailable(s, objectById("briarford-anvil")!)).toBe(true);
    const saved = JSON.stringify(s);
    expect(applyRpgCommand(s, { type: "quest", questId: "forge" }).ok).toBe(
      false,
    );
    expect(JSON.stringify(s)).toBe(saved);
  });
  it("requires delivered meals and unlocks the Briarford range after supper", () => {
    const s = fresh();
    at(s, "quest-supper");
    expect(stationAvailable(s, objectById("briarford-range")!)).toBe(false);
    expect(stationAvailable(s, objectById("oakrest-range")!)).toBe(true);
    quest(s, "supper");
    quest(s, "supper");
    expect(s.quests.supper.complete).toBe(true);
    expect(itemCount(s.player.inventory, "cooked-shrimp")).toBe(0);
    expect(itemCount(s.player.inventory, "coins")).toBe(85);
    expect(s.player.skills.fishing).toBe(2000);
    expect(s.player.skills.cooking).toBe(3000);
    expect(stationAvailable(s, objectById("briarford-range")!)).toBe(true);
  });
  it("requires road skills, supplies and accepted-quest kills before opening a real shorter route", () => {
    const s = fresh();
    at(s, "quest-road");
    quest(s, "road");
    addItems(s.player.inventory, "oak-logs", 8);
    quest(s, "road");
    expect(s.quests.road.complete).toBe(false);
    for (const skill of ["attack", "strength", "defence"] as const)
      s.player.skills[skill] = XP_THRESHOLDS[4];
    s.player.skills.woodcutting = XP_THRESHOLDS[14];
    quest(s, "road");
    expect(s.quests.road.complete).toBe(false);
    s.quests.road.kills = 3;
    const before = findPath(tile(110, 95), tile(130, 95), WORLD)!;
    const oldCollision = [...WORLD.collision];
    quest(s, "road");
    expect(s.quests.road.complete).toBe(true);
    expect(itemCount(s.player.inventory, "oak-logs")).toBe(0);
    expect(s.player.skills.attack).toBe(XP_THRESHOLDS[4] + 5000);
    const unlocked = worldForState(s);
    expect(unlocked).not.toBe(WORLD);
    expect(worldForState(s)).toBe(unlocked);
    expect(WORLD.collision).toEqual(oldCollision);
    const after = findPath(tile(110, 95), tile(130, 95), unlocked)!;
    expect(after.length).toBeLessThan(before.length);
    expect(after.length).toBe(20);
    expect(
      applyRpgCommand(s, { type: "move", position: tile(119, 95) }).ok,
    ).toBe(true);
    for (let i = 0; i < 1000 && s.control.active; i++) {
      stepRpg(s);
      expect(validateRpgSave(s)).not.toBeNull();
    }
    expect(s.player.position).toEqual(tile(119, 95));
  });
  it("keeps quest goals persistent while autonomously completing all three chains", () => {
    const s = createRpg(NOW);
    let firstQuest: string | undefined;
    for (let i = 0; i < 24000 && !s.quests.road.complete; i++) {
      stepRpg(s);
      if (s.control.goal?.kind === "quest") {
        if (!firstQuest) firstQuest = s.control.goal.questId;
        if (!s.quests[s.control.goal.questId!].complete)
          expect(s.control.goal.questId).toBe(
            Object.keys(QUESTS).find((id) => !s.quests[id].complete),
          );
      }
      if (i % 100 === 0)
        expect(validateRpgSave(s), `tick ${s.tick}`).not.toBeNull();
    }
    expect(firstQuest).toBe("forge");
    expect(s.quests.forge.complete).toBe(true);
    expect(s.quests.supper.complete).toBe(true);
    expect(s.quests.road.complete).toBe(true);
    expect(s.quests.road.kills).toBe(3);
    expect(s.player.health).toBeGreaterThan(0);
    expect(validateRpgSave(s)).not.toBeNull();
  }, 15000);
  it("reorders and removes only pending orders with bounds checks", () => {
    const s = fresh();
    applyRpgCommand(s, { type: "move", position: tile(60, 100) });
    const current = structuredClone(s.control.active);
    applyRpgCommand(s, {
      type: "enqueue",
      order: { type: "move", position: tile(61, 100) },
    });
    applyRpgCommand(s, {
      type: "enqueue",
      order: { type: "move", position: tile(62, 100) },
    });
    expect(
      applyRpgCommand(s, { type: "reorder-order", index: 1, direction: -1 }).ok,
    ).toBe(true);
    expect(s.control.queue[0]).toEqual({
      type: "move",
      position: tile(62, 100),
    });
    expect(applyRpgCommand(s, { type: "cancel-order", index: 1 }).ok).toBe(
      true,
    );
    expect(s.control.queue).toHaveLength(1);
    expect(s.control.active).toEqual(current);
    expect(applyRpgCommand(s, { type: "cancel-order", index: 8 }).ok).toBe(
      false,
    );
    expect(
      applyRpgCommand(s, { type: "reorder-order", index: 0, direction: -1 }).ok,
    ).toBe(false);
    expect(validateRpgSave(s)).not.toBeNull();
  });
  it("holds pending orders during Wait and resumes them in their existing order", () => {
    const s = fresh(),
      first = { type: "move" as const, position: tile(52, 95) },
      second = { type: "move" as const, position: tile(54, 95) };
    applyRpgCommand(s, { type: "move", position: tile(60, 100) });
    applyRpgCommand(s, { type: "enqueue", order: first });
    applyRpgCommand(s, { type: "enqueue", order: second });
    applyRpgCommand(s, { type: "wait" });
    const held = { ...s.player.position };
    stepRpg(s, 20);
    expect(s.player.position).toEqual(held);
    expect(s.control.queue).toEqual([first, second]);
    expect(validateRpgSave(s)).not.toBeNull();
    applyRpgCommand(s, { type: "resume" });
    stepRpg(s);
    expect(s.control.active).toEqual(first);
    expect(s.control.queue).toEqual([second]);
    for (let i = 0; i < 100 && s.control.active; i++) stepRpg(s);
    expect(s.player.position).toEqual(first.position);
    stepRpg(s);
    expect(s.control.active).toEqual(second);
    for (let i = 0; i < 100 && s.control.active; i++) stepRpg(s);
    expect(s.player.position).toEqual(second.position);
    expect(s.control.queue).toEqual([]);
    expect(validateRpgSave(s)).not.toBeNull();
  });
  it("rejects forged quest progress and unsupported ambitions", () => {
    const a = fresh();
    a.quests.road.kills = 4;
    expect(validateRpgSave(a)).toBeNull();
    const b = fresh();
    b.quests.forge.complete = true;
    expect(validateRpgSave(b)).toBeNull();
    const c = fresh();
    expect(
      applyRpgCommand(c, {
        type: "goal",
        goal: { id: "bad", title: "bad", kind: "quest", questId: "invented" },
      }).ok,
    ).toBe(false);
  });
});

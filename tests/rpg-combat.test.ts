import { describe, it, expect } from "vitest";
import {
  createRpg,
  stepRpg,
  applyRpgCommand,
  validateRpgSave,
  maxHealth,
  reconcileRpg,
} from "../src/rpg/engine";
import { ENEMIES, ITEMS } from "../src/rpg/content";
import { WORLD, ENEMY_SPAWNS, isWalkable, tile } from "../src/rpg/world";
import {
  addItems,
  removeItems,
  itemCount,
  inventorySlots,
} from "../src/rpg/inventory";
import { XP_THRESHOLDS } from "../src/rpg/skills";
import type { RpgState } from "../src/rpg/types";
const NOW = Date.UTC(2026, 9, 29);
function fresh() {
  const s = createRpg(NOW, 7);
  s.control.thinkingUntil = 1e9;
  return s;
}
function near(s: RpgState, id: string) {
  const e = s.enemies.find((e) => e.id === id)!;
  s.player.position = { ...e.position, x: e.position.x - 1 };
  s.player.previousPosition = { ...s.player.position };
  return e;
}
function finish(s: RpgState, limit = 1000) {
  for (let i = 0; i < limit && s.control.active; i++) stepRpg(s);
  expect(s.control.active).toBeNull();
  s.control.thinkingUntil = 1e9;
}
describe("seeded melee and survival", () => {
  it("has twelve legal original enemies including ranged and armoured outlaws", () => {
    const s = fresh();
    expect(s.enemies).toHaveLength(12);
    for (const e of s.enemies) {
      expect(isWalkable(e.home)).toBe(true);
      expect(ENEMIES[e.definitionId]).toBeDefined();
      expect(e.health).toBe(ENEMIES[e.definitionId].health);
    }
    expect(ENEMY_SPAWNS).toHaveLength(12);
    expect(validateRpgSave(s)).not.toBeNull();
  });
  it("awards style XP only for actual damage and caps overkill; HP XP stays integer tenths", () => {
    for (const style of ["attack", "strength", "defence"] as const) {
      const s = fresh(),
        enemy = near(s, "boar-0");
      s.player.skills.attack = XP_THRESHOLDS[98];
      s.player.skills.strength = XP_THRESHOLDS[98];
      const before = s.player.skills[style],
        hp = s.player.skills.hitpoints;
      applyRpgCommand(s, { type: "style", skill: style });
      expect(applyRpgCommand(s, { type: "attack", enemyId: enemy.id }).ok).toBe(
        true,
      );
      for (let i = 0; i < 60 && enemy.health; i++) {
        stepRpg(s);
        expect(validateRpgSave(s), `tick ${s.tick}`).not.toBeNull();
      }
      expect(enemy.health).toBe(0);
      expect(s.player.skills[style] - before).toBe(8 * 40);
      expect(s.player.skills.hitpoints - hp).toBeGreaterThanOrEqual(104);
      expect(s.player.skills.hitpoints - hp).toBeLessThanOrEqual(108);
      expect(s.player.completed).toBe(1);
      expect(enemy.respawnAt).toBeGreaterThan(s.tick);
    }
  });
  it("heals with food independently of Cooking, rejecting absent or non-food items", () => {
    const s = fresh();
    s.player.health = 1;
    addItems(s.player.inventory, "cooked-trout", 1);
    expect(s.player.skills.cooking).toBe(0);
    expect(applyRpgCommand(s, { type: "eat", itemId: "cooked-trout" }).ok).toBe(
      true,
    );
    stepRpg(s);
    expect(s.player.health).toBe(8);
    expect(itemCount(s.player.inventory, "cooked-trout")).toBe(0);
    expect(applyRpgCommand(s, { type: "eat", itemId: "logs" }).ok).toBe(false);
    expect(applyRpgCommand(s, { type: "eat", itemId: "cooked-trout" }).ok).toBe(
      false,
    );
    expect(ITEMS["cooked-trout"].heals).toBe(7);
    expect(validateRpgSave(s)).not.toBeNull();
  });
  it("enforces a three-tick food delay and preserves hostile engagement across Eat and Wait", () => {
    const s = fresh(),
      enemy = near(s, "boar-0");
    s.player.health = 2;
    applyRpgCommand(s, { type: "attack", enemyId: enemy.id });
    stepRpg(s);
    expect(enemy.engagedUntil).toBeGreaterThan(s.tick);
    expect(
      applyRpgCommand(s, { type: "eat", itemId: "cooked-shrimp" }).ok,
    ).toBe(true);
    stepRpg(s);
    const count = itemCount(s.player.inventory, "cooked-shrimp");
    expect(s.control.eatReadyAt).toBe(s.tick + 3);
    expect(
      applyRpgCommand(s, { type: "eat", itemId: "cooked-shrimp" }).ok,
    ).toBe(false);
    expect(itemCount(s.player.inventory, "cooked-shrimp")).toBe(count);
    applyRpgCommand(s, { type: "attack", enemyId: enemy.id });
    stepRpg(s, 2);
    expect(enemy.health).toBe(8);
    expect(s.player.action).toBeNull();
    applyRpgCommand(s, { type: "wait" });
    const held = { ...s.player.position };
    stepRpg(s, 12);
    expect(s.player.position).toEqual(held);
    expect(enemy.engagedUntil).toBeGreaterThan(s.tick);
    expect(enemy.cooldown).toBeGreaterThan(0);
    expect(validateRpgSave(s)).not.toBeNull();
  });
  it("keeps full-bag loot on persistent ground drops and collects only what fits", () => {
    const s = fresh(),
      enemy = near(s, "boar-0");
    s.player.skills.attack = XP_THRESHOLDS[98];
    s.player.skills.strength = XP_THRESHOLDS[98];
    addItems(s.player.inventory, "logs", 17);
    expect(inventorySlots(s.player.inventory)).toBe(28);
    applyRpgCommand(s, { type: "attack", enemyId: enemy.id });
    finish(s);
    const drop = s.drops.find((d) => d.id === "loot-boar-0")!;
    expect(drop).toBeDefined();
    expect(drop.expiresAt).toBe(0);
    const coins = itemCount(s.player.inventory, "coins");
    applyRpgCommand(s, { type: "loot", dropId: drop.id });
    finish(s);
    expect(itemCount(s.player.inventory, "coins")).toBe(coins + 4);
    expect(itemCount(s.player.inventory, "raw-boar")).toBe(0);
    expect(drop.items).toEqual([{ itemId: "raw-boar", quantity: 1 }]);
    removeItems(s.player.inventory, "logs", 1);
    applyRpgCommand(s, { type: "loot", dropId: drop.id });
    finish(s);
    expect(itemCount(s.player.inventory, "raw-boar")).toBe(1);
    expect(s.drops).toHaveLength(0);
    expect(inventorySlots(s.player.inventory)).toBe(28);
    expect(validateRpgSave(s)).not.toBeNull();
  });
  it("defeat preserves XP and equipped gear and recovers every backpack item from a safe distance", () => {
    const s = fresh();
    near(s, "bandit-0");
    s.player.health = 1;
    s.seed = 3;
    const bag = structuredClone(s.player.inventory),
      gear = structuredClone(s.player.equipment),
      skills = structuredClone(s.player.skills);
    applyRpgCommand(s, { type: "wait" });
    stepRpg(s);
    expect(s.grave?.items).toEqual(bag);
    expect(s.player.inventory).toEqual([]);
    expect(s.player.equipment).toEqual(gear);
    expect(s.player.skills).toEqual(skills);
    expect(s.player.health).toBe(maxHealth(s.player));
    expect(s.player.position).toEqual(WORLD.spawns[0]);
    expect(validateRpgSave(s)).not.toBeNull();
    expect(applyRpgCommand(s, { type: "recover" }).ok).toBe(true);
    finish(s, 500);
    expect(s.grave).toBeNull();
    expect(s.player.inventory).toEqual(bag);
    expect(s.player.health).toBeGreaterThan(0);
    expect(validateRpgSave(s)).not.toBeNull();
  });
  it("leaves uncollected grave items persistent when only part of the backpack fits", () => {
    const s = fresh();
    addItems(s.player.inventory, "logs", 17);
    s.grave = {
      position: tile(52, 95),
      items: [
        { itemId: "copper-ore", quantity: 3 },
        { itemId: "coins", quantity: 20 },
      ],
      attempts: 2,
      retryAt: 0,
    };
    applyRpgCommand(s, { type: "recover" });
    finish(s);
    expect(itemCount(s.player.inventory, "coins")).toBe(45);
    expect(s.grave?.items).toEqual([{ itemId: "copper-ore", quantity: 3 }]);
    removeItems(s.player.inventory, "logs", 2);
    applyRpgCommand(s, { type: "recover" });
    finish(s);
    expect(itemCount(s.player.inventory, "copper-ore")).toBe(2);
    expect(s.grave?.items).toEqual([{ itemId: "copper-ore", quantity: 1 }]);
    expect(validateRpgSave(s)).not.toBeNull();
  });
  it("autonomously banks recovered belongings to recover a grave larger than one backpack", () => {
    const s = fresh();
    s.player.inventory = [];
    s.grave = {
      position: tile(52, 95),
      items: [{ itemId: "logs", quantity: 56 }],
      attempts: 0,
      retryAt: 0,
    };
    s.control.thinkingUntil = 0;
    stepRpg(s, 500);
    expect(s.grave).toBeNull();
    expect(
      itemCount(s.bank, "logs") + itemCount(s.player.inventory, "logs"),
    ).toBe(56);
    expect(validateRpgSave(s)).not.toBeNull();
  });
  it("counts only actual outlaw defeats after accepting the road quest", () => {
    const s = fresh(),
      enemy = near(s, "bandit-0");
    s.player.skills.attack = XP_THRESHOLDS[98];
    s.player.skills.strength = XP_THRESHOLDS[98];
    s.player.skills.defence = XP_THRESHOLDS[98];
    applyRpgCommand(s, { type: "attack", enemyId: enemy.id });
    finish(s);
    expect(s.quests.road.kills).toBe(0);
    applyRpgCommand(s, { type: "wait" });
    stepRpg(s, ENEMIES.bandit.respawnTicks);
    s.quests.road.accepted = true;
    near(s, enemy.id);
    applyRpgCommand(s, { type: "attack", enemyId: enemy.id });
    finish(s);
    expect(s.quests.road.kills).toBe(1);
    expect(validateRpgSave(s)).not.toBeNull();
  });
  it("bounds aggressive chasing and returns enemies home when the prince leaves their territory", () => {
    const s = fresh(),
      enemy = near(s, "bandit-0");
    s.player.health = 10;
    s.seed = 999;
    stepRpg(s);
    s.player.position = tile(52, 95);
    s.player.previousPosition = { ...s.player.position };
    applyRpgCommand(s, { type: "wait" });
    stepRpg(s, 30);
    expect(enemy.position).toEqual(enemy.home);
    expect(
      Math.max(
        Math.abs(enemy.position.x - enemy.home.x),
        Math.abs(enemy.position.y - enemy.home.y),
      ),
    ).toBeLessThanOrEqual(8);
    expect(validateRpgSave(s)).not.toBeNull();
  });
  it("does not replace explicit movement or Wait with autonomous food/retreat", () => {
    const s = fresh();
    s.player.health = 1;
    expect(
      applyRpgCommand(s, { type: "move", position: tile(60, 100) }).ok,
    ).toBe(true);
    stepRpg(s, 2);
    expect(s.control.active?.type).toBe("move");
    expect(itemCount(s.player.inventory, "cooked-shrimp")).toBe(6);
    applyRpgCommand(s, { type: "wait" });
    const held = { ...s.player.position };
    stepRpg(s, 20);
    expect(s.player.position).toEqual(held);
    expect(itemCount(s.player.inventory, "cooked-shrimp")).toBe(6);
    expect(s.control.waiting).toBe(true);
  });
  it("replays combat, loot and offline simulation through a serialized strict save", () => {
    const a = fresh();
    near(a, "rock-mite-0");
    a.player.skills.attack = XP_THRESHOLDS[4];
    applyRpgCommand(a, { type: "attack", enemyId: "rock-mite-0" });
    stepRpg(a, 7);
    const b = validateRpgSave(JSON.parse(JSON.stringify(a)))!;
    expect(b).not.toBeNull();
    stepRpg(a, 150);
    stepRpg(b, 150);
    expect(b).toEqual(a);
    const old = JSON.stringify(a);
    expect(reconcileRpg(a, NOW).ticks).toBe(0);
    expect(JSON.stringify(a)).toBe(old);
  });
  it("rejects malformed enemy, drop, grave and fight records", () => {
    const cases: ((s: RpgState) => void)[] = [
      (s) => (s.enemies[0].health = 999),
      (s) => (s.enemies[0].home = tile(2, 2)),
      (s) => (s.enemies[0].position = tile(52, 95)),
      (s) => (s.enemies[0].cooldown = -1),
      (s) =>
        (s.drops = [
          {
            id: "invented",
            position: tile(52, 95),
            items: [{ itemId: "coins", quantity: 1 }],
            expiresAt: 0,
          },
        ]),
      (s) =>
        (s.grave = {
          position: tile(52, 95),
          items: [{ itemId: "logs", quantity: 0 }],
          attempts: 0,
          retryAt: 0,
        }),
      (s) => {
        s.control.active = { type: "attack", enemyId: "boar-0" };
        s.control.source = "player";
        s.player.action = {
          kind: "fight",
          targetId: "bandit-0",
          duration: 4,
          remaining: 1,
        };
      },
    ];
    for (const corrupt of cases) {
      const s = fresh();
      corrupt(s);
      expect(validateRpgSave(s)).toBeNull();
    }
  });
});

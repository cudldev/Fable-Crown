import { describe, expect, it } from "vitest";
import { applyActionEvents } from "../src/action/rpg-adapter";
import { createRpg, maxHealth, validateRpgSave } from "../src/rpg/engine";
import { addItems, itemCount } from "../src/rpg/inventory";
import { tile } from "../src/rpg/world";
import { COTTAGE_TICKS } from "../src/valley/contracts";
import { reconcileValley } from "../src/valley/offline";
import { createValleySave, validateValleySave } from "../src/valley/save";
import { applyValleyCommand, ensureValleyResources } from "../src/valley/settlement";
import { createValleyWorld } from "../src/valley/world";

const NOW = Date.UTC(2026, 10, 1, 12);
const HOUR = 3_600_000;
function commissioned() {
  const save = createValleySave(NOW);
  expect(applyValleyCommand(save, { type: "place-home", x: 54, z: 155, rotation: 0 }, NOW).ok).toBe(true);
  expect(addItems(save.chapter.player.inventory, "coins", 75)).toBe(true);
  expect(applyValleyCommand(save, { type: "pay", amount: 100 }, NOW).ok).toBe(true);
  return save;
}

describe("quarter-speed offline valley construction", () => {
  it.each([[0, 0, 0], [1, 1500, 1500], [6, 9000, 9000], [24, 36000, 9000], [72, 36000, 9000]])(
    "%ih away yields %i settlement ticks and %i cottage ticks", (hours, ticks, cottage) => {
      const save = commissioned();
      expect(reconcileValley(save, NOW + hours * HOUR).ticks).toBe(ticks);
      expect(save.chapter.tick).toBe(ticks);
      expect(save.valley.cottageTicks).toBe(cottage);
      expect(save.savedAt).toBe(NOW + hours * HOUR);
      expect(save.offlineRemainder).toBe(0);
    },
  );

  it("keeps the first 100-coin bill distinct from construction and retains the tent until packed", () => {
    const save = createValleySave(NOW);
    expect(applyValleyCommand(save, { type: "place-home", x: 54, z: 155, rotation: 0 }, NOW).ok).toBe(true);
    expect(applyValleyCommand(save, { type: "pay", amount: 25 }, NOW).ok).toBe(true);
    reconcileValley(save, NOW + 72 * HOUR);
    expect(save.valley.cottageTicks).toBe(0);
    expect(createValleyWorld(save.valley).objects.some(o => o.id === "valley-home-cottage")).toBe(false);
    save.chapter.bank = [{ itemId: "coins", quantity: 75 }];
    expect(applyValleyCommand(save, { type: "pay", amount: 75 }, save.savedAt).ok).toBe(true);
    const building = createValleyWorld(save.valley).objects.find(o => o.id === "valley-home-cottage");
    expect(building?.name).toBe("Cottage construction");
    reconcileValley(save, save.savedAt + 6 * HOUR);
    expect(save.valley.cottageTicks).toBe(COTTAGE_TICKS);
    expect(save.valley.home?.tentPacked).toBe(false);
    expect(createValleyWorld(save.valley).objects.find(o => o.id === "valley-home-cottage")?.name).toBe("Your cottage");
  });

  it("is idempotent at the same timestamp and preserves the monotonic saved clock on rollback", () => {
    const save = commissioned();
    reconcileValley(save, NOW + HOUR);
    const before = structuredClone(save);
    expect(reconcileValley(save, NOW + HOUR).ticks).toBe(0);
    expect(save).toEqual(before);
    expect(reconcileValley(save, NOW - 24 * HOUR).ticks).toBe(0);
    expect(save).toEqual(before);
    expect(save.savedAt).toBe(before.savedAt);
    expect(save.valley.cottageTicks).toBe(before.valley.cottageTicks);
    expect(reconcileValley(save, NOW + HOUR).ticks).toBe(0);
    expect(reconcileValley(save, NOW + 2 * HOUR).ticks).toBe(1500);
  });

  it("carries fractional background time through JSON export and reload without rounding each visit", () => {
    let save = commissioned();
    for (let i = 1; i <= 6; i++) {
      reconcileValley(save, NOW + i * 400);
      const restored = validateValleySave(JSON.parse(JSON.stringify(save)));
      expect(restored).not.toBeNull();
      save = restored!;
      expect(save.valley.cottageTicks).toBe(i === 6 ? 1 : 0);
    }
    expect(save.offlineRemainder).toBe(0);
    reconcileValley(save, NOW + 2800);
    expect(save.offlineRemainder).toBe(100);
    reconcileValley(save, NOW + 2800);
    expect(save.offlineRemainder).toBe(100);
  });

  it("never catches up action frames, movement, guard, health, combat windups or quest decisions", () => {
    const save = commissioned();
    save.action.frame = 123;
    Object.assign(save.action.player, { guard: 17, guardDelay: 23, guardBroken: 4, health: 3, swing: 13, blocking: true });
    save.action.enemies[0].windup = 12;
    save.action.enemies[0].cooldown = 27;
    const before = structuredClone({ action: save.action, player: save.chapter.player, enemies: save.chapter.enemies, quests: save.chapter.quests, control: save.chapter.control });
    reconcileValley(save, NOW + 72 * HOUR);
    expect({ action: save.action, player: save.chapter.player, enemies: save.chapter.enemies, quests: save.chapter.quests, control: save.chapter.control }).toEqual(before);
  });

  it("completes reserved crafts and XP once across repeated returns and reloads", () => {
    let save = createValleySave(NOW);
    save.action.player.x = 69; save.action.player.z = 141;
    expect(addItems(save.chapter.player.inventory, "logs", 2)).toBe(true);
    expect(applyValleyCommand(save, { type: "craft", recipeId: "valley-plank", quantity: 2 }, NOW).ok).toBe(true);
    expect(itemCount(save.chapter.player.inventory, "logs")).toBe(0);
    reconcileValley(save, NOW + 12_000);
    expect(save.valley.workQueue[0].remainingTicks).toBe(1);
    save = validateValleySave(JSON.parse(JSON.stringify(save)))!;
    expect(reconcileValley(save, NOW + 14_400).message).toContain("craft batch is complete");
    expect(itemCount(save.chapter.player.inventory, "valley-plank")).toBe(4);
    expect(save.valley.carpentryXp).toBe(200);
    save = validateValleySave(JSON.parse(JSON.stringify(save)))!;
    reconcileValley(save, NOW + 72 * HOUR);
    reconcileValley(save, NOW + 72 * HOUR);
    expect(itemCount(save.chapter.player.inventory, "valley-plank")).toBe(4);
    expect(save.valley.carpentryXp).toBe(200);
  });

  it("does not grant another daily parcel after a future date then clock rollback", () => {
    const save = createValleySave(NOW);
    expect(applyValleyCommand(save, { type: "daily-help" }, NOW).ok).toBe(true);
    expect(applyValleyCommand(save, { type: "daily-help" }, NOW + 72 * HOUR).ok).toBe(true);
    const count = itemCount(save.chapter.player.inventory, "logs");
    for (const date of [NOW, NOW + 24 * HOUR, NOW + 48 * HOUR, NOW + 72 * HOUR]) {
      const before = structuredClone(save);
      expect(applyValleyCommand(save, { type: "daily-help" }, date).ok).toBe(false);
      expect(save).toEqual(before);
    }
    expect(itemCount(save.chapter.player.inventory, "logs")).toBe(count);
  });

  it.each([-1, NaN, Infinity, 0.5, 8.64e15 + 1])("rejects invalid reconciliation time %s atomically", now => {
    const save = commissioned(), before = structuredClone(save);
    expect(() => reconcileValley(save, now)).toThrow();
    expect(save).toEqual(before);
  });
});

describe("V6 conservation at the offline boundary", () => {
  it("keeps a wounded legacy character's earned maximum health when creating the action chapter", () => {
    const old = createRpg(NOW, 42);
    old.player.skills.hitpoints = 100_000;
    old.player.health = 3;
    expect(validateRpgSave(old)).not.toBeNull();
    const save = createValleySave(NOW, old.seed, old);
    expect(save.action.player.health).toBe(3);
    expect(save.action.player.maxHealth).toBe(maxHealth(old.player));
  });

  it.each([3, 4, 5])("preserves a V%i archive, possessions, quests, grave and drops during additive migration", version => {
    const old = createRpg(NOW, 42);
    old.version = version as 5;
    old.grave = { position: tile(52, 141), items: [{ itemId: "logs", quantity: 7 }], attempts: 2, retryAt: 10 };
    old.drops = [{ id: "loot-rock-mite-0", position: tile(94, 158), items: [{ itemId: "coins", quantity: 3 }], expiresAt: 0 }];
    const archive = JSON.stringify(old), normalized = validateRpgSave(old);
    expect(normalized).not.toBeNull();
    const save = createValleySave(NOW, old.seed, normalized!);
    expect(JSON.stringify(old)).toBe(archive);
    expect(save.chapter.grave).toEqual(old.grave);
    expect(save.chapter.drops).toEqual(old.drops);
    expect(save.chapter.bank).toEqual(old.bank);
    expect(validateValleySave(JSON.parse(JSON.stringify(save)))).not.toBeNull();
  });

  it("preserves the relocated enemy, its loot and persistent backpack through 72h and V6 validation", () => {
    const save = createValleySave(NOW);
    ensureValleyResources(save);
    save.action.frame = 42;
    save.action.player.guard = 37;
    save.action.player.health = 3;
    const enemy = save.action.enemies.find(e => e.id === "rock-mite-0")!;
    expect([enemy.homeX, enemy.homeZ]).toEqual([94, 158]);
    save.chapter.grave = { position: tile(94, 158), items: [{ itemId: "logs", quantity: 7 }], attempts: 2, retryAt: 10 };
    enemy.health = 0; enemy.defeated = true;
    applyActionEvents(save.chapter, save.action, [{ kind: "enemy-defeat", targetId: enemy.id }], createValleyWorld(save.valley));
    const belongings = structuredClone({ grave: save.chapter.grave, drops: save.chapter.drops });
    const frozen = structuredClone(save.action);
    reconcileValley(save, NOW + 72 * HOUR);
    const restored = validateValleySave(JSON.parse(JSON.stringify(save)));
    expect(restored).not.toBeNull();
    expect({ grave: restored!.chapter.grave, drops: restored!.chapter.drops }).toEqual(belongings);
    expect(restored!.action).toEqual(frozen);
    expect(restored!.chapter.enemies.find(e => e.id === enemy.id)?.respawnAt).toBe(save.chapter.enemies.find(e => e.id === enemy.id)?.respawnAt);
  });
});

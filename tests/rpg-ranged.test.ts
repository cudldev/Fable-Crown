import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { applyRpgCommand, attackDuration, createRpg, reconcileRpg, stepRpg, validateRpgSave } from "../src/rpg/engine";
import { addItems, inventorySlots, itemCount } from "../src/rpg/inventory";
import { ITEMS } from "../src/rpg/content";
import { isWalkable, tile, WORLD } from "../src/rpg/world";
import { XP_THRESHOLDS } from "../src/rpg/skills";
import type { CombatStyle, RpgState } from "../src/rpg/types";
const NOW = Date.UTC(2026, 9, 29, 12);
function fresh() { const s = createRpg(NOW, 1); s.control.thinkingUntil = 1e9;
  for (const npc of s.npcs) { npc.inventory = []; npc.action = null; npc.path = []; } return s; }
function command(s: RpgState, order: Parameters<typeof applyRpgCommand>[1]) { expect(applyRpgCommand(s, order).ok).toBe(true); stepRpg(s); s.control.thinkingUntil = 1e9; }
function archer(style: CombatStyle = "accurate") {
  const s = fresh(); s.player.skills.ranged = XP_THRESHOLDS[98];
  addItems(s.player.inventory, "shortbow", 1); addItems(s.player.inventory, "bronze-arrow", 30);
  command(s, { type: "equip", itemId: "shortbow" }); command(s, { type: "equip", itemId: "bronze-arrow" });
  applyRpgCommand(s, { type: "style", skill: style });
  const enemy = s.enemies.find((e) => e.id === "boar-0")!;
  s.player.position = tile(enemy.position.x, enemy.position.y + 7); s.player.previousPosition = { ...s.player.position };
  return s;
}
describe("local ranged combat and ammunition", () => {
  it.each(["accurate", "rapid", "longrange"] as const)("awards actual capped %s damage XP with the approved cadence", (style) => {
    const s = archer(style), enemy = s.enemies.find((e) => e.id === "boar-0")!;
    const xp = s.player.skills.ranged, defence = s.player.skills.defence, hp = s.player.skills.hitpoints;
    expect(attackDuration(s.player, style)).toBe(style === "rapid" ? 3 : 4);
    applyRpgCommand(s, { type: "attack", enemyId: enemy.id });
    for (let i = 0; i < 60 && enemy.health; i++) { stepRpg(s); expect(validateRpgSave(s)).not.toBeNull(); }
    expect(enemy.health).toBe(0);
    expect(s.player.skills.ranged - xp).toBe(style === "longrange" ? 160 : 320);
    expect(s.player.skills.defence - defence).toBe(style === "longrange" ? 160 : 0);
    expect(s.player.skills.hitpoints - hp).toBeGreaterThanOrEqual(104);
    expect(s.player.skills.hitpoints - hp).toBeLessThanOrEqual(108);
    const spent = 30 - (s.player.ammo?.quantity ?? 0), recovered = s.drops.filter((d) => d.id.startsWith("arrows-")).reduce((n, d) => n + itemCount(d.items, "bronze-arrow"), 0);
    expect(spent).toBeGreaterThan(0); expect(recovered).toBeLessThanOrEqual(spent);
    expect(s.drops.every((d) => d.expiresAt === 0)).toBe(true);
  });
  it("consumes arrows on misses, rejects empty shooting, and preserves a seeded replay", () => {
    const s = archer(), enemy = s.enemies.find((e) => e.id === "rock-mite-0")!;
    s.player.skills.ranged = 0; s.player.position = { ...enemy.position, x: enemy.position.x - 1 }; s.player.previousPosition = { ...s.player.position };
    const loaded = validateRpgSave(JSON.parse(JSON.stringify(s)))!;
    applyRpgCommand(s, { type: "attack", enemyId: enemy.id }); applyRpgCommand(loaded, { type: "attack", enemyId: enemy.id });
    stepRpg(s, 40); stepRpg(loaded, 40); expect(loaded).toEqual(s);
    expect(s.player.ammo!.quantity).toBeLessThan(30);
    expect(s.player.skills.ranged / 40).toBeLessThanOrEqual(30 - s.player.ammo!.quantity);
    s.player.ammo = null; expect(applyRpgCommand(s, { type: "attack", enemyId: "boar-1" }).ok).toBe(false);
  });
  it("loads and swaps ammo atomically and preserves two-handed/full-backpack constraints", () => {
    const s = fresh(); addItems(s.player.inventory, "bronze-arrow", 50); command(s, { type: "equip", itemId: "bronze-arrow" });
    expect(s.player.ammo).toEqual({ itemId: "bronze-arrow", quantity: 50 }); expect(itemCount(s.player.inventory, "bronze-arrow")).toBe(0);
    addItems(s.player.inventory, "iron-arrow", 25); command(s, { type: "equip", itemId: "iron-arrow" });
    expect(s.player.ammo).toEqual({ itemId: "iron-arrow", quantity: 25 }); expect(itemCount(s.player.inventory, "bronze-arrow")).toBe(50);
    command(s, { type: "unequip-ammo" }); expect(itemCount(s.player.inventory, "iron-arrow")).toBe(25);
    const full = fresh(); full.player.inventory = [{ itemId: "shortbow", quantity: 1 }, { itemId: "logs", quantity: 27 }];
    const before = structuredClone(full.player); command(full, { type: "equip", itemId: "shortbow" });
    expect(full.player.inventory).toEqual(before.inventory); expect(full.player.equipment).toEqual(before.equipment);
    full.player.inventory = [{ itemId: "shortbow", quantity: 1 }, { itemId: "logs", quantity: 26 }];
    command(full, { type: "equip", itemId: "shortbow" }); expect(full.player.equipment.shield).toBeUndefined();
    expect(itemCount(full.player.inventory, "bronze-shield")).toBe(1); expect(inventorySlots(full.player.inventory)).toBe(28);
    expect(applyRpgCommand(full, { type: "equip", itemId: "bronze-shield" }).ok).toBe(false);
    full.player.ammo = { itemId: "bronze-arrow", quantity: 9 }; expect(applyRpgCommand(full, { type: "unequip-ammo" }).ok).toBe(false);
    expect(full.player.ammo.quantity).toBe(9);
  });
  it("honors longrange distance and moves to a legal firing tile around blocked sight lines", () => {
    const s = archer("longrange"), enemy = s.enemies.find((e) => e.id === "boar-0")!;
    s.player.position = tile(enemy.position.x, enemy.position.y + 9); s.player.previousPosition = { ...s.player.position };
    applyRpgCommand(s, { type: "attack", enemyId: enemy.id }); stepRpg(s);
    expect(s.player.action?.kind).toBe("fight"); expect(s.player.path).toEqual([]);
    const normal = archer("accurate"), target = normal.enemies.find((e) => e.id === "boar-0")!;
    normal.player.position = tile(target.position.x, target.position.y + 9); normal.player.previousPosition = { ...normal.player.position };
    const arrows = normal.player.ammo!.quantity; applyRpgCommand(normal, { type: "attack", enemyId: target.id }); stepRpg(normal);
    expect(normal.player.movement).not.toBeNull(); expect(normal.player.ammo!.quantity).toBe(arrows);
    for (const point of normal.player.movement!.tiles) expect(isWalkable(point)).toBe(true);
    for (const point of normal.player.path) expect(isWalkable(point)).toBe(true);
  });
  it("keeps arrows equipped through defeat and backpack arrows safely recoverable in graves", () => {
    const s = archer(); s.player.ammo = { itemId: "bronze-arrow", quantity: 10 }; addItems(s.player.inventory, "steel-arrow", 20);
    s.player.health = 1; const enemy = s.enemies.find((e) => e.id === "bandit-0")!;
    s.player.position = { ...enemy.position, x: enemy.position.x - 1 }; s.player.previousPosition = { ...s.player.position };
    for (let i = 0; i < 200 && !s.grave; i++) stepRpg(s);
    expect(s.grave).not.toBeNull(); expect(itemCount(s.grave!.items, "steel-arrow")).toBe(20);
    expect(s.player.ammo).toEqual({ itemId: "bronze-arrow", quantity: 10 }); expect(validateRpgSave(s)).not.toBeNull();
  });
});
describe("real V3 archive migration", () => {
  it("repairs newly blocked enemy, loot and grave tiles even when every actor route is already legal", () => {
    const raw = JSON.parse(readFileSync(new URL("./fixtures/rpg-v3-original.json", import.meta.url), "utf8"));
    raw.enemies.find((e: { id: string }) => e.id === "boar-1").position = tile(133, 67);
    raw.drops = [{ id: "loot-boar-0", position: tile(132, 69), items: [{ itemId: "logs", quantity: 3 }], expiresAt: 0 }];
    raw.grave = { position: tile(132, 69), items: [{ itemId: "iron-ore", quantity: 2 }], attempts: 0, retryAt: 0 };
    const before = JSON.stringify(raw), migrated = validateRpgSave(raw)!;
    expect(migrated).not.toBeNull(); expect(JSON.stringify(raw)).toBe(before);
    expect(isWalkable(migrated.enemies.find((e) => e.id === "boar-1")!.position)).toBe(true);
    expect(isWalkable(migrated.drops[0].position)).toBe(true); expect(isWalkable(migrated.grave!.position)).toBe(true);
    expect(migrated.drops[0].items).toEqual(raw.drops[0].items); expect(migrated.grave!.items).toEqual(raw.grave.items);
  });
  it("copies the original public save into V5 without overwriting its data or paying rewards again", () => {
    const raw = JSON.parse(readFileSync(new URL("./fixtures/rpg-v3-original.json", import.meta.url), "utf8"));
    expect(Object.keys(raw.resources)).toHaveLength(75); expect(raw.enemies).toHaveLength(9); expect(Object.keys(raw.player.skills)).toHaveLength(9);
    raw.quests.forge = { accepted: true, complete: true, kills: 0 };
    raw.quests.supper = { accepted: true, complete: false, kills: 0 };
    raw.control.waiting = true; raw.control.active = null; raw.control.source = null; raw.player.path = []; raw.player.action = null;
    raw.control.queue = [{ type: "gather", objectId: "oakrest-ore-0", quantity: 3 }];
    const before = JSON.stringify(raw), migrated = validateRpgSave(raw)!;
    expect(migrated).not.toBeNull(); expect(migrated.version).toBe(5); expect(JSON.stringify(raw)).toBe(before);
    expect(migrated.player.inventory).toEqual(raw.player.inventory); expect(migrated.bank).toEqual(raw.bank);
    expect(migrated.player.equipment).toEqual(raw.player.equipment); expect(migrated.player.position).toEqual(raw.player.position);
    expect(migrated.player.skills.ranged).toBe(0); expect(migrated.player.ammo).toBeNull(); expect(migrated.npcs.every((p) => p.skills.ranged === 0 && p.ammo === null)).toBe(true);
    expect(migrated.control.queue).toEqual(raw.control.queue); expect(migrated.control.waiting).toBe(true);
    expect(migrated.quests.forge.stageId).toBe("complete"); expect(migrated.quests.supper.stageId).toBe("supplies"); expect(migrated.rewards ?? []).toEqual([]);
    const loaded = validateRpgSave(JSON.parse(JSON.stringify(migrated)))!; expect(loaded).not.toBeNull();
    reconcileRpg(migrated, NOW + 60000); reconcileRpg(loaded, NOW + 60000); expect(loaded).toEqual(migrated);
  });
  it("rejects malformed V5 ranged skills, ammo, two-handed gear and weapon requirements", () => {
    const s = archer();
    for (const mutate of [
      (state: RpgState) => { delete (state.player.skills as Partial<typeof state.player.skills>).ranged; },
      (state: RpgState) => { state.player.ammo = { itemId: "logs", quantity: 1 }; },
      (state: RpgState) => { state.player.ammo = { itemId: "bronze-arrow", quantity: 0 }; },
      (state: RpgState) => { state.player.equipment.shield = "bronze-shield"; },
      (state: RpgState) => { state.player.skills.ranged = 0; state.player.equipment.weapon = "willow-shortbow"; },
    ]) { const bad = structuredClone(s); mutate(bad); expect(validateRpgSave(bad)).toBeNull(); }
    expect(ITEMS["willow-shortbow"].rangedLevel).toBe(20); expect(WORLD.id).toBe("frontier");
  });
});

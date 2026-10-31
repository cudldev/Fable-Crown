import { describe, expect, it, vi } from "vitest";
import { actionInteract, actionSafe, applyActionEvents, rpgActionWorld, syncActionRespawns } from "../src/action/rpg-adapter";
import { createActionState, idleActionInput, stepAction } from "../src/action/simulation";
import type { ActionEnemy, ActionEvent } from "../src/action/contracts";
import { createRpg, stepRpg } from "../src/rpg/engine";
import { ITEMS, RESOURCES } from "../src/rpg/content";
import { inventorySlots, itemCount } from "../src/rpg/inventory";
import { XP_THRESHOLDS } from "../src/rpg/skills";
import type { ItemStack, RpgState, WorldObject } from "../src/rpg/types";
import { tile, WORLD } from "../src/rpg/world";

const NOW = Date.UTC(2026, 10, 1, 0);
function fresh(seed = 1): RpgState {
  const state = createRpg(NOW, seed);
  state.action = createActionState(state.player.position.x, state.player.position.y);
  state.control.autoplay = false;
  state.control.waiting = true;
  state.control.thinkingUntil = 1e9;
  state.npcs = [];
  return state;
}
function resource(id: NonNullable<WorldObject["resourceId"]>): WorldObject {
  const object = WORLD.objects.find((value) => value.resourceId === id);
  if (!object) throw Error(`Missing resource fixture ${id}`);
  return object;
}
function hit(state: RpgState, object: WorldObject): string {
  return applyActionEvents(state, state.action!, [{ kind: "resource-hit", targetId: object.id }]);
}
function hostile(id = "wolf"): ActionEnemy {
  return { id, x: 52, z: 96, homeX: 52, homeZ: 96, health: 6, maxHealth: 6,
    cooldown: 0, windup: 0, damage: 2, aggressive: true, defeated: false };
}
function quantity(items: readonly ItemStack[], itemId: string): number {
  return items.filter((item) => item.itemId === itemId).reduce((total, item) => total + item.quantity, 0);
}

describe("continuous action / settlement bridge", () => {
  it("keeps600ms settlement updates from moving, healing or damaging the continuous player", () => {
    const state = fresh();
    state.tick = 99;
    state.player.health = 3;
    state.player.path = [tile(53, 95), tile(54, 95)];
    state.control.waiting = false;
    state.control.active = { type: "move", position: tile(54, 95) };
    const enemy = state.enemies[0];
    enemy.position = { ...state.player.position };
    enemy.home = { ...state.player.position };
    enemy.cooldown = 0;
    const player = structuredClone(state.player), action = structuredClone(state.action);
    stepRpg(state, 100);
    expect(state.player).toEqual(player);
    expect(state.action).toEqual(action);
    expect(state.tick).toBe(199);
  });

  it("requires a matching tool and resource level without consuming anything", () => {
    const state = fresh();
    state.player.inventory = [];
    state.player.equipment = {};
    const seed = state.seed, skills = { ...state.player.skills };
    expect(hit(state, resource("tree"))).toMatch(/Requires axe/);
    expect(state.seed).toBe(seed);
    expect(state.player.skills).toEqual(skills);
    state.player.inventory = [{ itemId: "bronze-axe", quantity: 1 }];
    expect(hit(state, resource("oak"))).toMatch(/woodcutting 15/);
    expect(state.player.inventory).toEqual([{ itemId: "bronze-axe", quantity: 1 }]);
    expect(state.player.skills).toEqual(skills);
  });

  it("requires the chosen tool's own skill level even on a low-level resource", () => {
    const state = fresh();
    state.player.inventory = [{ itemId: "steel-axe", quantity: 1 }];
    state.player.equipment = {};
    hit(state, resource("tree"));
    expect(itemCount(state.player.inventory, "logs")).toBe(0);
    expect(state.player.skills.woodcutting).toBe(0);
  });

  it("awards one legal resource and exact XP, respects depletion, and conserves a full bag", () => {
    const state = fresh();
    const copper = resource("copper");
    const before = itemCount(state.player.inventory, "copper-ore");
    expect(hit(state, copper)).toMatch(/Collected/);
    expect(itemCount(state.player.inventory, "copper-ore")).toBe(before + 1);
    expect(state.player.skills.mining).toBe(RESOURCES.copper.xp);
    expect(state.resources[copper.id].available).toBe(false);
    hit(state, copper);
    expect(itemCount(state.player.inventory, "copper-ore")).toBe(before + 1);
    expect(state.player.skills.mining).toBe(RESOURCES.copper.xp);

    state.resources[copper.id].available = true;
    state.player.inventory = [{ itemId: "bronze-pickaxe", quantity: 1 }, { itemId: "logs", quantity: 27 }];
    const inventory = structuredClone(state.player.inventory), xp = state.player.skills.mining;
    expect(inventorySlots(inventory)).toBe(28);
    expect(hit(state, copper)).toMatch(/full/);
    expect(state.player.inventory).toEqual(inventory);
    expect(state.player.skills.mining).toBe(xp);
    expect(state.resources[copper.id].available).toBe(true);
  });

  it("requires fishing bait and consumes exactly one only for a successful catch", () => {
    const state = fresh(), sardine = resource("sardine");
    state.player.inventory = [{ itemId: "fishing-rod", quantity: 1 }];
    state.player.skills.fishing = XP_THRESHOLDS[4];
    hit(state, sardine);
    expect(itemCount(state.player.inventory, "raw-sardine")).toBe(0);
    state.player.inventory.push({ itemId: "bait", quantity: 2 });
    state.seed = 1;
    hit(state, sardine);
    expect(itemCount(state.player.inventory, "raw-sardine")).toBe(1);
    expect(itemCount(state.player.inventory, "bait")).toBe(1);

    state.resources[sardine.id].available = true;
    state.player.inventory = [{ itemId: "fishing-rod", quantity: 1 }, { itemId: "bait", quantity: 2 }, { itemId: "logs", quantity: 26 }];
    const fullBag = structuredClone(state.player.inventory);
    state.seed = 1;
    expect(hit(state, sardine)).toMatch(/full/);
    expect(state.player.inventory).toEqual(fullBag);
  });

  it("merges a previous grave on defeat while preserving equipment, ammo, bank and XP", () => {
    const state = fresh(), action = state.action!;
    action.player.x = 94.25; action.player.z = 100.75; action.player.health = 0;
    state.grave = { position: tile(90, 110), items: [{ itemId: "logs", quantity: 3 }, { itemId: "coins", quantity: 10 }], attempts: 2, retryAt: 8 };
    state.player.inventory = [{ itemId: "logs", quantity: 5 }, { itemId: "coins", quantity: 15 }];
    state.player.ammo = { itemId: "bronze-arrow", quantity: 20 };
    state.bank = [{ itemId: "iron-bar", quantity: 7 }];
    const gear = structuredClone(state.player.equipment), skills = { ...state.player.skills }, bank = structuredClone(state.bank), ammo = { ...state.player.ammo };
    applyActionEvents(state, action, [{ kind: "player-defeat" }]);
    expect(state.grave?.position).toEqual(tile(94, 101));
    expect(quantity(state.grave!.items, "logs")).toBe(8);
    expect(quantity(state.grave!.items, "coins")).toBe(25);
    expect(state.player.inventory).toEqual([]);
    expect(state.player.equipment).toEqual(gear);
    expect(state.player.skills).toEqual(skills);
    expect(state.player.ammo).toEqual(ammo);
    expect(state.bank).toEqual(bank);
    expect(action.player.health).toBe(action.player.maxHealth);
    expect(actionSafe(action.player.x, action.player.z)).toBe(true);
  });

  it("recovers only what fits and leaves the remaining grave contents intact", () => {
    const state = fresh(), action = state.action!;
    state.player.inventory = [{ itemId: "logs", quantity: 27 }];
    state.grave = { position: tile(action.player.x, action.player.z), items: [{ itemId: "iron-ore", quantity: 4 }], attempts: 0, retryAt: 0 };
    expect(actionInteract(state, action)).toMatch(/what fits/);
    expect(inventorySlots(state.player.inventory)).toBe(28);
    expect(itemCount(state.player.inventory, "iron-ore")).toBe(1);
    expect(itemCount(state.grave!.items, "iron-ore")).toBe(3);
    expect(itemCount(state.player.inventory, "logs")).toBe(27);
    state.player.inventory = [];
    expect(actionInteract(state, action)).toBe("Backpack recovered.");
    expect(itemCount(state.player.inventory, "iron-ore")).toBe(3);
    expect(state.grave).toBeNull();
  });

  it("never attacks within the home sanctuary or across its boundary", () => {
    const state = fresh(), action = state.action!;
    action.player.x = 52; action.player.z = 109;
    action.enemies = [hostile()];
    Object.assign(action.enemies[0], { z: 110, homeZ: 110 });
    const surface = { ...rpgActionWorld(state), canOccupy: () => true };
    const events: ActionEvent[] = [];
    for (let frame = 0; frame < 120; frame += 1) {
      events.push(...stepAction(action, { ...idleActionInput(), strike: frame % 40 === 0 }, surface));
    }
    expect(events).toEqual([]);
    expect(action.player.health).toBe(10);
    expect(action.enemies[0].health).toBe(6);
  });

  it("counts a defeated enemy once for loot and quests, then respawns on its settlement deadline", () => {
    const state = fresh(), action = state.action!;
    const old = state.enemies.find((enemy) => enemy.definitionId === "bandit")!;
    expect(old).toBeDefined();
    action.enemies = [{ ...hostile(old.id), x: old.position.x, z: old.position.y,
      homeX: old.home.x, homeZ: old.home.y, health: 0, defeated: true }];
    state.quests.road.accepted = true;
    applyActionEvents(state, action, [{ kind: "enemy-defeat", targetId: old.id }]);
    const deadline = old.respawnAt;
    expect(deadline).toBeGreaterThan(state.tick);
    expect(state.quests.road.kills).toBe(1);
    expect(state.drops).toHaveLength(1);
    applyActionEvents(state, action, [{ kind: "enemy-defeat", targetId: old.id }]);
    expect(state.quests.road.kills).toBe(1);
    expect(state.drops).toHaveLength(1);
    state.tick = deadline - 1;
    syncActionRespawns(state, action);
    expect(action.enemies[0].defeated).toBe(true);
    state.tick = deadline;
    syncActionRespawns(state, action);
    expect(action.enemies[0].defeated).toBe(false);
    expect(action.enemies[0].health).toBe(action.enemies[0].maxHealth);
    expect(old.health).toBe(action.enemies[0].maxHealth);
    expect(old.respawnAt).toBe(0);
  });

  it("replays seeded gathering exactly across a serialized action checkpoint", () => {
    const first = fresh(317), tree = resource("tree");
    first.action!.player.x = tree.position.x; first.action!.player.z = tree.position.y - 1;
    const second = JSON.parse(JSON.stringify(first)) as RpgState;
    const messagesA: string[] = [], messagesB: string[] = [];
    for (let tick = 0; tick < 100; tick += 1) {
      messagesA.push(hit(first, tree)); messagesB.push(hit(second, tree));
      stepRpg(first); stepRpg(second);
    }
    expect(second).toEqual(first);
    expect(messagesB).toEqual(messagesA);
    expect(first.player.inventory.every((item) => Boolean(ITEMS[item.itemId]))).toBe(true);
  });

  it("retains an input strike pulse until the worker's next fixed step consumes it", async () => {
    vi.useFakeTimers({ toFake: ["Date", "performance", "setInterval", "clearInterval"] });
    const worker = { onmessage: null as null | ((event: { data: unknown }) => void) };
    const snapshots: { action?: ReturnType<typeof createActionState> }[] = [];
    vi.stubGlobal("self", worker);
    vi.stubGlobal("postMessage", (message: object) => snapshots.push(structuredClone(message)));
    try {
      await import("../src/action/prototype.worker");
      worker.onmessage!({ data: { type: "input", input: { ...idleActionInput(), strike: true, tool: true } } });
      worker.onmessage!({ data: { type: "input", input: idleActionInput() } });
      vi.advanceTimersByTime(24);
      expect(snapshots.at(-1)?.action?.player.swing).toBe(35);
      expect(snapshots.at(-1)?.action?.swingTool).toBe(true);
      vi.advanceTimersByTime(1000);
      expect(snapshots.at(-1)?.action?.player.swing).toBe(0);
      const frame = snapshots.at(-1)!.action!.frame;
      const count = snapshots.length;
      worker.onmessage!({ data: { type: "pause" } });
      vi.advanceTimersByTime(60_000);
      expect(snapshots).toHaveLength(count);
      worker.onmessage!({ data: { type: "resume" } });
      vi.advanceTimersByTime(24);
      expect(snapshots.at(-1)?.action?.frame).toBe(frame + 1);
    } finally {
      vi.clearAllTimers(); vi.useRealTimers(); vi.unstubAllGlobals();
    }
  });
});

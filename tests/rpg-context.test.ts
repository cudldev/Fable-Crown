import { describe, expect, it } from "vitest";
import {
  applyRpgCommand,
  createRpg,
  stepRpg,
  validateRpgSave,
} from "../src/rpg/engine";
import { contextGoals } from "../src/rpg/context-goals";
import { goalMet } from "../src/rpg/planning";
import {
  addItems,
  exchangeItems,
  inventorySlots,
  itemCount,
  removeItems,
} from "../src/rpg/inventory";
import { ITEMS, QUESTS, RECIPES, RESOURCES } from "../src/rpg/content";
import { XP_THRESHOLDS } from "../src/rpg/skills";
import { interactionTiles, objectById, tile, WORLD } from "../src/rpg/world";
import type { Ambition, ItemStack, RpgState } from "../src/rpg/types";

const NOW = Date.UTC(2026, 9, 29, 12);
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
function until(s: RpgState, predicate: () => boolean, max = 5000) {
  for (let i = 0; i < max && !predicate(); i++) stepRpg(s);
  expect(
    predicate(),
    `tick ${s.tick}: ${s.control.reason} / ${s.player.activity}`,
  ).toBe(true);
}

describe("contextual ambitions", () => {
  it("switches from a long direct harvest to a quest goal immediately and preserves pending orders", () => {
    const s = fresh(); at(s, "oakrest-ore-0");
    applyRpgCommand(s, { type: "gather", objectId: "oakrest-ore-0", quantity: 10000 }); stepRpg(s, 2);
    expect(s.player.action?.kind).toBe("gather");
    const goal: Ambition = { id: "forge", kind: "quest", questId: "forge", title: "Forge supplies" };
    applyRpgCommand(s, { type: "goal", goal });
    expect(s.control.active).toBeNull(); expect(s.control.source).toBeNull();
    expect(s.player.action).toBeNull(); expect(s.player.path).toEqual([]);
    stepRpg(s); expect(s.control.active).toMatchObject({ type: "quest", questId: "forge" });
    expect(validateRpgSave(s)).not.toBeNull();
    // Direct orders issued after choosing the goal still take priority.
    applyRpgCommand(s, { type: "gather", objectId: "oakrest-ore-0", quantity: 10000 });
    const pending = { type: "gather" as const, objectId: "oakrest-ore-1", quantity: 1 };
    applyRpgCommand(s, { type: "enqueue", order: pending });
    applyRpgCommand(s, { type: "goal", goal });
    expect(s.control.active).toBeNull(); expect(s.control.queue).toEqual([pending]);
    expect(validateRpgSave(s)).not.toBeNull();
  });
  it("persists a direct quest visit as an ambition, and defers queued quest ambitions until execution", () => {
    const s = fresh(); at(s, "oakrest-ore-0");
    const mining: Ambition = { id: "mining", kind: "skill", skill: "mining", level: 30, title: "Mining 30" };
    applyRpgCommand(s, { type: "goal", goal: mining });
    applyRpgCommand(s, { type: "quest", questId: "forge" }); stepRpg(s);
    expect(s.control.goal).toMatchObject({ kind: "quest", questId: "forge" });
    expect(s.player.path.length).toBeGreaterThan(0); expect(validateRpgSave(s)).not.toBeNull();
    until(s, () => s.quests.forge.complete);
    const queued = fresh(); at(queued, "oakrest-ore-0");
    applyRpgCommand(queued, { type: "goal", goal: mining });
    applyRpgCommand(queued, { type: "gather", objectId: "oakrest-ore-0", quantity: 10000 });
    applyRpgCommand(queued, { type: "enqueue", order: { type: "quest", questId: "forge" } });
    stepRpg(queued); expect(queued.control.goal).toEqual(mining);
    applyRpgCommand(queued, { type: "wait" }); applyRpgCommand(queued, { type: "resume" }); stepRpg(queued);
    expect(queued.control.goal).toMatchObject({ kind: "quest", questId: "forge" });
    expect(validateRpgSave(queued)).not.toBeNull();
  });
  it("completes forge from partial logistics states with save reloads every 50 ticks", () => {
    const cases: [string, (s: RpgState) => void][] = [
      ["3 coins, pickaxe and hammer banked", (s) => {
        removeItems(s.player.inventory, "coins", 22);
        for (const id of ["bronze-pickaxe", "hammer"]) {
          removeItems(s.player.inventory, id, 1); addItems(s.bank, id, 1, Infinity);
        }
      }],
      ["all quest materials banked", (s) => {
        addItems(s.bank, "logs", 6, Infinity); addItems(s.bank, "bronze-bar", 6, Infinity);
      }],
      ["six copper, no tin", (s) => {
        addItems(s.player.inventory, "logs", 6); addItems(s.player.inventory, "copper-ore", 6);
      }],
      ["full bag of copper, tools and six meals", (s) => {
        addItems(s.player.inventory, "copper-ore", 17); addItems(s.bank, "logs", 6, Infinity);
      }],
      ["all tools banked, copper and logs in bag", (s) => {
        for (const id of ["bronze-pickaxe", "bronze-axe", "small-net", "hammer"]) {
          removeItems(s.player.inventory, id, 1); addItems(s.bank, id, 1, Infinity);
        }
        addItems(s.player.inventory, "logs", 6); addItems(s.player.inventory, "copper-ore", 6);
      }],
      ["surplus tools leave no two-input smelting workspace", (s) => {
        for (const id of ["iron-pickaxe", "steel-pickaxe", "iron-axe", "steel-axe", "hammer"])
          addItems(s.player.inventory, id, 1);
        addItems(s.player.inventory, "logs", 6); addItems(s.player.inventory, "bronze-bar", 5);
        addItems(s.player.inventory, "copper-ore", 1);
      }],
      ["spare armour leaves no two-input smelting workspace", (s) => {
        for (const id of ["bronze-med-helm", "bronze-body", "bronze-legs", "iron-med-helm", "iron-body"])
          addItems(s.player.inventory, id, 1);
        addItems(s.player.inventory, "logs", 6); addItems(s.player.inventory, "bronze-bar", 5);
        addItems(s.player.inventory, "copper-ore", 1);
      }],
    ];
    for (const [name, setup] of cases) {
      let s = fresh(); setup(s); at(s, "quest-forge");
      const held = (state: RpgState, id: string) => itemCount(state.player.inventory, id) + itemCount(state.bank, id) +
        Object.values(state.player.equipment).filter((item) => item === id).length;
      const permanent = Object.values(ITEMS).filter((item) => item.kind === "tool" || item.kind === "gear");
      const before = Object.fromEntries(permanent.map((item) => [item.id, held(s, item.id)]));
      const expected = Object.fromEntries(Object.keys(ITEMS).map((id) => [id, held(s, id)]));
      applyRpgCommand(s, { type: "goal", goal: { id: "forge", kind: "quest", questId: "forge", title: "Forge supplies" } });
      const trace: string[] = [];
      for (let i = 0; i < 10000 && !s.quests.forge.complete; i++) {
        stepRpg(s);
        if (i % 50 === 0) {
          trace.push(`${s.tick}:${JSON.stringify(s.control.active)}:${JSON.stringify(s.player.inventory)}:${s.control.reason}`);
          s = validateRpgSave(JSON.parse(JSON.stringify(s)))!;
          expect(s, `${name}: invalid save`).not.toBeNull();
        }
      }
      expect(s.quests.forge.complete, `${name}\n${trace.slice(-8).join("\n")}`).toBe(true);
      for (const item of permanent) expect(held(s, item.id), `${name}: ${item.id} conservation`).toBe(before[item.id]);
      // These bounded forge cases emit fewer than32 rewards: reconcile every gained item,
      // consumed smelting ingredient and delivered quest item against all personal stores.
      expect(s.rewards!.length).toBeLessThan(32);
      for (const event of s.rewards!) {
        for (const output of event.items) expected[output.itemId] += output.quantity;
        for (const output of event.items.filter((item) => item.itemId === "bronze-bar"))
          for (const input of RECIPES["bronze-bar"].inputs) expected[input.itemId] -= input.quantity * output.quantity;
      }
      for (const input of QUESTS.forge.items) expected[input.itemId] -= input.quantity;
      for (const id of Object.keys(ITEMS)) expect(held(s, id), `${name}: ${id} transaction accounting`).toBe(expected[id]);
      if (name.startsWith("surplus tools")) {
        expect(itemCount(s.bank, "hammer")).toBe(1);
        expect(itemCount(s.player.inventory, "hammer")).toBe(1);
        expect(itemCount(s.bank, "steel-pickaxe")).toBe(1);
      }
    }
  }, 15000);
  it("keeps a blocked quest at its missing supply instead of repeatedly visiting the giver", () => {
    const s = fresh(); at(s, "quest-forge"); s.player.inventory = [];
    applyRpgCommand(s, { type: "goal", goal: { id: "forge", kind: "quest", questId: "forge", title: "Forge supplies" } });
    stepRpg(s, 40);
    expect(s.quests.forge.accepted).toBe(true); expect(s.quests.forge.complete).toBe(false);
    expect(s.control.goal).toMatchObject({ kind: "quest", questId: "forge" });
    expect(s.control.active).toBeNull(); expect(s.player.path).toEqual([]);
    expect(s.control.reason).toContain("need 6 Logs (0/6)");
    expect(s.control.reason).toContain("bronze axe");
    expect(s.rewards).toEqual([]); expect(s.player.completed).toBe(0);
    expect(validateRpgSave(s)).not.toBeNull();
  });
  it("offers concrete valid goals for every known interactable, without mutating state", () => {
    const s = fresh();
    const before = structuredClone(s);
    for (const object of WORLD.objects) {
      const choices = contextGoals(s, object);
      expect(choices.length).toBeGreaterThan(0);
      expect(choices.length).toBeLessThanOrEqual(3);
      if (object.resourceId) expect(choices.length).toBeGreaterThanOrEqual(2);
      for (const choice of choices) {
        const candidate = structuredClone(s);
        expect(
          applyRpgCommand(candidate, { type: "goal", goal: choice.goal }).ok,
          `${object.id} ${choice.id}`,
        ).toBe(true);
        expect(validateRpgSave(candidate)).not.toBeNull();
      }
    }
    expect(s).toEqual(before);
  });
  it("sets additional gather quantities against total backpack and bank holdings", () => {
    const s = fresh();
    addItems(s.player.inventory, "iron-ore", 3);
    addItems(s.bank, "iron-ore", 9, Infinity);
    const iron = objectById("oakrest-ore-2")!;
    const choices = contextGoals(s, iron, 10);
    expect(choices[0].goal).toMatchObject({
      kind: "gather",
      resourceId: "iron",
      quantity: 22,
      targetId: iron.id,
    });
    expect(choices[1].goal).toMatchObject({
      kind: "skill",
      skill: "mining",
      level: 15,
      targetId: iron.id,
    });
  });
  it("gathers persistently across full backpacks and depleted nodes while keeping tools", () => {
    const s = fresh();
    at(s, "oakrest-ore-0");
    addItems(s.player.inventory, "logs", 17);
    const goal: Ambition = {
      id: "copper-supplies",
      title: "Gather 25 copper",
      kind: "gather",
      resourceId: "copper",
      quantity: 25,
      targetId: "oakrest-ore-0",
    };
    expect(applyRpgCommand(s, { type: "goal", goal }).ok).toBe(true);
    until(s, () => goalMet(s, goal));
    expect(itemCount(s.bank, "copper-ore")).toBeGreaterThan(0);
    expect(itemCount(s.bank, "logs")).toBe(17);
    expect(
      itemCount(s.player.inventory, "copper-ore") +
        itemCount(s.bank, "copper-ore"),
    ).toBe(25);
    for (const tool of ["bronze-axe", "bronze-pickaxe", "small-net", "hammer"])
      expect(itemCount(s.player.inventory, tool)).toBe(1);
    expect(s.rewards).toHaveLength(25);
    expect(s.rewards!.every((e) => e.items[0].itemId === "copper-ore")).toBe(
      true,
    );
    expect(validateRpgSave(s)).not.toBeNull();
  });
  it("uses the clicked usable node before considering nearer alternatives", () => {
    const s = fresh();
    at(s, "oakrest-ore-0");
    const node = WORLD.objects.find(
      (o) => o.resourceId === "copper" && o.id !== "oakrest-ore-0",
    )!;
    const goal = contextGoals(s, node)[1].goal;
    applyRpgCommand(s, { type: "goal", goal });
    stepRpg(s);
    expect(s.control.active).toMatchObject({
      type: "gather",
      objectId: node.id,
    });
    expect(s.player.path.length).toBeGreaterThan(0);
  });
  it("ends next-level training at the first successful harvest that reaches the level", () => {
    const s = fresh();
    at(s, "oakrest-ore-0");
    const goal = contextGoals(s, objectById("oakrest-ore-0")!)[1].goal;
    applyRpgCommand(s, { type: "goal", goal });
    until(s, () => goalMet(s, goal));
    expect(s.control.active).toBeNull();
    expect(s.player.skills.mining).toBe(875);
    expect(s.rewards).toHaveLength(5);
  });
  it("trains for locked iron with an actual withdrawn tool and survives save replay", () => {
    const s = fresh();
    at(s, "oakrest-bank");
    removeItems(s.player.inventory, "bronze-pickaxe", 1);
    addItems(s.bank, "bronze-pickaxe", 1, Infinity);
    // Keep the test bounded while still crossing the locked-resource prerequisite.
    s.player.skills.mining = XP_THRESHOLDS[14] - RESOURCES.copper.xp;
    const goal = contextGoals(s, objectById("oakrest-ore-2")!, 2)[0].goal;
    applyRpgCommand(s, { type: "goal", goal });
    stepRpg(s);
    expect(itemCount(s.player.inventory, "bronze-pickaxe")).toBe(1);
    expect(itemCount(s.bank, "bronze-pickaxe")).toBe(0);
    until(s, () => s.player.skills.mining >= XP_THRESHOLDS[14]);
    const loaded = validateRpgSave(JSON.parse(JSON.stringify(s)))!;
    expect(loaded).not.toBeNull();
    expect(loaded.control.goal).toEqual(goal);
    until(s, () => goalMet(s, goal));
    until(loaded, () => goalMet(loaded, goal));
    expect(loaded).toEqual(s);
    expect(
      itemCount(s.player.inventory, "iron-ore") + itemCount(s.bank, "iron-ore"),
    ).toBe(2);
  });
  it("rejects unknown resources, invalid quantities, and mismatched clicked skills", () => {
    const s = fresh();
    const base = contextGoals(s, objectById("oakrest-ore-0")!)[0].goal;
    for (const patch of [
      { resourceId: "bad" },
      { quantity: 0 },
      { quantity: 1.5 },
      { quantity: Infinity },
      { targetId: "oakrest-tree-0" },
      { skill: "fishing" },
    ]) {
      expect(
        applyRpgCommand(s, {
          type: "goal",
          goal: { ...base, ...patch } as Ambition,
        }).ok,
      ).toBe(false);
    }
    const skill = contextGoals(s, objectById("oakrest-ore-0")!)[1].goal;
    expect(
      applyRpgCommand(s, {
        type: "goal",
        goal: { ...skill, targetId: "oakrest-tree-0" },
      }).ok,
    ).toBe(false);
  });
});

describe("actual deterministic reward events", () => {
  it("records quest coins and actual capped XP once, rejecting repeated claims and load replay", () => {
    const s = fresh();
    at(s, "quest-supper");
    s.player.skills.cooking = 2_000_000_000 - 100;
    applyRpgCommand(s, { type: "quest", questId: "supper" });
    stepRpg(s);
    expect(s.rewards).toEqual([]);
    // The staged quest has already completed its basket/supply objectives in this reward fixture.
    s.quests.supper.stageId = "deliver";
    applyRpgCommand(s, { type: "quest", questId: "supper" });
    stepRpg(s);
    expect(s.rewards).toEqual([
      {
        id: "reward-1",
        tick: 2,
        items: [{ itemId: "coins", quantity: 60 }],
        xp: { fishing: 2000, cooking: 100 },
      },
    ]);
    expect(s.player.skills.cooking).toBe(2_000_000_000);
    const before = JSON.stringify(s);
    expect(applyRpgCommand(s, { type: "quest", questId: "supper" }).ok).toBe(
      false,
    );
    expect(JSON.stringify(s)).toBe(before);
    const loaded = validateRpgSave(JSON.parse(before))!;
    expect(loaded).not.toBeNull();
    applyRpgCommand(loaded, { type: "wait" });
    stepRpg(loaded, 50);
    expect(loaded.rewards).toEqual(s.rewards);
    expect(
      applyRpgCommand(loaded, { type: "quest", questId: "supper" }).ok,
    ).toBe(false);
    expect(loaded.rewards).toHaveLength(1);
  });
  it("awards a successful transaction once, excludes NPC work, and never replays a loaded reward", () => {
    const s = fresh();
    at(s, "oakrest-ore-0");
    applyRpgCommand(s, {
      type: "gather",
      objectId: "oakrest-ore-0",
      quantity: 1,
    });
    stepRpg(s, 7);
    expect(s.rewards).toEqual([]);
    stepRpg(s);
    expect(s.rewards).toEqual([
      {
        id: "reward-1",
        tick: 8,
        items: [{ itemId: "copper-ore", quantity: 1 }],
        xp: { mining: 175 },
      },
    ]);
    applyRpgCommand(s, { type: "wait" });
    const loaded = validateRpgSave(JSON.parse(JSON.stringify(s)))!;
    stepRpg(s, 600);
    stepRpg(loaded, 600);
    expect(s.rewards).toHaveLength(1);
    expect(loaded).toEqual(s);
    expect(s.npcs.some((npc) => npc.completed > 0)).toBe(true);
  });
  it("records crafting output and XP once; failed consumed ore and burnt fish give no rewards", () => {
    const s = fresh();
    at(s, "oakrest-furnace");
    addItems(s.player.inventory, "copper-ore", 1);
    addItems(s.player.inventory, "tin-ore", 1);
    applyRpgCommand(s, { type: "craft", recipeId: "bronze-bar", quantity: 1 });
    stepRpg(s, 5);
    expect(s.rewards![0]).toMatchObject({
      items: [{ itemId: "bronze-bar", quantity: 1 }],
      xp: { smithing: 62 },
    });
    s.player.skills.smithing = XP_THRESHOLDS[14];
    addItems(s.player.inventory, "iron-ore", 1);
    s.seed = 1000;
    applyRpgCommand(s, { type: "craft", recipeId: "iron-bar", quantity: 1 });
    stepRpg(s, 5);
    expect(itemCount(s.player.inventory, "iron-ore")).toBe(0);
    expect(s.rewards).toHaveLength(1);
    const cook = fresh();
    at(cook, "oakrest-range");
    addItems(cook.player.inventory, "raw-shrimp", 1);
    cook.seed = 1500;
    applyRpgCommand(cook, {
      type: "craft",
      recipeId: "cooked-shrimp",
      quantity: 1,
    });
    stepRpg(cook, 4);
    expect(itemCount(cook.player.inventory, "burnt-shrimp")).toBe(1);
    expect(cook.rewards).toEqual([]);
  });
  it("records only real combat damage XP once per strike without inventing loot in the bag", () => {
    const s = fresh();
    const enemy = s.enemies.find((e) => e.id === "boar-0")!;
    s.player.position = { ...enemy.position, x: enemy.position.x - 1 };
    s.player.previousPosition = { ...s.player.position };
    s.player.skills.attack = XP_THRESHOLDS[98];
    s.player.skills.strength = XP_THRESHOLDS[98];
    const attack = s.player.skills.attack,
      hp = s.player.skills.hitpoints;
    applyRpgCommand(s, { type: "attack", enemyId: enemy.id });
    until(s, () => enemy.health === 0, 100);
    expect(s.rewards!.every((e) => e.items.length === 0)).toBe(true);
    expect(s.rewards!.reduce((n, e) => n + (e.xp.attack ?? 0), 0)).toBe(
      s.player.skills.attack - attack,
    );
    expect(s.rewards!.reduce((n, e) => n + (e.xp.hitpoints ?? 0), 0)).toBe(
      s.player.skills.hitpoints - hp,
    );
    expect(s.rewards!.reduce((n, e) => n + (e.xp.attack ?? 0), 0)).toBe(320);
    expect(new Set(s.rewards!.map((e) => e.tick)).size).toBe(s.rewards!.length);
  });
  it("bounds logs to 32 and strictly validates log IDs, ticks, items, and XP; old V3 remains valid", () => {
    const s = fresh();
    const legacy = structuredClone(s);
    delete legacy.rewards;
    expect(validateRpgSave(legacy)).not.toBeNull();
    at(s, "oakrest-ore-0");
    const goal = contextGoals(s, objectById("oakrest-ore-0")!, 35)[0].goal;
    applyRpgCommand(s, { type: "goal", goal });
    until(s, () => goalMet(s, goal), 7000);
    expect(s.rewards).toHaveLength(32);
    expect(s.rewards![0].id).toBe("reward-4");
    expect(validateRpgSave(s)).not.toBeNull();
    for (const patch of [
      { id: "bad" },
      { id: "reward-0" },
      { tick: s.tick + 1 },
      { items: [{ itemId: "missing", quantity: 1 }] },
      { xp: { mining: -1 } },
      { xp: { fake: 1 } },
    ]) {
      const bad = structuredClone(s);
      Object.assign(bad.rewards![0], patch);
      expect(validateRpgSave(bad)).toBeNull();
    }
    const duplicate = structuredClone(s);
    duplicate.rewards![1].id = duplicate.rewards![0].id;
    expect(validateRpgSave(duplicate)).toBeNull();
  });
});

describe("one ore per backpack slot", () => {
  it("blocks a full-bag purchase atomically and banks before a full-bag harvest can award items", () => {
    const s = fresh();
    at(s, "oakrest-shop");
    s.player.inventory = [
      { itemId: "coins", quantity: 1000 },
      { itemId: "copper-ore", quantity: 27 },
    ];
    const before = structuredClone(s.player.inventory);
    const stock = s.shops.find((shop) => shop.id === "oakrest-shop")!.stock[
      "iron-pickaxe"
    ];
    applyRpgCommand(s, {
      type: "buy",
      shopId: "oakrest-shop",
      itemId: "iron-pickaxe",
      quantity: 1,
    });
    stepRpg(s);
    expect(s.player.inventory).toEqual(before);
    expect(
      s.shops.find((shop) => shop.id === "oakrest-shop")!.stock["iron-pickaxe"],
    ).toBe(stock);
    s.player.inventory = [{ itemId: "copper-ore", quantity: 28 }];
    s.player.equipment.weapon = "bronze-pickaxe";
    at(s, "oakrest-ore-0");
    applyRpgCommand(s, {
      type: "gather",
      objectId: "oakrest-ore-0",
      quantity: 1,
    });
    stepRpg(s);
    expect(inventorySlots(s.player.inventory)).toBe(28);
    expect(s.rewards).toEqual([]);
    expect(s.player.action?.kind).toBe("bank");
    expect(s.player.skills.mining).toBe(0);
    expect(s.resources["oakrest-ore-0"].available).toBe(true);
    expect(validateRpgSave(s)).not.toBeNull();
  });
  it("counts each unstackable ore, keeps currency/bait stacks, and rejects overfull saves atomically", () => {
    for (const id of [
      "copper-ore",
      "tin-ore",
      "iron-ore",
      "coal",
      "bronze-bar",
      "iron-bar",
      "steel-bar",
    ]) {
      expect(ITEMS[id].stackable).toBe(false);
      const bag: ItemStack[] = [];
      expect(addItems(bag, id, 28)).toBe(true);
      expect(inventorySlots(bag)).toBe(28);
      const before = structuredClone(bag);
      expect(addItems(bag, id, 1)).toBe(false);
      expect(addItems(bag, "coins", 1)).toBe(false);
      expect(
        exchangeItems(bag, [], [{ itemId: "bronze-pickaxe", quantity: 1 }]),
      ).toBe(false);
      expect(bag).toEqual(before);
    }
    const bag: ItemStack[] = [];
    addItems(bag, "coins", 1000000);
    addItems(bag, "bait", 1000000);
    addItems(bag, "copper-ore", 26);
    expect(inventorySlots(bag)).toBe(28);
    expect(addItems(bag, "coins", 10)).toBe(true);
    const s = fresh();
    s.player.inventory = [{ itemId: "copper-ore", quantity: 29 }];
    expect(validateRpgSave(s)).toBeNull();
  });
});

describe("player running and energy recovery", () => {
  function moving() {
    const s = fresh(); s.player.runEnergy = 1000;
    expect(applyRpgCommand(s, { type: "move", position: tile(60, 100) }).ok).toBe(true);
    expect(s.player.path.length).toBeGreaterThan(3);
    return s;
  }
  it("runs two legal path steps, walks one, and charges only actual running steps", () => {
    const running = moving(); const path = structuredClone(running.player.path);
    stepRpg(running);
    expect(running.player.position).toEqual(path[1]); expect(running.player.runEnergy).toBe(880);
    const walking = moving(); applyRpgCommand(walking, { type: "run", enabled: false }); stepRpg(walking);
    expect(walking.player.position).toEqual(path[0]); expect(walking.player.runEnergy).toBe(1015);
    const short = moving(); applyRpgCommand(short, { type: "move", position: short.player.path[0] }); stepRpg(short);
    expect(short.player.runEnergy).toBe(940);
    expect(validateRpgSave(running)).not.toBeNull(); expect(validateRpgSave(walking)).not.toBeNull();
  });
  it("switches to walking on exhaustion, recovers while walking, and requires an explicit run toggle", () => {
    const s = moving(); s.player.runEnergy = 120; const path = structuredClone(s.player.path);
    stepRpg(s); expect(s.player.position).toEqual(path[1]); expect(s.player.runEnergy).toBe(0);
    expect(s.control.running).toBe(false);
    const denied = applyRpgCommand(s, { type: "run", enabled: true });
    expect(denied.ok).toBe(false); expect(denied.message).toContain("Walk or wait");
    stepRpg(s); expect(s.player.position).toEqual(path[2]); expect(s.player.runEnergy).toBe(15);
    stepRpg(s, 3); expect(s.player.runEnergy).toBe(60); expect(s.control.running).toBe(false);
    expect(applyRpgCommand(s, { type: "run", enabled: true }).ok).toBe(true);
    expect(s.control.running).toBe(true);
  });
  it("recovers during Wait and keeps NPC movement independent of the player's running preference", () => {
    const s = moving(); s.player.runEnergy = 0; applyRpgCommand(s, { type: "wait" });
    const position = { ...s.player.position }; stepRpg(s, 4);
    expect(s.player.runEnergy).toBe(60); expect(s.player.position).toEqual(position);
    s.player.runEnergy = 9990; stepRpg(s, 2); expect(s.player.runEnergy).toBe(10000);
    const running = moving(), walking = moving(); applyRpgCommand(walking, { type: "run", enabled: false });
    stepRpg(running, 10); stepRpg(walking, 10);
    expect(running.npcs).toEqual(walking.npcs);
  });
  it("persists the optional running flag and accepts old V3 saves with default running behavior", () => {
    const s = moving(); expect(s.control.running).toBe(true);
    applyRpgCommand(s, { type: "run", enabled: false });
    const loaded = validateRpgSave(JSON.parse(JSON.stringify(s)))!;
    expect(loaded.control.running).toBe(false); stepRpg(loaded);
    expect(loaded.player.runEnergy).toBe(1015);
    const legacy = moving(); delete legacy.control.running;
    const old = validateRpgSave(JSON.parse(JSON.stringify(legacy)))!;
    expect(old).not.toBeNull(); stepRpg(old); expect(old.player.runEnergy).toBe(880);
    const bad = structuredClone(s); (bad.control as unknown as Record<string, unknown>).running = "yes";
    expect(validateRpgSave(bad)).toBeNull();
    expect(applyRpgCommand(s, { type: "run", enabled: "yes" } as never).ok).toBe(false);
  });
});

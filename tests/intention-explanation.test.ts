import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { applyRpgCommand, createRpg, reconcileRpg, stepRpg, validateRpgSave } from "../src/rpg/engine";
import { explainIntention } from "../src/rpg/intention-explanation";
import { DEFAULT_PLANNER_PROFILE, PLANNER_PRESETS } from "../src/rpg/planner-profile";
import { addItems, inventorySlots, itemCount } from "../src/rpg/inventory";
import { objectById, interactionTiles, tile } from "../src/rpg/world";
import { RESOURCES } from "../src/rpg/content";
import type { IntentionExplanation, RpgCommand, RpgState } from "../src/rpg/types";

const NOW = Date.UTC(2026, 9, 29, 12);
function fresh(seed = 7) { const s = createRpg(NOW, seed); s.control.thinkingUntil = 1e9; return s; }
function at(s: RpgState, id: string) { s.player.position = { ...interactionTiles(objectById(id)!)[0] }; s.player.previousPosition = { ...s.player.position }; s.player.path = []; s.player.movement = null; }
function accept(s: RpgState, command: RpgCommand) { expect(applyRpgCommand(s, command).ok).toBe(true); }
function valid(s: RpgState) { expect(validateRpgSave(s), JSON.stringify(s.control)).not.toBeNull(); }
function until(s: RpgState, predicate: () => boolean, max = 1000) {
  for (let i = 0; i < max && !predicate(); i++) stepRpg(s);
  expect(predicate(), `tick ${s.tick}: ${s.control.reason}`).toBe(true);
}

describe("actual intention explanation", () => {
  it("explains real forge copper, tin and smelting decisions with held counts and inputs", () => {
    const s = createRpg(NOW, 7), seen = new Set<string>();
    for (let i = 0; i < 1000 && !s.quests.forge.complete; i++) {
      stepRpg(s);
      const order = s.control.active, view = explainIntention(s);
      if (order?.type === "gather" && ["copper", "tin"].includes(objectById(order.objectId)!.resourceId!)) {
        const resource = objectById(order.objectId)!.resourceId!;
        seen.add(resource); expect(view.targetId).toBeTruthy();
        expect(view.reason).toContain("bronze"); expect(view.reason).toContain("held (bag");
        expect(view.reason).toContain("Copper ore"); expect(view.reason).toContain("Tin ore");
        if (resource === "copper") expect(view.next).toContain("Tin ore");
        if (s.player.action?.kind === "gather" && view.phase === "work") expect(view.progress).toMatchObject({ max: s.player.action.duration, value: s.player.action.duration - s.player.action.remaining });
      }
      if (order?.type === "craft" && order.recipeId === "bronze-bar") {
        seen.add("smelt"); expect(view.reason).toContain("1 Copper ore + 1 Tin ore");
        expect(view.targetId).toContain("furnace");
      }
    }
    expect(seen).toEqual(new Set(["copper", "tin", "smelt"])); expect(s.quests.forge.complete).toBe(true); valid(s);
    stepRpg(s, 2);
    expect(s.messages.filter((message) => message.key.startsWith("autogoal-")).map((message) => message.text)).toEqual([expect.stringContaining("Finished An Honest Forge; Alden chose")]);
  });

  it("shows the actual bank detour, rather than the gather order's node", () => {
    const s = fresh(); at(s, "oakrest-ore-0");
    addItems(s.player.inventory, "copper-ore", 28 - inventorySlots(s.player.inventory));
    accept(s, { type: "gather", objectId: "oakrest-ore-0", quantity: 3 });
    const view = explainIntention(s);
    expect(s.control.active?.type).toBe("gather"); expect(s.player.action?.kind).toBe("bank");
    expect(view.phase).toBe("travel"); expect(view.targetId).toBe(s.player.action!.targetId);
    expect(view.title).toContain("bank"); expect(view.reason).toContain("28/28"); expect(view.next).toContain("Resume Copper ore");
    stepRpg(s); expect(s.control.decisions!.at(-1)!.key).toContain(":bank-detour:"); valid(s);
  });

  it("distinguishes direct overrides, exact destinations, queue, pause and resume", () => {
    const s = fresh(); accept(s, { type: "move", position: tile(60, 100) });
    const first = explainIntention(s); expect(first.source).toBe("player"); expect(first.reason).toContain("Your order");
    expect(first.targetPosition).toEqual(tile(60, 100)); expect(first.phase).toBe("travel");
    accept(s, { type: "move", position: tile(61, 100) }); expect(explainIntention(s).key).not.toBe(first.key);
    accept(s, { type: "enqueue", order: { type: "quest", questId: "forge" } }); expect(explainIntention(s).next).toContain("Next queued");
    expect(s.control.decisions).toHaveLength(1); // Same-tick commands coalesce to the latest actual intention.
    stepRpg(s); accept(s, { type: "wait" }); expect(explainIntention(s)).toMatchObject({ phase: "wait", source: "player", title: "Waiting for you" });
    const queue = structuredClone(s.control.queue); stepRpg(s, 2); expect(s.control.queue).toEqual(queue);
    accept(s, { type: "resume" }); expect(explainIntention(s).phase).toBe("ready");
    stepRpg(s); expect(s.control.goalSource).toBe("player"); valid(s);
  });

  it("records meaningful transitions once per tick, caps at eight and excludes ordinary progress spam", () => {
    const s = fresh(); at(s, "oakrest-ore-0");
    accept(s, { type: "gather", objectId: "oakrest-ore-0", quantity: 10 }); stepRpg(s);
    const trail = structuredClone(s.control.decisions), messages = structuredClone(s.messages);
    stepRpg(s, 3); expect(s.control.decisions).toEqual(trail); expect(s.messages).toEqual(messages);
    expect(explainIntention(s).progress!.value).toBeGreaterThan(1);
    s.player.position = tile(70, 108); s.player.previousPosition = { ...s.player.position }; s.player.path = []; s.player.action = null;
    for (let i = 0; i < 12; i++) { accept(s, { type: "move", position: tile(71 + i % 2, 108) }); stepRpg(s); }
    expect(s.control.decisions).toHaveLength(8);
    expect(new Set(s.control.decisions!.map((entry) => entry.tick)).size).toBe(8);
    expect(s.messages.some((message) => message.key.startsWith("intention"))).toBe(false); valid(s);
  });

  it("reports the committed replacement, missing tool, retreat and a failed cooking result truthfully", () => {
    const s = fresh(); at(s, "oakrest-ore-0"); s.resources["oakrest-ore-0"] = { objectId: "oakrest-ore-0", available: false, respawnAt: 99 };
    accept(s, { type: "gather", objectId: "oakrest-ore-0", quantity: 2 });
    expect(explainIntention(s).targetId).not.toBe("oakrest-ore-0"); expect(explainIntention(s).reason).toContain("replacement");
    stepRpg(s); expect(explainIntention(s).targetId).not.toBe("oakrest-ore-0");
    until(s, () => s.player.action?.kind === "gather"); expect(explainIntention(s).targetId).toBe((s.control.active as { objectId: string }).objectId);
    s.player.inventory = s.player.inventory.filter((item) => item.itemId !== "bronze-pickaxe"); s.player.path = [];
    expect(explainIntention(s).phase).toBe("blocked"); expect(explainIntention(s).reason).toContain("pickaxe");
    const retreat = fresh(); at(retreat, "oakrest-ore-0"); retreat.player.health = 2; retreat.player.inventory = [];
    retreat.control.active = { type: "attack", enemyId: "boar-0" }; retreat.control.source = "autonomous";
    stepRpg(retreat); expect(explainIntention(retreat).reason).toContain("no carried healing meals");
    let burned = false;
    for (let seed = 1; seed <= 12 && !burned; seed++) {
      const cook = fresh(seed); at(cook, "oakrest-range"); addItems(cook.player.inventory, "raw-shrimp", 2);
      accept(cook, { type: "craft", recipeId: "cooked-shrimp", quantity: 2 });
      for (let i = 0; i < 10 && cook.control.active; i++) {
        const xp = cook.player.skills.cooking; stepRpg(cook);
        if (cook.effects.at(-1)?.kind === "action-result" && cook.effects.at(-1)?.success === false) {
          burned = true; expect(cook.player.skills.cooking).toBe(xp);
          expect(explainIntention(cook).reason).toContain("failed and awarded no success XP"); break;
        }
      }
    }
    expect(burned).toBe(true);
  });

  it("is pure and cannot change simulation, rewards or seeded outcomes through repeated reads", () => {
    const a = createRpg(NOW, 7), b = structuredClone(a);
    for (let i = 0; i < 250; i++) {
      const before = JSON.stringify(a); expect(explainIntention(a)).toEqual(explainIntention(a)); expect(JSON.stringify(a)).toBe(before);
      stepRpg(a); stepRpg(b);
    }
    expect(a).toEqual(b); expect(a.rewards!.length).toBeGreaterThan(0);
    const loaded = validateRpgSave(JSON.parse(JSON.stringify(a)))!; expect(loaded).toEqual(a);
    reconcileRpg(a, NOW + 120000); reconcileRpg(loaded, NOW + 120000); expect(loaded).toEqual(a); valid(a);
  });

  it("strictly validates optional historical decisions and imports without recording or replay", () => {
    const s = fresh(); accept(s, { type: "move", position: tile(60, 100) }); stepRpg(s, 3); valid(s);
    const before = JSON.stringify(s); expect(validateRpgSave(s)).not.toBeNull(); expect(JSON.stringify(s)).toBe(before);
    const mutations: ((entry: IntentionExplanation, state: RpgState) => void)[] = [
      (entry) => { entry.tick = 1e9; }, (entry) => { entry.source = "other" as "player"; },
      (entry) => { entry.title = ""; }, (entry) => { entry.reason = "a".repeat(1001); },
      (entry) => { entry.targetPosition = tile(-1, 0); },
      (_entry, state) => { state.control.decisions!.push(structuredClone(state.control.decisions![0])); },
    ];
    for (const mutate of mutations) { const bad = structuredClone(s); mutate(bad.control.decisions![0], bad); expect(validateRpgSave(bad)).toBeNull(); }
    const historical = structuredClone(s); historical.control.decisions![0].targetPosition = { ...objectById("oakrest-ore-0")!.position }; expect(validateRpgSave(historical)).not.toBeNull();
    for (const file of ["rpg-v3-original.json", "rpg-v4-original.json", "rpg-v5-feel.json"]) {
      const old = JSON.parse(readFileSync(new URL(`./fixtures/${file}`, import.meta.url), "utf8"));
      const original = JSON.stringify(old), loaded = validateRpgSave(old)!;
      expect(loaded).not.toBeNull(); expect(loaded.control.decisions).toBeUndefined(); expect(loaded.control.profile).toBeUndefined();
      expect(JSON.stringify(old)).toBe(original); expect(loaded.messages).toEqual(old.version === 5 ? old.messages : []);
    }
  });
});

describe("editable deterministic planning preferences", () => {
  it("persists traits while preserving the current player goal, active order, queue, items and XP", () => {
    const s = fresh(); const goal = { id: "my-mining", kind: "skill" as const, skill: "mining" as const, level: 30, title: "My Mining 30" };
    accept(s, { type: "goal", goal }); accept(s, { type: "gather", objectId: "oakrest-ore-0", quantity: 30 });
    accept(s, { type: "enqueue", order: { type: "bank" } });
    const before = structuredClone(s);
    accept(s, { type: "planner-profile", profile: PLANNER_PRESETS.find((preset) => preset.id === "explorer")!.profile });
    expect(s.control.goal).toEqual(goal); expect(s.control.goalSource).toBe("player");
    expect(s.control.active).toEqual(before.control.active); expect(s.control.queue).toEqual(before.control.queue);
    expect(s.player).toEqual(before.player); expect(s.bank).toEqual(before.bank); expect(s.rewards).toEqual(before.rewards); valid(s);
    for (const profile of [{ ...DEFAULT_PLANNER_PROFILE, curiosity: -1 }, { ...DEFAULT_PLANNER_PROFILE, caution: .5 }, { ...DEFAULT_PLANNER_PROFILE, extra: 1 }, { curiosity: 50 }]) {
      const snapshot = JSON.stringify(s); expect(applyRpgCommand(s, { type: "planner-profile", profile } as RpgCommand).ok).toBe(false); expect(JSON.stringify(s)).toBe(snapshot);
    }
  });

  it("reconsiders explicitly using the actual ranked comparison and preserves accepted pending orders", () => {
    const s = fresh(), previous = s.control.goal!.id;
    accept(s, { type: "gather", objectId: "oakrest-ore-0", quantity: 100 });
    accept(s, { type: "enqueue", order: { type: "bank" } }); const queue = structuredClone(s.control.queue), player = structuredClone(s.player);
    accept(s, { type: "planner-profile", profile: PLANNER_PRESETS.find((preset) => preset.id === "explorer")!.profile });
    expect(s.control.goal!.id).toBe(previous); accept(s, { type: "reconsider" });
    expect(s.control.goal!.id).not.toBe(previous); expect(s.control.goalSource).toBe("autonomous");
    expect(s.control.deliberation!.chosenId).toBe(s.control.goal!.id); expect(s.control.deliberation!.options[0].goal).toEqual(s.control.goal);
    expect(s.control.deliberation!.options.length).toBeLessThanOrEqual(4); expect(s.control.active).toBeNull(); expect(s.player.path).toEqual([]);
    expect(s.control.queue).toEqual(queue); expect(s.player.inventory).toEqual(player.inventory); expect(s.player.skills).toEqual(player.skills);
    expect(explainIntention(s).reason).toContain("Chosen because"); valid(s);
  });

  it("uses caution for real autonomous meals and keeps the neutral legacy threshold", () => {
    const neutral = createRpg(NOW), cautious = structuredClone(neutral); neutral.player.health = cautious.player.health = 6;
    accept(cautious, { type: "planner-profile", profile: { ...DEFAULT_PLANNER_PROFILE, caution: 100 } });
    stepRpg(neutral); stepRpg(cautious);
    expect(itemCount(neutral.player.inventory, "cooked-shrimp")).toBe(6); expect(itemCount(cautious.player.inventory, "cooked-shrimp")).toBe(5);
    expect(cautious.player.health).toBeGreaterThan(neutral.player.health); expect(cautious.control.decisions!.at(-1)!.reason).toContain("Caution 100/100");
    const legacy = createRpg(NOW); delete legacy.control.profile; legacy.player.health = 6; stepRpg(legacy); expect(legacy.player).toEqual(neutral.player);
    const direct = createRpg(NOW); direct.player.health = 6; accept(direct, { type: "planner-profile", profile: { ...DEFAULT_PLANNER_PROFILE, caution: 100 } });
    accept(direct, { type: "gather", objectId: "oakrest-ore-0", quantity: 1 }); stepRpg(direct); expect(itemCount(direct.player.inventory, "cooked-shrimp")).toBe(6); valid(cautious);
  });

  it("rejects corrupt profile, source and deliberation state atomically while accepting older missing fields", () => {
    const s = createRpg(NOW); valid(s);
    for (const mutate of [
      (bad: RpgState) => { bad.control.profile!.caution = 101; },
      (bad: RpgState) => { bad.control.goalSource = "unknown" as "player"; },
      (bad: RpgState) => { bad.control.deliberation!.tick = 1; },
      (bad: RpgState) => { bad.control.deliberation!.chosenId = "unknown"; },
      (bad: RpgState) => { bad.control.deliberation!.options[0].score = 1001; },
      (bad: RpgState) => { bad.control.deliberation!.options[0].reasons = []; },
      (bad: RpgState) => { bad.control.deliberation!.options[0].goal = { id: "bad", title: "Unknown", kind: "gather", resourceId: "missing" as keyof typeof RESOURCES, quantity: 1 }; },
    ]) { const bad = structuredClone(s); mutate(bad); const before = JSON.stringify(bad); expect(validateRpgSave(bad)).toBeNull(); expect(JSON.stringify(bad)).toBe(before); }
    delete s.control.profile; delete s.control.goalSource; delete s.control.deliberation; delete s.control.decisions;
    expect(validateRpgSave(s)).toEqual(s);
  });
});

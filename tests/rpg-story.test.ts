import { describe, expect, it } from "vitest";
import { applyRpgCommand, createRpg, currentQuestStage, normalizeQuestProgress, reconcileRpg, repairRpgPositions, stepRpg, validateRpgSave } from "../src/rpg/engine";
import { ITEMS, QUESTS, SHOPS } from "../src/rpg/content";
import { addItems, itemCount } from "../src/rpg/inventory";
import { FERRIES, interactionTiles, objectById, WORLD } from "../src/rpg/world";
import { XP_THRESHOLDS } from "../src/rpg/skills";
import type { RpgState } from "../src/rpg/types";
const NOW = Date.UTC(2026, 9, 29, 12);
function at(s: RpgState, id: string) { s.player.position = { ...interactionTiles(objectById(id)!)[0] }; s.player.previousPosition = { ...s.player.position }; s.player.path = []; }
function goal(s: RpgState, id: string) { expect(applyRpgCommand(s, { type: "goal", goal: { id: `quest-${id}`, title: QUESTS[id].name, kind: "quest", questId: id } }).ok).toBe(true); }
function finish(s: RpgState, id: string, max = 20000) {
  for (let i = 0; i < max && !s.quests[id].complete; i++) { stepRpg(s); if (i % 100 === 0) expect(validateRpgSave(s), `${id}:${s.tick}:${s.control.reason}`).not.toBeNull(); }
  expect(s.quests[id].complete, `${id}:${s.tick}:${JSON.stringify(s.control)} bag${JSON.stringify(s.player.inventory)} bank${JSON.stringify(s.bank)}`).toBe(true);
}
describe("staged original overworld stories", () => {
  it("keeps the default autonomous journey progressing across the first three stories", () => {
    const s = createRpg(NOW); finish(s, "road", 36000);
  }, 20000);
  it("autonomously completes all six stories without required narrative services", () => {
    const s = createRpg(NOW, 7);
    for (const id of Object.keys(QUESTS)) { goal(s, id); finish(s, id); }
    expect(s.quests.bowyer.counters?.practice).toBe(3);
    expect(itemCount(s.player.inventory, "shortbow") + itemCount(s.bank, "shortbow")).toBe(1);
    expect(s.quests.letters.choices?.route).toBe("supplies");
    expect(s.quests.watch.counters?.captain).toBe(1);
    expect(Object.keys(s.player.skills)).not.toContain("ranged");
    for (const id of Object.keys(QUESTS)) {
      expect(s.journal.filter((line) => line.startsWith(`Completed: ${QUESTS[id].name}.`))).toHaveLength(1);
      expect(applyRpgCommand(s, { type: "quest", questId: id }).ok).toBe(false);
    }
  }, 20000);
  it.each(["supplies", "scout"])("supports the %s river branch with authoritative choices and a real ferry", (branch) => {
    const s = createRpg(NOW); s.quests.letters.accepted = true; s.quests.letters.stageId = "route";
    at(s, "quest-letters"); goal(s, "letters"); stepRpg(s);
    expect(currentQuestStage(s, "letters")?.kind).toBe("choice"); expect(s.dialogue).not.toBeNull();
    const before = JSON.stringify(s); expect(applyRpgCommand(s, { type: "dialogue-choice", choiceId: "invented" }).ok).toBe(false); expect(JSON.stringify(s)).toBe(before);
    expect(applyRpgCommand(s, { type: "travel-service", objectId: "ferry-west" }).ok).toBe(false);
    expect(applyRpgCommand(s, { type: "dialogue-choice", choiceId: branch }).ok).toBe(true); finish(s, "letters");
    expect(s.quests.letters.choices?.route).toBe(branch); at(s, "ferry-west");
    const coins = itemCount(s.player.inventory, "coins"); applyRpgCommand(s, { type: "travel-service", objectId: "ferry-west" }); stepRpg(s);
    expect(s.player.position).toEqual(FERRIES["ferry-west"].destination); expect(itemCount(s.player.inventory, "coins")).toBe(coins - 5);
  });
  it("resolves the same 20-second local choice across offline replay and save reload", () => {
    const s = createRpg(NOW); s.quests.letters.accepted = true; s.quests.letters.stageId = "route";
    at(s, "quest-letters"); goal(s, "letters"); stepRpg(s);
    const loaded = validateRpgSave(JSON.parse(JSON.stringify(s)))!; expect(loaded).not.toBeNull();
    reconcileRpg(s, NOW + 120000); reconcileRpg(loaded, NOW + 120000);
    expect(loaded).toEqual(s); expect(s.quests.letters.choices?.route).toBe("supplies");
    expect(applyRpgCommand(s, { type: "dialogue-choice", choiceId: "scout" }).ok).toBe(false);
  });
  it("normalizes completed and accepted old quests without duplicating rewards or dropping items", () => {
    const s = createRpg(NOW); s.quests.forge = { accepted: true, complete: true, kills: 0 };
    s.quests.supper = { accepted: true, complete: false, kills: 0 };
    delete s.quests.bowyer; delete s.quests.letters; delete s.quests.watch;
    const bag = structuredClone(s.player.inventory), original = JSON.stringify(s);
    const loaded = validateRpgSave(s)!; expect(loaded).not.toBeNull(); expect(JSON.stringify(s)).toBe(original);
    expect(loaded.quests.forge.stageId).toBe("complete"); expect(loaded.quests.supper.stageId).toBe("supplies");
    expect(loaded.player.inventory).toEqual(bag); expect(loaded.rewards).toEqual([]);
    expect(applyRpgCommand(loaded, { type: "quest", questId: "forge" }).ok).toBe(false);
    expect(Object.keys(normalizeQuestProgress(loaded).quests)).toHaveLength(6);
  });
  it("requires commissions and service quests, and repairs terrain explicitly without losing inventory", () => {
    const s = createRpg(NOW); at(s, "briarford-bowyer");
    expect(applyRpgCommand(s, { type: "buy", shopId: "briarford-bowyer", itemId: "shortbow", quantity: 1 }).ok).toBe(false);
    at(s, "bowyer-target"); applyRpgCommand(s, { type: "interact", objectId: "bowyer-target", verb: "practice" }); stepRpg(s, 10);
    expect(s.quests.bowyer.counters?.practice ?? 0).toBe(0);
    const bag = structuredClone(s.player.inventory); s.player.position = { ...WORLD.spawns[0], x: 119, y: 95 };
    repairRpgPositions(s); expect(s.player.inventory).toEqual(bag); expect(validateRpgSave(s)).not.toBeNull();
    expect(SHOPS["oakrest-shop"].stock["steel-pickaxe"].buy).toBe(500);
    expect(ITEMS["black-sword"].attackLevel).toBe(10); expect(ITEMS["mithril-pickaxe"].level).toBe(21);
    expect(XP_THRESHOLDS[1]).toBe(830);
    expect(addItems(s.bank, "logs", 2, Infinity)).toBe(true);
  });
});

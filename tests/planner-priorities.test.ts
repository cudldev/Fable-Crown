import { describe, expect, it } from "vitest";
import { createRpg } from "../src/rpg/engine";
import { evaluateGoals, goalMet, suggestGoals } from "../src/rpg/planning";
import { DEFAULT_PLANNER_PROFILE, getPlannerProfile, PLANNER_PRESETS, PLANNER_TRAITS } from "../src/rpg/planner-profile";
import { XP_THRESHOLDS } from "../src/rpg/skills";
import { objectById } from "../src/rpg/world";
import type { RpgState } from "../src/rpg/types";

const NOW = Date.UTC(2026, 9, 29, 12);
function finished(s: RpgState, id: string) { s.quests[id] = { accepted: true, complete: true, kills: 0, stageId: "complete" }; }
function workshop(s: RpgState) {
  for (const id of Object.keys(s.quests)) finished(s, id);
  s.player.skills.ranged = XP_THRESHOLDS[4];
  s.control.visited = ["hill-shrine", "east-watch", "north-bridge"];
  s.bank.push({ itemId: "steel-pickaxe", quantity: 1 }, { itemId: "steel-axe", quantity: 1 });
}
const score = (s: RpgState, id: string) => evaluateGoals(s).find((candidate) => candidate.goal.id === id)!.score;

describe("deterministic personality-aware ambition ranking", () => {
  it("keeps neutral traits on the quest-led journey with archery after the bowyer", () => {
    const s = createRpg(NOW);
    expect(evaluateGoals(s)[0].goal.id).toBe("quest-forge");
    finished(s, "forge"); expect(evaluateGoals(s)[0].goal.id).toBe("quest-bowyer");
    finished(s, "bowyer"); expect(evaluateGoals(s)[0].goal.id).toBe("train-ranged-5");
    s.player.skills.ranged = XP_THRESHOLDS[4];
    expect(evaluateGoals(s)[0].goal.id).toBe("quest-supper");
    finished(s, "supper"); expect(evaluateGoals(s)[0].goal.id).toBe("quest-letters");
    finished(s, "letters"); expect(evaluateGoals(s)[0].goal.id).toBe("quest-road");
  });
  it("turns curiosity and craftsmanship into different real choices", () => {
    const s = createRpg(NOW);
    s.control.profile = { curiosity: 100, craftsmanship: 0, helpfulness: 0, adventurousness: 0, caution: 0 };
    expect(evaluateGoals(s)[0].goal.kind).toBe("explore");
    expect(evaluateGoals(s)[0].reasons).toContain("Curiosity favours a new place");
    s.control.profile = { ...PLANNER_PRESETS.find((preset) => preset.id === "artisan")!.profile };
    expect(evaluateGoals(s)[0].goal.kind).toBe("equipment");
    expect(evaluateGoals(s)[0].reasons).toContain("Craftsmanship favours a lasting tool upgrade");
  });
  it("lowers risky practice when weapons, meals or health are missing, especially with caution", () => {
    const s = createRpg(NOW); workshop(s);
    const ready = score(s, "train-attack-5");
    s.player.equipment = {}; s.player.inventory = []; s.bank = [];
    s.control.profile = { ...DEFAULT_PLANNER_PROFILE, adventurousness: 100, craftsmanship: 0, curiosity: 0, helpfulness: 0, caution: 0 };
    const brave = score(s, "train-attack-5");
    s.control.profile.caution = 100;
    const cautious = score(s, "train-attack-5");
    expect(cautious).toBeLessThan(brave);
    s.control.profile = { ...DEFAULT_PLANNER_PROFILE }; s.control.visited = [];
    // Compare preparedness under exactly the same profile.
    s.player.inventory = [{ itemId: "bronze-sword", quantity: 1 }, { itemId: "cooked-shrimp", quantity: 6 }];
    s.bank = [{ itemId: "steel-pickaxe", quantity: 1 }, { itemId: "steel-axe", quantity: 1 }];
    s.control.visited = ["hill-shrine", "east-watch", "north-bridge"];
    expect(score(s, "train-attack-5")).toBe(ready);
    for (const skill of ["mining", "woodcutting", "fishing", "smithing", "cooking"] as const) s.player.skills[skill] = XP_THRESHOLDS[29];
    s.player.health = 1;
    expect(score(s, "train-attack-5")).toBeLessThan(ready);
  });
  it("lets an adventurous prince choose combat only after real preparation", () => {
    const s = createRpg(NOW);
    s.control.profile = { curiosity: 0, craftsmanship: 0, helpfulness: 0, adventurousness: 100, caution: 70 };
    expect(evaluateGoals(s)[0].goal.id).toBe("train-attack-5");
    s.player.inventory = []; s.player.equipment = {};
    expect(evaluateGoals(s)[0].goal.kind).toBe("quest");
  });
  it("uses saved supply quantities, useful tools, skill unlocks and nearby travel", () => {
    const s = createRpg(NOW); workshop(s);
    const empty = score(s, "train-smithing-3");
    s.bank.push({ itemId: "copper-ore", quantity: 8 }, { itemId: "tin-ore", quantity: 8 });
    expect(score(s, "train-smithing-3")).toBeGreaterThan(empty);
    for (const skill of ["attack", "strength", "defence", "ranged"] as const) s.player.skills[skill] = XP_THRESHOLDS[29];
    const toolReady = score(s, "train-mining-6");
    s.player.inventory = s.player.inventory.filter((item) => item.itemId !== "bronze-pickaxe");
    s.bank = s.bank.filter((item) => item.itemId !== "steel-pickaxe");
    expect(score(s, "train-mining-6")).toBeLessThan(toolReady);
    s.player.skills.mining = XP_THRESHOLDS[10];
    expect(evaluateGoals(s).some((option) => option.goal.id === "train-mining-15")).toBe(true);
    const fresh = createRpg(NOW); fresh.control.profile = { ...DEFAULT_PLANNER_PROFILE, curiosity: 100 };
    const far = score(fresh, "explore-east-watch"); fresh.player.position = { ...objectById("east-watch")!.position };
    expect(score(fresh, "explore-east-watch")).toBeGreaterThan(far);
  });
  it("excludes completed and locked stories and fulfilled milestones", () => {
    const s = createRpg(NOW);
    expect(evaluateGoals(s).some((option) => option.goal.questId === "watch")).toBe(false);
    finished(s, "forge"); finished(s, "road");
    expect(evaluateGoals(s).some((option) => option.goal.questId === "watch")).toBe(true);
    expect(evaluateGoals(s).some((option) => option.goal.questId === "forge")).toBe(false);
    for (const option of evaluateGoals(s)) expect(goalMet(s, option.goal)).toBe(false);
  });
  it("is bounded, deterministic and does not mutate state or consume seeded randomness", () => {
    const s = createRpg(NOW), before = JSON.stringify(s);
    const result = evaluateGoals(s);
    expect(result).toEqual(evaluateGoals(s)); expect(JSON.stringify(s)).toBe(before);
    expect(result.length).toBeLessThanOrEqual(8);
    for (const [index, option] of result.entries()) {
      expect(Number.isInteger(option.score)).toBe(true); expect(option.score).toBeGreaterThanOrEqual(0); expect(option.score).toBeLessThanOrEqual(1000);
      expect(option.reasons.length).toBeGreaterThanOrEqual(1); expect(option.reasons.length).toBeLessThanOrEqual(4);
      expect(option.reasons.every((reason) => reason.length <= 200)).toBe(true);
      if (index) expect(result[index - 1].score).toBeGreaterThanOrEqual(option.score);
    }
    expect(suggestGoals(s).map((option) => option.id)).toEqual(result.slice(0, 3).map((option) => option.goal.id));
    expect(new Set(suggestGoals(s).map((option) => option.id)).size).toBe(3);
    workshop(s);
    const tied = evaluateGoals(s).filter((option) => ["train-attack-5", "train-defence-5", "train-strength-5"].includes(option.goal.id));
    expect(new Set(tied.map((option) => option.score)).size).toBe(1);
    expect(tied.map((option) => option.goal.id)).toEqual(["train-attack-5", "train-defence-5", "train-strength-5"]);
  });
  it("reads old V5 saves with independent neutral defaults and exposes five preferences", () => {
    const s = createRpg(NOW); delete s.control.profile;
    const before = JSON.stringify(s), profile = getPlannerProfile(s);
    expect(profile).toEqual(DEFAULT_PLANNER_PROFILE); profile.curiosity = 100;
    expect(getPlannerProfile(s).curiosity).toBe(50); expect(JSON.stringify(s)).toBe(before);
    expect(PLANNER_TRAITS).toHaveLength(5); expect(PLANNER_PRESETS).toHaveLength(4);
  });
});

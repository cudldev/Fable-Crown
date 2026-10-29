import { describe, expect, it } from "vitest";
import { applyRpgCommand, createRpg, stepRpg, validateRpgSave } from "../src/rpg/engine";
import { QUESTS } from "../src/rpg/content";
import { levelForXp } from "../src/rpg/skills";
const NOW = Date.UTC(2026, 9, 29, 12);
describe("objective-driven autonomous journey", () => {
  it.each([1, 7, 981])("finishes six real stories and field archery without bank loops for seed %i", (seed) => {
    let s = createRpg(NOW, seed);
    expect(s.control.goal?.kind).toBe("quest"); expect(s.control.goal?.questId).toBe("forge");
    const objectives = new Set<string>();
    for (let i = 0; i < 36000 && !s.quests.watch.complete; i++) {
      stepRpg(s); objectives.add(s.control.goal?.kind ?? "none");
      if (i % 500 === 0) { const loaded = validateRpgSave(JSON.parse(JSON.stringify(s))); expect(loaded, JSON.stringify({ tick: s.tick, control: s.control, player: s.player, drops: s.drops })).not.toBeNull(); s = loaded!; }
    }
    expect(Object.values(s.quests).every((q) => q.complete), `${seed}: ${s.control.reason}; ${JSON.stringify(s.control.goal)}`).toBe(true);
    expect(levelForXp(s.player.skills.ranged)).toBeGreaterThanOrEqual(5);
    expect(objectives.has("skill")).toBe(true); expect(s.control.progress?.failures ?? 0).toBe(0);
    for (const q of Object.values(QUESTS)) expect(s.journal.filter((entry) => entry.startsWith(`Completed: ${q.name}.`))).toHaveLength(1);
  }, 20000);
  it("backs off with a clear blocker while preserving an impossible user ambition", () => {
    const s = createRpg(NOW); s.player.inventory = [];
    const goal = { id: "user-forge", title: "My forge ambition", kind: "quest" as const, questId: "forge" };
    applyRpgCommand(s, { type: "goal", goal });
    for (let i = 0; i < 2500 && !(s.control.progress?.failures); i++) stepRpg(s);
    expect(s.control.goal).toEqual(goal); expect(s.control.reason).toContain("Blocked:");
    expect(s.control.thinkingUntil).toBeGreaterThan(s.tick); expect(s.player.inventory).toEqual([]);
    expect(s.quests.forge.complete).toBe(false); expect(validateRpgSave(s)).not.toBeNull();
  });
});

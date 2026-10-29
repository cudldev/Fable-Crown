import { describe, it, expect } from "vitest";
import { createRpg } from "../src/rpg/engine";
import { rewardFeedback, xpProgress } from "../src/rpg/reward-feedback";
import { XP_THRESHOLDS } from "../src/rpg/skills";
const NOW = Date.UTC(2026, 9, 29);
describe("presentation of committed rewards", () => {
  it("shows actual item/XP/level gains once and ignores transfers", () => {
    const before = createRpg(NOW),
      after = structuredClone(before);
    before.player.skills.mining = XP_THRESHOLDS[1] - 100;
    after.player.skills.mining = before.player.skills.mining + 175;
    after.tick = 10;
    after.rewards = [
      {
        id: "reward-1",
        tick: 10,
        items: [{ itemId: "copper-ore", quantity: 1 }],
        xp: { mining: 175 },
      },
    ];
    const gain = rewardFeedback(before, after, 100);
    expect(gain.floaters.map((f) => f.tone)).toEqual(["item", "xp", "level"]);
    expect(gain.gains).toEqual({ mining: 175 });
    expect(rewardFeedback(after, structuredClone(after), 120).floaters).toEqual(
      [],
    );
    const transfer = structuredClone(after);
    transfer.player.inventory.push({ itemId: "iron-ore", quantity: 10 });
    expect(rewardFeedback(after, transfer, 140).floaters).toEqual([]);
  });
  it("caps bursts and keeps level progress meaningful at both ends of the XP curve", () => {
    const before = createRpg(NOW),
      after = structuredClone(before);
    after.tick = 32;
    after.rewards = Array.from({ length: 32 }, (_, i) => ({
      id: `reward-${i + 1}`,
      tick: i + 1,
      items: [{ itemId: "logs", quantity: 1 }],
      xp: { woodcutting: 250 },
    }));
    expect(rewardFeedback(before, after, 100).floaters).toHaveLength(8);
    expect(xpProgress(0)).toMatchObject({
      level: 1,
      current: 0,
      span: 830,
      remaining: 830,
    });
    expect(xpProgress(XP_THRESHOLDS[98])).toMatchObject({
      level: 99,
      current: 1,
      span: 1,
      remaining: 0,
    });
  });
});

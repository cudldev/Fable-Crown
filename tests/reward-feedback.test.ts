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
  it("shows committed hits at victims once, distinguishes misses and player damage", () => {
    const before = createRpg(NOW), after = structuredClone(before);
    const target = after.enemies[0];
    after.effectSequence = 3;
    after.effects = [
      { id: 1, tick: 1, kind: "hit", actorId: "player", position: before.player.position, targetId: target.id, targetPosition: target.position, amount: 3, success: true },
      { id: 2, tick: 1, kind: "hit", actorId: target.id, position: target.position, targetId: "player", targetPosition: after.player.position, amount: 2, success: true },
      { id: 3, tick: 1, kind: "hit", actorId: "player", position: before.player.position, targetId: target.id, targetPosition: target.position, amount: 0, success: false },
    ];
    const result = rewardFeedback(before, after, 200);
    expect(result.floaters.map(value => [value.text, value.tone])).toEqual([["−3", "damage"], ["−2", "player-damage"], ["Miss", "miss"]]);
    expect(result.floaters[0].position).toEqual(target.position);
    expect(rewardFeedback(after, after, 300).floaters).toEqual([]);
  });
});

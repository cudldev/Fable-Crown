import { describe, expect, it } from "vitest";
import { layoutFeedback, type FeedbackAnchor } from "../src/render/feedback-layout";

describe("world feedback layout", () => {
  it("separates simultaneous damage, XP and items above health/work indicators", () => {
    const anchors: FeedbackAnchor[] = Array.from({ length: 4 }, (_, i) => ({ id: String(i), x: 200, y: 240, width: 140, height: 22 }));
    const result = layoutFeedback(anchors, [{ x: 150, y: 220, width: 100, height: 30 }], 400, 500);
    expect([...result.values()].map(point => point.y)).toEqual([215, 188, 161, 134]);
  });
  it("keeps labels inside narrow viewports and hides excess instead of overlapping", () => {
    const anchors = Array.from({ length: 20 }, (_, i) => ({ id: String(i), x: i % 2 ? -10 : 500, y: 90, width: 170, height: 22 }));
    const result = layoutFeedback(anchors, [], 200, 120);
    expect(result.size).toBe(3);
    for (const point of result.values()) { expect(point.x).toBeGreaterThanOrEqual(93); expect(point.x).toBeLessThanOrEqual(107); expect(point.y).toBeGreaterThanOrEqual(30); }
  });
  it("leaves separate targets independent and is deterministic", () => {
    const anchors = [{ id: "a", x: 80, y: 100, width: 50, height: 20 }, { id: "b", x: 220, y: 100, width: 50, height: 20 }];
    const result = layoutFeedback(anchors, [], 300, 200);
    expect([...result.values()]).toEqual([{ x: 80, y: 100 }, { x: 220, y: 100 }]);
    expect(layoutFeedback(anchors, [], 300, 200)).toEqual(result);
  });
});

import { expect, test } from "vitest";
import { clampGameplayZoom, gameplaySpan, MIN_GAMEPLAY_ZOOM } from "../src/render/camera-limits";

test("gameplay camera bounds invalid/extreme zoom and limits wide-window coverage", () => {
  expect(clampGameplayZoom(.01)).toBe(MIN_GAMEPLAY_ZOOM);
  expect(clampGameplayZoom(10)).toBe(2);
  expect(clampGameplayZoom(NaN)).toBe(.85);
  expect(gameplaySpan(.15, 1)).toBe(32);
  expect(gameplaySpan(.15, 3) * 3).toBe(48);
  expect(gameplaySpan(.85, 1.6)).toBeCloseTo(24 / .85);
});

import { expect, test } from "vitest";
import { moonAmount } from "../src/render/three/sky";
import { fogShaftsEnabled } from "../src/render/three/post-processing";
import { normalizeVisualSettings, transportSettingsKey } from "../src/render/three/visual-settings";

test("moon transitions smoothly at dawn/dusk and atmosphere controls do not rebuild GI", () => {
  const s = normalizeVisualSettings({});
  expect(moonAmount("dusk", { ...s, cycleHour: 0 })).toBe(1);
  expect(moonAmount("dusk", { ...s, cycleHour: 12 })).toBe(0);
  expect(moonAmount("dusk", { ...s, cycleHour: 18 })).toBeCloseTo(.5);
  expect(moonAmount("night", { ...s, dayNightCycle: false })).toBe(1);
  expect(transportSettingsKey(normalizeVisualSettings({ lightRays: 0, fogGradient: 0 }))).toBe(transportSettingsKey(s));
  expect(normalizeVisualSettings({ lightRays: 9, fogGradient: -2 })).toMatchObject({ lightRays: 1, fogGradient: 0 });
});
test("fog shafts require world shadows and fog, independently of sky visibility", () => {
  const s = normalizeVisualSettings({ skyEnabled: false });
  expect(fogShaftsEnabled(s, false, true)).toBe(true);
  expect(fogShaftsEnabled(s, true, true)).toBe(false);
  expect(fogShaftsEnabled(s, false, false)).toBe(false);
  expect(fogShaftsEnabled({ ...s, lightRays: 0 }, false, true)).toBe(false);
  expect(fogShaftsEnabled({ ...s, fogEnabled: false }, false, true)).toBe(false);
});

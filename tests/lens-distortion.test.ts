import { expect, test } from "vitest";
import { lensToScene, lensToScreen } from "../src/render/three/lens-distortion";
import { DEFAULT_VISUAL_PRESET, normalizeVisualSettings, transportSettingsKey, visualPresetJSON } from "../src/render/three/visual-settings";

test("lens picking and projected labels round trip across desktop and phone aspect ratios", () => {
  for (const aspect of [1280 / 800, 390 / 844, 844 / 390]) for (const strength of [0, .15, 1]) {
    for (const x of [-1, -.8, 0, .4, 1]) for (const y of [-1, -.6, 0, .9, 1]) {
      const scene = lensToScene({ x, y, z: .3 }, strength, aspect);
      expect(Math.abs(scene.x)).toBeLessThanOrEqual(1);
      expect(Math.abs(scene.y)).toBeLessThanOrEqual(1);
      const screen = lensToScreen(scene, strength, aspect);
      expect(screen.x).toBeCloseTo(x, 10); expect(screen.y).toBeCloseTo(y, 10);
      expect(screen.z).toBe(.3);
    }
    expect(lensToScene({ x: 0, y: 0 }, strength, aspect)).toEqual({ x: 0, y: 0 });
  }
  expect(lensToScene({ x: .8, y: .4 }, 0, 1)).toEqual({ x: .8, y: .4 });
});

test("distortion stays subtle, bounds unsafe presets and copies without changing transport", () => {
  expect(normalizeVisualSettings({}).lensDistortion).toBe(.15);
  expect(normalizeVisualSettings({ lensDistortion: NaN }).lensDistortion).toBe(.15);
  expect(normalizeVisualSettings({ lensDistortion: -1 }).lensDistortion).toBe(0);
  const visual = normalizeVisualSettings({ lensDistortion: 9 });
  expect(visual.lensDistortion).toBe(1);
  expect(JSON.parse(visualPresetJSON({ ...DEFAULT_VISUAL_PRESET, visual })).visual.lensDistortion).toBe(1);
  expect(transportSettingsKey(visual)).toBe(transportSettingsKey(normalizeVisualSettings({})));
  const point = lensToScene({ x: .7, y: 0 }, .15, 1);
  expect(.7 - point.x).toBeGreaterThan(0);
  expect(.7 - point.x).toBeLessThan(.005);
});

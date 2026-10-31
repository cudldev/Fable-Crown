import { expect, test } from "vitest";
import { Vector3 } from "three";
import { resolveLighting } from "../src/render/three/lighting";
import { cycleVisual, giCycleVisual, normalizeVisualSettings, transportSettingsKey } from "../src/render/three/visual-settings";

test("default cosmetic cycle repeats with saved time and blends across midnight and phase boundaries", () => {
  const settings = normalizeVisualSettings({ dayTime: 0, cycleMinutes: 30 });
  expect(settings.dayNightCycle).toBe(true);
  expect(cycleVisual(settings, 900).cycleHour).toBeCloseTo(12);
  expect(cycleVisual(settings, 1800).cycleHour).toBeCloseTo(0);
  const sample = (h: number) => resolveLighting("dusk", { ...settings, cycleHour: h });
  expect(sample(12).sunPower).toBeGreaterThan(sample(0).sunPower);
  expect(sample(0).lamps).toBeGreaterThan(sample(12).lamps);
  for (const hour of [0, 5, 6, 8, 16, 18, 20, 24]) {
    const a = sample(hour - .00001), b = sample(hour + .00001);
    expect(Math.abs(a.sunPower - b.sunPower)).toBeLessThan(.0001);
    expect(new Vector3(...a.direction).distanceTo(new Vector3(...b.direction))).toBeLessThan(.0001);
  }
  const fixed = normalizeVisualSettings({ dayNightCycle: false });
  expect(cycleVisual(fixed, 999)).toBe(fixed);
  expect(resolveLighting("night", fixed).sunPower).toBe(.5);
});

test("GI cycle samples invalidate half-hour changes while direct lighting stays smooth", () => {
  const s = normalizeVisualSettings({ dayTime: 12 });
  const a = cycleVisual(s, 1), b = cycleVisual(s, 2), c = cycleVisual(s, 40);
  expect(a.cycleHour).not.toBe(b.cycleHour);
  expect(transportSettingsKey(giCycleVisual(a))).toBe(transportSettingsKey(giCycleVisual(b)));
  expect(transportSettingsKey(giCycleVisual(a))).not.toBe(transportSettingsKey(giCycleVisual(c)));
  expect(normalizeVisualSettings({ giBounces: 99 }).giBounces).toBe(1);
  expect(transportSettingsKey(normalizeVisualSettings({ giBounces: 2 }))).not.toBe(transportSettingsKey(s));
});

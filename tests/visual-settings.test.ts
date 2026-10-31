import { expect, test } from "vitest";
import { Scene, Vector3, WebGLRenderTarget } from "three";
import { LightingRig, LIGHTING_PRESETS, resolveLighting } from "../src/render/three/lighting";
import { DEFAULT_VISUAL_PRESET, DEFAULT_VISUAL_SETTINGS, normalizeVisualSettings, sunDirection, transportSettingsKey, visualPresetJSON } from "../src/render/three/visual-settings";

test("defaults reproduce the accepted visual preset and unsafe values stay bounded", () => {
  expect(DEFAULT_VISUAL_SETTINGS.lightRays).toBe(.65);
  expect(DEFAULT_VISUAL_SETTINGS).toMatchObject({ sunAzimuth: 23.3, sunElevation: 62.3, shadowResolution: 2048, shadowSoftness: 3.5, shadowCoverage: 79, shadowBias: -.003, shadowNormalBias: .055, giStrength: 1.3, fogReach: 60, aoStrength: .1, aoDistance: .125 });
  expect(Math.hypot(...sunDirection(DEFAULT_VISUAL_SETTINGS))).toBeCloseTo(1);
  expect(resolveLighting("day").sunPower).toBe(LIGHTING_PRESETS.day.sunPower);
  const bounded = normalizeVisualSettings({ sunStrength: -5, exposure: Infinity, shadowResolution: 8192, sunElevation: 100, sunTint: "unsafe" });
  expect(bounded.sunStrength).toBe(0); expect(bounded.exposure).toBe(DEFAULT_VISUAL_SETTINGS.exposure);
  expect(bounded.shadowResolution).toBe(DEFAULT_VISUAL_SETTINGS.shadowResolution); expect(bounded.sunElevation).toBe(85); expect(bounded.sunTint).toBe(null);
  // Presets copied before screen pixelation was removed must also use normal rendering.
  expect(normalizeVisualSettings(JSON.parse('{"renderStyle":"pixelated","exposure":1.4}'))).toMatchObject({ renderStyle: "smooth", exposure: 1.4 });
});

test("shadow reconfiguration releases its old target, adjusts coverage and keeps light count bounded", () => {
  const scene = new Scene(), rig = new LightingRig(scene), target = new WebGLRenderTarget(512, 512); let disposed = false;
  rig.setVisual(normalizeVisualSettings({ shadowResolution: 512 })); rig.setPreset("day");
  target.addEventListener("dispose", () => { disposed = true; }); rig.sun.shadow.map = target;
  const settings = normalizeVisualSettings({ shadowResolution: 2048, shadowCoverage: 64, sunStrength: 2, ambientStrength: 0, lampStrength: 0, sunAzimuth: 0, sunElevation: 45, fogEnabled: false });
  rig.setVisual(settings); rig.setPreset("day"); rig.update([], new Vector3(), 0, false);
  expect(disposed).toBe(true); expect(rig.sun.shadow.map).toBe(null); expect(rig.sun.shadow.mapSize.x).toBe(2048);
  expect(rig.sun.shadow.camera.right).toBe(32); expect(rig.sun.intensity).toBeCloseTo(4.2); expect(rig.fill.intensity).toBe(0);
  expect(scene.fog).toBe(null); expect(rig.slots).toHaveLength(4);
  const direction = rig.sun.position.clone().sub(rig.sun.target.position).normalize();
  expect(direction.distanceTo(new Vector3(...sunDirection(settings)))).toBeLessThan(1e-10); rig.dispose();
});

test("display and strength changes do not rebake transport, while source light changes do", () => {
  const base = transportSettingsKey(DEFAULT_VISUAL_SETTINGS);
  expect(transportSettingsKey(normalizeVisualSettings({ renderStyle: "smooth", exposure: 2, giStrength: .3, aoStrength: .4, fogEnabled: false, shadowResolution: 2048 }))).toBe(base);
  expect(transportSettingsKey(normalizeVisualSettings({ sunStrength: 2 }))).not.toBe(base);
  expect(transportSettingsKey(normalizeVisualSettings({ ambientTint: "#c0d0e0" }))).not.toBe(base);
});

test("copied JSON preserves the actual visual configuration and can reproduce its lighting", () => {
  const settings = normalizeVisualSettings({ renderStyle: "smooth", exposure: 1.4, sunStrength: .7, sunAzimuth: 75, sunTint: "#d0a060", giStrength: 1.5, shadowResolution: 2048 });
  const controls = { ...DEFAULT_VISUAL_PRESET, lighting: "night" as const, shadows: false, cameraMode: "orthographic" as const, visual: settings };
  const result = JSON.parse(visualPresetJSON(controls));
  expect(result.type).toBe("fable-crown.visual-settings"); expect(result.version).toBe(1);
  expect(result.shadows).toBe(false); expect(result.cameraMode).toBe("orthographic"); expect(result.visual).toEqual(settings);
  expect(resolveLighting(result.lighting, normalizeVisualSettings(result.visual))).toEqual(resolveLighting("night", settings));
  expect(Object.keys(result)).not.toContain("player");
});

test("water controls normalize old presets, bound quality and stay outside GI transport", () => {
  expect(normalizeVisualSettings({})).toMatchObject({ waterReflections: true, waterReflectionRate: 0 });
  expect(normalizeVisualSettings({ waterReflectionRate: 999 }).waterReflectionRate).toBe(0);
  expect(normalizeVisualSettings({ waterReflectionRate: 30 }).waterReflectionRate).toBe(30);
  const settings = normalizeVisualSettings({ waterReflections: false, waterReflectionStrength: 9, waterRippleStrength: -1, waterReflectionResolution: 9999 });
  expect(settings).toMatchObject({ waterReflections: false, waterReflectionStrength: 1, waterRippleStrength: 0, waterReflectionResolution: 0 });
  expect(normalizeVisualSettings({ waterReflectionResolution: 2048 }).waterReflectionResolution).toBe(2048);
  expect(normalizeVisualSettings({ waterReflectionResolution: 4096 }).waterReflectionResolution).toBe(4096);
  expect(normalizeVisualSettings({ waterReflectionResolution: 256 }).waterReflectionResolution).toBe(256);
  expect(transportSettingsKey(settings)).toBe(transportSettingsKey(DEFAULT_VISUAL_SETTINGS));
  const copied = JSON.parse(visualPresetJSON({ ...DEFAULT_VISUAL_PRESET, visual: settings }));
  expect(copied.visual.waterReflections).toBe(false);
  expect(copied.visual.waterReflectionStrength).toBe(1);
});

test("sky and cloud controls remain local presentation settings and copy with the preset", () => {
  expect(normalizeVisualSettings({})).toMatchObject({ skyEnabled: true, cloudCoverage: .55, cloudSpeed: 1, cloudScale: 1 });
  const visual = normalizeVisualSettings({ skyEnabled: false, cloudCoverage: 2, cloudSpeed: -1, cloudScale: 9 });
  expect(visual).toMatchObject({ skyEnabled: false, cloudCoverage: 1, cloudSpeed: 0, cloudScale: 2 });
  expect(transportSettingsKey(visual)).toBe(transportSettingsKey(DEFAULT_VISUAL_SETTINGS));
  expect(JSON.parse(visualPresetJSON({ ...DEFAULT_VISUAL_PRESET, visual })).visual).toMatchObject({ skyEnabled: false, cloudCoverage: 1, cloudSpeed: 0, cloudScale: 2 });
});

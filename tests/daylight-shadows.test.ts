import { expect, test } from "vitest";
import { Scene, Vector3 } from "three";
import { LightingRig } from "../src/render/three/lighting";
import { cycleVisual, normalizeVisualSettings } from "../src/render/three/visual-settings";

test("cycling sun keeps a stationary shadow anchor still and moving targets continuous", () => {
  const rig = new LightingRig(new Scene()), target = new Vector3(60, 0, 106);
  const settings = normalizeVisualSettings({ dayTime: 16 });
  for (let frame = 0; frame < 600; frame++) {
    rig.setVisual(cycleVisual(settings, frame / 60)); rig.setPreset("dusk");
    rig.update([], target, frame * 1000 / 60, false);
    expect(rig.sun.target.position.distanceTo(target)).toBeLessThan(1e-12);
    expect(rig.sun.position.distanceTo(target)).toBeCloseTo(Math.hypot(28, 34, 16), 10);
    target.x += .0001;
  }
  rig.dispose();
});

test("fixed sun retains shadow texel snapping", () => {
  const rig = new LightingRig(new Scene()), settings = normalizeVisualSettings({ dayNightCycle: false });
  rig.setVisual(settings); rig.setPreset("day");
  const target = new Vector3(60, 0, 106); rig.update([], target, 0, false);
  const offset = rig.sun.position.clone().sub(rig.sun.target.position);
  const right = new Vector3(offset.z, 0, -offset.x).normalize(), up = offset.clone().normalize().cross(right).normalize();
  const texel = settings.shadowCoverage / settings.shadowResolution;
  for (const axis of [right, up]) {
    const coordinate = rig.sun.target.position.dot(axis) / texel;
    expect(coordinate).toBeCloseTo(Math.round(coordinate), 9);
  }
  rig.dispose();
});

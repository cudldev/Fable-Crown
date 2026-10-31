import { expect, test } from "vitest";
import { Box3, BoxGeometry, Matrix4, Mesh, MeshBasicMaterial, PerspectiveCamera, Ray, Scene, Vector3 } from "three";
import { cameraPitch, closeCameraBlend, WorldCurve } from "../src/render/three/world-curve";
import { DEFAULT_VISUAL_PRESET, DEFAULT_VISUAL_SETTINGS, normalizeVisualSettings, transportSettingsKey, visualPresetJSON } from "../src/render/three/visual-settings";
import { WATER_HEIGHT, waterReflectionCamera } from "../src/render/three/water";

test("close zoom smoothly lowers pitch by five degrees and keeps the focus point fixed", () => {
  expect(closeCameraBlend(.375)).toBe(0); expect(closeCameraBlend(2)).toBe(1);
  expect(cameraPitch(.375) - cameraPitch(2)).toBeCloseTo(5 * Math.PI / 180);
  const curve = new WorldCurve(), center = new Vector3(100, 0, 80);
  curve.update(center, 2, 1, true);
  expect(curve.bend(center.clone()).equals(center)).toBe(true);
  expect(curve.bend(center.clone().add(new Vector3(10, 0, 10))).y).toBeLessThan(-.5);
  curve.update(center, 2, 1, false); expect(curve.strength).toBe(0);
  expect(curve.bend(center.clone().addScalar(10)).y).toBe(10);
});

test("curved-ground picking reverses the rendered projection across camera positions and zooms", () => {
  const curve = new WorldCurve();
  for (const center of [new Vector3(), new Vector3(150, 0, 120)]) for (const zoom of [.375, .85, 2]) {
    const camera = new PerspectiveCamera(20, 1.6, .1, 650), pitch = cameraPitch(zoom);
    camera.position.copy(center).add(new Vector3(32, Math.hypot(32, 45) * Math.tan(pitch), 45).normalize().multiplyScalar(35 / zoom));
    camera.lookAt(center); camera.updateMatrixWorld();
    curve.update(center, zoom, 1, true);
    for (const [x, z] of [[0, 0], [3, -5], [-4, 5], [10, 12]]) {
      const logical = center.clone().add(new Vector3(x, 0, z)), bent = curve.bend(logical.clone());
      const ray = new Ray(camera.position.clone(), bent.clone().sub(camera.position).normalize());
      expect(curve.ground(ray)!.distanceTo(logical)).toBeLessThan(1e-8);
    }
  }
  curve.update(new Vector3(), 2, 1, true);
  expect(curve.ground(new Ray(new Vector3(0, 10, 0), new Vector3(0, 1, 0)))).toBeNull();
});

test("lens defaults migrate old presets and never change GI transport", () => {
  expect(normalizeVisualSettings({})).toMatchObject({ bloom: .12, chromaticAberration: .18, depthOfField: .25, worldCurvature: 2 });
  const visual = normalizeVisualSettings({ bloom: -1, chromaticAberration: 99, depthOfField: NaN, worldCurvature: 99 });
  expect(visual).toMatchObject({ bloom: 0, chromaticAberration: 1, depthOfField: .25, worldCurvature: 2 });
  expect(transportSettingsKey(visual)).toBe(transportSettingsKey(DEFAULT_VISUAL_SETTINGS));
  expect(JSON.parse(visualPresetJSON({ ...DEFAULT_VISUAL_PRESET, visual })).visual).toEqual(visual);
});

test("curved bounds enclose lowered vertices without changing shared geometry or retaining removed meshes", () => {
  const curve = new WorldCurve(), scene = new Scene(), geometry = new BoxGeometry(2, 2, 2), material = new MeshBasicMaterial();
  const mesh = new Mesh(geometry, material); mesh.position.set(10, 1, 10); scene.add(mesh);
  curve.update(new Vector3(), 2, 1, true); geometry.computeBoundingSphere();
  const radius = geometry.boundingSphere!.radius;
  curve.prepareCulling(scene);
  const bounded = mesh as Mesh & { boundingSphere?: { radius: number } };
  expect(bounded.boundingSphere!.radius).toBeGreaterThan(radius);
  expect(geometry.boundingSphere!.radius).toBe(radius);
  const source = new Box3(new Vector3(5, 0, 6), new Vector3(8, 3, 9)), expanded = curve.expandBounds(source, new Box3());
  expect(source.min.y).toBe(0); expect(expanded.min.y).toBeLessThan(0); expect(expanded.max.y).toBe(3);
  for (const x of [5, 8]) for (const z of [6, 9]) expect(expanded.containsPoint(curve.bend(new Vector3(x, 0, z)))).toBe(true);
  scene.remove(mesh); curve.prepareCulling(scene); expect(bounded.boundingSphere).toBeUndefined();
  curve.dispose(); geometry.dispose(); material.dispose();
});

test("inverse-bent water UVs track curved screen coordinates instead of drifting off-center", () => {
  const curve = new WorldCurve(), camera = new PerspectiveCamera(20, 1.6, .1, 650);
  camera.position.set(20, 18, 30); camera.lookAt(0, .4, 0); camera.updateMatrixWorld();
  curve.update(new Vector3(), 2, 1, true);
  const reflected = camera.clone(), textureMatrix = new Matrix4(); waterReflectionCamera(camera, reflected, textureMatrix);
  const water = new Vector3(5, WATER_HEIGHT, 6), bent = curve.bend(water.clone()), screen = bent.clone().project(camera);
  const inverseBent = water.clone().multiplyScalar(2).sub(bent).applyMatrix4(textureMatrix), raw = water.clone().applyMatrix4(textureMatrix);
  // Mirrored view reverses horizontal handedness, as in the original planar capture.
  expect(inverseBent.x).toBeCloseTo((1 - screen.x) / 2, 10);
  expect(inverseBent.y).toBeCloseTo((1 + screen.y) / 2, 10);
  expect(Math.abs(raw.y - inverseBent.y)).toBeGreaterThan(.001);
});

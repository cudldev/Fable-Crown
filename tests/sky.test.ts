import { expect, test, vi } from "vitest";
import { Color, OrthographicCamera, PerspectiveCamera, Scene, type WebGLRenderer } from "three";
import { cloudNoise, cloudNoiseValue, SkySystem } from "../src/render/three/sky";
import { DEFAULT_VISUAL_SETTINGS } from "../src/render/three/visual-settings";

test("cloud pigment is deterministic, periodic and varied without external artwork", () => {
  const first = cloudNoise(), second = cloudNoise(); expect(first).toEqual(second); expect(first).toHaveLength(128 * 128);
  expect(new Set(first).size).toBeGreaterThan(100);
  for (const [x, y] of [[0, 0], [33.4, 17.7], [-10.2, 84.8], [127.9, 128.1]]) {
    expect(cloudNoiseValue(x + 128, y)).toBeCloseTo(cloudNoiseValue(x, y), 10);
    expect(cloudNoiseValue(x, y + 128)).toBeCloseTo(cloudNoiseValue(x, y), 10);
  }
  expect(() => cloudNoise(3)).toThrow("Invalid cloud texture size");
});

test.each(["perspective", "orthographic"])("%s sky rays preserve reflected camera orientation and ignore its oblique clip row", kind => {
  const scene = new Scene(), sky = new SkySystem(scene);
  const camera = kind === "perspective" ? new PerspectiveCamera(50, 1.6, .1, 650) : new OrthographicCamera(-12, 12, 8, -8, .1, 650);
  camera.position.set(4, -20, 7); camera.lookAt(0, 5, 0); camera.updateMatrixWorld();
  const material = sky.mesh.material, uniforms = material.uniforms;
  const prepare = () => sky.mesh.onBeforeRender({} as WebGLRenderer, scene, camera, sky.mesh.geometry, material, null as never);
  prepare(); const projection = uniforms.skyProjection.value.clone();
  for (const index of [2, 6, 10, 14]) camera.projectionMatrix.elements[index] += .4 + index;
  prepare();
  expect(uniforms.skyProjection.value.equals(projection)).toBe(true);
  expect(uniforms.skyCameraWorld.value.equals(camera.matrixWorld)).toBe(true);
  expect(uniforms.skyOrthographic.value).toBe(kind === "orthographic" ? 1 : 0);
  expect(material.depthWrite).toBe(false); expect(material.depthTest).toBe(true); expect(material.fog).toBe(false);
  expect(sky.mesh.frustumCulled).toBe(false); expect(sky.mesh.renderOrder).toBeGreaterThan(0);
  sky.dispose();
});

test("cloud phase advances with a still camera, freezes without snapping, and follows sky controls", () => {
  const scene = new Scene(), sky = new SkySystem(scene), settings = { ...DEFAULT_VISUAL_SETTINGS, skyEnabled: true, cloudSpeed: 1, cloudCoverage: .55, cloudScale: 1 };
  sky.update(100, "dusk", settings); sky.update(600, "dusk", settings); expect(sky.stats.cloudTime).toBe(.5);
  sky.update(1100, "dusk", { ...settings, cloudSpeed: 0 }); expect(sky.stats.cloudTime).toBe(.5);
  sky.update(1600, "dusk", settings, true); expect(sky.stats.cloudTime).toBe(.5);
  sky.update(2100, "day", { ...settings, cloudCoverage: 0, cloudScale: 2, sunStrength: 0 }); expect(sky.stats.cloudTime).toBe(1);
  expect(sky.mesh.material.uniforms.cloudCoverage.value).toBe(0); expect(sky.mesh.material.uniforms.cloudScale.value).toBe(2);
  expect(sky.mesh.material.uniforms.sunPower.value).toBe(0);
  sky.update(2200, "night", { ...settings, skyEnabled: false, skyTint: "#667799" }); expect(sky.mesh.visible).toBe(false);
  expect(sky.mesh.material.uniforms.skyHorizon.value).toEqual(new Color("#667799")); sky.dispose();
});

test("sky leaves the lighting background intact and frees all owned resources", () => {
  const scene = new Scene(), background = new Color(0x8f9aa4); scene.background = background;
  const sky = new SkySystem(scene), geometry = vi.fn(), material = vi.fn(), texture = vi.fn();
  sky.mesh.geometry.addEventListener("dispose", geometry); sky.mesh.material.addEventListener("dispose", material);
  sky.mesh.material.uniforms.cloudNoise.value.addEventListener("dispose", texture);
  expect(scene.background).toBe(background); expect(scene.children).toContain(sky.mesh);
  sky.dispose(); expect(scene.children).not.toContain(sky.mesh); expect(scene.background).toBe(background);
  expect(geometry).toHaveBeenCalledOnce(); expect(material).toHaveBeenCalledOnce(); expect(texture).toHaveBeenCalledOnce();
});

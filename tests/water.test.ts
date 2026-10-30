import { expect, test, vi } from "vitest";
import { BoxGeometry, DataTexture, Group, Matrix4, Mesh, OrthographicCamera, PerspectiveCamera, Scene, Vector2, Vector4, WebGLRenderTarget,
  type WebGLProgramParametersWithUniforms, type WebGLRenderer } from "three";
import { WATER_HEIGHT, WaterSystem, waterReflectionCamera, waterShoreDepth } from "../src/render/three/water";
import type { Terrain } from "../src/rpg/types";
import { DEFAULT_VISUAL_SETTINGS } from "../src/render/three/visual-settings";

const settings = { ...DEFAULT_VISUAL_SETTINGS, waterReflections: true, waterReflectionStrength: .65, waterRippleStrength: .35, waterReflectionResolution: 512 };

function fixture() {
  const system = new WaterSystem(), scene = new Scene(), camera = new PerspectiveCamera(50, 2, .1, 120);
  camera.position.set(0, 8, 10); camera.lookAt(0, WATER_HEIGHT, 0); camera.updateMatrixWorld();
  const water = new Mesh(new BoxGeometry(4, .01, 4), system.material); water.position.y = WATER_HEIGHT;
  const hidden = new Group(), alreadyHidden = new Group(); alreadyHidden.visible = false;
  scene.add(water, hidden, alreadyHidden); scene.updateMatrixWorld(true);
  const initialTarget = new WebGLRenderTarget(8, 8), viewport = new Vector4(2, 3, 100, 200), scissor = new Vector4(4, 5, 80, 90);
  let target: WebGLRenderTarget | null = initialTarget, scissorTest = true;
  const renderer = {
    extensions: { has: () => true }, capabilities: { maxTextureSize: 8192 }, xr: { enabled: true }, shadowMap: { autoUpdate: true, needsUpdate: true },
    getDrawingBufferSize: (output: Vector2) => output.set(3840, 1941),
    getRenderTarget: () => target, getActiveCubeFace: () => 2, getActiveMipmapLevel: () => 1,
    setRenderTarget: vi.fn((next: WebGLRenderTarget | null) => { target = next; }),
    getViewport: (output: Vector4) => output.copy(viewport), setViewport: vi.fn((value: Vector4) => { viewport.copy(value); }),
    getScissor: (output: Vector4) => output.copy(scissor), setScissor: vi.fn((value: Vector4) => { scissor.copy(value); }),
    getScissorTest: () => scissorTest, setScissorTest: (value: boolean) => { scissorTest = value; },
    clear: vi.fn(), render: vi.fn(),
  };
  const update = (time = 0, visual = settings, overview = false) => system.update(renderer as unknown as WebGLRenderer, scene, camera, [water], [hidden, alreadyHidden], time, "dusk", visual, overview);
  return { system, scene, camera, water, hidden, alreadyHidden, renderer, initialTarget, viewport, scissor, update };
}

test.each(["perspective", "orthographic"])("%s reflection mirrors the view and clips below-water geometry", type => {
  const camera = type === "perspective" ? new PerspectiveCamera(50, 1.6, .1, 120) : new OrthographicCamera(-10, 10, 7, -7, .1, 120);
  camera.position.set(3, 8, 10); camera.lookAt(1, 0, 2); camera.updateMatrixWorld();
  const original = camera.matrixWorld.clone(), reflected = camera.clone(), texture = new Matrix4();
  waterReflectionCamera(camera, reflected, texture);
  expect(reflected.position.x).toBe(3); expect(reflected.position.z).toBe(10);
  expect(reflected.position.y).toBeCloseTo(2 * WATER_HEIGHT - 8);
  expect(camera.matrixWorld.equals(original)).toBe(true);
  for (const y of [WATER_HEIGHT + .4, WATER_HEIGHT - .4]) {
    const clip = new Vector4(1, y, 2, 1).applyMatrix4(reflected.matrixWorldInverse).applyMatrix4(reflected.projectionMatrix);
    expect(Math.sign(clip.z + clip.w)).toBe(y > WATER_HEIGHT ? 1 : -1);
  }
  const identity = reflected.projectionMatrix.clone().multiply(reflected.projectionMatrixInverse).elements;
  new Matrix4().elements.forEach((value, i) => expect(identity[i]).toBeCloseTo(value));
});

test("one bounded capture is shared; static/moving cadence never updates projection without its image", () => {
  const f = fixture();
  const shader = { uniforms: {}, vertexShader: "#include <project_vertex>", fragmentShader: "#include <normal_fragment_maps>\n#include <opaque_fragment>" } as WebGLProgramParametersWithUniforms;
  f.system.material.onBeforeCompile(shader, f.renderer as unknown as WebGLRenderer);
  f.update(0, { ...settings, waterReflectionRate: 4 });
  expect(f.system.stats).toMatchObject({ reflectionPasses: 1, reflectionWidth: 512, reflectionHeight: 259, state: "ready" });
  const matrix = (shader.uniforms.fableWaterMatrix.value as Matrix4).clone();
  f.update(100, { ...settings, waterReflectionRate: 4 }); expect(f.renderer.render).toHaveBeenCalledTimes(1);
  f.update(250, { ...settings, waterReflectionRate: 4 }); expect(f.renderer.render).toHaveBeenCalledTimes(2);
  f.camera.position.x += .4;
  f.update(260, { ...settings, waterReflectionRate: 4 }); expect(f.renderer.render).toHaveBeenCalledTimes(2);
  expect((shader.uniforms.fableWaterMatrix.value as Matrix4).equals(matrix)).toBe(true);
  f.update(500, { ...settings, waterReflectionRate: 4 }); expect(f.renderer.render).toHaveBeenCalledTimes(3);
  expect((shader.uniforms.fableWaterMatrix.value as Matrix4).equals(matrix)).toBe(false);
  f.system.dispose(); f.water.geometry.dispose(); f.initialTarget.dispose();
});

test("realtime defaults recapture scene motion every frame even with an unchanged camera", () => {
  const f = fixture();
  expect(settings.waterReflectionRate).toBe(0);
  f.update(0); f.hidden.position.x = 1; f.update(8.33); f.update(16.67);
  expect(f.renderer.render).toHaveBeenCalledTimes(3);
  expect(f.system.stats.reflectionPasses).toBe(3);
  f.system.dispose(); f.water.geometry.dispose(); f.initialTarget.dispose();
});

test("full reflection resolution follows the high-DPI render buffer and hardware limits preserve aspect", () => {
  const f = fixture(), visual = { ...settings, waterReflectionResolution: DEFAULT_VISUAL_SETTINGS.waterReflectionResolution };
  expect(visual.waterReflectionResolution).toBe(0);
  f.update(0, visual);
  expect(f.system.stats).toMatchObject({ reflectionWidth: 3840, reflectionHeight: 1941 });
  f.renderer.capabilities.maxTextureSize = 2048; f.update(10, visual);
  expect(f.system.stats).toMatchObject({ reflectionWidth: 2048, reflectionHeight: 1035 });
  f.update(20, { ...visual, waterReflectionResolution: 1024 });
  expect(f.system.stats).toMatchObject({ reflectionWidth: 1024, reflectionHeight: 518 });
  f.system.dispose(); f.water.geometry.dispose(); f.initialTarget.dispose();
});

test("capture hides water/overlays, reuses shadows, and restores every renderer and visibility state", () => {
  const f = fixture();
  f.renderer.render.mockImplementation(() => {
    expect(f.water.visible).toBe(false); expect(f.hidden.visible).toBe(false); expect(f.alreadyHidden.visible).toBe(false);
    expect(f.renderer.shadowMap).toEqual({ autoUpdate: false, needsUpdate: false }); expect(f.renderer.xr.enabled).toBe(false);
    expect(f.renderer.getScissorTest()).toBe(false);
  });
  f.update();
  expect(f.water.visible).toBe(true); expect(f.hidden.visible).toBe(true); expect(f.alreadyHidden.visible).toBe(false);
  expect(f.renderer.getRenderTarget()).toBe(f.initialTarget); expect(f.renderer.setRenderTarget).toHaveBeenLastCalledWith(f.initialTarget, 2, 1);
  expect(f.viewport.toArray()).toEqual([2, 3, 100, 200]); expect(f.scissor.toArray()).toEqual([4, 5, 80, 90]);
  expect(f.renderer.getScissorTest()).toBe(true); expect(f.renderer.xr.enabled).toBe(true);
  expect(f.renderer.shadowMap).toEqual({ autoUpdate: true, needsUpdate: true });
  f.system.dispose(); f.water.geometry.dispose(); f.initialTarget.dispose();
});

test("offscreen/overview/disabled water renders no reflection and a failed capture cannot retry each frame", () => {
  const f = fixture();
  const shader = { uniforms: {}, vertexShader: "#include <project_vertex>", fragmentShader: "#include <normal_fragment_maps>\n#include <opaque_fragment>" } as WebGLProgramParametersWithUniforms;
  f.system.material.onBeforeCompile(shader, f.renderer as unknown as WebGLRenderer);
  f.update(0, settings, true); f.update(100, { ...settings, waterReflections: false });
  expect(shader.uniforms.fableWaterReflectionStrength.value).toBe(0);
  f.water.visible = false; f.update(200); expect(f.renderer.render).not.toHaveBeenCalled();
  f.water.visible = true;
  const warning = vi.spyOn(console, "warn").mockImplementation(() => {});
  f.renderer.render.mockImplementation(() => { throw Error("unsupported target"); });
  f.update(300); f.update(320); f.update(600);
  expect(f.system.stats.state).toBe("error"); expect(f.renderer.render).toHaveBeenCalledTimes(1);
  expect(f.water.visible).toBe(true); expect(f.hidden.visible).toBe(true); expect(f.renderer.getRenderTarget()).toBe(f.initialTarget);
  expect(f.renderer.shadowMap).toEqual({ autoUpdate: true, needsUpdate: true });
  warning.mockRestore(); f.system.dispose(); f.water.geometry.dispose(); f.initialTarget.dispose();
});

test("sun direction and fog changes refresh an otherwise stationary capture immediately", () => {
  const f = fixture();
  f.update(0); f.update(10, { ...settings, sunAzimuth: settings.sunAzimuth + 30 });
  expect(f.renderer.render).toHaveBeenCalledTimes(2);
  f.update(20, { ...settings, sunAzimuth: settings.sunAzimuth + 30, fogEnabled: !settings.fogEnabled });
  expect(f.renderer.render).toHaveBeenCalledTimes(3);
  f.system.dispose(); f.water.geometry.dispose(); f.initialTarget.dispose();
});

test("shore colour distance follows four-neighbour water, saturates at three tiles, and ignores world edges", () => {
  const terrain: Terrain[] = Array(7 * 7).fill("water"); terrain[3 * 7 + 3] = "sand";
  const original = [...terrain], depth = waterShoreDepth({ width: 7, height: 7, terrain });
  expect(depth[3 * 7 + 3]).toBe(0); expect(depth[3 * 7 + 4]).toBe(85);
  expect(depth[4 * 7 + 4]).toBe(170); expect(depth[0]).toBe(255); expect(depth[3 * 7 + 6]).toBe(255);
  expect(terrain).toEqual(original);
  expect([...waterShoreDepth({ width: 2, height: 2, terrain: ["water", "water", "water", "water"] })]).toEqual([255, 255, 255, 255]);
});

test("shore textures are cached per terrain identity and released on replacement and disposal", () => {
  const system = new WaterSystem();
  const shader = { uniforms: {}, vertexShader: "#include <project_vertex>", fragmentShader: "#include <color_fragment>" } as WebGLProgramParametersWithUniforms;
  system.material.onBeforeCompile(shader, {} as WebGLRenderer);
  const fallback = shader.uniforms.fableWaterDepth.value as DataTexture, fallbackDisposed = vi.fn(); fallback.addEventListener("dispose", fallbackDisposed);
  const world = { width: 4, height: 1, terrain: ["sand", "water", "water", "water"] as Terrain[] };
  system.setWorld(world);
  const texture = shader.uniforms.fableWaterDepth.value as DataTexture, disposed = vi.fn(); texture.addEventListener("dispose", disposed);
  expect(fallbackDisposed).toHaveBeenCalledOnce(); expect([...texture.image.data as Uint8Array]).toEqual([0, 85, 170, 255]);
  expect(shader.uniforms.fableWaterWorldSize.value.toArray()).toEqual([4, 1]);
  system.setWorld(world); expect(shader.uniforms.fableWaterDepth.value).toBe(texture); expect(disposed).not.toHaveBeenCalled();
  expect(() => system.setWorld({ ...world, width: 3 })).toThrow("Invalid water terrain dimensions");
  expect(disposed).not.toHaveBeenCalled();
  system.setWorld({ ...world, terrain: [...world.terrain] }); expect(disposed).toHaveBeenCalledOnce();
  const final = shader.uniforms.fableWaterDepth.value as DataTexture, finalDisposed = vi.fn(); final.addEventListener("dispose", finalDisposed);
  system.dispose(); expect(finalDisposed).toHaveBeenCalledOnce();
});

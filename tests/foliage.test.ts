import { expect, test, vi } from "vitest";
import { Scene, Vector3 } from "three";
import { buildFoliageLayout, foliageGeometry, foliagePlants, FoliageSystem, FOLIAGE_KINDS, FOLIAGE_PITCH } from "../src/render/three/foliage";
import { DEFAULT_VISUAL_SETTINGS, normalizeVisualSettings, transportSettingsKey, visualPresetJSON, DEFAULT_VISUAL_PRESET } from "../src/render/three/visual-settings";
import type { WorldDefinition } from "../src/rpg/types";

function world(): WorldDefinition {
  return { id: "foliage-test", name: "Test", width: 32, height: 32, chunkSize: 16, terrain: Array(1024).fill("grass"), collision: Array(1024).fill(0), objects: [], spawns: [], portals: [] };
}
test("habitats exclude paths, paving, water, collision and service footprints without mutating the world", () => {
  const w = world();
  w.terrain[10 * 32 + 10] = "dirt"; w.terrain[12 * 32 + 10] = "stone"; w.terrain[20 * 32 + 10] = "water";
  w.terrain[20 * 32 + 11] = "sand"; w.terrain[25 * 32 + 25] = "sand"; w.collision[15 * 32 + 15] = 1;
  w.objects.push({ id: "bank", kind: "bank", name: "Bank", width: 4, height: 3, position: { x: 3, y: 3, worldId: w.id, plane: 0 }, blocks: true });
  const before = JSON.stringify(w), layout = buildFoliageLayout(w), at = (x: number, z: number) => layout.habitat[z * 32 + x];
  for (const [x, z] of [[10, 10], [10, 9], [10, 12], [10, 20], [25, 25], [15, 15], [2, 2], [7, 6]]) expect(at(x, z)).toBe(0);
  expect(at(11, 20)).toBe(3); expect(at(29, 29)).toBe(1); expect(JSON.stringify(w)).toBe(before);
});
test("trees seed woodland around a clear trunk and presentation cleanup can supply grass without changing logical dirt", () => {
  const w = world(); w.objects.push({ id: "tree", name: "Oak", kind: "tree", width: 1, height: 1, blocks: true, position: { x: 16, y: 16, worldId: w.id, plane: 0 } });
  w.terrain[2 * 32 + 2] = "dirt"; const presentation = w.terrain.slice(); presentation[2 * 32 + 2] = "grass";
  const layout = buildFoliageLayout(w, presentation);
  expect(layout.habitat[16 * 32 + 16]).toBe(0); expect(layout.habitat[16 * 32 + 18]).toBe(2);
  expect(layout.habitat[2 * 32 + 2]).toBe(1); expect(w.terrain[2 * 32 + 2]).toBe("dirt");
});
test("overlapping foliage windows preserve exact plants and never consume shared random state", () => {
  const spy = vi.spyOn(Math, "random").mockImplementation(() => { throw Error("game RNG"); });
  try {
    const layout = buildFoliageLayout(world()), all = foliagePlants(layout, 0, 0, 31, 31), left = foliagePlants(layout, 0, 0, 12, 31);
    expect(left).toEqual(all.filter(p => Math.round(p.x) <= 12)); expect(left.length).toBeGreaterThan(20);
    expect(foliagePlants(layout, 0, 0, 31, 31)).toEqual(all);
    expect(new Set(all.map(p => p.kind))).toEqual(new Set(["grass", "flower"]));
  } finally { spy.mockRestore(); }
});
test("every plant stays on native voxel centres and only uses axis-aligned quarter turns", () => {
  const plants = foliagePlants(buildFoliageLayout(world()), 0, 0, 31, 31);
  for (const plant of plants) {
    expect(plant.x / FOLIAGE_PITCH - .5).toBeCloseTo(Math.round(plant.x / FOLIAGE_PITCH - .5), 10);
    expect(plant.z / FOLIAGE_PITCH - .5).toBeCloseTo(Math.round(plant.z / FOLIAGE_PITCH - .5), 10);
    expect(plant.angle / (Math.PI / 2)).toBe(Math.round(plant.angle / (Math.PI / 2)));
  }
});
test.each(FOLIAGE_KINDS)("%s clumps sit on the shared voxel grid with flat ground contact", kind => {
  const geometry = foliageGeometry(kind), positions = geometry.getAttribute("position"), normals = geometry.getAttribute("normal");
  expect(geometry.boundingBox!.min.y).toBeCloseTo(0); expect(geometry.boundingBox!.max.y).toBeLessThan(1);
  for (let i = 0; i < positions.count; i++) {
    expect(positions.getY(i) / FOLIAGE_PITCH).toBeCloseTo(Math.round(positions.getY(i) / FOLIAGE_PITCH), 5);
    expect(Math.abs(normals.getX(i)) + Math.abs(normals.getY(i)) + Math.abs(normals.getZ(i))).toBe(1);
  }
  expect(positions.count).toBeLessThan(36 * 50); geometry.dispose();
});
test("wind freezes, density thins stable plants, uploads stay cached, and disabled/overview vegetation draws nothing", () => {
  const scene = new Scene(), system = new FoliageSystem(scene), target = new Vector3(16, 0, 16);
  system.setWorld(world()); system.update(0, target, DEFAULT_VISUAL_SETTINGS, false); system.update(100, target, DEFAULT_VISUAL_SETTINGS, false);
  expect(system.stats.windTime).toBe(.1); const count = system.stats.visiblePlants, uploads = system.stats.uploads;
  system.update(700, target, { ...DEFAULT_VISUAL_SETTINGS, windStrength: 0, foliageDensity: .2 }, false);
  expect(system.stats.windTime).toBe(.1); expect(system.stats.visiblePlants).toBeLessThan(count); expect(system.stats.uploads).toBe(uploads + 1);
  system.update(750, target, { ...DEFAULT_VISUAL_SETTINGS, windStrength: 0, foliageDensity: .2 }, false); expect(system.stats.uploads).toBe(uploads + 1);
  system.update(800, target, DEFAULT_VISUAL_SETTINGS, false, true); expect(system.stats.windTime).toBe(.1);
  system.update(900, target, DEFAULT_VISUAL_SETTINGS, true); expect(system.meshes.every(m => !m.visible)).toBe(true);
  system.update(1000, target, { ...DEFAULT_VISUAL_SETTINGS, foliageEnabled: false }, false); expect(system.stats.visiblePlants).toBe(0);
  const dispose = vi.fn(); system.meshes[0].geometry.addEventListener("dispose", dispose); system.dispose();
  expect(scene.children).toHaveLength(0); expect(dispose).toHaveBeenCalledOnce();
});
test("old presets acquire bounded local foliage settings without changing GI transport", () => {
  expect(normalizeVisualSettings({})).toMatchObject({ foliageEnabled: true, foliageDensity: .7, windStrength: 1 });
  const visual = normalizeVisualSettings({ foliageEnabled: false, foliageDensity: -1, windStrength: 5 });
  expect(visual).toMatchObject({ foliageEnabled: false, foliageDensity: 0, windStrength: 2 });
  expect(transportSettingsKey(visual)).toBe(transportSettingsKey(DEFAULT_VISUAL_SETTINGS));
  expect(JSON.parse(visualPresetJSON({ ...DEFAULT_VISUAL_PRESET, visual })).visual.foliageEnabled).toBe(false);
});

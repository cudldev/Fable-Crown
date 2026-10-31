import { expect, test, vi } from "vitest";
import { DataTexture, DoubleSide, InstancedBufferAttribute, Matrix4, MeshLambertMaterial, Scene, Vector3 } from "three";
import { buildFoliageLayout, foliageGeometry, foliageGroundColor, foliagePlants, FoliageSystem, FOLIAGE_KINDS, FOLIAGE_PITCH } from "../src/render/three/foliage";
import type { TerrainSurface } from "../src/render/three/terrain-tiles";
import { DEFAULT_VISUAL_SETTINGS, normalizeVisualSettings, transportSettingsKey, visualPresetJSON, DEFAULT_VISUAL_PRESET } from "../src/render/three/visual-settings";
import type { WorldDefinition } from "../src/rpg/types";
import { FOLIAGE_ART, FOLIAGE_CARD_SIZE, foliageAtlas, foliagePixels, foliageVariantCount } from "../src/render/three/foliage-art";

function world(): WorldDefinition {
  return { id: "foliage-test", name: "Test", width: 32, height: 32, chunkSize: 16, terrain: Array(1024).fill("grass"), collision: Array(1024).fill(0), objects: [], spawns: [], portals: [] };
}

function settle(system: FoliageSystem, time: number, target: Vector3, visual = DEFAULT_VISUAL_SETTINGS, reducedMotion = false) {
  for (let frame = 0; frame < 1000; frame++) {
    system.update(time, target, visual, false, reducedMotion);
    if (!system.stats.queued && !system.stats.countQueued) return frame + 1;
  }
  throw Error("Foliage preparation did not settle.");
}

function largeWorld(size = 96): WorldDefinition {
  return { ...world(), width: size, height: size, terrain: Array(size * size).fill("grass"), collision: Array(size * size).fill(0) };
}

function snapshot(system: FoliageSystem) {
  return system.meshes.map(mesh => ({ count: mesh.count,
    matrices: (mesh.instanceMatrix.array as Float32Array).slice(0, mesh.count * 16),
    colors: (mesh.instanceColor!.array as Float32Array).slice(0, mesh.count * 3),
    ranks: (mesh.geometry.getAttribute("foliageRank").array as Float32Array).slice(0, mesh.count) }));
}

function expectWindow(system: FoliageSystem, w: WorldDefinition, target: Vector3, density = DEFAULT_VISUAL_SETTINGS.foliageDensity) {
  const x = Math.round(target.x / 8) * 8, z = Math.round(target.z / 8) * 8;
  const expected = foliagePlants(buildFoliageLayout(w), x - 34, z - 34, x + 34, z + 34).filter(plant => plant.rank < density && Math.hypot(plant.x - x, plant.z - z) <= 34);
  const matrix = new Matrix4();
  for (const [k, mesh] of system.meshes.entries()) {
    const plants = expected.filter(plant => plant.kind === FOLIAGE_KINDS[k]).slice(0, mesh.instanceMatrix.count);
    expect(mesh.count, FOLIAGE_KINDS[k]).toBe(plants.length);
    const matrices = new Float32Array(plants.length * 16), ranks = new Float32Array(plants.length);
    plants.forEach((plant, i) => { matrix.makeRotationY(plant.angle).setPosition(plant.x, 0, plant.z); matrices.set(matrix.elements, i * 16); ranks[i] = plant.rank; });
    expect(Buffer.from(mesh.instanceMatrix.array.buffer, mesh.instanceMatrix.array.byteOffset, matrices.byteLength).equals(Buffer.from(matrices.buffer)), FOLIAGE_KINDS[k] + " transforms").toBe(true);
    const actualRanks = mesh.geometry.getAttribute("foliageRank").array;
    expect(Buffer.from(actualRanks.buffer, actualRanks.byteOffset, ranks.byteLength).equals(Buffer.from(ranks.buffer)), FOLIAGE_KINDS[k] + " ranks").toBe(true);
  }
}
test("habitats exclude paths, paving, water, collision and service footprints without mutating the world", () => {
  const w = world();
  w.terrain[10 * 32 + 10] = "dirt"; w.terrain[12 * 32 + 10] = "stone"; w.terrain[20 * 32 + 10] = "water";
  w.terrain[20 * 32 + 11] = "sand"; w.terrain[25 * 32 + 25] = "sand"; w.collision[15 * 32 + 15] = 1;
  w.objects.push({ id: "bank", kind: "bank", name: "Bank", width: 4, height: 3, position: { x: 3, y: 3, worldId: w.id, plane: 0 }, blocks: true });
  const before = JSON.stringify(w), layout = buildFoliageLayout(w), at = (x: number, z: number) => layout.habitat[z * 32 + x];
  for (const [x, z] of [[10, 10], [10, 12], [10, 20], [25, 25], [15, 15], [2, 2], [7, 6]]) expect(at(x, z)).toBe(0);
  expect(at(10, 9)).toBe(1); expect(layout.edge[9 * 32 + 10]).toBe(1);
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
    expect(new Set(all.map(p => p.kind))).toEqual(new Set(["grass", "flower", "groundcover", "bush", "shortgrass"]));
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
test.each(FOLIAGE_KINDS)("%s uses cheap grounded cards with a transparent plant silhouette", kind => {
  const geometry = foliageGeometry(kind), positions = geometry.getAttribute("position"), normals = geometry.getAttribute("normal");
  const ground = kind === "groundcover";
  expect(geometry.boundingBox!.min.y).toBeCloseTo(ground ? .012 : 0); expect(geometry.boundingBox!.max.y).toBeLessThanOrEqual(1);
  for (let i = 0; i < positions.count; i++) {
    if (!ground) expect(positions.getY(i) / FOLIAGE_PITCH).toBeCloseTo(Math.round(positions.getY(i) / FOLIAGE_PITCH), 5);
    expect(Math.abs(normals.getX(i)) + Math.abs(normals.getY(i)) + Math.abs(normals.getZ(i))).toBe(1);
  }
  expect(positions.count).toBe(ground ? 4 : 8); expect(geometry.index!.count / 3).toBe(ground ? 2 : 4); expect(geometry.getAttribute("uv").count).toBe(ground ? 4 : 8);
  const pixels = foliagePixels(kind), alpha = Array.from(pixels).filter((_, i) => i % 4 === 3), opaque = alpha.filter(a => a === 255).length;
  const rows = FOLIAGE_ART[kind], width = rows[0].length;
  expect(pixels).toEqual(foliagePixels(kind)); expect(opaque).toBeGreaterThan(8); expect(opaque).toBeLessThan(rows.length * width * .7);
  expect(FOLIAGE_CARD_SIZE[kind]).toEqual([width * FOLIAGE_PITCH, rows.length * FOLIAGE_PITCH]);
  expect(alpha.every(a => a === 0 || a === 255)).toBe(true); if (!ground) expect(alpha.slice(-width).some(a => a === 255)).toBe(true);
  // Layered tufts retain chunky 6.25cm pixels and stay well below human height.
  const visibleRows = rows.filter(row => /[^.]/.test(row)).length;
  if (!ground) expect(visibleRows * FOLIAGE_PITCH).toBe({ grass: .375, fern: .375, flower: .4375, reed: .8125, bush: .6875, shortgrass: .1875 }[kind]);
  geometry.dispose();
});
test("card placement supports lush coverage while keeping the instance window bounded", () => {
  const plants = foliagePlants(buildFoliageLayout(world()), 0, 0, 31, 31);
  expect(plants.length).toBeGreaterThan(2500); expect(plants.length).toBeLessThanOrEqual(32 * 32 * 11);
});
test("neighbouring upright cards never share an overlapping plane and ground mats meet without overlap", () => {
  const plants = foliagePlants(buildFoliageLayout(world()), 0, 0, 31, 31);
  for (const axis of ["x", "z"] as const) {
    const along = axis === "x" ? "z" : "x", lanes = new Map<number, typeof plants>();
    for (const p of plants) if (p.kind !== "groundcover") { const lane = lanes.get(p[axis]) ?? []; lane.push(p); lanes.set(p[axis], lane); }
    for (const lane of lanes.values()) for (let a = 0; a < lane.length; a++) for (let b = a + 1; b < lane.length; b++) {
      const reach = (FOLIAGE_CARD_SIZE[lane[a].kind][0] + FOLIAGE_CARD_SIZE[lane[b].kind][0]) / 2;
      expect(Math.abs(lane[a][along] - lane[b][along])).toBeGreaterThanOrEqual(reach - .00001);
    }
  }
  const mats = plants.filter(p => p.kind === "groundcover");
  expect(new Set(mats.map(p => `${Math.round(p.x)}:${Math.round(p.z)}`)).size).toBe(mats.length);
  for (const p of mats) { expect(p.x - FOLIAGE_PITCH / 2).toBe(Math.round(p.x)); expect(p.z - FOLIAGE_PITCH / 2).toBe(Math.round(p.z)); }
});
test("flowers have independent stems and petals; none are painted into grass or ground cover", () => {
  for (const kind of FOLIAGE_KINDS.filter(k => k !== "flower")) expect(FOLIAGE_ART[kind].join("")).not.toMatch(/[pcv]/);
  expect(FOLIAGE_ART.flower.join("")).not.toMatch(/[dgl]/); expect(FOLIAGE_ART.flower.join("")).toMatch(/p/);
});
test("upright vegetation has broken green roots rather than a painted dark base stripe", () => {
  for (const kind of ["grass", "shortgrass", "fern", "reed", "bush"] as const) {
    const rows = FOLIAGE_ART[kind]; expect(rows.slice(-2).join("")).not.toContain("d");
    expect(rows[rows.length - 1]).toContain("."); expect(rows[rows.length - 1]).toContain("g");
  }
});
test("grass has four distinct silhouettes with restrained tip contrast and no extra geometry", () => {
  for (const kind of ["grass", "shortgrass"] as const) {
    expect(foliageVariantCount(kind)).toBe(4);
    const atlas = foliageAtlas(kind), signatures = new Set<string>();
    expect(atlas.width).toBe(FOLIAGE_ART[kind][0].length * 4);
    for (let variant = 0; variant < 4; variant++) {
      const pixels = foliagePixels(kind, variant), greens: number[] = [];
      signatures.add(Array.from(pixels).join(","));
      for (let i = 0; i < pixels.length; i += 4) if (pixels[i + 3]) greens.push(pixels[i + 1]);
      expect(Math.max(...greens) / Math.min(...greens)).toBeLessThan(1.15);
      for (let y = 0; y < atlas.height; y++) {
        const width = FOLIAGE_ART[kind][0].length, start = (y * atlas.width + variant * width) * 4;
        expect(atlas.data.subarray(start, start + width * 4)).toEqual(pixels.subarray(y * width * 4, (y + 1) * width * 4));
      }
    }
    expect(signatures.size).toBe(4);
  }
});
test("ground tint samples the actual atlas beneath a card and retains individual color variance", () => {
  const data = new Uint8Array(16 * 16 * 4);
  for (let y = 0; y < 16; y++) for (let x = 0; x < 16; x++) data.set(y < 8 ? [160, 70, 40, 255] : [70, 130, 55, 255], (y * 16 + x) * 4);
  const texture = new DataTexture(data, 16, 16);
  const surface: TerrainSurface = { texture, presentationTerrain: world().terrain, uvAt: () => [0, 0, 1, 1],
    stats: { textureBytes: data.length, sourceModules: 1, paintedVariants: 1, width: 16, height: 16, tiles: 1, quietedDirtTiles: 0 }, dispose() { texture.dispose(); } };
  const north = foliageGroundColor(surface, 0, -.3), south = foliageGroundColor(surface, 0, .3);
  expect(north.g).toBeGreaterThan(north.r); expect(south.r).toBeGreaterThan(south.g);
  const system = new FoliageSystem(new Scene()); system.setWorld(world(), undefined, surface);
  settle(system, 0, new Vector3(16, 0, 16));
  const colors = system.meshes[0].instanceColor!;
  expect(new Set(Array.from(colors.array).filter((_, i) => i % 3 === 0).slice(0, system.meshes[0].count)).size).toBeGreaterThan(10);
  system.dispose(); surface.dispose();
});
test("bare edges grade into short grass before the taller interior layers", () => {
  const w = world(); for (let z = 0; z < w.height; z++) w.terrain[z * 32 + 8] = "dirt";
  const layout = buildFoliageLayout(w);
  expect([8, 9, 10, 11].map(x => layout.edge[16 * 32 + x])).toEqual([0, 1, 2, 3]);
  const fringe = foliagePlants(layout, 9, 3, 9, 28);
  expect(fringe.length).toBeGreaterThan(0); expect(fringe.every(p => p.kind === "shortgrass")).toBe(true);
  for (const plant of fringe) expect(Math.abs(plant.x - 9) + .25).toBeLessThan(.5);
  const interior = foliagePlants(layout, 12, 3, 25, 28);
  expect(interior.some(p => p.kind === "groundcover")).toBe(true); expect(interior.some(p => p.kind === "grass")).toBe(true);
});
test("wind freezes, density thins stable plants, uploads stay cached, and disabled/overview vegetation draws nothing", () => {
  const scene = new Scene(), system = new FoliageSystem(scene), target = new Vector3(16, 0, 16);
  system.setWorld(world()); settle(system, 0, target); system.update(100, target, DEFAULT_VISUAL_SETTINGS, false);
  for (const mesh of system.meshes) {
    const material = mesh.material as MeshLambertMaterial;
    expect(material.alphaTest).toBe(.5); expect(material.transparent).toBe(false); expect(material.side).toBe(DoubleSide); expect(material.map).not.toBeNull();
  }
  expect(system.stats.windTime).toBe(.1); const count = system.stats.visiblePlants, uploads = system.stats.uploads;
  settle(system, 700, target, { ...DEFAULT_VISUAL_SETTINGS, windStrength: 0, foliageDensity: .2 });
  expect(system.stats.windTime).toBe(.1); expect(system.stats.visiblePlants).toBeLessThan(count); expect(system.stats.uploads).toBe(uploads + 1);
  system.update(750, target, { ...DEFAULT_VISUAL_SETTINGS, windStrength: 0, foliageDensity: .2 }, false); expect(system.stats.uploads).toBe(uploads + 1);
  system.update(800, target, DEFAULT_VISUAL_SETTINGS, false, true); expect(system.stats.windTime).toBe(.1);
  system.update(900, target, DEFAULT_VISUAL_SETTINGS, true); expect(system.meshes.every(m => !m.visible)).toBe(true);
  system.update(1000, target, { ...DEFAULT_VISUAL_SETTINGS, foliageEnabled: false }, false); expect(system.stats.visiblePlants).toBe(0);
  const dispose = vi.fn(), disposeTexture = vi.fn(); system.meshes[0].geometry.addEventListener("dispose", dispose);
  (system.meshes[0].material as MeshLambertMaterial).map!.addEventListener("dispose", disposeTexture); system.dispose();
  expect(scene.children).toHaveLength(0); expect(dispose).toHaveBeenCalledOnce(); expect(disposeTexture).toHaveBeenCalledOnce();
});
test("old presets acquire bounded local foliage settings without changing GI transport", () => {
  expect(normalizeVisualSettings({})).toMatchObject({ foliageEnabled: true, foliageDensity: .7, windStrength: 1 });
  const visual = normalizeVisualSettings({ foliageEnabled: false, foliageDensity: -1, windStrength: 5 });
  expect(visual).toMatchObject({ foliageEnabled: false, foliageDensity: 0, windStrength: 2 });
  expect(transportSettingsKey(visual)).toBe(transportSettingsKey(DEFAULT_VISUAL_SETTINGS));
  expect(JSON.parse(visualPresetJSON({ ...DEFAULT_VISUAL_PRESET, visual })).visual.foliageEnabled).toBe(false);
});

test("source chunks preserve exact accepted window transforms/ranks while preparation and uploads span frames", () => {
  const w = largeWorld(), scene = new Scene(), system = new FoliageSystem(scene), target = new Vector3(40, 0, 40);
  system.setWorld(w);
  system.update(0, target, DEFAULT_VISUAL_SETTINGS, false);
  expect(system.stats.queued).toBe(1); expect(system.meshes.every(mesh => mesh.count === 0)).toBe(true);
  let frames = 0;
  do {
    const versions = system.meshes.map(mesh => mesh.instanceMatrix.version), commits = system.stats.commits;
    system.update(0, target, DEFAULT_VISUAL_SETTINGS, false); frames++;
    expect(system.stats.commits - commits).toBeLessThanOrEqual(1);
    expect(system.meshes.filter((mesh, i) => mesh.instanceMatrix.version !== versions[i]).length).toBeLessThanOrEqual(1);
    expect(frames).toBeLessThan(500);
  } while (system.stats.queued || system.stats.countQueued);
  expect(frames).toBeGreaterThan(FOLIAGE_KINDS.length);
  expect(system.stats.uploads).toBe(1); expect(system.stats.commits).toBe(FOLIAGE_KINDS.length);
  expectWindow(system, w, target);
  for (const mesh of system.meshes) if (mesh.count) {
    expect(mesh.instanceMatrix.updateRanges).toEqual([{ start: 0, count: mesh.count * 16 }]);
    expect(mesh.instanceColor!.updateRanges).toEqual([{ start: 0, count: mesh.count * 3 }]);
    expect((mesh.geometry.getAttribute("foliageRank") as InstancedBufferAttribute).updateRanges).toEqual([{ start: 0, count: mesh.count }]);
    expect(mesh.boundingSphere!.radius).toBeGreaterThan(1);
  }
  const versions = system.meshes.map(mesh => mesh.instanceMatrix.version), uploads = system.stats.uploads;
  settle(system, 1000, target);
  expect(system.meshes.map(mesh => mesh.instanceMatrix.version)).toEqual(versions); expect(system.stats.uploads).toBe(uploads);
  system.dispose();
});

test("camera boundary preparation retains live buffers, coalesces nearby requests and restores exact cached colors on return", () => {
  const w = largeWorld(), system = new FoliageSystem(new Scene()), first = new Vector3(40, 0, 40), next = new Vector3(48, 0, 40);
  system.setWorld(w); settle(system, 0, first); const original = snapshot(system);
  system.update(1, next, DEFAULT_VISUAL_SETTINGS, false);
  expect(system.stats.queued).toBe(1); expect(snapshot(system)).toEqual(original);
  for (const x of [56, 40, 48, 56, 48, 40]) system.update(2, new Vector3(x, 0, 40), DEFAULT_VISUAL_SETTINGS, false);
  settle(system, 3, first);
  expectWindow(system, w, first); expect(snapshot(system)).toEqual(original);
  expect(system.stats.cancelled).toBe(0); expect(system.stats.cacheChunks).toBeLessThanOrEqual(256);
  const lower = { ...DEFAULT_VISUAL_SETTINGS, foliageDensity: .2 };
  settle(system, 4, next, lower); expectWindow(system, w, next, .2);
  settle(system, 5, first); expect(snapshot(system)).toEqual(original);
  system.dispose();
});

test("far obsolete uncommitted preparation cancels safely and a changed world discards source/tint caches", () => {
  const w = largeWorld(160), system = new FoliageSystem(new Scene()), first = new Vector3(24, 0, 24), far = new Vector3(128, 0, 128);
  system.setWorld(w); settle(system, 0, first); const original = snapshot(system);
  system.update(1, new Vector3(32, 0, 24), DEFAULT_VISUAL_SETTINGS, false);
  system.update(2, far, DEFAULT_VISUAL_SETTINGS, false);
  expect(system.stats.cancelled).toBe(1); expect(snapshot(system)).toEqual(original);
  settle(system, 3, far); expectWindow(system, w, far);
  const nextWorld = { ...world(), id: "new-foliage-seed" };
  system.setWorld(nextWorld); expect(system.stats.cacheChunks).toBe(0); expect(system.meshes.every(mesh => mesh.count === 0)).toBe(true);
  settle(system, 4, new Vector3(16, 0, 16)); expectWindow(system, nextWorld, new Vector3(16, 0, 16));
  system.dispose(); expect(system.stats.queued).toBe(0); expect(system.stats.stagingBytes).toBe(0);
});

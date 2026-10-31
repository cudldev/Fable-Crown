import { readFile } from "node:fs/promises";
import { expect, test, vi } from "vitest";
import { bakeDensityShadowProxy, bakeVoxelModelSurfaces, bakeVoxelSurface, type VoxelSurfaceData } from "../src/render/three/voxel-surface";
import { composeVoxelModels, parseVox, selectVoxelShadowSurfaces, surfaceLevel, voxelModel, type VoxelGrid, VOXEL_SHADOW_TRIANGLE_BUDGET } from "../src/render/three/voxel-data";
import { decodeVoxelAsset, type VoxelDecodeSpec } from "../src/render/three/voxel-decode";

const palette = new Uint8Array([180, 120, 60, 255, 50, 100, 180, 255]);
const solid = (n: number): VoxelGrid => ({ size: [n, n, n], cells: new Uint8Array(n ** 3).fill(1), palette });
const at = (x: number, y: number, z: number, size: readonly number[]) => (x * size[1] + y) * size[2] + z;

function area(geometry: Pick<VoxelSurfaceData, "positions" | "indices">) {
  let sum = 0;
  for (let i = 0; i < geometry.indices.length; i += 3) {
    const points = [...geometry.indices.subarray(i, i + 3)].map(index => [...geometry.positions.subarray(index * 3, index * 3 + 3)]);
    const a = points[1].map((value, axis) => value - points[0][axis]), b = points[2].map((value, axis) => value - points[0][axis]);
    sum += Math.hypot(a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]) / 2;
  }
  return sum;
}

test("one cell has outward winding on all six Y-up faces, exact pivot and typed buffer metadata", () => {
  const geometry = bakeVoxelSurface(solid(1), .5, [2, 3, 1]);
  expect(geometry.positions).toBeInstanceOf(Float32Array); expect(geometry.normals).toBeInstanceOf(Int8Array);
  expect(geometry.colors).toBeInstanceOf(Float32Array); expect(geometry.ao).toBeInstanceOf(Uint8Array); expect(geometry.indices).toBeInstanceOf(Uint32Array);
  expect(geometry).toMatchObject({ exposedFaces: 6, quads: 6, triangles: 12, bytes: 816, pitch: .5, bounds: { min: [-1, -.5, 1], max: [-.5, 0, 1.5] } });
  expect(geometry.shadow).toBeUndefined(); expect([...geometry.ao]).toEqual(Array(24).fill(255));
  const normalSet = new Set<string>();
  for (let i = 0; i < geometry.indices.length; i += 3) {
    const [a, b, c] = [...geometry.indices.subarray(i, i + 3)];
    const ab = [0, 1, 2].map(axis => geometry.positions[b * 3 + axis] - geometry.positions[a * 3 + axis]);
    const ac = [0, 1, 2].map(axis => geometry.positions[c * 3 + axis] - geometry.positions[a * 3 + axis]);
    const cross = [ab[1] * ac[2] - ab[2] * ac[1], ab[2] * ac[0] - ab[0] * ac[2], ab[0] * ac[1] - ab[1] * ac[0]];
    const normal = [...geometry.normals.subarray(a * 3, a * 3 + 3)]; normalSet.add(normal.join(","));
    expect(cross.reduce((sum, value, axis) => sum + value * normal[axis], 0)).toBeGreaterThan(0);
  }
  expect([...normalSet].sort()).toEqual(["-1,0,0", "0,-1,0", "0,0,-1", "0,0,1", "0,1,0", "1,0,0"].sort());
  expect(area(geometry)).toBe(6 * .5 ** 2);
});

test("greedy surfaces remove neighboring internal faces and preserve enclosed cavity walls", () => {
  const block = bakeVoxelSurface(solid(2), 1, [0, 0, 0]);
  expect(block).toMatchObject({ exposedFaces: 24, quads: 6, triangles: 12 }); expect(area(block)).toBe(24);
  const grid = solid(3); grid.cells[at(1, 1, 1, grid.size)] = 0;
  const cavity = bakeVoxelSurface(grid, 1, [0, 0, 0]);
  expect(cavity.exposedFaces).toBe(60); expect(cavity.quads).toBe(12); expect(area(cavity)).toBe(60);
  expect(cavity.bounds).toEqual({ min: [0, 0, -3], max: [3, 3, 0] });
  const empty = solid(1); empty.cells.fill(0); const none = bakeVoxelSurface(empty, 1, [0, 0, 0]);
  expect(none).toMatchObject({ quads: 0, triangles: 0, bytes: 0, bounds: { min: [0, 0, 0], max: [0, 0, 0] } });
});

test("pigment boundaries remain visible while an optional shadow mesh merges only coplanar occupancy", () => {
  const grid = solid(2);
  for (let y = 0; y < 2; y++) for (let z = 0; z < 2; z++) grid.cells[at(1, y, z, grid.size)] = 2;
  const level = surfaceLevel(grid, 1, [0, 0, 0]), geometry = bakeVoxelSurface(grid, 1, [0, 0, 0], level);
  expect(geometry.quads).toBe(10); expect(geometry.shadow?.quads).toBe(6);
  expect(geometry.shadow!.triangles).toBeLessThan(geometry.triangles);
  expect(geometry.shadow!.bounds).toEqual(geometry.bounds); expect(area(geometry.shadow!)).toBe(area(geometry));
  for (let q = 0; q < geometry.quads; q++) {
    const first = geometry.colors.subarray(q * 12, q * 12 + 3);
    for (let corner = 1; corner < 4; corner++) expect(geometry.colors.subarray(q * 12 + corner * 3, q * 12 + corner * 3 + 3)).toEqual(first);
    expect([...Array(level.count).keys()].some(i => [...first].every((value, channel) => value === level.colors[i * 3 + channel]))).toBe(true);
  }
  const duplicates = { ...grid, palette: new Uint8Array([...palette.subarray(0, 4), ...palette.subarray(0, 4)]) };
  expect(bakeVoxelSurface(duplicates, 1, [0, 0, 0]).quads).toBe(6);
});

test("nonuniform corner AO retains source values, unit quads and the original per-face diagonal", () => {
  const grid = solid(4); grid.cells.fill(0); grid.cells[at(1, 1, 1, grid.size)] = 1; grid.cells[at(2, 2, 1, grid.size)] = 1;
  const level = surfaceLevel(grid, 1, [0, 0, 0]), geometry = bakeVoxelSurface(grid, 1, [0, 0, 0], level);
  const source = [...Array(level.count).keys()].find(i => level.centers[i * 3] === 1.5 && level.centers[i * 3 + 1] === 1.5 && level.centers[i * 3 + 2] === -1.5)!;
  for (const [face, normal, diagonal] of [[1, [1, 0, 0], [0, 1, 3, 0, 3, 2]], [3, [0, 0, -1], [0, 1, 2, 1, 3, 2]]] as const) {
    let found = false;
    for (let q = 0; q < geometry.quads; q++) {
      const start = q * 4, positions = geometry.positions.subarray(start * 3, start * 3 + 12);
      if (!normal.every((value, axis) => geometry.normals[start * 3 + axis] === value)) continue;
      const center = [0, 1, 2].map(axis => [0, 1, 2, 3].reduce((sum, corner) => sum + positions[corner * 3 + axis], 0) / 4);
      if (face === 1 ? center[0] !== 2 || center[1] !== 1.5 || center[2] !== -1.5 : center[0] !== 1.5 || center[1] !== 1.5 || center[2] !== -2) continue;
      const values = level.ao.subarray(source * 24 + face * 4, source * 24 + face * 4 + 4);
      expect(new Set(values).size).toBeGreaterThan(1);
      expect(geometry.ao.subarray(start, start + 4)).toEqual(values);
      expect([...geometry.indices.subarray(q * 6, q * 6 + 6)].map(index => index - start)).toEqual(diagonal);
      found = true;
    }
    expect(found, `source face ${face} must retain its own AO quad`).toBe(true);
  }
});

test("dense-grid stump baking follows every model LOD pitch, pivot and capped identity without changing source lighting", () => {
  const grid = solid(16), original = grid.cells.slice(), model = voxelModel(grid, .0625, [8, 8, 0], .5), lighting = model.lighting, levels = model.levels;
  expect(model.surfaces).toBeUndefined();
  const surfaces = bakeVoxelModelSurfaces(grid, model, .0625, [8, 8, 0], .5);
  expect(model.surfaces).toBe(surfaces); expect(model.levels).toBe(levels); expect(model.lighting).toBe(lighting); expect(grid.cells).toEqual(original);
  expect(surfaces[3]).toBe(surfaces[4]); expect(levels[3]).toBe(levels[4]);
  for (let i = 0; i < levels.length; i++) {
    expect(surfaces[i].pitch).toBe(levels[i].pitch);
    expect(surfaces[i].bounds).toEqual({ min: [-.5, 0, -.5], max: [.5, .5, .5] });
    expect(area(surfaces[i])).toBeCloseTo(surfaces[i].exposedFaces * levels[i].pitch ** 2, 8);
  }
});

test("composed supplies translate/rebase shared surfaces and optional shadow data once per unique LOD", () => {
  const grid = solid(2); for (let y = 0; y < 2; y++) for (let z = 0; z < 2; z++) grid.cells[at(1, y, z, grid.size)] = 2;
  const a = voxelModel(grid, .25, [0, 0, 0]), b = voxelModel(solid(2), .25, [0, 0, 0]);
  bakeVoxelModelSurfaces(grid, a, .25, [0, 0, 0]); bakeVoxelModelSurfaces(solid(2), b, .25, [0, 0, 0]);
  const composed = composeVoxelModels([{ model: a, offset: [-1, 0, 0] }, { model: b, offset: [1, .25, .5] }]);
  expect(composed.surfaces).toHaveLength(5); const geometry = composed.surfaces![0];
  expect(geometry.bounds).toEqual({ min: [-1, 0, -.5], max: [1.5, .75, .5] });
  expect(geometry.indices.subarray(0, a.surfaces![0].indices.length)).toEqual(a.surfaces![0].indices);
  expect(geometry.indices[a.surfaces![0].indices.length]).toBe(b.surfaces![0].indices[0] + a.surfaces![0].positions.length / 3);
  expect(geometry.shadow!.triangles).toBeLessThan(geometry.triangles);
  expect(area(geometry.shadow!)).toBe(area(geometry));
  expect(composed.surfaces![1]).toBe(composed.surfaces![4]);
  expect(composeVoxelModels([{ model: voxelModel(solid(1), 1, [0, 0, 0]), offset: [0, 0, 0] }]).surfaces).toBeUndefined();
});

test("accepted native oak preserves dense occupancy bounds and submits fewer surface/shadow triangles", async () => {
  const bytes = Uint8Array.from(await readFile(new URL("../public/art3d/voxel/tree.vox", import.meta.url))), grid = parseVox(bytes.buffer);
  const model = voxelModel(grid, .0625, [34, 35, 0]);
  const surfaces = bakeVoxelModelSurfaces(grid, model, .0625, [34, 35, 0]);
  for (let i = 0; i < model.levels.length; i++) {
    const level = model.levels[i], geometry = surfaces[i];
    expect(geometry.triangles).toBeLessThan(level.count * 12);
    const positions = [...Array(level.count).keys()];
    const min = [0, 1, 2].map(axis => Math.min(...positions.map(index => level.centers[index * 3 + axis])) - level.pitch / 2);
    const max = [0, 1, 2].map(axis => Math.max(...positions.map(index => level.centers[index * 3 + axis])) + level.pitch / 2);
    expect(geometry.bounds).toEqual({ min, max });
    expect(area(geometry)).toBeCloseTo(geometry.exposedFaces * level.pitch ** 2, 6);
  }
  expect(surfaces[0].shadow).toBeDefined(); expect(surfaces[0].shadow!.triangles).toBeLessThan(surfaces[0].triangles);
  const proxy = model.shadowSurfaces![0]!;
  expect(proxy.triangles).toBe(1972); expect(proxy.densityProxy).toEqual({ factor: 4, minimumOccupancy: .375 });
  expect(model.shadowSurfaces![1]).toBe(proxy); expect(model.shadowSurfaces![2]).toBe(surfaces[2].shadow);
  expect(proxy.positions).not.toBe(surfaces[2].shadow!.positions); expect(proxy.indices).not.toBe(surfaces[2].shadow!.indices);
  expect(model.shadowBudgetExceeded).toBeUndefined();
  expect(proxy.bounds).toEqual({ min: [-2.125, 0, -2.3125], max: [2.125, 4, 2.1875] });
  expect(surfaces[0].bounds).toEqual({ min: [-2.125, 0, -2.1875], max: [2.125, 4, 2.1875] });
  expect(surfaces[0].triangles).toBe(49656); expect(surfaces[0].shadow!.triangles).toBe(9806);
  const compound = composeVoxelModels([{ model, offset: [-3, 0, 0] }, { model, offset: [3, 0, 0] }]);
  expect(compound.shadowSurfaces![0]).toBe(compound.shadowSurfaces![1]);
  expect(compound.shadowSurfaces![0]!.triangles).toBe(3944);
  expect(compound.shadowSurfaces![0]!.bounds).toEqual({ min: [-5.125, 0, -2.3125], max: [5.125, 4, 2.1875] });
  expect(compound.shadowBudgetExceeded).toEqual([true, true, true, false, false]);
  console.log("Native oak surface counts", surfaces.map(surface => ({ triangles: surface.triangles, shadowTriangles: surface.shadow?.triangles ?? surface.triangles, bytes: surface.bytes + (surface.shadow?.bytes ?? 0) })));
});

test("shadow selection prefers the finest qualifying existing level and never changes visible arrays", () => {
  const base = bakeVoxelSurface(solid(1), 1, [0, 0, 0]);
  const visible = [6000, 3000, 2100, 400, 24], shadow = [3000, 2200, 1900, 300, 24];
  const surfaces = visible.map((triangles, index) => ({ ...base, triangles, shadow: { ...base, triangles: shadow[index] } }));
  const selected = selectVoxelShadowSurfaces(surfaces)!;
  expect(selected).toEqual([surfaces[2].shadow, surfaces[2].shadow, surfaces[2].shadow, surfaces[3].shadow, undefined]);
  expect(selected[0]).toBe(selected[2]);
  expect(surfaces.every(surface => surface.positions === base.positions && surface.indices === base.indices && surface.ao === base.ao)).toBe(true);
  expect(selectVoxelShadowSurfaces(surfaces.slice(0, 2))).toBeUndefined();
  expect(selectVoxelShadowSurfaces([base])).toBeUndefined();
  const empty = bakeVoxelSurface({ ...solid(1), cells: new Uint8Array(1) }, 1, [0, 0, 0]);
  expect(selectVoxelShadowSurfaces([empty])).toBeUndefined();
});

test("shadow proxies preserve colored stump pivots and share capped level buffers", () => {
  const grid = solid(16);
  for (let x = 8; x < 16; x++) for (let y = 0; y < 16; y++) for (let z = 0; z < 16; z++) grid.cells[at(x, y, z, grid.size)] = 2;
  const model = voxelModel(grid, .0625, [8, 8, 0], .5);
  bakeVoxelModelSurfaces(grid, model, .0625, [8, 8, 0], .5);
  expect(model.shadowSurfaces).toHaveLength(5);
  expect(model.shadowSurfaces![3]).toBe(model.shadowSurfaces![4]);
  for (const shadow of model.shadowSurfaces!) {
    expect(shadow!.bounds).toEqual({ min: [-.5, 0, -.5], max: [.5, .5, .5] });
    expect(shadow!.triangles).toBeLessThanOrEqual(VOXEL_SHADOW_TRIANGLE_BUDGET);
  }
});

test("shadow-only density thresholds count available edge cells and never edit native/visible data", () => {
  const grid: VoxelGrid = { size: [5, 4, 4], cells: new Uint8Array(80), palette };
  for (let y = 0; y < 4; y++) for (let z = 0; z < 2; z++) grid.cells[at(4, y, z, grid.size)] = 1;
  const before = grid.cells.slice(), model = voxelModel(grid, 1, [0, 0, 0]);
  const geometry = bakeDensityShadowProxy(grid, 1, [0, 0, 0], 4, .5);
  expect(geometry.triangles).toBe(12); expect(geometry.bounds).toEqual({ min: [4, 0, -4], max: [8, 4, 0] });
  expect(bakeDensityShadowProxy(grid, 1, [0, 0, 0], 4, .75).triangles).toBe(0);
  expect(grid.cells).toEqual(before); expect(model.surfaces).toBeUndefined(); expect(model.shadowSurfaces).toBeUndefined();
  expect(() => bakeDensityShadowProxy(grid, 1, [0, 0, 0], 0, .25)).toThrow();
});

test("sparse ground details retain exact shadows and explicitly report an unmet budget", () => {
  const grid = solid(24); grid.cells.fill(0);
  for (let x = 0; x < 24; x += 2) for (let y = 0; y < 24; y += 2) for (let z = 0; z < 24; z += 2) grid.cells[at(x, y, z, grid.size)] = 1;
  const before = grid.cells.slice(), model = voxelModel(grid, .0625, [12, 12, 0]);
  bakeVoxelModelSurfaces(grid, model, .0625, [12, 12, 0]);
  const exact = model.surfaces![0].shadow ?? model.surfaces![0];
  expect(exact.triangles).toBeGreaterThan(VOXEL_SHADOW_TRIANGLE_BUDGET);
  expect(model.shadowSurfaces?.[0] ?? model.surfaces![0]).toBe(exact);
  expect(model.shadowBudgetExceeded?.[0]).toBe(true);
  expect(exact.bounds.min[1]).toBe(0); expect(grid.cells).toEqual(before);
});

test("published native props and depleted states have no unreported shadow budget fallback", async () => {
  const manifest = JSON.parse(await readFile(new URL("../public/art3d/voxel/manifest.json", import.meta.url), "utf8")) as { assets: (VoxelDecodeSpec & { id: string; file: string })[] };
  for (const spec of manifest.assets) {
    const bytes = Uint8Array.from(await readFile(new URL(`../public/art3d/voxel/${spec.file}`, import.meta.url)));
    const decoded = decodeVoxelAsset(bytes.buffer, spec);
    for (const [state, model] of Object.entries(decoded.voxels)) if (model) {
      const shadow = model.shadowSurfaces?.[0] ?? model.surfaces![0].shadow ?? model.surfaces![0];
      expect(shadow.triangles, `${spec.id}/${state} native shadow triangles`).toBeLessThanOrEqual(VOXEL_SHADOW_TRIANGLE_BUDGET);
      expect(model.shadowBudgetExceeded?.[0], `${spec.id}/${state} native fallback`).not.toBe(true);
      expect(shadow.bounds.min[1], `${spec.id}/${state} ground contact`).toBe(0);
    }
  }
});

function tinyVox() {
  const bytes = new Uint8Array(1104), view = new DataView(bytes.buffer), text = (at: number, value: string) => bytes.set([...value].map(char => char.charCodeAt(0)), at);
  text(0, "VOX "); view.setUint32(4, 150, true); text(8, "MAIN"); view.setUint32(16, bytes.length - 20, true);
  text(20, "SIZE"); view.setUint32(24, 12, true); [2, 1, 1].forEach((value, i) => view.setUint32(32 + i * 4, value, true));
  text(44, "XYZI"); view.setUint32(48, 12, true); view.setUint32(56, 2, true); bytes.set([0, 0, 0, 1, 1, 0, 0, 2], 60);
  text(68, "RGBA"); view.setUint32(72, 1024, true); bytes.set(palette, 80);
  return bytes.buffer;
}

test("asset worker transfers every unique surface/shadow buffer and preserves capped aliases", async () => {
  const scope: { onmessage?: (event: { data: unknown }) => void } = {}, post = vi.fn();
  vi.stubGlobal("self", scope); vi.stubGlobal("postMessage", post);
  try {
    await import("../src/render/three/voxel-assets.worker");
    scope.onmessage?.({ data: { buffer: tinyVox(), spec: { pitch: .0625, pivot: [0, 0, 0] } } });
    expect(post).toHaveBeenCalledOnce();
    const [message, options] = post.mock.calls[0];
    expect(message.error).toBeUndefined();
    const model = message.voxels.model, surface = model.surfaces[0];
    expect(model.surfaces[4]).toBe(surface); expect(surface.shadow).toBeDefined();
    expect(new Set(options.transfer).size).toBe(options.transfer.length);
    for (const array of [surface.positions, surface.normals, surface.colors, surface.ao, surface.indices, surface.shadow.positions, surface.shadow.indices]) expect(options.transfer).toContain(array.buffer);
    for (const shadow of model.shadowSurfaces ?? []) if (shadow) for (const array of [shadow.positions, shadow.indices]) expect(options.transfer).toContain(array.buffer);
  } finally { vi.unstubAllGlobals(); }
});

import { expect, test } from "vitest";
import { decodeVoxelBake, encodeVoxelBake, type BakedVoxelAssets } from "../src/render/three/voxel-bake";
import { voxelModel, type VoxelGrid } from "../src/render/three/voxel-data";
import { bakeVoxelModelSurfaces } from "../src/render/three/voxel-surface";

function fixture(): BakedVoxelAssets {
  const grid: VoxelGrid = { size: [2, 2, 2], cells: new Uint8Array([1, 1, 1, 1, 2, 2, 2, 2]), palette: new Uint8Array([160, 90, 40, 255, 30, 130, 50, 255]) };
  const model = voxelModel(grid, .0625, [1, 1, 0]);
  bakeVoxelModelSurfaces(grid, model, .0625, [1, 1, 0]);
  const depleted = voxelModel(grid, .0625, [1, 1, 0], .0625);
  bakeVoxelModelSurfaces(grid, depleted, .0625, [1, 1, 0], .0625);
  // Include aliases across assets and available/depleted models, including a
  // shadow reference to an existing visible surface and explicit undefined.
  model.shadowSurfaces = [model.surfaces![0].shadow, model.surfaces![1], undefined, model.surfaces![1], undefined];
  model.shadowBudgetExceeded = [false, false, false, false, false];
  return { sourceVersion: "test-v1", assets: [{ id: "tree", size: grid.size, voxels: { model, depleted } }, { id: "other", size: grid.size, voxels: { model: depleted } }] };
}

function rewrite(buffer: ArrayBuffer, change: (meta: Record<string, any>) => void) {
  const view = new DataView(buffer), length = view.getUint32(8, true), payloadAt = Math.ceil((16 + length) / 4) * 4;
  const meta = JSON.parse(new TextDecoder().decode(new Uint8Array(buffer, 16, length)));
  change(meta);
  const json = new TextEncoder().encode(JSON.stringify(meta)), at = Math.ceil((16 + json.length) / 4) * 4;
  const next = new ArrayBuffer(at + buffer.byteLength - payloadAt), bytes = new Uint8Array(next), header = new DataView(next);
  bytes.set(new Uint8Array(buffer, 0, 16)); header.setUint32(8, json.length, true); bytes.set(json, 16); bytes.set(new Uint8Array(buffer, payloadAt), at);
  return next;
}

test("baked voxel pack roundtrips exact typed data, capped LOD aliases and shared depleted/shadow identities", () => {
  const source = fixture(), encoded = encodeVoxelBake(source), decoded = decodeVoxelBake(encoded, "test-v1");
  expect(decoded).toEqual(source);
  const model = decoded.assets[0].voxels.model, depleted = decoded.assets[0].voxels.depleted!;
  expect(model.levels[2]).toBe(model.levels[4]); expect(model.surfaces![2]).toBe(model.surfaces![4]);
  expect(model.shadowSurfaces![0]).toBe(model.surfaces![0].shadow);
  expect(model.shadowSurfaces![1]).toBe(model.surfaces![1]); expect(model.shadowSurfaces![3]).toBe(model.surfaces![1]);
  expect(model.shadowSurfaces![2]).toBeUndefined(); expect(decoded.assets[1].voxels.model).toBe(depleted);
  for (const level of model.levels) for (const data of [level.centers, level.colors, level.ao]) expect(data.buffer).toBe(encoded);
  expect(model.surfaces![0].normals).toBeInstanceOf(Int8Array); expect(model.surfaces![0].indices).toBeInstanceOf(Uint32Array);
  expect([...model.surfaces![0].normals]).toContain(-1);
  // Stable traversal and buffer padding make repeat builds byte-identical.
  expect(new Uint8Array(encodeVoxelBake(source))).toEqual(new Uint8Array(encoded));
});

test("typed-array view aliases retain data offsets without duplicating the source backing buffer", () => {
  const source = fixture(), level = source.assets[0].voxels.model.levels[0], count = level.centers.length;
  const storage = new Float32Array(count * 2 + 2);
  storage.set(level.centers, 1); storage.set(level.colors, count + 1);
  level.centers = storage.subarray(1, count + 1); level.colors = storage.subarray(count + 1, count * 2 + 1);
  // Also preserve zero-length typed-array identity, not just equal contents.
  const shared = new Uint8Array(4), empty = source.assets[0].voxels.model.lighting;
  const originalAO = empty.ao; expect(originalAO.length).toBe(0);
  empty.ao = new Uint8Array(shared.buffer, 1, 0);
  source.assets[0].voxels.depleted!.lighting.ao = empty.ao;
  const decoded = decodeVoxelBake(encodeVoxelBake(source), "test-v1");
  expect(decoded.assets[0].voxels.model.lighting.ao).toBe(decoded.assets[0].voxels.depleted!.lighting.ao);
  const restored = decoded.assets[0].voxels.model.levels[0];
  expect(restored.centers).toEqual(level.centers); expect(restored.colors).toEqual(level.colors);
  expect(restored.centers.buffer).toBe(restored.colors.buffer);
  expect(restored.colors.byteOffset - restored.centers.byteOffset).toBe(count * 4);
});

test("baked voxel format rejects version mismatches, truncated payloads, trailing bytes and corrupt headers", () => {
  const encoded = encodeVoxelBake(fixture());
  expect(() => decodeVoxelBake(encoded, "other")).toThrow(/version/);
  for (const size of [0, 15, encoded.byteLength - 1]) expect(() => decodeVoxelBake(encoded.slice(0, size), "test-v1")).toThrow();
  const trailing = new Uint8Array(encoded.byteLength + 1); trailing.set(new Uint8Array(encoded));
  expect(() => decodeVoxelBake(trailing.buffer, "test-v1")).toThrow();
  for (const offset of [0, 4, 8, 12]) {
    const corrupt = encoded.slice(0); new DataView(corrupt).setUint32(offset, 0xffffffff, true);
    expect(() => decodeVoxelBake(corrupt, "test-v1")).toThrow();
  }
});

test("baked voxel decoder rejects invalid domain references, counts, buffer extents and malformed metadata", () => {
  const encoded = encodeVoxelBake(fixture());
  const mutations: ((meta: Record<string, any>) => void)[] = [
    meta => { meta.assets[0].id = "../outside"; },
    meta => { meta.assets[1].id = meta.assets[0].id; },
    meta => { meta.assets[0].size = [2, -1, 2]; },
    meta => { meta.assets[0].model = 99_999; },
    meta => { meta.models[0].lighting = -1; },
    meta => { meta.models[0].levels.pop(); },
    meta => { meta.models[0].surfaces[0] = 99_999; },
    meta => { meta.models[0].shadowSurfaces[0] = -2; },
    meta => { meta.models[0].shadowBudgetExceeded[0] = 1; },
    meta => { meta.levels[0].count++; },
    meta => { meta.geometries[0].triangles++; },
    meta => { meta.geometries[0].bytes++; },
    meta => { meta.geometries[0].bounds.min[0] = 999; },
    meta => { meta.geometries[0].shadow = 0; },
    meta => { meta.arrays[0].kind = "__proto__"; },
    meta => { meta.arrays[0].offset = 1; },
    meta => { meta.arrays[0].length = 1_000_000_000; },
    meta => { meta.buffers[0].length = 1_000_000_000; },
    meta => { meta.buffers[0].offset = 4; },
    meta => { meta.assets = {}; },
  ];
  for (const mutate of mutations) expect(() => decodeVoxelBake(rewrite(encoded, mutate), "test-v1")).toThrow();
});

test("baked voxel decoder checks index ranges and finite floats in actual binary payload", () => {
  const source = fixture(); source.assets[0].voxels.model.surfaces![0].indices[0] = 0xffffffff;
  expect(() => decodeVoxelBake(encodeVoxelBake(source), "test-v1")).toThrow();
  const badFloat = fixture(); badFloat.assets[0].voxels.model.levels[0].centers[0] = NaN;
  expect(() => decodeVoxelBake(encodeVoxelBake(badFloat), "test-v1")).toThrow();
  const badNormal = fixture(); badNormal.assets[0].voxels.model.surfaces![0].normals[0] = 2;
  expect(() => decodeVoxelBake(encodeVoxelBake(badNormal), "test-v1")).toThrow();
});

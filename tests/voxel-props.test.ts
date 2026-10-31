import { afterEach, beforeAll, expect, test, vi } from "vitest";
import { readFile } from "node:fs/promises";
import { MeshLambertMaterial } from "three";
import { composeVoxelModels, type VoxelObject } from "../src/render/three/voxel-data";
import { loadVoxelAssets, voxelAssetSpecs, voxelBindingId, voxelObject } from "../src/render/three/voxel-assets";
import { VOXEL_VERSION } from "../src/render/three/voxel-version";
import { WORLD } from "../src/rpg/world";
import { captureGIWorld } from "../src/render/three/voxel-gi-source";

let models: Map<string, VoxelObject>;
const urls: string[] = [];
beforeAll(async () => {
  const manifest = JSON.parse(await readFile(new URL("../public/art3d/voxel/manifest.json", import.meta.url), "utf8"));
  const files = new Map<string, Uint8Array>();
  for (const asset of manifest.assets) files.set(asset.file, Uint8Array.from(await readFile(new URL("../public/art3d/voxel/" + asset.file, import.meta.url))));
  vi.stubGlobal("fetch", vi.fn(async (input: URL) => {
    const url = new URL(String(input)); urls.push(url.href);
    const name = url.pathname.split("/").at(-1)!;
    return new Response(name === "manifest.json" ? JSON.stringify(manifest) : files.get(name)!.buffer as ArrayBuffer);
  }));
  models = await loadVoxelAssets(new URL("https://local.test/art3d/voxel/"), new AbortController().signal); vi.unstubAllGlobals();
});
afterEach(() => vi.unstubAllGlobals());

test("reviewed props load with versioned local URLs and preserve metre-scale grounding", () => {
  expect(models.size).toBe(9); expect(urls).toHaveLength(10);
  for (const url of urls) expect(new URL(url).searchParams.get("v")).toBe(VOXEL_VERSION);
  for (const [id, height] of [["anvil", 1], ["barrel", .9375], ["crate", .75], ["ore-copper", .75]] as const) {
    const level = models.get(id)!.model.levels[0], ys = Array.from({ length: level.count }, (_, i) => level.centers[i * 3 + 1]);
    expect(level.pitch).toBe(.0625); expect(Math.min(...ys) - level.pitch / 2).toBe(0); expect(Math.max(...ys) + level.pitch / 2).toBe(height);
  }
});

test("every existing anvil, supply group and ore resource resolves to a native binding", () => {
  const counts: Record<string, number> = {};
  for (const object of WORLD.objects) { const id = voxelBindingId(object); if (id) counts[id] = (counts[id] ?? 0) + 1; }
  expect(counts).toMatchObject({ tree: 240, anvil: 3, supplies: 7, "ore-copper": 12, "ore-tin": 6, "ore-iron": 6, "ore-coal": 6 });
  expect(voxelBindingId({ kind: "decor", art: "barrel" })).toBe("barrel");
  expect(voxelBindingId({ kind: "decor", art: "crate" })).toBe("crate");
  expect(voxelBindingId({ kind: "bank" })).toBeUndefined();
});

test("ore identities retain geometry while sharing a low neutral depleted model and GI state", () => {
  const copper = models.get("ore-copper")!;
  for (const id of ["ore-tin", "ore-iron", "ore-coal"]) {
    const ore = models.get(id)!; expect(ore.model.levels[0].centers).toEqual(copper.model.levels[0].centers);
    expect(ore.model.levels[0].colors).not.toEqual(copper.model.levels[0].colors); expect(ore.depleted).toBe(copper.depleted);
  }
  const depleted = copper.depleted!, level = depleted.levels[0];
  expect(Math.max(...Array.from({ length: level.count }, (_, i) => level.centers[i * 3 + 1])) + level.pitch / 2).toBe(.375);
  for (const lod of depleted.levels) expect(lod.pitch).toBeLessThanOrEqual(.25);
  const art = voxelObject(copper), material = new MeshLambertMaterial({ color: 0x888888 });
  const source = captureGIWorld([{ object: { id: "ore" }, art }], { width: 1, height: 1, terrain: ["stone"] }, { stone: material });
  expect(source.objects[0].boxes!.available.length).toBeGreaterThan(0);
  expect(source.objects[0].boxes!.depleted).not.toEqual(source.objects[0].boxes!.available); material.dispose();
});

test("supply composition retains both original props at shared pitch without overlap or per-axis scaling", () => {
  const crate = models.get("crate")!.model, barrel = models.get("barrel")!.model;
  const composite = composeVoxelModels([{ model: crate, offset: [-.5, 0, -.125] }, { model: barrel, offset: [.5, 0, .125] }]);
  const level = composite.levels[0]; expect(level.count).toBe(crate.levels[0].count + barrel.levels[0].count); expect(level.pitch).toBe(.0625);
  const xs = Array.from({ length: level.count }, (_, i) => level.centers[i * 3]);
  expect(Math.max(...xs) - Math.min(...xs) + level.pitch).toBe(1.875);
  expect(level.ao.length).toBe(level.count * 24); expect(composite.lighting.count).toBe(crate.lighting.count + barrel.lighting.count);
});

test("depleted references reject missing states, cycles and incompatible physical frames", () => {
  const base = { id: "ore", file: "ore.vox", pitch: .0625, pivot: [13, 14, 0], depletedAsset: "spent" }, spent = { id: "spent", file: "spent.vox", pitch: .0625, pivot: [13, 14, 0] };
  expect(() => voxelAssetSpecs({ assets: [base] })).toThrow(/Missing/);
  expect(() => voxelAssetSpecs({ assets: [base, { ...spent, depletedAsset: "ore" }] })).toThrow(/cyclic/);
  expect(() => voxelAssetSpecs({ assets: [base, { ...spent, pitch: .125 }] })).toThrow(/scale/);
  expect(() => voxelAssetSpecs({ assets: [{ ...base, cutHeight: .5 }, spent] })).toThrow(/depleted/);
});

test("a stale unversioned manifest cannot silently keep the old tree-only asset library", async () => {
  const fetch = vi.fn(async () => new Response(JSON.stringify({ version: "old-native-cache", assets: [] }))); vi.stubGlobal("fetch", fetch);
  await expect(loadVoxelAssets(new URL("https://local.test/art3d/voxel/"), new AbortController().signal)).rejects.toThrow(/cache version/);
  expect(fetch).toHaveBeenCalledTimes(1);
});

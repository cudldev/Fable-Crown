import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { beforeAll, expect, test, vi } from "vitest";
import { OrthographicCamera, Scene } from "three";
import { voxelAssetSpecs, voxelBindingId, voxelObject } from "../src/render/three/voxel-assets";
import type { BakedVoxelAssets } from "../src/render/three/voxel-bake";
import { VoxelBakeDecoder } from "../src/render/three/voxel-bake-decoder";
import { bakeVoxelAssets } from "../src/render/three/voxel-bake-source";
import { unpackVoxelBake } from "../src/render/three/voxel-bake-unpack";
import { VoxelMeshes } from "../src/render/three/voxel-meshes";
import { WORLD } from "../src/rpg/world";

interface BakeManifest { sourceVersion: string; decodedBytes: number; packSha256: string; assets: { id: string; size: number[] }[] }
let manifest: BakeManifest, compressed: ArrayBuffer, fresh: BakedVoxelAssets, loaded: BakedVoxelAssets;
const location = (file: string) => new URL("../public/art3d/voxel/" + file, import.meta.url);
const hash = (buffer: ArrayBuffer) => createHash("sha256").update(new Uint8Array(buffer)).digest("hex");

beforeAll(async () => {
  manifest = JSON.parse(await readFile(location("baked.json"), "utf8"));
  compressed = Uint8Array.from(await readFile(location("meshes.bin"))).buffer;
  const native = JSON.parse(await readFile(location("manifest.json"), "utf8"));
  const inputs = await Promise.all(voxelAssetSpecs(native).map(async spec => ({ spec, buffer: Uint8Array.from(await readFile(location(spec.file))).buffer })));
  expect(inputs).toHaveLength(9);
  fresh = bakeVoxelAssets(native.version, inputs);
  loaded = await unpackVoxelBake(compressed, manifest.sourceVersion, manifest.decodedBytes, manifest.packSha256);
}, 15000);

/** Exact views, while optional undefined fields may be omitted by the format. */
function sameContents(actual: unknown, expected: unknown, path = "pack", seen = new WeakSet<object>()) {
  if (expected === undefined) { expect(actual, path).toBeUndefined(); return; }
  if (expected === null || typeof expected !== "object") { expect(actual, path).toBe(expected); return; }
  expect(actual, path).not.toBeNull(); expect(typeof actual, path).toBe("object");
  if (seen.has(expected)) return;
  seen.add(expected);
  if (ArrayBuffer.isView(expected)) {
    expect(actual, path).toBeInstanceOf(expected.constructor);
    const view = actual as ArrayBufferView;
    expect(view.byteLength, path).toBe(expected.byteLength);
    expect(Buffer.from(view.buffer, view.byteOffset, view.byteLength).equals(Buffer.from(expected.buffer, expected.byteOffset, expected.byteLength)), path).toBe(true);
    return;
  }
  if (Array.isArray(expected)) {
    expect(Array.isArray(actual), path).toBe(true); expect((actual as unknown[]).length, path).toBe(expected.length);
    expected.forEach((entry, index) => sameContents((actual as unknown[])[index], entry, `${path}[${index}]`, seen)); return;
  }
  const target = actual as Record<string, unknown>, reference = expected as Record<string, unknown>;
  expect(Object.keys(target).filter(key => target[key] !== undefined).sort(), path).toEqual(Object.keys(reference).filter(key => reference[key] !== undefined).sort());
  for (const key of Object.keys(reference)) sameContents(target[key], reference[key], path + "." + key, seen);
}

test("all nine native sources and baked supplies match fresh geometry, LOD, color, AO, lighting and shadow bytes", () => {
  expect(loaded.assets).toHaveLength(10);
  expect(loaded.assets.map(({ id, size }) => ({ id, size }))).toEqual(manifest.assets);
  sameContents(loaded, fresh);
  const aliases = new Map<object, object>();
  const alias = (actual: object | undefined, expected: object | undefined) => {
    if (!expected) { expect(actual).toBeUndefined(); return; }
    expect(actual).toBeDefined();
    if (aliases.has(expected)) expect(actual).toBe(aliases.get(expected)); else aliases.set(expected, actual!);
  };
  for (let asset = 0; asset < fresh.assets.length; asset++) {
    for (const state of ["model", "depleted"] as const) {
      const expected = fresh.assets[asset].voxels[state], actual = loaded.assets[asset].voxels[state]; alias(actual, expected);
      if (!expected || !actual) continue;
      for (let lod = 0; lod < expected.levels.length; lod++) {
        alias(actual.levels[lod], expected.levels[lod]); alias(actual.surfaces![lod], expected.surfaces![lod]);
        alias(actual.surfaces![lod].shadow, expected.surfaces![lod].shadow);
        alias(actual.shadowSurfaces?.[lod], expected.shadowSurfaces?.[lod]);
        for (const key of ["centers", "colors", "ao"] as const) alias(actual.levels[lod][key], expected.levels[lod][key]);
        for (const key of ["positions", "normals", "colors", "ao", "indices"] as const) alias(actual.surfaces![lod][key], expected.surfaces![lod][key]);
      }
      alias(actual.lighting, expected.lighting);
    }
  }
  const byId = new Map(loaded.assets.map(asset => [asset.id, asset.voxels]));
  for (const ore of ["ore-copper", "ore-tin", "ore-iron", "ore-coal"]) expect(byId.get(ore)!.depleted).toBe(byId.get("ore-depleted")!.model);
  expect(byId.get("tree")!.depleted!.levels[3]).toBe(byId.get("tree")!.depleted!.levels[4]);
  expect(byId.get("tree")!.depleted!.surfaces![3]).toBe(byId.get("tree")!.depleted!.surfaces![4]);
});

test("binding the real world retains exactly 37 shared templates through mesh warmup", () => {
  const byId = new Map(loaded.assets.map(asset => [asset.id, asset.voxels])), scene = new Scene(), renderer = new VoxelMeshes(scene);
  const surfaces = new Set<object>();
  const entries = WORLD.objects.flatMap(object => {
    const binding = voxelBindingId(object); if (!binding) return [];
    const voxels = byId.get(binding)!;
    for (const model of [voxels.model, voxels.depleted]) for (const surface of model?.surfaces ?? []) surfaces.add(surface);
    const art = voxelObject(voxels); art.group.position.set(object.position.x, 0, object.position.y); scene.add(art.group); return [{ art }];
  });
  try {
    expect(surfaces.size).toBe(37); renderer.replace(entries);
    const end = renderer.beginWarmup();
    const camera = new OrthographicCamera(-5, 5, 5, -5, .1, 200); camera.position.set(10000, 20, 10000); camera.lookAt(10000, 0, 10000); camera.updateMatrixWorld();
    renderer.update(camera, 844, undefined, 0);
    expect(renderer.stats.templates).toBe(37); expect(renderer.stats.templateBuilds).toBe(37);
    end(); renderer.update(camera, 844, undefined, 16);
    expect(renderer.stats.templates).toBe(37); expect(renderer.stats.templateBuilds).toBe(37);
    expect(renderer.stats.queued).toBe(0);
  } finally { renderer.dispose(); }
});

test("compressed bake rejects content bitflips, truncated gzip, stale source and declared decoded-size mismatches", async () => {
  const bad = compressed.slice(0); new Uint8Array(bad)[Math.floor(bad.byteLength / 2)] ^= 1;
  await expect(unpackVoxelBake(bad, manifest.sourceVersion, manifest.decodedBytes, manifest.packSha256)).rejects.toThrow(/hash/);
  const truncated = compressed.slice(0, compressed.byteLength - 8);
  await expect(unpackVoxelBake(truncated, manifest.sourceVersion, manifest.decodedBytes, hash(truncated))).rejects.toThrow();
  await expect(unpackVoxelBake(compressed, "old-native-version", manifest.decodedBytes, manifest.packSha256)).rejects.toThrow(/version/);
  await expect(unpackVoxelBake(compressed, manifest.sourceVersion, manifest.decodedBytes - 1, manifest.packSha256)).rejects.toThrow(/expanded beyond/);
  await expect(unpackVoxelBake(compressed, manifest.sourceVersion, manifest.decodedBytes + 1, manifest.packSha256)).rejects.toThrow(/size differs/);
  await expect(unpackVoxelBake(compressed, manifest.sourceVersion, 64 * 1024 * 1024 + 1, manifest.packSha256)).rejects.toThrow(/envelope/);
});

test("abort terminates the bake-only worker, rejects pending work and ignores late transport replies", async () => {
  class BakeTransport {
    static latest: BakeTransport; terminated = false; onmessage?: (event: { data: unknown }) => void; onerror?: () => void;
    messages: unknown[] = []; transfers: unknown[] = [];
    constructor(readonly url: URL) { BakeTransport.latest = this; }
    postMessage(message: unknown, transfer: unknown[]) { this.messages.push(message); this.transfers.push(transfer); }
    terminate() { this.terminated = true; }
  }
  vi.stubGlobal("Worker", BakeTransport);
  try {
    const controller = new AbortController(), decoder = new VoxelBakeDecoder(controller.signal), transport = BakeTransport.latest, input = new ArrayBuffer(8);
    expect(transport.url.pathname).toMatch(/voxel-bake\.worker\.ts$/);
    const request = decoder.decode(input, manifest.sourceVersion, manifest.decodedBytes, manifest.packSha256);
    expect(transport.messages).toEqual([{ buffer: input, sourceVersion: manifest.sourceVersion, decodedBytes: manifest.decodedBytes, sha256: manifest.packSha256 }]);
    expect(transport.transfers).toEqual([[input]]);
    await expect(decoder.decode(new ArrayBuffer(1), manifest.sourceVersion, manifest.decodedBytes, manifest.packSha256)).rejects.toThrow(/sequential/);
    const rejected = expect(request).rejects.toMatchObject({ name: "AbortError" }); controller.abort(); await rejected;
    expect(transport.terminated).toBe(true); transport.onmessage?.({ data: loaded }); decoder.dispose();
    await expect(decoder.decode(new ArrayBuffer(1), manifest.sourceVersion, manifest.decodedBytes, manifest.packSha256)).rejects.toMatchObject({ name: "AbortError" });
    expect(() => new VoxelBakeDecoder(controller.signal)).toThrow();
  } finally { vi.unstubAllGlobals(); }
});

import { expect, test, vi } from "vitest";
import { readFile } from "node:fs/promises";
import { InstancedMesh, OrthographicCamera, Scene } from "three";
import { VoxelBuckets } from "../src/render/three/voxel-buckets";
import { voxelObject } from "../src/render/three/voxel-assets";
import { parseVox, voxelModel, type VoxelGrid } from "../src/render/three/voxel-data";
import { decodeVoxelAsset } from "../src/render/three/voxel-decode";
import { VoxelAssetDecoder } from "../src/render/three/voxel-decoder";

const model = () => voxelModel({ size: [40, 40, 40], cells: new Uint8Array(40 ** 3).fill(1), palette: new Uint8Array([125, 150, 80, 255]) } satisfies VoxelGrid, .0625, [20, 20, 0]);
const camera = () => { const c = new OrthographicCamera(-5, 5, 5, -5, .1, 200); c.position.set(2, 20, 2); c.up.set(0, 0, -1); c.lookAt(2, 0, 2); c.updateMatrixWorld(); return c; };
const meshes = (scene: Scene) => scene.children.filter(node => node instanceof InstancedMesh && node.visible) as InstancedMesh[];
const settle = (buckets: VoxelBuckets, c: OrthographicCamera) => {
  let frames = 0;
  do { buckets.update(c, 2000); expect(buckets.stats.committed).toBeLessThanOrEqual(1); frames++; } while (buckets.stats.queued && frames < 200);
  expect(buckets.stats.queued).toBe(0); return frames;
};

test("runtime stages large LODs across frames, retains the old batch, and matches immediate attributes", () => {
  const clock = vi.spyOn(performance, "now").mockReturnValue(0);
  const source = model(), scene = new Scene(), art = voxelObject({ model: source }); art.group.position.x = 2; scene.add(art.group);
  const buckets = new VoxelBuckets(scene, 48, 100000, 250000, true), c = camera();
  try {
    buckets.replace([{ art }]); buckets.update(c, 2000);
    expect(buckets.stats.queued).toBe(1); expect(buckets.stats.instances).toBe(source.levels[4].count);
    const coarse = meshes(scene)[0];
    expect(settle(buckets, c)).toBeGreaterThan(0);
    expect(meshes(scene)).toHaveLength(1); expect(meshes(scene)[0]).not.toBe(coarse);
    expect(buckets.stats.instances).toBe(source.levels[0].count);
    const referenceScene = new Scene(), immediate = new VoxelBuckets(referenceScene);
    immediate.replace([{ art }]); immediate.update(c, 2000);
    const reference = meshes(referenceScene)[0], actual = meshes(scene)[0];
    expect(actual.instanceMatrix.array).toEqual(reference.instanceMatrix.array.subarray(0, actual.instanceMatrix.array.length));
    expect(actual.instanceColor!.array).toEqual(reference.instanceColor!.array.subarray(0, actual.instanceColor!.array.length));
    for (let face = 0; face < 6; face++) expect(actual.geometry.getAttribute(`voxelAO${face}`).array).toEqual(reference.geometry.getAttribute(`voxelAO${face}`).array.subarray(0, actual.count * 4));
    immediate.dispose();
    c.left = c.bottom = -128; c.right = c.top = 128; c.updateProjectionMatrix();
    settle(buckets, c); expect(buckets.stats.instances).toBeLessThan(source.levels[0].count);
  } finally { buckets.dispose(); clock.mockRestore(); }
});

test("harvest cancels stale fine geometry immediately; hierarchy switches never draw parent and children together", () => {
  const clock = vi.spyOn(performance, "now").mockReturnValue(0), scene = new Scene(), source = model();
  const stump = voxelModel({ size: [1, 1, 1], cells: new Uint8Array([1]), palette: new Uint8Array([125, 150, 80, 255]) }, .0625, [0, 0, 0]);
  const a = voxelObject({ model: source, depleted: stump }), b = voxelObject({ model: source });
  a.group.position.x = 2; b.group.position.x = 12; scene.add(a.group, b.group);
  const buckets = new VoxelBuckets(scene, 48, 100000, 250000, true), c = camera();
  try {
    buckets.replace([{ art: a }, { art: b }]); buckets.update(c, 2000); expect(buckets.stats.queued).toBe(1);
    a.depleted.visible = true; a.available.visible = false;
    settle(buckets, c); expect(buckets.stats.instances).toBe(1); expect(meshes(scene)).toHaveLength(1);
    a.depleted.visible = false; a.available.visible = true; settle(buckets, c); expect(buckets.stats.instances).toBe(source.levels[0].count);
    c.left = c.bottom = -30; c.right = c.top = 30; c.updateProjectionMatrix();
    for (let frame = 0; frame < 30; frame++) { buckets.update(c, 100); expect(meshes(scene)).toHaveLength(1); }
    expect(buckets.stats.parentBuckets).toBe(1);
    c.position.x = 400; c.lookAt(400, 0, 2); c.updateMatrixWorld(); buckets.update(c, 2000);
    expect(buckets.stats.queued).toBe(0); expect(buckets.stats.stagedCells).toBe(0); expect(meshes(scene)).toHaveLength(0);
  } finally { buckets.dispose(); clock.mockRestore(); }
});

test("native decoding preserves all source LOD, AO and stump data", async () => {
  const buffer = Uint8Array.from(await readFile(new URL("../public/art3d/voxel/tree.vox", import.meta.url))).buffer;
  const spec = { pitch: .0625, pivot: [34, 35, 0], cutHeight: .5 }, decoded = decodeVoxelAsset(buffer, spec), grid = parseVox(buffer);
  expect(decoded.size).toEqual(grid.size);
  expect(decoded.voxels.model).toEqual(voxelModel(grid, spec.pitch, spec.pivot));
  expect(decoded.voxels.depleted).toEqual(voxelModel(grid, spec.pitch, spec.pivot, spec.cutHeight));
  expect(decoded.voxels.depleted!.levels[3]).toBe(decoded.voxels.depleted!.levels[4]);
});

test("aborting asset loading terminates in-flight decoding and rejects its promise", async () => {
  class DecoderTransport {
    static latest: DecoderTransport; terminated = false; onmessage?: (event: { data: unknown }) => void; onerror?: () => void;
    messages: unknown[] = []; constructor() { DecoderTransport.latest = this; }
    postMessage(message: unknown) { this.messages.push(message); } terminate() { this.terminated = true; }
  }
  vi.stubGlobal("Worker", DecoderTransport);
  try {
    const controller = new AbortController(), decoder = new VoxelAssetDecoder(controller.signal), transport = DecoderTransport.latest;
    const request = decoder.decode(new ArrayBuffer(8), { pitch: 1, pivot: [0, 0, 0] });
    const rejected = expect(request).rejects.toMatchObject({ name: "AbortError" }); controller.abort(); await rejected;
    expect(transport.terminated).toBe(true);
    transport.onmessage?.({ data: { voxels: "stale" } }); decoder.dispose();
    await expect(decoder.decode(new ArrayBuffer(1), { pitch: 1, pivot: [0, 0, 0] })).rejects.toMatchObject({ name: "AbortError" });
  } finally { vi.unstubAllGlobals(); }
});

import { expect, test, vi } from "vitest";
import { readFile } from "node:fs/promises";
import { InstancedMesh, Matrix4, OrthographicCamera, Scene, type InterleavedBufferAttribute } from "three";
import { fillVoxelInstances, standaloneVoxel, VoxelBuckets } from "../src/render/three/voxel-buckets";
import { voxelObject } from "../src/render/three/voxel-assets";
import { parseVox, voxelModel, type VoxelGrid } from "../src/render/three/voxel-data";
import { decodeVoxelAsset } from "../src/render/three/voxel-decode";
import { VoxelAssetDecoder } from "../src/render/three/voxel-decoder";

const model = (n = 80) => voxelModel({ size: [n, n, n], cells: new Uint8Array(n ** 3).fill(1), palette: new Uint8Array([125, 150, 80, 255]) } satisfies VoxelGrid, .0625, [n / 2, n / 2, 0]);
const camera = () => { const c = new OrthographicCamera(-5, 5, 5, -5, .1, 200); c.position.set(2, 20, 2); c.up.set(0, 0, -1); c.lookAt(2, 0, 2); c.updateMatrixWorld(); return c; };
const meshes = (scene: Scene) => scene.children.filter(node => node instanceof InstancedMesh && node.visible) as InstancedMesh[];
const sameBytes = (a: ArrayBufferView, b: ArrayBufferView) => Buffer.from(a.buffer, a.byteOffset, a.byteLength).equals(Buffer.from(b.buffer, b.byteOffset, b.byteLength));
class Frames {
  now = 0;
  tick(buckets: VoxelBuckets, c: OrthographicCamera, height = 2000) { this.now += 16; buckets.update(c, height, undefined, this.now); }
}
const settle = (buckets: VoxelBuckets, c: OrthographicCamera, clock: Frames, height = 2000) => {
  let frames = 0;
  do { clock.tick(buckets, c, height); expect(buckets.stats.committed).toBeLessThanOrEqual(1); frames++; } while ((buckets.stats.queued || buckets.stats.transitions) && frames < 200);
  expect(buckets.stats.queued).toBe(0); expect(buckets.stats.transitions).toBe(0); return frames;
};

test("runtime stages large LODs across frames, retains the old batch, and matches immediate attributes", () => {
  const clock = vi.spyOn(performance, "now").mockReturnValue(0);
  const source = model(), scene = new Scene(), art = voxelObject({ model: source }); art.group.position.x = 2; scene.add(art.group);
  const buckets = new VoxelBuckets(scene, 48, 100000, 250000, true), c = camera(), frames = new Frames();
  try {
    buckets.replace([{ art }]); frames.tick(buckets, c);
    expect(buckets.stats.queued).toBe(1); expect(buckets.stats.instances).toBeLessThan(source.levels[0].count);
    const coarse = meshes(scene)[0];
    expect(settle(buckets, c, frames)).toBeGreaterThan(8);
    expect(meshes(scene)).toHaveLength(1); expect(meshes(scene)[0]).not.toBe(coarse);
    expect(buckets.stats.instances).toBe(source.levels[0].count);
    const referenceScene = new Scene(), immediate = new VoxelBuckets(referenceScene);
    immediate.replace([{ art }]); immediate.update(c, 2000);
    const reference = meshes(referenceScene)[0], actual = meshes(scene)[0];
    expect(sameBytes(actual.instanceMatrix.array, reference.instanceMatrix.array.subarray(0, actual.instanceMatrix.array.length))).toBe(true);
    expect(sameBytes(actual.instanceColor!.array, reference.instanceColor!.array.subarray(0, actual.instanceColor!.array.length))).toBe(true);
    const actualAO = actual.geometry.getAttribute("voxelAO0") as InterleavedBufferAttribute;
    const referenceAO = reference.geometry.getAttribute("voxelAO0") as InterleavedBufferAttribute;
    expect(sameBytes(actualAO.array, referenceAO.array.subarray(0, actual.count * 24))).toBe(true);
    expect(sameBytes(actualAO.array, source.levels[0].ao)).toBe(true);
    for (let face = 0; face < 6; face++) {
      const attribute = actual.geometry.getAttribute(`voxelAO${face}`) as InterleavedBufferAttribute;
      expect(attribute.data).toBe(actualAO.data); expect(attribute.data.stride).toBe(24);
      expect(attribute.offset).toBe(face * 4); expect(attribute.itemSize).toBe(4); expect(attribute.normalized).toBe(true);
      for (const index of [0, 1, Math.floor(actual.count / 2), actual.count - 1]) {
        const expected = source.levels[0].ao.subarray(index * 24 + face * 4, index * 24 + face * 4 + 4);
        expect([attribute.getX(index), attribute.getY(index), attribute.getZ(index), attribute.getW(index)]).toEqual([...expected].map(value => value / 255));
      }
    }
    immediate.dispose();
    c.left = c.bottom = -128; c.right = c.top = 128; c.updateProjectionMatrix();
    settle(buckets, c, frames); expect(buckets.stats.instances).toBeLessThan(source.levels[0].count);
  } finally { buckets.dispose(); clock.mockRestore(); }
});

test("latest harvest state converges despite rapid changes; parent/child ownership stays exclusive", () => {
  const clock = vi.spyOn(performance, "now").mockReturnValue(0), scene = new Scene(), source = model();
  const stump = voxelModel({ size: [1, 1, 1], cells: new Uint8Array([1]), palette: new Uint8Array([125, 150, 80, 255]) }, .0625, [0, 0, 0]);
  const a = voxelObject({ model: source, depleted: stump }), b = voxelObject({ model: source });
  a.group.position.x = 2; b.group.position.x = 12; scene.add(a.group, b.group);
  const buckets = new VoxelBuckets(scene, 48, 100000, 250000, true), c = camera(), frames = new Frames();
  try {
    buckets.replace([{ art: a }, { art: b }]); frames.tick(buckets, c); expect(buckets.stats.queued).toBeGreaterThan(0);
    a.depleted.visible = true; a.available.visible = false;
    frames.tick(buckets, c);
    a.depleted.visible = false; a.available.visible = true; frames.tick(buckets, c);
    a.depleted.visible = true; a.available.visible = false;
    settle(buckets, c, frames); expect(buckets.stats.instances).toBe(1); expect(meshes(scene)).toHaveLength(1);
    a.depleted.visible = false; a.available.visible = true; settle(buckets, c, frames); expect(buckets.stats.instances).toBe(source.levels[0].count);
    c.left = c.bottom = -30; c.right = c.top = 30; c.updateProjectionMatrix();
    for (let frame = 0; frame < 30; frame++) {
      frames.tick(buckets, c, 100);
      expect(buckets.stats.parentBuckets).toBe(1); expect(buckets.stats.childBuckets).toBe(0);
      // Two complementary LOD meshes belong to one parent during the fade.
      expect(meshes(scene).length).toBeLessThanOrEqual(2);
    }
    settle(buckets, c, frames, 100); expect(meshes(scene)).toHaveLength(1);
    expect(buckets.stats.parentBuckets).toBe(1);
    c.position.x = 400; c.lookAt(400, 0, 2); c.updateMatrixWorld(); frames.tick(buckets, c);
    expect(buckets.stats.queued).toBe(0); expect(buckets.stats.stagedCells).toBe(0); expect(meshes(scene)).toHaveLength(0);
  } finally { buckets.dispose(); clock.mockRestore(); }
});

test("camera LOD changes let valid in-flight detail finish before following the latest target", () => {
  const time = vi.spyOn(performance, "now").mockReturnValue(0), frames = new Frames();
  const scene = new Scene(), source = model(), art = voxelObject({ model: source }), c = camera();
  const buckets = new VoxelBuckets(scene, 48, 100000, 250000, true); art.group.position.x = 2; scene.add(art.group);
  try {
    buckets.replace([{ art }]); frames.tick(buckets, c);
    expect(buckets.stats.queued).toBe(1); expect(buckets.stats.stagedCells).toBe(source.levels[0].count);
    const cancelled = buckets.stats.cancelled;
    c.left = c.bottom = -100; c.right = c.top = 100; c.updateProjectionMatrix();
    frames.tick(buckets, c);
    expect(buckets.stats.cancelled).toBe(cancelled);
    expect(meshes(scene).some(mesh => mesh.count === source.levels[0].count)).toBe(true);
    expect(buckets.stats.transitions).toBe(1);
    settle(buckets, c, frames);
    expect(buckets.stats.objectLods).toEqual([0, 1, 0, 0, 0]);
    expect(buckets.stats.instances).toBe(source.levels[1].count);
  } finally { buckets.dispose(); time.mockRestore(); }
});

test("returning to an already rendered LOD cannot repeatedly erase a partially prepared upgrade", () => {
  const time = vi.spyOn(performance, "now").mockReturnValue(0), frames = new Frames();
  const scene = new Scene(), source = model(), art = voxelObject({ model: source }), c = camera();
  art.group.position.x = 2; art.group.userData.voxelAsset = "tree"; scene.add(art.group);
  const buckets = new VoxelBuckets(scene, 48, 100000, 250000, true);
  try {
    // Start from a committed real LOD1 token, not the temporary 'coarse:' token.
    // The 37,448-cell native model needs two 32,768-cell preparation slices.
    c.left = c.bottom = -100; c.right = c.top = 100; c.updateProjectionMatrix();
    buckets.replace([{ art }]); settle(buckets, c, frames);
    expect(buckets.stats.objectLods).toEqual([0, 1, 0, 0, 0]);
    const cancelled = buckets.stats.cancelled;
    c.left = c.bottom = -5; c.right = c.top = 5; c.updateProjectionMatrix(); frames.tick(buckets, c);
    expect(buckets.stats.queued).toBe(1); expect(buckets.stats.stagedCells).toBe(source.levels[0].count);
    c.left = c.bottom = -100; c.right = c.top = 100; c.updateProjectionMatrix(); frames.tick(buckets, c);
    expect(buckets.stats.cancelled, "same-state work must survive a return to the existing LOD").toBe(cancelled);
    let fineVisible = false;
    for (let frame = 0; frame < 30; frame++) {
      const extent = frame % 2 ? 100 : 5;
      c.left = c.bottom = -extent; c.right = c.top = extent; c.updateProjectionMatrix(); frames.tick(buckets, c);
      fineVisible ||= buckets.stats.nativeTrees > 0;
      expect(buckets.stats.committed).toBeLessThanOrEqual(1);
    }
    expect(fineVisible, "intermittent close requests must accumulate enough work to display native detail").toBe(true);
    c.left = c.bottom = -5; c.right = c.top = 5; c.updateProjectionMatrix(); settle(buckets, c, frames);
    expect(buckets.stats.nativeTrees).toBe(1); expect(buckets.stats.instances).toBe(source.levels[0].count);
  } finally { buckets.dispose(); time.mockRestore(); }
});

test("a started visible upgrade finishes when camera distance makes another queued bucket closer", () => {
  const time = vi.spyOn(performance, "now").mockReturnValue(0), frames = new Frames();
  const scene = new Scene(), source = model(), a = voxelObject({ model: source }), b = voxelObject({ model: source }), c = camera();
  a.group.position.x = 2; b.group.position.x = 18; scene.add(a.group, b.group);
  c.left = c.bottom = -30; c.right = c.top = 30; c.updateProjectionMatrix();
  const buckets = new VoxelBuckets(scene, 48, 100000, 250000, true);
  try {
    buckets.replace([{ art: a }, { art: b }]); frames.tick(buckets, c);
    expect(buckets.stats.visibleBuckets).toBe(2);
    expect(buckets.stats.committed).toBe(0); expect(buckets.stats.stagedCells).toBe(source.levels[0].count);
    // Both remain visible and ask for the same detail. Only queue priority changes.
    c.position.x = 18; c.lookAt(18, 0, 2); c.updateMatrixWorld(); frames.tick(buckets, c);
    expect(buckets.stats.committed, "finish the existing partial buffer before starting another visible one").toBe(1);
    expect(buckets.stats.stagedCells).toBe(0);
    expect(meshes(scene).some(mesh => mesh.count === source.levels[0].count)).toBe(true);
    expect(buckets.stats.cancelled).toBe(0);
    settle(buckets, c, frames);
    expect(buckets.stats.instances).toBe(2 * source.levels[0].count);
  } finally { buckets.dispose(); time.mockRestore(); }
});

test("a tree crossing the frustum edge cannot reset the fine neighbour in its batch", () => {
  const time = vi.spyOn(performance, "now").mockReturnValue(0), frames = new Frames();
  const scene = new Scene(), source = model(40), a = voxelObject({ model: source }), b = voxelObject({ model: source }), c = camera();
  a.group.position.x = 1.8; b.group.position.x = 3.6;
  a.group.userData.voxelAsset = b.group.userData.voxelAsset = "tree"; scene.add(a.group, b.group);
  c.left = c.bottom = -1.5; c.right = c.top = 1.5; c.updateProjectionMatrix();
  const buckets = new VoxelBuckets(scene, 48, 100000, 250000, true);
  try {
    buckets.replace([{ art: a }, { art: b }]); settle(buckets, c, frames);
    expect(buckets.stats.visibleObjects).toBe(2); expect(buckets.stats.nativeTrees).toBe(2);
    const fine = meshes(scene)[0], uploads = buckets.stats.uploads, cancelled = buckets.stats.cancelled;
    c.position.x = .1; c.lookAt(.1, 0, 2); c.updateMatrixWorld(); frames.tick(buckets, c);
    expect(buckets.stats.visibleObjects).toBe(1); expect(buckets.stats.nativeTrees).toBe(1);
    expect(meshes(scene)).toEqual([fine]); expect(buckets.stats.transitions).toBe(0);
    expect(buckets.stats.uploads).toBe(uploads); expect(buckets.stats.cancelled).toBe(cancelled); expect(buckets.stats.queued).toBe(0);
  } finally { buckets.dispose(); time.mockRestore(); }
});

test("disposal releases pending buffers and fading meshes exactly once", () => {
  const time = vi.spyOn(performance, "now").mockReturnValue(0), frames = new Frames(), scene = new Scene(), source = model();
  const a = voxelObject({ model: source }), b = voxelObject({ model: source }); a.group.position.x = 2; b.group.position.x = 12; scene.add(a.group, b.group);
  const c = camera(); c.left = c.bottom = -20; c.right = c.top = 20; c.updateProjectionMatrix();
  const buckets = new VoxelBuckets(scene, 48, 100000, 250000, true), disposed = new Set<InstancedMesh>();
  const original = InstancedMesh.prototype.dispose;
  const dispose = vi.spyOn(InstancedMesh.prototype, "dispose").mockImplementation(function (this: InstancedMesh) { expect(disposed.has(this)).toBe(false); disposed.add(this); original.call(this); });
  try {
    buckets.replace([{ art: a }, { art: b }]); frames.tick(buckets, c);
    const visible = meshes(scene).length; expect(buckets.stats.stagedCells).toBeGreaterThan(0);
    buckets.dispose(); expect(meshes(scene)).toHaveLength(0);
    expect(disposed.size).toBeGreaterThan(visible);
    const calls = disposed.size; buckets.dispose(); expect(disposed.size).toBe(calls);
  } finally { dispose.mockRestore(); time.mockRestore(); }
});

test("direct instance writes match affine Matrix4 composition including shear and reflection", () => {
  const source = model(3).levels[0], mesh = standaloneVoxel(source);
  const root = new Matrix4().set(.8,.12,-.4,3.5, -.3,1.3,.05,2.1, .2,-.15,-.7,-4.2, 0,0,0,1);
  try {
    fillVoxelInstances(mesh, [{ level: source, matrix: root }]);
    for (let i = 0; i < source.count; i++) {
      const expected = new Matrix4().makeScale(source.pitch, source.pitch, source.pitch)
        .setPosition(source.centers[i*3], source.centers[i*3+1], source.centers[i*3+2]).premultiply(root);
      expect(mesh.instanceMatrix.array.slice(i*16,i*16+16)).toEqual(new Float32Array(expected.elements));
    }
    expect(mesh.instanceColor!.array).toEqual(source.colors);
  } finally { mesh.dispose(); mesh.geometry.dispose(); if (!Array.isArray(mesh.material)) mesh.material.dispose(); }
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

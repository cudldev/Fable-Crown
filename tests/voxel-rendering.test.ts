import { describe, expect, test } from "vitest";
import { readFile } from "node:fs/promises";
import { Group, InstancedMesh, Matrix4, OrthographicCamera, PerspectiveCamera, Scene, Vector3 } from "three";
import { parseVox, surfaceLevel, voxelModel, type VoxelGrid } from "../src/render/three/voxel-data";
import { cellPixels, chooseVoxelLod, fillVoxelInstances, standaloneVoxel, voxelBucketKey, VoxelBuckets, VOXEL_RESIDENT_CELL_BUDGET } from "../src/render/three/voxel-buckets";
import { voxelAssetSpecs, voxelObject } from "../src/render/three/voxel-assets";

const solid = (n = 4): VoxelGrid => ({ size: [n, n, n], cells: new Uint8Array(n ** 3).fill(1), palette: new Uint8Array([255, 0, 0, 255]) });
const camera = () => { const c = new OrthographicCamera(-12, 12, 12, -12, .1, 200); c.position.set(0, 10, 15); c.lookAt(0, 0, 0); c.updateMatrixWorld(); return c; };

describe("native voxel rendering", () => {
  test("loads the accepted VOX source; rejects truncation and malformed cells", async () => {
    const bytes = Uint8Array.from(await readFile(new URL("../public/art3d/voxel/tree.vox", import.meta.url)));
    const grid = parseVox(bytes.buffer);
    expect(grid.size).toEqual([68, 70, 64]); expect(grid.cells.filter(Boolean)).toHaveLength(31522);
    const model = voxelModel(grid, .0625, [34, 35, 0]);
    expect(model.levels[0].count).toBeGreaterThan(model.levels[1].count); expect(model.levels[1].count).toBeGreaterThan(model.levels[2].count);
    expect(() => parseVox(bytes.slice(0, -1).buffer)).toThrow();
    const invalid = bytes.slice(); const at = Buffer.from(invalid).indexOf("XYZI") + 16;
    invalid[at] = 255; expect(() => parseVox(invalid.buffer)).toThrow(/coordinate/);
    const duplicate = bytes.slice(); duplicate.set(duplicate.slice(at, at + 4), at + 4);
    expect(() => parseVox(duplicate.buffer)).toThrow(/Repeated/);
  });

  test("omits fully enclosed cubes, keeps cavity walls and uses linear material colors", () => {
    const grid = solid(3); expect(surfaceLevel(grid, 1, [0, 0, 0]).count).toBe(26);
    grid.cells[13] = 0; expect(surfaceLevel(grid, 1, [0, 0, 0]).count).toBe(26);
    const large = solid(5); large.cells[(2 * 5 + 2) * 5 + 2] = 0;
    expect(surfaceLevel(large, 1, [0, 0, 0]).count).toBe(104);
    const level = surfaceLevel(solid(1), .0625, [0, 0, 0]);
    expect([...level.colors]).toEqual([1, 0, 0]); expect([...level.centers]).toEqual([.03125, .03125, -.03125]);
  });

  test("LOD changes cell pitch without changing a grid-aligned object's physical bounds/ground", () => {
    const model = voxelModel(solid(), .25, [2, 2, 0]);
    expect(model.levels.map(l => l.count)).toEqual([56, 8, 1, 1, 1]);
    for (const level of model.levels) {
      const ys = Array.from({ length: level.count }, (_, i) => level.centers[i * 3 + 1]);
      expect(Math.min(...ys) - level.pitch / 2).toBe(0); expect(Math.max(...ys) + level.pitch / 2).toBe(1);
    }
    const stump = voxelModel(solid(), .25, [2, 2, 0], .5);
    expect(Math.max(...Array.from({ length: stump.levels[0].count }, (_, i) => stump.levels[0].centers[i * 3 + 1])) + .125).toBe(.5);
  });

  test("selection uses screen size in both camera modes, with hysteresis", () => {
    expect([4, .7, .2, .05].map(px => chooseVoxelLod(px))).toEqual([0, 1, 2, 4]);
    expect(chooseVoxelLod(.05, -1, 2)).toBe(2);
    expect(chooseVoxelLod(.7, 0)).toBe(0); expect(chooseVoxelLod(.65, 0)).toBe(1);
    expect(chooseVoxelLod(.8, 1)).toBe(1); expect(chooseVoxelLod(.84, 1)).toBe(0);
    for (const pixels of [.1, .2, .4, .7, 1.2]) expect(pixels * 2 ** chooseVoxelLod(pixels)).toBeLessThanOrEqual(1.5);
    const ortho = camera(); expect(cellPixels(ortho, 480, .1, new Vector3())).toBeCloseTo(2);
    const perspective = new PerspectiveCamera(30, 1, .1, 1000); perspective.position.z = 10; perspective.updateMatrixWorld();
    const near = cellPixels(perspective, 480, .1, new Vector3());
    // Equal camera depth projects equally, including off-axis objects.
    expect(cellPixels(perspective, 480, .1, new Vector3(8, 0, 0))).toBeCloseTo(near);
    perspective.position.z = 20; perspective.updateMatrixWorld();
    expect(cellPixels(perspective, 480, .1, new Vector3())).toBeCloseTo(near / 2);
  });

  test("near and far objects in the same batch select detail independently", () => {
    const scene = new Scene(), renderer = new VoxelBuckets(scene);
    const c = new PerspectiveCamera(90, 1, .1, 100);
    c.position.set(2, .5, 10); c.lookAt(2, .5, 0); c.updateMatrixWorld();
    const model = voxelModel(solid(16), .0625, [8, 8, 0]);
    const near = voxelObject({ model }), far = voxelObject({ model });
    near.group.position.set(2, 0, 7); far.group.position.set(2, 0, 1); scene.add(near.group, far.group);
    renderer.replace([{ art: near }, { art: far }]); renderer.update(c, 80);
    expect(renderer.stats.visibleBuckets).toBe(1);
    expect(renderer.stats.instances).toBe(model.levels[0].count + model.levels[2].count);
    const mesh = scene.children.find(node => node instanceof InstancedMesh) as InstancedMesh;
    const matrix = new Matrix4(); mesh.getMatrixAt(0, matrix);
    expect(new Vector3().setFromMatrixScale(matrix).x).toBeCloseTo(.0625);
    mesh.getMatrixAt(model.levels[0].count, matrix);
    expect(new Vector3().setFromMatrixScale(matrix).x).toBeCloseTo(.25);
    const uploads = renderer.stats.uploads;
    renderer.update(c, 80); expect(renderer.stats.uploads).toBe(uploads);
    renderer.dispose();
  });

  test("budget-forced detail recovers immediately when pressure clears", () => {
    const scene = new Scene(), renderer = new VoxelBuckets(scene, 48, 50000, 400), c = camera();
    const model = voxelModel(solid(16), .0625, [8, 8, 0]);
    const a = voxelObject({ model }), b = voxelObject({ model }); b.group.position.x = 2; scene.add(a.group, b.group);
    renderer.replace([{ art: a }, { art: b }]); renderer.update(c, 192);
    expect(renderer.stats.instances).toBe(model.levels[2].count + model.levels[1].count);
    const uploads = renderer.stats.uploads;
    renderer.update(c, 192); expect(renderer.stats.uploads).toBe(uploads);
    b.group.visible = false; renderer.update(c, 192);
    expect(renderer.stats.instances).toBe(model.levels[1].count);
    renderer.dispose();
  });

  test("off-screen objects in a visible child bucket cannot spend foreground detail", () => {
    const model = voxelModel(solid(16), .0625, [8, 8, 0]);
    const scene = new Scene(), renderer = new VoxelBuckets(scene, 48, 50000, model.levels[0].count);
    const c = new OrthographicCamera(-1, 1, 1, -1, .1, 100);
    c.position.set(2, 20, 2); c.up.set(0, 0, -1); c.lookAt(2, 0, 2); c.updateMatrixWorld();
    const a = voxelObject({ model }), b = voxelObject({ model });
    a.group.position.set(2, 0, 2); b.group.position.set(7, 0, 2); scene.add(a.group, b.group);
    renderer.replace([{ art: a }, { art: b }]); renderer.update(c, 800);
    expect(renderer.stats.visibleBuckets).toBe(1); expect(renderer.stats.visibleObjects).toBe(1);
    expect(renderer.stats.instances).toBe(model.levels[0].count);
    expect(renderer.stats.requestedCells).toBe(model.levels[0].count);
    expect(renderer.stats.budgetCoarsenedObjects).toBe(0);
    expect(renderer.stats.objectLods).toEqual([1, 0, 0, 0, 0]);
    c.position.x = 7; c.lookAt(7, 0, 2); c.updateMatrixWorld(); renderer.update(c, 800);
    expect(renderer.stats.visibleObjects).toBe(1); expect(renderer.stats.instances).toBe(model.levels[0].count);
    const uploads = renderer.stats.uploads; renderer.update(c, 800); expect(renderer.stats.uploads).toBe(uploads);
    renderer.dispose();
  });

  test("scaled objects use their transformed cell pitch within shared batches", () => {
    const scene = new Scene(), renderer = new VoxelBuckets(scene), c = camera();
    const model = voxelModel(solid(16), .0625, [8, 8, 0]);
    const a = voxelObject({ model }), b = voxelObject({ model });
    b.group.position.x = 2; b.group.scale.setScalar(2); scene.add(a.group, b.group);
    renderer.replace([{ art: a }, { art: b }]); renderer.update(c, 192);
    expect(renderer.stats.visibleBuckets).toBe(1);
    expect(renderer.stats.instances).toBe(model.levels[1].count + model.levels[0].count);
    renderer.dispose();
  });

  test("buckets handle negative coordinates and do not reupload unchanged instances", () => {
    expect(voxelBucketKey(-.1, -16)).toBe("-1:-1"); expect(voxelBucketKey(16, 0)).toBe("1:0");
    const scene = new Scene(), renderer = new VoxelBuckets(scene), c = camera();
    const model = voxelModel(solid(), .25, [2, 2, 0]);
    const art = voxelObject({ model, depleted: voxelModel(solid(), .25, [2, 2, 0], .5) }); scene.add(art.group);
    renderer.replace([{ art }]); renderer.update(c, 480);
    expect(renderer.stats.visibleBuckets).toBe(1); const initial = renderer.stats.uploads, count = renderer.stats.instances;
    renderer.update(c, 480); expect(renderer.stats.uploads).toBe(initial);
    art.available.visible = false; art.depleted.visible = true; renderer.update(c, 480);
    expect(renderer.stats.uploads).toBe(initial + 1); expect(renderer.stats.instances).toBeLessThan(count);
    c.position.set(500, 10, 500); c.lookAt(500, 0, 490); c.updateMatrixWorld(); renderer.update(c, 480);
    expect(renderer.stats.visibleBuckets).toBe(0); renderer.dispose();
  });

  test("distant levels reduce the real oak while harvested stumps stay grounded and short", async () => {
    const grid = parseVox(Uint8Array.from(await readFile(new URL("../public/art3d/voxel/tree.vox", import.meta.url))).buffer);
    const model = voxelModel(grid, .0625, [34, 35, 0]);
    expect(model.levels).toHaveLength(5);
    expect(model.levels[3].count).toBeLessThan(model.levels[2].count / 2);
    expect(model.levels[4].count).toBeLessThan(model.levels[3].count / 2);
    const stump = voxelModel(grid, .0625, [34, 35, 0], .5);
    for (const level of stump.levels) for (let i = 0; i < level.count; i++) {
      expect(level.centers[i * 3 + 1] - level.pitch / 2).toBeGreaterThanOrEqual(0);
      expect(level.centers[i * 3 + 1] + level.pitch / 2).toBeLessThanOrEqual(.5);
    }
  });

  test("the view-wide budget coarsens multiple buckets without hiding them or reuploading a stable view", () => {
    const scene = new Scene(), renderer = new VoxelBuckets(scene, 1, 50000, 40), c = camera();
    c.left = -40; c.right = 40; c.updateProjectionMatrix();
    const model = voxelModel(solid(16), .0625, [8, 8, 0]);
    const objects = [-20, 0, 20].map(x => { const art = voxelObject({ model }); art.group.position.x = x; scene.add(art.group); return { art }; });
    renderer.replace(objects); renderer.update(c, 800);
    expect(renderer.stats.visibleBuckets).toBe(3);
    expect(renderer.stats.instances).toBeGreaterThan(0); expect(renderer.stats.instances).toBeLessThanOrEqual(40);
    expect(renderer.stats.budgetExceeded).toBe(false);
    const uploads = renderer.stats.uploads;
    renderer.update(c, 800); expect(renderer.stats.uploads).toBe(uploads);
    renderer.dispose();
  });

  test("reports an impossible budget and retains objects; hidden groups use no budget", () => {
    const scene = new Scene(), renderer = new VoxelBuckets(scene, 1, 50000, 0), c = camera();
    const art = voxelObject({ model: voxelModel(solid(1), .0625, [0, 0, 0]) }); scene.add(art.group);
    renderer.replace([{ art }]); renderer.update(c, 480);
    expect(renderer.stats.instances).toBe(1); expect(renderer.stats.budgetExceeded).toBe(true);
    art.group.visible = false; renderer.update(c, 480);
    expect(renderer.stats.instances).toBe(0); expect(renderer.stats.budgetExceeded).toBe(false);
    renderer.dispose();
  });

  test("nested buckets cull children nearby and merge the same objects once at distance", () => {
    const scene = new Scene(), renderer = new VoxelBuckets(scene, 1), c = new OrthographicCamera(-2, 2, 2, -2, .1, 100);
    c.position.set(2, 20, 2); c.up.set(0, 0, -1); c.lookAt(2, 0, 2); c.updateMatrixWorld();
    const model = voxelModel(solid(1), .0625, [0, 0, 0]);
    const a = voxelObject({ model }), b = voxelObject({ model });
    a.group.position.set(2, 0, 2); b.group.position.set(12, 0, 2); scene.add(a.group, b.group);
    renderer.replace([{ art: a }, { art: b }]); renderer.update(c, 800);
    expect(renderer.stats.childBuckets).toBe(1); expect(renderer.stats.parentBuckets).toBe(0);
    expect(renderer.stats.instances).toBe(1);
    c.left = c.bottom = -20; c.right = c.top = 20; c.updateProjectionMatrix(); renderer.update(c, 100);
    expect(renderer.stats.parentBuckets).toBe(1); expect(renderer.stats.childBuckets).toBe(0);
    expect(renderer.stats.instances).toBe(2); expect(renderer.stats.residentBuckets).toBe(1);
    expect(scene.children.filter(node => node instanceof InstancedMesh && node.visible)).toHaveLength(1);
    c.left = c.bottom = -2; c.right = c.top = 2; c.updateProjectionMatrix(); renderer.update(c, 800);
    expect(renderer.stats.childBuckets).toBe(1); expect(renderer.stats.instances).toBe(1);
    expect(scene.children.filter(node => node instanceof InstancedMesh && node.visible)).toHaveLength(1);
    renderer.dispose();
  });

  test("zooming out releases large buffers and zooming back restores fine detail", () => {
    const scene = new Scene(), renderer = new VoxelBuckets(scene), c = camera();
    const art = voxelObject({ model: voxelModel(solid(16), .0625, [8, 8, 0]) }); scene.add(art.group);
    renderer.replace([{ art }]); renderer.update(c, 800);
    const closeInstances = renderer.stats.instances, closeCapacity = renderer.stats.residentCells;
    expect(renderer.stats.lod0).toBe(1);
    c.left = c.bottom = -128; c.right = c.top = 128; c.updateProjectionMatrix(); renderer.update(c, 800);
    expect(renderer.stats.residentCells).toBeLessThan(closeCapacity / 4);
    expect(renderer.stats.instances).toBeLessThan(closeInstances);
    c.left = c.bottom = -12; c.right = c.top = 12; c.updateProjectionMatrix(); renderer.update(c, 800);
    expect(renderer.stats.lod0).toBe(1); expect(renderer.stats.instances).toBe(closeInstances);
    renderer.dispose();
  });

  test("panning streams batches under the resident cell limit even below the bucket-count limit", () => {
    const scene = new Scene(), renderer = new VoxelBuckets(scene, 48), c = camera();
    c.left = c.bottom = -5; c.right = c.top = 5; c.updateProjectionMatrix();
    const model = voxelModel(solid(64), .0625, [32, 32, 0]);
    const objects = Array.from({ length: 20 }, (_, i) => {
      const art = voxelObject({ model }); art.group.position.x = i * 48; scene.add(art.group); return { art };
    });
    renderer.replace(objects);
    for (let i = 0; i < objects.length; i++) {
      c.position.set(i * 48, 10, 15); c.lookAt(i * 48, 0, 0); c.updateMatrixWorld(); renderer.update(c, 2000);
      expect(renderer.stats.visibleBuckets).toBe(1);
      expect(renderer.stats.residentCells).toBeLessThanOrEqual(VOXEL_RESIDENT_CELL_BUDGET);
    }
    expect(renderer.stats.residentBuckets).toBeLessThan(objects.length);
    renderer.dispose();
  });

  test("GPU instances preserve positions, scale and colors without individual scene nodes", () => {
    const level = surfaceLevel(solid(1), .5, [0, 0, 0]), mesh = standaloneVoxel(level);
    fillVoxelInstances(mesh, [{ level, matrix: new Matrix4().makeTranslation(16, 0, -8) }]);
    const transform = new Matrix4(); mesh.getMatrixAt(0, transform);
    expect(new Vector3().setFromMatrixPosition(transform).toArray()).toEqual([16.25, .25, -8.25]);
    expect(new Vector3().setFromMatrixScale(transform).toArray()).toEqual([.5, .5, .5]);
    expect(mesh.children).toHaveLength(0); mesh.dispose(); mesh.geometry.dispose();
    if (!Array.isArray(mesh.material)) mesh.material.dispose();
  });

  test("overview keeps every visible bucket even above the inactive-cache target", () => {
    const scene = new Scene(), renderer = new VoxelBuckets(scene, 1), c = camera();
    c.left = -40; c.right = 40; c.updateProjectionMatrix();
    const model = voxelModel(solid(1), .25, [0, 0, 0]);
    const a = voxelObject({ model }), b = voxelObject({ model }); b.group.position.x = 20; scene.add(a.group, b.group);
    renderer.replace([{ art: a }, { art: b }]); renderer.update(c, 480);
    expect(renderer.stats.visibleBuckets).toBe(2); expect(renderer.stats.residentBuckets).toBe(2);
    c.position.set(500, 10, 500); c.lookAt(500, 0, 490); c.updateMatrixWorld(); renderer.update(c, 480);
    expect(renderer.stats.visibleBuckets).toBe(0); expect(renderer.stats.residentBuckets).toBe(1); renderer.dispose();
  });

  test("native asset paths and dimensions cannot escape the local source directory", () => {
    const entry = { id: "tree", file: "tree.vox", pitch: .0625, pivot: [34, 35, 0] };
    expect(voxelAssetSpecs({ assets: [entry] })).toHaveLength(1);
    for (const change of [{ file: "../tree.vox" }, { file: "https://example.com/tree.vox" }, { pitch: 0 }, { pivot: [0, NaN, 0] }]) expect(() => voxelAssetSpecs({ assets: [{ ...entry, ...change }] })).toThrow();
    expect(() => voxelAssetSpecs({ assets: [entry, entry] })).toThrow();
  });
});

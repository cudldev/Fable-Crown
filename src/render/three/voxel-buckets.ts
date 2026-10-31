import { Box3, BoxGeometry, Color, Frustum, InstancedBufferAttribute, InstancedMesh, Matrix4, OrthographicCamera, PerspectiveCamera, Scene, Sphere, StaticDrawUsage, Vector3, type Camera } from "three";
import { voxelMaterial } from "./voxel-ao";
import { DEFAULT_VISUAL_SETTINGS } from "./visual-settings";
import type { ObjectArt } from "./contracts";
import type { WorldCurve } from "./world-curve";
import { VOXEL_LOD_FACTORS, type VoxelLevel, type VoxelObject } from "./voxel-data";

export const VOXEL_CHUNK_TILES = 16;
export const VOXEL_CHILD_TILES = 8;
export const VOXEL_VISIBLE_CELL_BUDGET = 250_000;
export const VOXEL_RESIDENT_CELL_BUDGET = 524_288;
export const voxelBucketKey = (x: number, z: number) => `${Math.floor(x / VOXEL_CHUNK_TILES)}:${Math.floor(z / VOXEL_CHUNK_TILES)}`;

/** Pixel-size selection handles perspective and orthographic overview; hysteresis avoids boundary chatter. */
export function chooseVoxelLod(pixels: number, previous = -1, maxLevel = VOXEL_LOD_FACTORS.length - 1): number {
  // Keep the selected cell below ~1.5 CSS pixels. Ceil selected cells up to
  // twice that size; the old broad hysteresis then held them while approaching.
  if (previous >= 0 && previous <= maxLevel && pixels * 2 ** previous >= .675 && pixels * 2 ** previous <= 1.65) return previous;
  return Math.max(0, Math.min(maxLevel, Math.floor(Math.log2(1.5 / Math.max(.00001, pixels)))));
}

export function cellPixels(camera: Camera, height: number, pitch: number, center: Vector3): number {
  if (camera instanceof OrthographicCamera) return pitch * height * camera.zoom / (camera.top - camera.bottom);
  if (camera instanceof PerspectiveCamera) {
    const m = camera.matrixWorldInverse.elements;
    const depth = -(m[2] * center.x + m[6] * center.y + m[10] * center.z + m[14]);
    return pitch * height * camera.zoom / (2 * Math.max(.01, depth) * Math.tan(camera.fov * Math.PI / 360));
  }
  return 0;
}

interface Entry { art: ObjectArt; voxel: VoxelObject; center: Vector3; bounds: Box3; scale: number; desiredLod: number }
interface BatchWork { mesh?: InstancedMesh; count: number; entries: { level: VoxelLevel; matrix: Matrix4 }[]; token: string; state: string; lod: number; objectLods: number[]; steps?: Generator<number>; complete: boolean }
interface Bucket { entries: Entry[]; center: Vector3; bounds: Box3; mesh?: InstancedMesh; token: string; state?: string; objectLods?: number[]; pending?: BatchWork; lastSeen: number; children?: Map<string, Bucket>; split: boolean }
interface LodPlan { entry: Entry; model: VoxelObject["model"] | undefined; pixels: number; lod: number; count: number; maxLod: number }

/** Spend detail on the largest projected cells first, independently of batch ownership. */
function coarsenToBudget(plans: LodPlan[], budget: number): number {
  let total = plans.reduce((sum, plan) => sum + plan.count, 0);
  while (total > budget) {
    let candidate: LodPlan | undefined, smallest = Infinity;
    for (const plan of plans) if (plan.model && plan.lod < plan.maxLod) {
      const size = plan.pixels * 2 ** plan.lod;
      if (size < smallest) { candidate = plan; smallest = size; }
    }
    if (!candidate) break;
    const count = candidate.model!.levels[++candidate.lod].count;
    total += count - candidate.count; candidate.count = count;
  }
  return total;
}
export interface VoxelStats { visibleBuckets: number; residentBuckets: number; residentCells: number; parentBuckets: number; childBuckets: number; instances: number; uploads: number; lod0: number; lod1: number; lod2: number; lod3: number; lod4: number; budgetExceeded: boolean; visibleObjects: number; nativeTrees: number; requestedCells: number; budgetCoarsenedObjects: number; objectLods: number[]; largestCellPixels: number; queued: number; stagedCells: number; committed: number; preparationMs: number }
const emptyStats = (): VoxelStats => ({ visibleBuckets: 0, residentBuckets: 0, residentCells: 0, parentBuckets: 0, childBuckets: 0, instances: 0, uploads: 0, lod0: 0, lod1: 0, lod2: 0, lod3: 0, lod4: 0, budgetExceeded: false, visibleObjects: 0, nativeTrees: 0, requestedCells: 0, budgetCoarsenedObjects: 0, objectLods: [0, 0, 0, 0, 0], largestCellPixels: 0, queued: 0, stagedCells: 0, committed: 0, preparationMs: 0 });
const newBucket = (): Bucket => ({ entries: [], center: new Vector3(), bounds: new Box3(), token: "", lastSeen: 0, split: false });

const modelBoundsCache = new WeakMap<VoxelObject["model"], Box3>();
/** Include every derived silhouette, without the old root-centred radius inflation. */
function modelBounds(model: VoxelObject["model"]): Box3 {
  let bounds = modelBoundsCache.get(model);
  if (bounds) return bounds;
  bounds = new Box3();
  const point = new Vector3();
  for (const level of model.levels) for (let i = 0; i < level.count; i++) {
    const x = level.centers[i * 3], y = level.centers[i * 3 + 1], z = level.centers[i * 3 + 2], half = level.pitch / 2;
    bounds.expandByPoint(point.set(x - half, y - half, z - half));
    bounds.expandByPoint(point.set(x + half, y + half, z + half));
  }
  modelBoundsCache.set(model, bounds); return bounds;
}

/** Same write order for immediate workbench meshes and frame-sliced runtime staging. */
function* fillVoxelInstanceSteps(mesh: InstancedMesh, entries: { level: VoxelLevel; matrix: Matrix4 }[]): Generator<number> {
  const matrix = new Matrix4(), color = new Color(); let at = 0;
  const attributes = Array.from({length: 6}, (_, face) => {
    const name = `voxelAO${face}`;
    if (!mesh.geometry.hasAttribute(name)) mesh.geometry.setAttribute(name, new InstancedBufferAttribute(new Uint8Array(mesh.instanceMatrix.count * 4).fill(255), 4, true));
    return mesh.geometry.getAttribute(name) as InstancedBufferAttribute;
  });
  for (const { level, matrix: root } of entries) for (let i = 0; i < level.count; i++) {
    matrix.makeScale(level.pitch, level.pitch, level.pitch);
    matrix.setPosition(level.centers[i * 3], level.centers[i * 3 + 1], level.centers[i * 3 + 2]);
    matrix.premultiply(root); mesh.setMatrixAt(at, matrix);
    color.setRGB(level.colors[i * 3], level.colors[i * 3 + 1], level.colors[i * 3 + 2]); mesh.setColorAt(at, color);
    for (let face = 0; face < 6; face++) for (let corner = 0; corner < 4; corner++) attributes[face].array[at * 4 + corner] = level.ao[i * 24 + face * 4 + corner];
    at++;
    if (at % 256 === 0) yield 256;
  }
  mesh.count = at; mesh.instanceMatrix.needsUpdate = true;
  if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
  attributes.forEach(attribute => { attribute.needsUpdate = true; });
  yield at % 256;
}

export function fillVoxelInstances(mesh: InstancedMesh, entries: { level: VoxelLevel; matrix: Matrix4 }[]) {
  for (const _ of fillVoxelInstanceSteps(mesh, entries)) { /* immediate workbench/reference path */ }
  mesh.computeBoundingBox(); mesh.computeBoundingSphere();
}

/** Instanced cubes, one shared geometry/material. No render objects for individual cells. */
export class VoxelBuckets {
  private geometry = new BoxGeometry(1, 1, 1);
  private aoStrength = { value: 1 };
  private aoDistance = { value: DEFAULT_VISUAL_SETTINGS.aoDistance };
  private material = voxelMaterial(this.aoStrength, this.aoDistance);
  private buckets = new Map<string, Bucket>();
  private nodes: Bucket[] = [];
  private frame = 0;
  private uploads = 0;
  stats: VoxelStats = emptyStats();
  constructor(private scene: Scene, private maxResident = 48, private targetCellsPerBucket = 100000, private visibleCellBudget = VOXEL_VISIBLE_CELL_BUDGET, private streaming = false) {}
  setAO(enabled: boolean, strength = 1, distance = DEFAULT_VISUAL_SETTINGS.aoDistance) { this.aoStrength.value = enabled ? strength : 0; this.aoDistance.value = distance; }

  replace(objects: Iterable<{ art: ObjectArt }>) {
    this.clear();
    for (const { art } of objects) {
      if (!art.voxels) continue;
      art.group.updateWorldMatrix(true, false);
      const point = art.group.getWorldPosition(new Vector3());
      const { x, z } = point, key = voxelBucketKey(x, z);
      let bucket = this.buckets.get(key);
      if (!bucket) {
        bucket = newBucket(); bucket.children = new Map();
        this.buckets.set(key, bucket); this.nodes.push(bucket);
      }
      const childKey = `${Math.floor(x / VOXEL_CHILD_TILES)}:${Math.floor(z / VOXEL_CHILD_TILES)}`;
      let child = bucket.children!.get(childKey);
      if (!child) { child = newBucket(); bucket.children!.set(childKey, child); this.nodes.push(child); }
      const scale = art.group.getWorldScale(new Vector3());
      const bounds = modelBounds(art.voxels.model).clone();
      if (art.voxels.depleted) bounds.union(modelBounds(art.voxels.depleted));
      bounds.applyMatrix4(art.group.matrixWorld);
      // Share selection history between parent and child so hierarchy changes
      // cannot reset detail. Budgets never overwrite this unforced selection.
      const entry: Entry = { art, voxel: art.voxels, center: bounds.getCenter(new Vector3()), bounds, scale: Math.max(Math.abs(scale.x), Math.abs(scale.y), Math.abs(scale.z)), desiredLod: -1 };
      for (const node of [bucket, child]) {
        node.bounds.union(bounds);
        node.bounds.getCenter(node.center); node.entries.push(entry);
      }
    }
  }

  update(camera: Camera, viewportHeight: number, curve?: WorldCurve) {
    this.frame++;
    const frustum = new Frustum().setFromProjectionMatrix(new Matrix4().multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse));
    const stats = emptyStats();
    const visible: Bucket[] = [];
    const curvedBounds = new Box3();
    const intersects = (bounds: Box3) => (!curve || curve.view.intersects(bounds)) && frustum.intersectsBox(curve ? curve.expandBounds(bounds, curvedBounds) : bounds);
    // Hierarchical culling: skip whole sectors first, then visit only their
    // intersecting 8m children nearby. Distant sectors share one coarse draw.
    for (const parent of this.buckets.values()) {
      if (!intersects(parent.bounds)) continue;
      const pixels = cellPixels(camera, viewportHeight, parent.entries[0].voxel.model.pitch, parent.center);
      parent.split = parent.children!.size > 1 && pixels > (parent.split ? .6 : .8);
      if (parent.split) {
        for (const child of parent.children!.values()) if (intersects(child.bounds)) { visible.push(child); stats.childBuckets++; }
      } else { visible.push(parent); stats.parentBuckets++; }
    }
    visible.sort((a, b) => a.center.distanceToSquared(camera.position) - b.center.distanceToSquared(camera.position));
    const active = new Set(visible);
    for (const bucket of this.nodes) {
      if (bucket.mesh) bucket.mesh.visible = active.has(bucket);
      if (!active.has(bucket)) this.cancelWork(bucket);
    }
    const plans = visible.map(bucket => {
      const objects = bucket.entries.map(entry => {
        const { art, voxel } = entry;
        // A visible bucket may contain many objects outside the actual view.
        // They must not consume detail or force foreground objects to coarsen.
        const model = !art.group.visible || !intersects(entry.bounds) ? undefined : art.depleted?.visible ? voxel.depleted : voxel.model;
        const maxLod = (model ?? voxel.model).levels.length - 1;
        const pixels = cellPixels(camera, viewportHeight, (model ?? voxel.model).pitch * entry.scale, entry.center);
        const lod = chooseVoxelLod(pixels, entry.desiredLod, maxLod);
        entry.desiredLod = lod;
        return { entry, model, pixels, lod, maxLod, count: model?.levels[lod].count ?? 0 };
      });
      stats.requestedCells += objects.reduce((sum, object) => sum + object.count, 0);
      coarsenToBudget(objects, this.targetCellsPerBucket);
      return { bucket, objects };
    });
    // A per-bucket cap alone grows with the visible world. Coarsen the least
    // screen-significant objects until the whole view fits, retaining every tree.
    const total = coarsenToBudget(plans.flatMap(plan => plan.objects), this.visibleCellBudget);
    stats.budgetExceeded = total > this.visibleCellBudget;
    for (const { bucket, objects } of plans) {
      const lod = Math.min(4, ...objects.filter(object => object.model).map(object => object.lod));
      for (const object of objects) if (object.model) {
        stats.visibleObjects++; stats.objectLods[object.lod]++;
        if (object.lod === 0 && object.entry.art.group.userData.voxelAsset === "tree") stats.nativeTrees++;
        if (object.lod > object.entry.desiredLod) stats.budgetCoarsenedObjects++;
        stats.largestCellPixels = Math.max(stats.largestCellPixels, object.pixels * object.model.levels[object.lod].pitch / object.model.pitch);
      }
      const token = objects.map(({ entry, model, lod }) => `${lod}${model === entry.voxel.model ? "a" : "d"}${model ? "v" : "h"}`).join(":");
      const state = objects.map(({ entry, model }) => `${model === entry.voxel.model ? "a" : "d"}${model ? "v" : "h"}`).join(":");
      if ((!bucket.mesh || token !== bucket.token) && (!this.streaming || bucket.pending?.token !== token)) {
        const entries = objects.flatMap(({ entry, model, lod }) => {
          const group = entry.art.group; group.updateWorldMatrix(true, false);
          return model ? [{ level: model.levels[lod], matrix: group.matrixWorld }] : [];
        });
        const count = entries.reduce((sum, entry) => sum + entry.level.count, 0);
        if (this.streaming) {
          // Coarse state-correct coverage is immediate, including harvest/restore.
          // Parent/child ownership switches in this frame; they never draw together.
          if (!bucket.mesh || state !== bucket.state) {
            this.cancelWork(bucket);
            const coarse = objects.flatMap(({ entry, model }) => model ? [{ level: model.levels.at(-1)!, matrix: entry.art.group.matrixWorld }] : []);
            const fallback = this.createMesh(coarse.reduce((sum, item) => sum + item.level.count, 0), bucket);
            for (const _ of fillVoxelInstanceSteps(fallback, coarse)) { /* small fallback only */ }
            this.replaceMesh(bucket, fallback); bucket.state = state; bucket.token = "coarse:" + state;
            bucket.objectLods = objects.map(object => object.model ? object.maxLod : -1);
            this.uploads++;
            if (objects.every(object => !object.model || object.lod === object.maxLod)) bucket.token = token;
          }
          if (bucket.token !== token && bucket.pending?.token !== token) {
            this.cancelWork(bucket);
            bucket.pending = { count, entries, token, state, lod, objectLods: objects.map(object => object.model ? object.lod : -1), complete: false };
          }
        } else {
        if (!bucket.mesh || bucket.mesh.instanceMatrix.count < count || bucket.mesh.instanceMatrix.count > Math.max(256, count * 4)) {
          if (bucket.mesh) { this.scene.remove(bucket.mesh); bucket.mesh.dispose(); bucket.mesh.geometry.dispose(); }
          bucket.mesh = new InstancedMesh(this.geometry.clone(), this.material, Math.max(1, 2 ** Math.ceil(Math.log2(Math.max(1, count)))));
          bucket.mesh.name = "voxel-chunk"; bucket.mesh.instanceMatrix.setUsage(StaticDrawUsage); this.scene.add(bucket.mesh);
        }
        fillVoxelInstances(bucket.mesh, entries); bucket.mesh.castShadow = lod === 0; bucket.mesh.receiveShadow = true;
        bucket.token = token; this.uploads++;
        }
      } else if (bucket.pending && token === bucket.token) {
        this.cancelWork(bucket);
      }
      bucket.mesh!.visible = true; bucket.lastSeen = this.frame;
      stats.visibleBuckets++; stats.instances += bucket.mesh!.count;
      if (lod === 0) stats.lod0++; else if (lod === 1) stats.lod1++; else if (lod === 2) stats.lod2++; else if (lod === 3) stats.lod3++; else stats.lod4++;
    }
    if (this.streaming) {
      const started = performance.now(); let written = 0, committed = 0;
      // Nearest-first queue; bounded CPU preparation and one final GPU admission/frame.
      for (const bucket of visible) {
        const work = bucket.pending; if (!work) continue;
        if (written >= 8192 || performance.now() - started >= 2) break;
        if (!work.mesh) {
          work.mesh = this.createMesh(work.count, bucket);
          work.steps = fillVoxelInstanceSteps(work.mesh, work.entries);
        }
        while (!work.complete && written < 8192 && performance.now() - started < 2) {
          const step = work.steps!.next(); written += step.value ?? 0; work.complete = step.done === true;
        }
        if (work.complete && !committed) {
          work.mesh.castShadow = work.lod === 0;
          this.replaceMesh(bucket, work.mesh); bucket.token = work.token; bucket.state = work.state;
          bucket.objectLods = work.objectLods; bucket.pending = undefined; committed++; this.uploads++;
        }
        if (written >= 8192 || performance.now() - started >= 2) break;
      }
      stats.preparationMs = performance.now() - started; stats.committed = committed;
      stats.instances = visible.reduce((sum, bucket) => sum + bucket.mesh!.count, 0);
      stats.budgetExceeded ||= stats.instances > this.visibleCellBudget;
      stats.queued = visible.filter(bucket => bucket.pending).length;
      stats.stagedCells = visible.reduce((sum, bucket) => sum + (bucket.pending?.mesh?.instanceMatrix.count ?? 0), 0);
      stats.lod0 = stats.lod1 = stats.lod2 = stats.lod3 = stats.lod4 = 0;
      stats.nativeTrees = stats.visibleObjects = stats.budgetCoarsenedObjects = stats.largestCellPixels = 0;
      stats.objectLods.fill(0);
      for (const { bucket, objects } of plans) {
        let finest = 4;
        objects.forEach((object, i) => {
          const rendered = bucket.objectLods?.[i] ?? -1; if (rendered < 0 || !object.model) return;
          finest = Math.min(finest, rendered); stats.visibleObjects++; stats.objectLods[rendered]++;
          if (rendered === 0 && object.entry.art.group.userData.voxelAsset === "tree") stats.nativeTrees++;
          if (rendered > object.entry.desiredLod) stats.budgetCoarsenedObjects++;
          stats.largestCellPixels = Math.max(stats.largestCellPixels, object.pixels * object.model.levels[rendered].pitch / object.model.pitch);
        });
        if (finest === 0) stats.lod0++; else if (finest === 1) stats.lod1++; else if (finest === 2) stats.lod2++; else if (finest === 3) stats.lod3++; else stats.lod4++;
      }
    }
    const resident = this.nodes.filter(bucket => bucket.mesh);
    let residentCount = resident.length, residentCells = resident.reduce((sum, bucket) => sum + bucket.mesh!.instanceMatrix.count, 0);
    for (const bucket of resident.sort((a, b) => a.lastSeen - b.lastSeen)) {
      if (residentCount <= Math.max(this.maxResident, visible.length) && residentCells + stats.stagedCells <= VOXEL_RESIDENT_CELL_BUDGET) break;
      if (!active.has(bucket)) {
        residentCount--; residentCells -= bucket.mesh!.instanceMatrix.count;
        this.scene.remove(bucket.mesh!); bucket.mesh!.dispose(); bucket.mesh!.geometry.dispose(); bucket.mesh = undefined; bucket.token = "";
      }
    }
    stats.residentBuckets = residentCount; stats.residentCells = residentCells; stats.uploads = this.uploads; this.stats = stats;
  }

  private createMesh(count: number, bucket: Bucket) {
    const mesh = new InstancedMesh(this.geometry.clone(), this.material, Math.max(1, count));
    mesh.name = "voxel-chunk"; mesh.instanceMatrix.setUsage(StaticDrawUsage); mesh.receiveShadow = true;
    // Exact cached bounds include every LOD and both states; avoid scanning matrices again.
    mesh.boundingBox = bucket.bounds.clone(); mesh.boundingSphere = bucket.bounds.getBoundingSphere(new Sphere());
    return mesh;
  }
  private replaceMesh(bucket: Bucket, mesh: InstancedMesh) {
    if (bucket.mesh) { this.scene.remove(bucket.mesh); bucket.mesh.dispose(); bucket.mesh.geometry.dispose(); }
    bucket.mesh = mesh; this.scene.add(mesh);
  }
  private cancelWork(bucket: Bucket) {
    if (!bucket.pending) return;
    bucket.pending.steps?.return(0); bucket.pending.mesh?.dispose(); bucket.pending.mesh?.geometry.dispose(); bucket.pending = undefined;
  }
  private clear() { for (const bucket of this.nodes) { this.cancelWork(bucket); if (bucket.mesh) { this.scene.remove(bucket.mesh); bucket.mesh.dispose(); bucket.mesh.geometry.dispose(); } } this.buckets.clear(); this.nodes = []; }
  dispose() { this.clear(); this.geometry.dispose(); this.material.dispose(); }
}

/** Read-only workbench uses the same cubes/linear palette, outside world chunk ownership. */
export function standaloneVoxel(level: VoxelLevel): InstancedMesh {
  const mesh = new InstancedMesh(new BoxGeometry(1, 1, 1), voxelMaterial(), Math.max(1, level.count));
  fillVoxelInstances(mesh, [{ level, matrix: new Matrix4() }]); mesh.castShadow = mesh.receiveShadow = true; return mesh;
}

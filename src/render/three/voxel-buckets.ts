import { Box3, BoxGeometry, Color, Frustum, InstancedBufferAttribute, InstancedMesh, Matrix4, OrthographicCamera, PerspectiveCamera, Scene, StaticDrawUsage, Vector3, type Camera } from "three";
import { voxelMaterial } from "./voxel-ao";
import { DEFAULT_VISUAL_SETTINGS } from "./visual-settings";
import type { ObjectArt } from "./contracts";
import { VOXEL_LOD_FACTORS, type VoxelLevel, type VoxelObject } from "./voxel-data";

export const VOXEL_CHUNK_TILES = 16;
export const VOXEL_CHILD_TILES = 8;
export const VOXEL_VISIBLE_CELL_BUDGET = 100_000;
export const VOXEL_RESIDENT_CELL_BUDGET = 262_144;
export const voxelBucketKey = (x: number, z: number) => `${Math.floor(x / VOXEL_CHUNK_TILES)}:${Math.floor(z / VOXEL_CHUNK_TILES)}`;

/** Pixel-size selection handles perspective and orthographic overview; hysteresis avoids boundary chatter. */
export function chooseVoxelLod(pixels: number, previous = -1, maxLevel = VOXEL_LOD_FACTORS.length - 1): number {
  if (previous >= 0 && previous <= maxLevel && pixels * 2 ** previous >= 1 && pixels * 2 ** previous <= 2.2) return previous;
  return Math.max(0, Math.min(maxLevel, Math.ceil(Math.log2(1.5 / Math.max(.00001, pixels)))));
}

export function cellPixels(camera: Camera, height: number, pitch: number, center: Vector3): number {
  if (camera instanceof OrthographicCamera) return pitch * height * camera.zoom / (camera.top - camera.bottom);
  if (camera instanceof PerspectiveCamera) return pitch * height * camera.zoom / (2 * Math.max(.01, camera.position.distanceTo(center)) * Math.tan(camera.fov * Math.PI / 360));
  return 0;
}

interface Entry { art: ObjectArt; voxel: VoxelObject }
interface Bucket { entries: Entry[]; center: Vector3; bounds: Box3; mesh?: InstancedMesh; lod: number; token: string; lastSeen: number; children?: Map<string, Bucket>; split: boolean }
export interface VoxelStats { visibleBuckets: number; residentBuckets: number; residentCells: number; parentBuckets: number; childBuckets: number; instances: number; uploads: number; lod0: number; lod1: number; lod2: number; lod3: number; lod4: number; budgetExceeded: boolean }
const emptyStats = (): VoxelStats => ({ visibleBuckets: 0, residentBuckets: 0, residentCells: 0, parentBuckets: 0, childBuckets: 0, instances: 0, uploads: 0, lod0: 0, lod1: 0, lod2: 0, lod3: 0, lod4: 0, budgetExceeded: false });
const newBucket = (): Bucket => ({ entries: [], center: new Vector3(), bounds: new Box3(), lod: -1, token: "", lastSeen: 0, split: false });

export function fillVoxelInstances(mesh: InstancedMesh, entries: { level: VoxelLevel; matrix: Matrix4 }[]) {
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
  }
  mesh.count = at; mesh.instanceMatrix.needsUpdate = true;
  if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
  attributes.forEach(attribute => { attribute.needsUpdate = true; });
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
  constructor(private scene: Scene, private maxResident = 48, private targetCellsPerBucket = 50000, private visibleCellBudget = VOXEL_VISIBLE_CELL_BUDGET) {}
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
      // Include coarse-grid overhang in the culling envelope as well as transformed source bounds.
      const radius = (art.voxels.model.radius + Math.sqrt(3) * art.voxels.model.levels.at(-1)!.pitch) * Math.max(Math.abs(scale.x), Math.abs(scale.y), Math.abs(scale.z));
      for (const node of [bucket, child]) {
        node.bounds.expandByPoint(point.clone().addScalar(radius)); node.bounds.expandByPoint(point.clone().addScalar(-radius));
        node.bounds.getCenter(node.center); node.entries.push({ art, voxel: art.voxels });
      }
    }
  }

  update(camera: Camera, viewportHeight: number) {
    this.frame++;
    const frustum = new Frustum().setFromProjectionMatrix(new Matrix4().multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse));
    const stats = emptyStats();
    const visible: Bucket[] = [];
    // Hierarchical culling: skip whole sectors first, then visit only their
    // intersecting 8m children nearby. Distant sectors share one coarse draw.
    for (const parent of this.buckets.values()) {
      if (!frustum.intersectsBox(parent.bounds)) continue;
      const pixels = cellPixels(camera, viewportHeight, parent.entries[0].voxel.model.pitch, parent.center);
      parent.split = parent.children!.size > 1 && pixels > (parent.split ? .6 : .8);
      if (parent.split) {
        for (const child of parent.children!.values()) if (frustum.intersectsBox(child.bounds)) { visible.push(child); stats.childBuckets++; }
      } else { visible.push(parent); stats.parentBuckets++; }
    }
    visible.sort((a, b) => a.center.distanceToSquared(camera.position) - b.center.distanceToSquared(camera.position));
    const active = new Set(visible);
    for (const bucket of this.nodes) if (bucket.mesh) bucket.mesh.visible = active.has(bucket);
    const plans = visible.map(bucket => {
      const models = bucket.entries.map(({ art, voxel }) => !art.group.visible ? undefined : art.depleted?.visible ? voxel.depleted : voxel.model);
      const maxLod = Math.min(...bucket.entries.map(entry => entry.voxel.model.levels.length - 1));
      const pixels = cellPixels(camera, viewportHeight, bucket.entries[0].voxel.model.pitch, bucket.center);
      const counts = Array.from({ length: maxLod + 1 }, (_, lod) => models.reduce((sum, model) => sum + (model?.levels[Math.min(lod, model.levels.length - 1)].count ?? 0), 0));
      let lod = chooseVoxelLod(pixels, bucket.lod, maxLod);
      while (lod < maxLod && counts[lod] > this.targetCellsPerBucket) lod++;
      return { bucket, models, pixels, counts, lod, maxLod };
    });
    // A per-bucket cap alone grows with the visible world. Coarsen the least
    // screen-significant chunks until the whole view fits, retaining every tree.
    let total = plans.reduce((sum, plan) => sum + plan.counts[plan.lod], 0);
    while (total > this.visibleCellBudget) {
      const candidate = plans.filter(plan => plan.lod < plan.maxLod)
        .sort((a, b) => a.pixels * 2 ** a.lod - b.pixels * 2 ** b.lod)[0];
      if (!candidate) break; // Report saturation rather than silently hiding objects.
      total -= candidate.counts[candidate.lod] - candidate.counts[++candidate.lod];
    }
    stats.budgetExceeded = total > this.visibleCellBudget;
    for (const { bucket, models, lod } of plans) {
      const token = lod + ":" + models.map((model, i) => (model === bucket.entries[i].voxel.model ? "a" : "d") + (bucket.entries[i].art.group.visible ? "v" : "h")).join("");
      if (!bucket.mesh || token !== bucket.token) {
        const entries = models.flatMap((model, i) => {
          const group = bucket.entries[i].art.group; group.updateWorldMatrix(true, false);
          return model && group.visible ? [{ level: model.levels[Math.min(lod, model.levels.length - 1)], matrix: group.matrixWorld }] : [];
        });
        const count = entries.reduce((sum, entry) => sum + entry.level.count, 0);
        if (!bucket.mesh || bucket.mesh.instanceMatrix.count < count || bucket.mesh.instanceMatrix.count > Math.max(256, count * 4)) {
          if (bucket.mesh) { this.scene.remove(bucket.mesh); bucket.mesh.dispose(); bucket.mesh.geometry.dispose(); }
          bucket.mesh = new InstancedMesh(this.geometry.clone(), this.material, Math.max(1, 2 ** Math.ceil(Math.log2(Math.max(1, count)))));
          bucket.mesh.name = "voxel-chunk"; bucket.mesh.instanceMatrix.setUsage(StaticDrawUsage); this.scene.add(bucket.mesh);
        }
        fillVoxelInstances(bucket.mesh, entries); bucket.mesh.castShadow = lod === 0; bucket.mesh.receiveShadow = true;
        bucket.lod = lod; bucket.token = token; this.uploads++;
      }
      bucket.mesh!.visible = true; bucket.lastSeen = this.frame;
      stats.visibleBuckets++; stats.instances += bucket.mesh!.count;
      if (lod === 0) stats.lod0++; else if (lod === 1) stats.lod1++; else if (lod === 2) stats.lod2++; else if (lod === 3) stats.lod3++; else stats.lod4++;
    }
    const resident = this.nodes.filter(bucket => bucket.mesh);
    let residentCount = resident.length, residentCells = resident.reduce((sum, bucket) => sum + bucket.mesh!.instanceMatrix.count, 0);
    for (const bucket of resident.sort((a, b) => a.lastSeen - b.lastSeen)) {
      if (residentCount <= Math.max(this.maxResident, visible.length) && residentCells <= VOXEL_RESIDENT_CELL_BUDGET) break;
      if (!active.has(bucket)) {
        residentCount--; residentCells -= bucket.mesh!.instanceMatrix.count;
        this.scene.remove(bucket.mesh!); bucket.mesh!.dispose(); bucket.mesh!.geometry.dispose(); bucket.mesh = undefined; bucket.token = "";
      }
    }
    stats.residentBuckets = residentCount; stats.residentCells = residentCells; stats.uploads = this.uploads; this.stats = stats;
  }

  private clear() { for (const bucket of this.nodes) if (bucket.mesh) { this.scene.remove(bucket.mesh); bucket.mesh.dispose(); bucket.mesh.geometry.dispose(); } this.buckets.clear(); this.nodes = []; }
  dispose() { this.clear(); this.geometry.dispose(); this.material.dispose(); }
}

/** Read-only workbench uses the same cubes/linear palette, outside world chunk ownership. */
export function standaloneVoxel(level: VoxelLevel): InstancedMesh {
  const mesh = new InstancedMesh(new BoxGeometry(1, 1, 1), voxelMaterial(), Math.max(1, level.count));
  fillVoxelInstances(mesh, [{ level, matrix: new Matrix4() }]); mesh.castShadow = mesh.receiveShadow = true; return mesh;
}

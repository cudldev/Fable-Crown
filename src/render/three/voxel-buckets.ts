import { Box3, BoxGeometry, Frustum, InstancedBufferAttribute, InstancedInterleavedBuffer, InstancedMesh, InterleavedBufferAttribute, Matrix4, OrthographicCamera, PerspectiveCamera, Scene, Sphere, StaticDrawUsage, Vector3, type Camera } from "three";
import { voxelMaterial } from "./voxel-ao";
import { DEFAULT_VISUAL_SETTINGS } from "./visual-settings";
import type { ObjectArt } from "./contracts";
import type { WorldCurve } from "./world-curve";
import { VOXEL_LOD_FACTORS, type VoxelLevel, type VoxelObject } from "./voxel-data";
import { clearVoxelTransition, createVoxelTransitionDepthMaterial, installVoxelTransition, setVoxelTransition } from "./voxel-transition";

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
interface BatchWork { mesh?: InstancedMesh; count: number; entries: { level: VoxelLevel; matrix: Matrix4 }[]; token: string; state: string; lod: number; objectLods: number[]; steps?: Generator<number>; complete: boolean; started: number }
interface Bucket { entries: Entry[]; center: Vector3; bounds: Box3; mesh?: InstancedMesh; token: string; state?: string; objectLods?: number[]; pending?: BatchWork; retiring?: { mesh: InstancedMesh; started: number; objectLods: number[] }; lastSeen: number; children?: Map<string, Bucket>; split: boolean }
interface LodPlan { entry: Entry; model: VoxelObject["model"] | undefined; pixels: number; lod: number; count: number; maxLod: number; inView: boolean }

/** Spend detail on the largest projected cells first, independently of batch ownership. */
function coarsenToBudget(plans: LodPlan[], budget: number): number {
  let total = plans.reduce((sum, plan) => sum + plan.count, 0);
  while (total > budget) {
    let candidate: LodPlan | undefined, smallest = Infinity;
    for (const plan of plans) if (plan.model && plan.lod < plan.maxLod) {
      const size = plan.pixels * 2 ** plan.lod * (plan.inView ? 1 : .2);
      if (size < smallest) { candidate = plan; smallest = size; }
    }
    if (!candidate) break;
    const count = candidate.model!.levels[++candidate.lod].count;
    total += count - candidate.count; candidate.count = count;
  }
  return total;
}
export interface VoxelStats { visibleBuckets: number; residentBuckets: number; residentCells: number; parentBuckets: number; childBuckets: number; instances: number; uploads: number; lod0: number; lod1: number; lod2: number; lod3: number; lod4: number; budgetExceeded: boolean; visibleObjects: number; nativeTrees: number; requestedCells: number; budgetCoarsenedObjects: number; objectLods: number[]; largestCellPixels: number; queued: number; stagedCells: number; committed: number; preparationMs: number; cancelled: number; pendingAgeMs: number; transitions: number; transitionCells: number; prefetchedBuckets: number; closestTreeId: string; closestTreeLod: number; closestTreeDesiredLod: number }
const emptyStats = (): VoxelStats => ({ visibleBuckets: 0, residentBuckets: 0, residentCells: 0, parentBuckets: 0, childBuckets: 0, instances: 0, uploads: 0, lod0: 0, lod1: 0, lod2: 0, lod3: 0, lod4: 0, budgetExceeded: false, visibleObjects: 0, nativeTrees: 0, requestedCells: 0, budgetCoarsenedObjects: 0, objectLods: [0, 0, 0, 0, 0], largestCellPixels: 0, queued: 0, stagedCells: 0, committed: 0, preparationMs: 0, cancelled: 0, pendingAgeMs: 0, transitions: 0, transitionCells: 0, prefetchedBuckets: 0, closestTreeId: "", closestTreeLod: -1, closestTreeDesiredLod: -1 });
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
  let at = 0;
  if (!mesh.instanceColor) mesh.instanceColor = new InstancedBufferAttribute(new Float32Array(mesh.instanceMatrix.count * 3), 3);
  const matrices = mesh.instanceMatrix.array, colors = mesh.instanceColor.array;
  let ao = (mesh.geometry.getAttribute("voxelAO0") as InterleavedBufferAttribute | undefined)?.data as InstancedInterleavedBuffer | undefined;
  if (!ao) {
    ao = new InstancedInterleavedBuffer(new Uint8Array(mesh.instanceMatrix.count * 24).fill(255), 24);
    for (let face = 0; face < 6; face++) mesh.geometry.setAttribute(`voxelAO${face}`, new InterleavedBufferAttribute(ao, 4, face * 4, true));
  }
  for (const { level, matrix: root } of entries) {
    const r = root.elements, p = level.pitch;
    const basis = new Float32Array([r[0]*p,r[1]*p,r[2]*p,r[3]*p,r[4]*p,r[5]*p,r[6]*p,r[7]*p,r[8]*p,r[9]*p,r[10]*p,r[11]*p]);
    for (let first = 0; first < level.count; first += 256) {
      const end = Math.min(first + 256, level.count), count = end - first;
      // Decoder output is already in GPU order. Native bulk copies avoid
      // deinterleaving 24 AO bytes and assigning 3 colors for every cube.
      colors.set(level.colors.subarray(first * 3, end * 3), at * 3);
      ao.array.set(level.ao.subarray(first * 24, end * 24), at * 24);
      for (let i = first; i < end; i++) {
        const source = i * 3, destination = at * 16, x = level.centers[source], y = level.centers[source+1], z = level.centers[source+2];
        matrices.set(basis, destination);
        matrices[destination+12] = r[0]*x+r[4]*y+r[8]*z+r[12];
        matrices[destination+13] = r[1]*x+r[5]*y+r[9]*z+r[13];
        matrices[destination+14] = r[2]*x+r[6]*y+r[10]*z+r[14];
        matrices[destination+15] = r[3]*x+r[7]*y+r[11]*z+r[15];
        at++;
      }
      yield count;
    }
  }
  mesh.count = at; mesh.instanceMatrix.needsUpdate = true;
  if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
  ao.needsUpdate = true;
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
  private depthMaterial = createVoxelTransitionDepthMaterial();
  private buckets = new Map<string, Bucket>();
  private nodes: Bucket[] = [];
  private frame = 0;
  private uploads = 0;
  private cancelled = 0;
  stats: VoxelStats = emptyStats();
  constructor(private scene: Scene, private maxResident = 48, private targetCellsPerBucket = 100000, private visibleCellBudget = VOXEL_VISIBLE_CELL_BUDGET, private streaming = false) { installVoxelTransition(this.material); }
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
      // Smaller runtime jobs refine individual crowns instead of an entire grove.
      const childTiles = this.streaming ? 4 : VOXEL_CHILD_TILES;
      const childKey = `${Math.floor(x / childTiles)}:${Math.floor(z / childTiles)}`;
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

  update(camera: Camera, viewportHeight: number, curve?: WorldCurve, now = performance.now()) {
    this.frame++;
    const stats = emptyStats(), frustum = new Frustum().setFromProjectionMatrix(new Matrix4().multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse));
    const curved = new Box3(), expanded = new Box3();
    const intersects = (bounds: Box3) => (!curve || curve.view.intersects(bounds)) && frustum.intersectsBox(curve ? curve.expandBounds(bounds, curved) : bounds);
    const ahead = (bounds: Box3) => intersects(expanded.copy(bounds).expandByScalar(6));
    const candidates: { bucket: Bucket; visible: boolean }[] = [];
    for (const parent of this.buckets.values()) {
      if (!intersects(parent.bounds) && !(this.streaming && ahead(parent.bounds))) continue;
      const pixels = cellPixels(camera, viewportHeight, parent.entries[0].voxel.model.pitch, parent.center);
      parent.split = parent.children!.size > 1 && (this.streaming && curve?.view.enabled || pixels > (parent.split ? .6 : .8));
      for (const bucket of parent.split ? parent.children!.values() : [parent]) {
        const visible = intersects(bucket.bounds);
        if (visible || this.streaming && ahead(bucket.bounds)) candidates.push({ bucket, visible });
      }
    }
    candidates.sort((a,b) => Number(b.visible)-Number(a.visible) || a.bucket.center.distanceToSquared(camera.position)-b.bucket.center.distanceToSquared(camera.position));
    const active = new Set(candidates.map(item => item.bucket));
    for (const bucket of this.nodes) {
      const selected = active.has(bucket);
      if (!selected) { this.cancelWork(bucket); this.finishTransition(bucket); }
      if (bucket.mesh) bucket.mesh.visible = false;
      if (bucket.retiring) bucket.retiring.mesh.visible = false;
    }
    const plans = candidates.map(({ bucket, visible }) => {
      const objects: LodPlan[] = bucket.entries.map(entry => {
        const { art, voxel } = entry, inView = visible && intersects(entry.bounds);
        // Stable membership: a tree leaving one edge must not reset every neighbour.
        const model = !art.group.visible || !this.streaming && !inView ? undefined : art.depleted?.visible ? voxel.depleted : voxel.model;
        const maxLod = (model ?? voxel.model).levels.length-1;
        const pixels = cellPixels(camera, viewportHeight, (model ?? voxel.model).pitch*entry.scale, entry.center);
        const near = inView || this.streaming && ahead(entry.bounds);
        const lod = near ? chooseVoxelLod(pixels,entry.desiredLod,maxLod) : maxLod;
        if (near) entry.desiredLod = lod;
        return { entry, model, pixels, lod, maxLod, count: model?.levels[lod].count ?? 0, inView };
      });
      if (visible) stats.requestedCells += objects.reduce((sum,object) => sum+(object.inView ? object.count : 0),0);
      coarsenToBudget(objects,this.targetCellsPerBucket);
      return { bucket, visible, objects };
    });
    const visiblePlans = plans.filter(plan => plan.visible), preloadPlans = plans.filter(plan => !plan.visible);
    coarsenToBudget(visiblePlans.flatMap(plan => plan.objects),this.visibleCellBudget);
    coarsenToBudget(preloadPlans.flatMap(plan => plan.objects),64_000);
    for (const { bucket,visible,objects } of plans) {
      const token = objects.map(({ entry,model,lod }) => `${lod}${model===entry.voxel.model?'a':'d'}${model?'v':'h'}`).join(':');
      const state = objects.map(({ entry,model }) => `${model===entry.voxel.model?'a':'d'}${model?'v':'h'}`).join(':');
      const objectLods = objects.map(object => object.model ? object.lod : -1);
      const lod = Math.min(4,...objectLods.filter(value => value>=0));
      const entries = () => objects.flatMap(({entry,model,lod}) => {
        entry.art.group.updateWorldMatrix(true,false);
        return model ? [{level:model.levels[lod],matrix:entry.art.group.matrixWorld}] : [];
      });
      if (!this.streaming) {
        if (!bucket.mesh || bucket.token!==token) {
          const items=entries(), count=items.reduce((sum,item)=>sum+item.level.count,0);
          if (!bucket.mesh || bucket.mesh.instanceMatrix.count<count || bucket.mesh.instanceMatrix.count>Math.max(256,count*4)) this.replaceMesh(bucket,this.createMesh(Math.max(1,2**Math.ceil(Math.log2(Math.max(1,count)))),bucket));
          fillVoxelInstances(bucket.mesh!,items); bucket.mesh!.castShadow=lod===0;
          bucket.token=token; bucket.state=state; bucket.objectLods=objectLods; this.uploads++;
        }
      } else {
        if (!bucket.mesh) {
          // Keep recognizable crowns while finer data is prepared. The last
          // level's giant blocks are reserved for genuinely distant objects.
          const fallbackLods=objects.map(object=>Math.max(object.lod,Math.min(3,object.maxLod)));
          const coarse=objects.flatMap(({entry,model},i)=>model?[{level:model.levels[fallbackLods[i]],matrix:entry.art.group.matrixWorld}]:[]);
          const fallback=this.createMesh(coarse.reduce((sum,item)=>sum+item.level.count,0),bucket);
          for (const _ of fillVoxelInstanceSteps(fallback,coarse)) { /* first coverage, usually prepared outside the view */ }
          this.replaceMesh(bucket,fallback); bucket.state=state;
          bucket.objectLods=objects.map((object,i)=>object.model?fallbackLods[i]:-1); bucket.token='coarse:'+state; this.uploads++;
          if (objects.every((object,i)=>!object.model || object.model.levels[object.lod]===object.model.levels[fallbackLods[i]])) { bucket.token=token; bucket.objectLods=objectLods; }
        }
        if (bucket.pending && (bucket.pending.state!==state || !bucket.pending.mesh && bucket.token===token)) this.cancelWork(bucket);
        // Do not cancel a valid in-flight build for every fractional camera change.
        // Finish it, then compare against the newest desired detail next frame.
        if (bucket.token!==token && !bucket.pending) {
          const items=entries();
          bucket.pending={ entries:items,count:items.reduce((sum,item)=>sum+item.level.count,0),token,state,lod,objectLods,complete:false,started:now };
        }
      }
      bucket.mesh!.visible=visible; bucket.lastSeen=this.frame;
      if (bucket.retiring) {
        const progress=Math.min(1,(now-bucket.retiring.started)/140);
        if (!visible || progress>=1) this.finishTransition(bucket);
        else { setVoxelTransition(bucket.mesh!,progress,true); setVoxelTransition(bucket.retiring.mesh,progress,false); bucket.retiring.mesh.visible=true; }
      }
    }
    if (this.streaming) {
      const started=performance.now(); let written=0,committed=0;
      let transitions=plans.filter(plan=>plan.bucket.retiring).length;
      // Finish started visible buffers before allocating another after a small
      // camera priority change. Prefetch never blocks visible preparation.
      const scheduled = [...plans].sort((a,b) => Number(b.visible)-Number(a.visible) || Number(!!b.bucket.pending?.mesh)-Number(!!a.bucket.pending?.mesh));
      for (const {bucket,visible} of scheduled) {
        const work=bucket.pending; if (!work) continue;
        if (written>=32768 || performance.now()-started>=2) break;
        if (!work.mesh) { work.mesh=this.createMesh(work.count,bucket); work.steps=fillVoxelInstanceSteps(work.mesh,work.entries); }
        while (!work.complete && written<32768 && performance.now()-started<2) {
          const step=work.steps!.next(); written+=step.value??0; work.complete=step.done===true;
        }
        if (work.complete && !committed && !bucket.retiring && (!visible || transitions<2)) {
          work.mesh.castShadow=work.lod===0; work.mesh.visible=visible;
          if (visible && bucket.mesh!.count && work.count) {
            bucket.retiring={mesh:bucket.mesh!,started:now,objectLods:bucket.objectLods??[]}; bucket.mesh=work.mesh; this.scene.add(work.mesh);
            setVoxelTransition(bucket.mesh,0,true); setVoxelTransition(bucket.retiring.mesh,0,false); transitions++;
          } else this.replaceMesh(bucket,work.mesh);
          bucket.token=work.token; bucket.state=work.state; bucket.objectLods=work.objectLods;
          bucket.pending=undefined; committed++; this.uploads++;
          break;
        }
        // One staged buffer at a time when transition admission is full.
        if (work.complete) break;
      }
      stats.preparationMs=performance.now()-started; stats.committed=committed;
    }
    let closestPixels=-Infinity;
    for (const {bucket,visible,objects} of plans) {
      stats.queued+=Number(!!bucket.pending);
      stats.stagedCells+=bucket.pending?.mesh?.instanceMatrix.count??0;
      stats.pendingAgeMs=Math.max(stats.pendingAgeMs,bucket.pending?now-bucket.pending.started:0);
      stats.transitions+=Number(!!bucket.retiring);
      if (!visible) { stats.prefetchedBuckets++; continue; }
      stats.visibleBuckets++; if (bucket.children) stats.parentBuckets++; else stats.childBuckets++;
      stats.transitionCells+=bucket.retiring?.mesh.count??0;
      stats.instances+=bucket.mesh!.count+(bucket.retiring?.mesh.count??0);
      let finest=4;
      objects.forEach((object,i)=> {
        const rendered=(bucket.retiring && now-bucket.retiring.started<70 ? bucket.retiring.objectLods[i] : bucket.objectLods?.[i])??-1;
        if (rendered<0 || !object.model || !object.inView) return;
        finest=Math.min(finest,rendered); stats.visibleObjects++; stats.objectLods[rendered]++;
        const tree=object.entry.art.group.userData.voxelAsset==='tree';
        if (tree && rendered===0) stats.nativeTrees++;
        if (rendered>object.entry.desiredLod) stats.budgetCoarsenedObjects++;
        stats.largestCellPixels=Math.max(stats.largestCellPixels,object.pixels*object.model.levels[rendered].pitch/object.model.pitch);
        if (tree && !object.entry.art.depleted?.visible && object.pixels>closestPixels) {
          closestPixels=object.pixels; stats.closestTreeId=String(object.entry.art.group.userData.selection?.id??object.entry.art.group.uuid);
          stats.closestTreeLod=rendered; stats.closestTreeDesiredLod=object.lod;
        }
      });
      if (finest===0) stats.lod0++; else if(finest===1) stats.lod1++; else if(finest===2) stats.lod2++; else if(finest===3) stats.lod3++; else stats.lod4++;
    }
    const resident=this.nodes.filter(bucket=>bucket.mesh);
    const cells=(bucket:Bucket)=>bucket.mesh!.instanceMatrix.count+(bucket.retiring?.mesh.instanceMatrix.count??0);
    let residentCount=resident.length, residentCells=resident.reduce((sum,bucket)=>sum+cells(bucket),0);
    for (const bucket of resident.sort((a,b)=>a.lastSeen-b.lastSeen)) {
      if (residentCount<=Math.max(this.maxResident,candidates.length) && residentCells+stats.stagedCells<=VOXEL_RESIDENT_CELL_BUDGET) break;
      if (!active.has(bucket)) { residentCount--; residentCells-=cells(bucket); this.finishTransition(bucket); this.releaseMesh(bucket.mesh!); bucket.mesh=undefined; bucket.token=''; }
    }
    stats.budgetExceeded=stats.instances>this.visibleCellBudget;
    stats.residentBuckets=residentCount; stats.residentCells=residentCells; stats.uploads=this.uploads; stats.cancelled=this.cancelled; this.stats=stats;
  }

  private createMesh(count: number, bucket: Bucket) {
    const mesh = new InstancedMesh(this.geometry.clone(), this.material, Math.max(1, count));
    mesh.name = "voxel-chunk"; mesh.instanceMatrix.setUsage(StaticDrawUsage); mesh.receiveShadow = true;
    mesh.customDepthMaterial = this.depthMaterial; clearVoxelTransition(mesh);
    // Exact cached bounds include every LOD and both states; avoid scanning matrices again.
    mesh.boundingBox = bucket.bounds.clone(); mesh.boundingSphere = bucket.bounds.getBoundingSphere(new Sphere());
    return mesh;
  }
  private replaceMesh(bucket: Bucket, mesh: InstancedMesh) {
    this.finishTransition(bucket);
    if (bucket.mesh) this.releaseMesh(bucket.mesh);
    bucket.mesh = mesh; this.scene.add(mesh);
  }
  private releaseMesh(mesh: InstancedMesh) { this.scene.remove(mesh); mesh.dispose(); mesh.geometry.dispose(); }
  private finishTransition(bucket: Bucket) {
    if (!bucket.retiring) return;
    this.releaseMesh(bucket.retiring.mesh); bucket.retiring=undefined;
    if (bucket.mesh) clearVoxelTransition(bucket.mesh);
  }
  private cancelWork(bucket: Bucket) {
    if (!bucket.pending) return;
    this.cancelled++;
    bucket.pending.steps?.return(0); bucket.pending.mesh?.dispose(); bucket.pending.mesh?.geometry.dispose(); bucket.pending = undefined;
  }
  private clear() { for (const bucket of this.nodes) { this.cancelWork(bucket); this.finishTransition(bucket); if (bucket.mesh) this.releaseMesh(bucket.mesh); } this.buckets.clear(); this.nodes = []; }
  dispose() { this.clear(); this.geometry.dispose(); this.material.dispose(); this.depthMaterial.dispose(); }
}

/** Read-only workbench uses the same cubes/linear palette, outside world chunk ownership. */
export function standaloneVoxel(level: VoxelLevel): InstancedMesh {
  const mesh = new InstancedMesh(new BoxGeometry(1, 1, 1), voxelMaterial(), Math.max(1, level.count));
  fillVoxelInstances(mesh, [{ level, matrix: new Matrix4() }]); mesh.castShadow = mesh.receiveShadow = true; return mesh;
}

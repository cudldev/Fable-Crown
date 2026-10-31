import { Box3, BufferAttribute, BufferGeometry, DynamicDrawUsage, Frustum, InstancedBufferAttribute, InstancedMesh, Matrix4, MeshBasicMaterial, Scene, Sphere, Vector3, type Camera, type MeshLambertMaterial } from "three";
import type { ObjectArt } from "./contracts";
import type { VoxelModel, VoxelObject } from "./voxel-data";
import type { VoxelShadowData, VoxelSurfaceData } from "./voxel-surface";
import { cellPixels, chooseVoxelLod, VOXEL_VISIBLE_CELL_BUDGET, type VoxelStats } from "./voxel-buckets";
import { createVoxelTransitionDepthMaterial } from "./voxel-transition";
import { voxelMeshMaterial } from "./voxel-mesh-material";
import { DEFAULT_VISUAL_SETTINGS } from "./visual-settings";
import type { WorldCurve } from "./world-curve";

const FADE_MS = 140;
interface Template { id: number; data: VoxelSurfaceData; shadowData?: VoxelShadowData; cells: number; ready: boolean; geometry?: BufferGeometry; shadowGeometry?: BufferGeometry; material?: MeshLambertMaterial }
interface Appearance { model: VoxelModel; lod: number; template: Template }
interface Entry {
  id: number; art: ObjectArt; voxel: VoxelObject; localBounds: Box3; bounds: Box3; center: Vector3;
  matrix: Matrix4; version: number; scale: number; desired: number; presented: boolean;
  current?: Appearance; outgoing?: Appearance; started: number; inverse: boolean; revealing: boolean;
}
interface Plan { entry: Entry; model?: VoxelModel; lod: number; count: number; pixels: number; visible: boolean; near: boolean }
interface Draw { entry: Entry; appearance: Appearance; fade: number }
interface Batch {
  template: Template; mesh: InstancedMesh; shadow?: InstancedMesh; fade: InstancedBufferAttribute;
  ids: number[]; versions: number[]; records: Draw[]; capacity: number; warm: boolean;
}
export interface VoxelMeshOptions { visibleCellBudget?: number; maxAdmittedTemplatesPerFrame?: number; targetCellsPerObject?: number }
export interface VoxelMeshStats extends VoxelStats {
  templates: number; templateBuilds: number; geometryBytes: number; instanceBytes: number;
  drawInstances: number; equivalentCells: number; visibleTriangles: number; shadowTriangles: number;
}
const stats = (): VoxelMeshStats => ({ visibleBuckets: 0, residentBuckets: 0, residentCells: 0, parentBuckets: 0, childBuckets: 0, instances: 0, uploads: 0,
  lod0: 0, lod1: 0, lod2: 0, lod3: 0, lod4: 0, budgetExceeded: false, visibleObjects: 0, nativeTrees: 0, requestedCells: 0, budgetCoarsenedObjects: 0,
  objectLods: [0,0,0,0,0], largestCellPixels: 0, queued: 0, stagedCells: 0, committed: 0, preparationMs: 0, cancelled: 0, pendingAgeMs: 0,
  transitions: 0, transitionCells: 0, prefetchedBuckets: 0, closestTreeId: "", closestTreeLod: -1, closestTreeDesiredLod: -1,
  templates: 0, templateBuilds: 0, geometryBytes: 0, instanceBytes: 0, drawInstances: 0, equivalentCells: 0, visibleTriangles: 0, shadowTriangles: 0 });

/** Lower LOD number is finer. Retained finer data is adequate, never a placeholder. */
const adequate = (appearance: Appearance | undefined, model: VoxelModel, lod: number) =>
  !!appearance && appearance.model === model && appearance.lod <= lod && appearance.template.ready;
function transition(progress: number, incoming: boolean, inverse = false) {
  const coverage = Math.max(0, Math.ceil(Math.min(1,Math.max(0,progress))*16-.5))/16;
  return inverse ? incoming ? 1-coverage : -coverage : incoming ? coverage-1 : coverage;
}
function coarsen(plans: Plan[], budget: number) {
  let count = plans.reduce((sum, plan) => sum+plan.count,0);
  while (count>budget) {
    let selected: Plan | undefined, smallest = Infinity;
    for (const plan of plans) if (plan.model && plan.lod<plan.model.levels.length-1) {
      const pixels = plan.pixels*2**plan.lod*(plan.visible?1:.2);
      if (pixels<smallest) { smallest=pixels; selected=plan; }
    }
    if (!selected) break;
    const next = selected.model!.levels[++selected.lod].count;
    count += next-selected.count; selected.count=next;
  }
}
function bounds(data: VoxelShadowData) { return new Box3(new Vector3(...data.bounds.min),new Vector3(...data.bounds.max)); }
function geometry(data: VoxelShadowData, surface?: VoxelSurfaceData) {
  const result = new BufferGeometry();
  result.setAttribute("position",new BufferAttribute(data.positions,3)); result.setIndex(new BufferAttribute(data.indices,1));
  if (surface) {
    result.setAttribute("normal",new BufferAttribute(surface.normals,3,false));
    result.setAttribute("color",new BufferAttribute(surface.colors,3));
    result.setAttribute("voxelSurfaceAO",new BufferAttribute(surface.ao,1,true));
  }
  result.boundingBox=bounds(data); result.boundingSphere=result.boundingBox.getBoundingSphere(new Sphere());
  return result;
}

/** Geometry/attributes are prepared once per immutable asset LOD; copies contain only object transforms. */
export class VoxelMeshes {
  private entries: Entry[] = [];
  private templates = new Map<VoxelSurfaceData,Template>();
  private shadowGeometries = new Map<VoxelShadowData,BufferGeometry>();
  private batches = new Map<string,Batch>();
  private views = new Set<BufferGeometry>();
  private warm: Batch[] = [];
  private materials = new Map<number,MeshLambertMaterial>();
  private aoStrength = { value: 1 };
  private aoDistance = { value: DEFAULT_VISUAL_SETTINGS.aoDistance };
  private depth = createVoxelTransitionDepthMaterial();
  private shadowMaterial = new MeshBasicMaterial({ colorWrite: false, depthWrite: false });
  private builds = 0;
  private uploads = 0;
  private nextTemplate = 1;
  private pendingSince = new Map<Template,number>();
  private sectors = new Map<string,number>();
  private sectorsDirty = true;
  stats: VoxelMeshStats = stats();
  constructor(private scene: Scene, private options: VoxelMeshOptions = {}) {}
  setAO(enabled: boolean, strength = 1, distance = DEFAULT_VISUAL_SETTINGS.aoDistance) { this.aoStrength.value=enabled?strength:0; this.aoDistance.value=distance; }
  private template(model: VoxelModel, lod: number) {
    const data=model.surfaces?.[lod];
    if (!data) throw Error("A voxel prop is missing its baked static surface.");
    let template=this.templates.get(data);
    if (!template) {
      const shadow=model.shadowSurfaces?.[lod]??data.shadow;
      template={id:this.nextTemplate++,data,shadowData:shadow&&shadow.triangles<data.triangles?shadow:undefined,cells:model.levels[lod].count,ready:false};
      this.templates.set(data,template);
    }
    return template;
  }
  replace(objects: Iterable<{ art: ObjectArt }>) {
    for (const batch of this.batches.values()) { batch.mesh.visible=false; batch.ids=[]; batch.versions=[]; if(batch.shadow)batch.shadow.visible=false; }
    this.entries=[]; this.pendingSince.clear(); this.sectorsDirty=true;
    for (const {art} of objects) if (art.voxels) {
      const voxel=art.voxels, local=new Box3();
      for (const model of [voxel.model,voxel.depleted]) if(model) for(let lod=0;lod<model.levels.length;lod++) local.union(bounds(this.template(model,lod).data));
      art.group.updateWorldMatrix(true,false);
      const matrix=art.group.matrixWorld.clone(), box=local.clone().applyMatrix4(matrix);
      this.entries.push({id:this.entries.length,art,voxel,localBounds:local,bounds:box,center:box.getCenter(new Vector3()),matrix,version:0,
        scale:matrix.getMaxScaleOnAxis(),desired:-1,presented:false,started:0,inverse:false,revealing:false});
    }
  }
  private admit(template: Template) {
    if (template.ready) return;
    let material=this.materials.get(template.data.pitch);
    if(!material) { material=voxelMeshMaterial(template.data.pitch,this.aoStrength,this.aoDistance);this.materials.set(template.data.pitch,material); }
    template.material=material;template.geometry=geometry(template.data,template.data);
    if(template.shadowData) {
      let cached=this.shadowGeometries.get(template.shadowData);
      if(!cached){cached=geometry(template.shadowData);this.shadowGeometries.set(template.shadowData,cached);}
      template.shadowGeometry=cached;
    }
    template.ready=true;this.builds++;
  }
  private view(base: BufferGeometry, fade: InstancedBufferAttribute) {
    const result=new BufferGeometry();
    for(const [key,attribute] of Object.entries(base.attributes)) result.setAttribute(key,attribute);
    result.setIndex(base.index);result.boundingBox=base.boundingBox;result.boundingSphere=base.boundingSphere;
    result.setAttribute("voxelTransition",fade);this.views.add(result);return result;
  }
  private batch(template: Template, capacity: number, casts: boolean, warm = false) {
    const fade=new InstancedBufferAttribute(new Float32Array(capacity),1);fade.setUsage(DynamicDrawUsage);
    const mesh=new InstancedMesh(this.view(template.geometry!,fade),template.material!,capacity);
    mesh.instanceMatrix.setUsage(DynamicDrawUsage);mesh.receiveShadow=true;mesh.customDepthMaterial=this.depth;
    mesh.name="voxel-static-batch";mesh.userData.voxelStatic=true;mesh.userData.voxelTemplate=template.id;
    const batch:Batch={template,mesh,fade,capacity,ids:[],versions:[],records:[],warm};
    if(casts&&template.shadowGeometry) {
      const shadowGeometry=this.view(template.shadowGeometry,fade);shadowGeometry.setDrawRange(0,0);
      const shadow=new InstancedMesh(shadowGeometry,this.shadowMaterial,1);
      shadow.instanceMatrix=mesh.instanceMatrix;shadow.count=0;shadow.castShadow=true;shadow.customDepthMaterial=this.depth;
      shadow.name="voxel-static-shadow";shadow.userData.voxelStaticShadow=true;shadow.userData.voxelTemplate=template.id;
      // Keep exact shared silhouette data out of the color/depth passes.
      shadow.onBeforeShadow=()=>{shadow.count=mesh.count;shadowGeometry.setDrawRange(0,template.shadowData!.indices.length);};
      shadow.onAfterShadow=()=>{shadow.count=0;shadowGeometry.setDrawRange(0,0);};
      batch.shadow=shadow;this.scene.add(shadow);
    } else mesh.castShadow=casts;
    this.scene.add(mesh);return batch;
  }
  /** Warm the actual shared buffers/materials under the startup overlay, in every real render profile. */
  beginWarmup() {
    const matrix=new Matrix4().makeTranslation(0,-100000,0);
    for(const template of this.templates.values()) {
      this.admit(template);
      const batch=this.batch(template,1,true,true);
      batch.mesh.setMatrixAt(0,matrix);batch.mesh.instanceMatrix.needsUpdate=true;batch.mesh.count=1;batch.mesh.frustumCulled=false;
      if(batch.shadow){batch.shadow.count=0;batch.shadow.frustumCulled=false;}
      this.warm.push(batch);
    }
    return ()=>this.endWarmup();
  }
  private endWarmup() {
    for(const batch of this.warm) {this.scene.remove(batch.mesh);batch.mesh.dispose();if(batch.shadow){this.scene.remove(batch.shadow);batch.shadow.dispose();}}
    this.warm=[];
  }
  update(camera: Camera, viewportHeight: number, curve?: WorldCurve, now = performance.now()) {
    const began=performance.now(), result=stats(), frustum=new Frustum().setFromProjectionMatrix(new Matrix4().multiplyMatrices(camera.projectionMatrix,camera.matrixWorldInverse));
    const expanded=new Box3(), curved=new Box3();
    const intersects=(box:Box3)=>(!curve||curve.view.intersects(box))&&frustum.intersectsBox(curve?curve.expandBounds(box,curved):box);
    const plans:Plan[]=this.entries.map(entry=>{
      entry.art.group.updateWorldMatrix(true,false);
      if(!entry.matrix.equals(entry.art.group.matrixWorld)) {
        entry.matrix.copy(entry.art.group.matrixWorld);entry.version++;this.sectorsDirty=true;entry.bounds.copy(entry.localBounds).applyMatrix4(entry.matrix);
        entry.bounds.getCenter(entry.center);entry.scale=entry.matrix.getMaxScaleOnAxis();
      }
      const model=!entry.art.group.visible?undefined:entry.art.depleted?.visible?entry.voxel.depleted:entry.voxel.model;
      const visible=!!model&&intersects(entry.bounds),near=visible||!!model&&intersects(expanded.copy(entry.bounds).expandByScalar(6));
      const pixels=cellPixels(camera,viewportHeight,(model??entry.voxel.model).pitch*entry.scale,entry.center);
      const lod=near?chooseVoxelLod(pixels,entry.desired,(model??entry.voxel.model).levels.length-1):(model??entry.voxel.model).levels.length-1;
      if(near)entry.desired=lod;
      const plan={entry,model,lod,pixels,visible,near,count:model&&near?model.levels[lod].count:0};
      if(visible)result.requestedCells+=plan.count;
      coarsen([plan],this.options.targetCellsPerObject??100000);return plan;
    });
    const visible=plans.filter(plan=>plan.visible),prefetch=plans.filter(plan=>plan.near&&!plan.visible);
    if(this.sectorsDirty) {
      this.sectors.clear();
      for(const entry of this.entries)for(const size of [16,32]) {
        const p=entry.matrix.elements,key=`${size}:${Math.floor(p[12]/size)}:${Math.floor(p[14]/size)}`;
        this.sectors.set(key,(this.sectors.get(key)??0)+1);
      }
      this.sectorsDirty=false;
    }
    coarsen(visible,this.options.visibleCellBudget??VOXEL_VISIBLE_CELL_BUDGET);coarsen(prefetch,64000);
    const needed=new Set<Template>();
    for(const plan of [...visible,...prefetch].sort((a,b)=>Number(b.visible)-Number(a.visible)||b.pixels-a.pixels)) if(plan.model) {
      const template=this.template(plan.model,plan.lod);if(!template.ready){needed.add(template);if(!this.pendingSince.has(template))this.pendingSince.set(template,now);}
    }
    let admissions=0;
    for(const template of needed) if(admissions<(this.options.maxAdmittedTemplatesPerFrame??1)) {this.admit(template);admissions++;this.pendingSince.delete(template);}
    for(const template of this.pendingSince.keys())if(!needed.has(template))this.pendingSince.delete(template);
    for(const batch of this.batches.values())batch.records=[];
    let closest=-Infinity;
    const draw=(entry:Entry,appearance:Appearance,fade:number)=>{
      const size=curve?.view.enabled===false?32:16,point=entry.matrix.elements;
      const sector=`${size}:${Math.floor(point[12]/size)}:${Math.floor(point[14]/size)}`;
      const capacity=2**Math.ceil(Math.log2(Math.max(1,this.sectors.get(sector)??1)));
      const casts=appearance.lod===0,key=`${appearance.template.id}:${sector}:${Number(casts)}`;
      let batch=this.batches.get(key);
      if(batch&&batch.capacity<capacity) {
        this.scene.remove(batch.mesh);batch.mesh.dispose();if(batch.shadow){this.scene.remove(batch.shadow);batch.shadow.dispose();}batch=undefined;
      }
      if(!batch){batch=this.batch(appearance.template,capacity,casts);this.batches.set(key,batch);}
      batch.records.push({entry,appearance,fade});
    };
    for(const plan of plans) {
      const {entry,model,lod}=plan;
      if(!plan.visible||!model) {entry.presented=false;entry.revealing=false;entry.outgoing=undefined;continue;}
      const target=this.template(model,lod);
      if(!entry.presented) {
        if(target.ready)entry.current={model,lod,template:target};
        else if(!adequate(entry.current,model,lod))continue;
        entry.presented=true;entry.revealing=true;entry.started=now;entry.inverse=false;entry.outgoing=undefined;
      }
      const progress=Math.min(1,(now-entry.started)/FADE_MS);
      if(entry.outgoing&&progress>=1)entry.outgoing=undefined;
      if(entry.revealing&&progress>=1)entry.revealing=false;
      if(entry.outgoing&&entry.outgoing.model===model&&entry.outgoing.template===target) {
        const previous=entry.current!;entry.current=entry.outgoing;entry.outgoing=previous;
        entry.started=now-(1-progress)*FADE_MS;entry.inverse=!entry.inverse;
      } else if(!entry.outgoing&&!entry.revealing&&target.ready) {
        if(entry.current!.template===target){entry.current!.lod=lod;entry.current!.model=model;}
        else {entry.outgoing=entry.current;entry.current={model,lod,template:target};entry.started=now;entry.inverse=false;}
      }
      const fade=Math.min(1,(now-entry.started)/FADE_MS),current=entry.current!;
      draw(entry,current,entry.outgoing?transition(fade,true,entry.inverse):entry.revealing?transition(fade,true):0);
      if(entry.outgoing) {draw(entry,entry.outgoing,transition(fade,false,entry.inverse));result.transitionCells+=entry.outgoing.model.levels[entry.outgoing.lod].count;}
      if(entry.outgoing||entry.revealing)result.transitions++;
      const dominant=entry.outgoing&&fade<.5?entry.outgoing:current;
      result.visibleObjects++;result.objectLods[dominant.lod]++;result.equivalentCells+=current.model.levels[current.lod].count;
      if(dominant.lod>entry.desired)result.budgetCoarsenedObjects++;
      result.largestCellPixels=Math.max(result.largestCellPixels,plan.pixels*dominant.model.levels[dominant.lod].pitch/dominant.model.pitch);
      if(entry.art.group.userData.voxelAsset==="tree"&&dominant.lod===0)result.nativeTrees++;
    }
    // Observe the actual nearest desired tree, including its hidden preparation.
    for(const plan of visible) if(plan.entry.art.group.userData.voxelAsset==="tree"&&!plan.entry.art.depleted?.visible&&plan.pixels>closest) {
      closest=plan.pixels;result.closestTreeId=String(plan.entry.art.group.userData.selection?.id??plan.entry.art.group.uuid);result.closestTreeDesiredLod=plan.lod;
      const e=plan.entry,p=Math.min(1,(now-e.started)/FADE_MS);
      result.closestTreeLod=e.presented?(e.outgoing&&p<.5?e.outgoing:e.current)!.lod:-1;
    }
    for(const batch of this.batches.values()) {
      const {mesh,shadow,records}=batch;mesh.visible=records.length>0;mesh.count=records.length;
      if(shadow){shadow.visible=mesh.visible;shadow.count=0;}
      if(!mesh.visible)continue;
      const matricesChanged=records.length!==batch.ids.length||records.some((record,i)=>record.entry.id!==batch.ids[i]||record.entry.version!==batch.versions[i]);
      if(matricesChanged){records.forEach((record,i)=>mesh.setMatrixAt(i,record.entry.matrix));mesh.instanceMatrix.needsUpdate=true;
        batch.ids=records.map(record=>record.entry.id);batch.versions=records.map(record=>record.entry.version);mesh.computeBoundingBox();mesh.computeBoundingSphere();
        if(shadow){shadow.count=records.length;shadow.computeBoundingBox();shadow.computeBoundingSphere();shadow.count=0;}this.uploads++;}
      let fadeChanged=false;records.forEach((record,i)=>{if(batch.fade.array[i]!==record.fade){batch.fade.array[i]=record.fade;fadeChanged=true;}});
      if(fadeChanged)batch.fade.needsUpdate=true;
      result.instances+=records.length;result.drawInstances+=records.length;result.visibleBuckets++;
      if(curve?.view.enabled===false)result.parentBuckets++;else result.childBuckets++;
      const finest=Math.min(...records.map(record=>record.appearance.lod));
      if(finest===0)result.lod0++;else if(finest===1)result.lod1++;else if(finest===2)result.lod2++;else if(finest===3)result.lod3++;else result.lod4++;
      result.visibleTriangles+=batch.template.data.triangles*records.length;
      if(shadow||mesh.castShadow)result.shadowTriangles+=(batch.template.shadowData?.triangles??batch.template.data.triangles)*records.length;
    }
    const shadowStorage=new Set<VoxelShadowData>();
    for(const template of this.templates.values())if(template.ready){result.templates++;result.geometryBytes+=template.data.bytes;result.residentCells+=template.cells;if(template.shadowData)shadowStorage.add(template.shadowData);}
    for(const data of shadowStorage)result.geometryBytes+=data.bytes;
    for(const batch of this.batches.values())result.instanceBytes+=batch.capacity*(16*4+4);
    result.residentBuckets=this.batches.size;result.templateBuilds=this.builds;result.uploads=this.uploads;result.queued=[...needed].filter(template=>!template.ready).length;
    for(const [template,started]of this.pendingSince)if(!template.ready)result.pendingAgeMs=Math.max(result.pendingAgeMs,now-started);
    result.prefetchedBuckets=prefetch.length;result.committed=admissions;result.preparationMs=performance.now()-began;
    result.budgetExceeded=result.equivalentCells>(this.options.visibleCellBudget??VOXEL_VISIBLE_CELL_BUDGET);this.stats=result;
  }
  dispose() {
    this.endWarmup();
    for(const batch of this.batches.values()){this.scene.remove(batch.mesh);batch.mesh.dispose();if(batch.shadow){this.scene.remove(batch.shadow);batch.shadow.dispose();}}
    // Attribute storage is shared between views; retain it until the entire cache ends.
    for(const view of this.views)view.dispose();
    for(const template of this.templates.values())template.geometry?.dispose();
    for(const geometry of this.shadowGeometries.values())geometry.dispose();
    for(const material of this.materials.values())material.dispose();
    this.shadowMaterial.dispose();this.depth.dispose();this.batches.clear();this.views.clear();this.templates.clear();this.shadowGeometries.clear();this.materials.clear();this.entries=[];this.pendingSince.clear();this.sectors.clear();
  }
}

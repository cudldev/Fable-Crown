import { expect, test } from "vitest";
import { BufferGeometry, InstancedMesh, Matrix4, MeshBasicMaterial, MeshLambertMaterial, OrthographicCamera, Scene,ShaderLib } from "three";
import { VoxelMeshes, type VoxelMeshOptions } from "../src/render/three/voxel-meshes";
import { voxelObject } from "../src/render/three/voxel-assets";
import { voxelModel, type VoxelGrid } from "../src/render/three/voxel-data";
import { bakeVoxelModelSurfaces } from "../src/render/three/voxel-surface";

function baked(n = 16, checker = true, cut?: number) {
  const grid: VoxelGrid = { size: [n,n,n], cells: new Uint8Array(n ** 3), palette: new Uint8Array([125,150,80,255, 140,100,60,255]) };
  for(let x=0;x<n;x++) for(let y=0;y<n;y++) for(let z=0;z<n;z++) grid.cells[(x*n+y)*n+z]=checker?(x+y+z)%2+1:1;
  const pivot=[n/2,n/2,0], model=voxelModel(grid,.0625,pivot,cut);
  bakeVoxelModelSurfaces(grid,model,.0625,pivot,cut); return model;
}
function camera(extent = 5, x = 2) {
  const c=new OrthographicCamera(-extent,extent,extent,-extent,.1,200);c.position.set(x,20,2);c.up.set(0,0,-1);c.lookAt(x,0,2);c.updateMatrixWorld();return c;
}
function move(c: OrthographicCamera,x:number) {c.position.x=x;c.lookAt(x,0,2);c.updateMatrixWorld();}
function meshes(scene: Scene) {const all:InstancedMesh[]=[];scene.traverse(object=>{if(object instanceof InstancedMesh)all.push(object);});return all;}
const color=(scene:Scene)=>meshes(scene).filter(mesh=>mesh.userData.voxelStatic&&mesh.visible&&mesh.count>0);
const shadow=(scene:Scene)=>meshes(scene).filter(mesh=>mesh.userData.voxelStaticShadow&&mesh.visible);
function surfaceShader(material:MeshLambertMaterial){const shader={...ShaderLib.lambert,uniforms:{...ShaderLib.lambert.uniforms}};material.onBeforeCompile(shader as never,{}as never);return shader;}
class Frames {now=0;tick(renderer:VoxelMeshes,c:OrthographicCamera,height=2000){this.now+=16;renderer.update(c,height,undefined,this.now);}}
function settle(renderer:VoxelMeshes,c:OrthographicCamera,clock:Frames,height=2000) {
  let count=0;do{clock.tick(renderer,c,height);count++;}while((renderer.stats.queued||renderer.stats.transitions)&&count<200);
  expect(renderer.stats.queued).toBe(0);expect(renderer.stats.transitions).toBe(0);
}

test("surface normals keep the source grid through LOD changes and live tuning preserves geometry",()=>{
  const scene=new Scene(),model=baked(16,false),art=voxelObject({model}),c=camera(),clock=new Frames(),renderer=new VoxelMeshes(scene);
  art.group.position.x=2;scene.add(art.group);
  try{
    renderer.replace([{art}]);settle(renderer,c,clock);
    const first=color(scene)[0],material=first.material as MeshLambertMaterial,shader=surfaceShader(material),geometry=first.geometry,builds=renderer.stats.templateBuilds,key=material.customProgramCacheKey();
    expect(shader.uniforms.fableSurfacePitch.value).toBe(model.pitch);
    expect(shader.uniforms.fableSurfaceOrigin.value.toArray()).toEqual(model.surfaces![0].bounds.min);
    renderer.setSurfaceDetail(0,.9);clock.tick(renderer,c);
    expect(shader.uniforms.fableSurfaceStrength.value).toBe(0);expect(shader.uniforms.fableSurfaceVariation.value).toBe(.9);
    expect(color(scene)[0].geometry).toBe(geometry);expect(renderer.stats.templateBuilds).toBe(builds);expect(material.customProgramCacheKey()).toBe(key);
    settle(renderer,c,clock,100);
    const coarse=surfaceShader(color(scene)[0].material as MeshLambertMaterial);
    expect(coarse.uniforms.voxelSurfacePitch.value).toBeGreaterThan(shader.uniforms.voxelSurfacePitch.value);
    expect(coarse.uniforms.fableSurfacePitch.value).toBe(model.pitch);expect(coarse.uniforms.fableSurfaceOrigin.value.toArray()).toEqual(model.surfaces![0].bounds.min);
    expect(coarse.uniforms.fableSurfaceStrength.value).toBe(0);
  }finally{renderer.dispose();}
});

test("first appearance stays hidden until the requested static template is ready, then fades for140ms",()=>{
  const scene=new Scene(), model=baked(), art=voxelObject({model}), c=camera(), clock=new Frames();art.group.position.x=2;scene.add(art.group);
  const renderer=new VoxelMeshes(scene,{maxAdmittedTemplatesPerFrame:0});
  try {
    renderer.replace([{art}]);clock.tick(renderer,c);
    expect(renderer.stats.queued).toBe(1);expect(renderer.stats.instances).toBe(0);expect(color(scene)).toHaveLength(0);
    const cleanup=renderer.beginWarmup();cleanup();clock.tick(renderer,c);
    const visible=color(scene);expect(visible).toHaveLength(1);expect(renderer.stats.instances).toBe(1);expect(renderer.stats.transitions).toBe(1);
    expect(visible[0].geometry.getAttribute("position").array).toBe(model.surfaces![0].positions);
    const fade=()=>visible[0].geometry.getAttribute("voxelTransition").array[0];expect(fade()).toBeLessThan(0);
    for(let frame=0;frame<8;frame++)clock.tick(renderer,c);
    expect(renderer.stats.transitions).toBe(1);expect(fade()).toBeLessThan(0);
    clock.tick(renderer,c);expect(renderer.stats.transitions).toBe(0);expect(fade()).toBe(0);
  } finally {renderer.dispose();}
});

test("many copies and spatial batches share one admitted source template and vertex attributes",()=>{
  const scene=new Scene(),model=baked(4),c=camera(40,0),clock=new Frames(),renderer=new VoxelMeshes(scene);
  const make=(x:number)=>{const art=voxelObject({model});art.group.position.x=x;scene.add(art.group);return {art};};
  try {
    renderer.replace([make(0),make(18)]);settle(renderer,c,clock);
    const batches=color(scene);expect(batches).toHaveLength(2);expect(renderer.stats.templateBuilds).toBe(1);
    for(const key of ["position","normal","color","voxelSurfaceAO"])expect(batches[0].geometry.getAttribute(key)).toBe(batches[1].geometry.getAttribute(key));
    expect(batches[0].geometry.index).toBe(batches[1].geometry.index);
    expect(batches[0].geometry.getAttribute("position").array).toBe(model.surfaces![0].positions);
    expect(batches[0].geometry.getAttribute("voxelTransition")).not.toBe(batches[1].geometry.getAttribute("voxelTransition"));
    const builds=renderer.stats.templateBuilds,bytes=renderer.stats.geometryBytes;
    renderer.replace(Array.from({length:100},(_,i)=>make(i%2?0:18)));clock.tick(renderer,c);
    expect(renderer.stats.queued).toBe(0);expect(renderer.stats.templateBuilds).toBe(builds);expect(renderer.stats.geometryBytes).toBe(bytes);
    expect(renderer.stats.instances).toBe(100);expect(color(scene).reduce((sum,mesh)=>sum+mesh.count,0)).toBe(100);
    expect(renderer.stats.equivalentCells).toBe(100*model.levels[0].count);
    expect(color(scene).every(mesh=>mesh.instanceMatrix.count<=100)).toBe(true);
    expect(renderer.stats.stagedCells).toBe(0);
  } finally {renderer.dispose();}
});

for(const presented of [false,true])test(`cached coarse ${presented?"reentry":"prefetch"} never becomes a placeholder for missing fine geometry`,()=>{
  const scene=new Scene(),model=baked(),art=voxelObject({model}),c=camera(5,presented?12:2),clock=new Frames();art.group.position.x=12;scene.add(art.group);
  const options:VoxelMeshOptions={maxAdmittedTemplatesPerFrame:1},renderer=new VoxelMeshes(scene,options);
  try {
    renderer.replace([{art}]);settle(renderer,c,clock,80);
    if(presented)expect(color(scene)).toHaveLength(1);
    move(c,2);clock.tick(renderer,c,80);expect(color(scene)).toHaveLength(0);
    options.maxAdmittedTemplatesPerFrame=0;move(c,12);clock.tick(renderer,c);
    expect(renderer.stats.queued).toBe(1);expect(renderer.stats.instances).toBe(0);expect(color(scene)).toHaveLength(0);
    const cleanup=renderer.beginWarmup();cleanup();clock.tick(renderer,c);
    expect(color(scene)).toHaveLength(1);expect(color(scene)[0].geometry.getAttribute("position").array).toBe(model.surfaces![0].positions);
    expect(renderer.stats.transitions).toBe(1);settle(renderer,c,clock);
  } finally {renderer.dispose();}
});

test("an already visible mesh stays until its finer template is admitted",()=>{
  const scene=new Scene(),model=baked(),art=voxelObject({model}),c=camera(100),clock=new Frames();art.group.position.x=2;scene.add(art.group);
  const options:VoxelMeshOptions={maxAdmittedTemplatesPerFrame:1},renderer=new VoxelMeshes(scene,options);
  try {
    renderer.replace([{art}]);settle(renderer,c,clock);const previous=color(scene)[0];
    expect(previous.geometry.getAttribute("position").array).toBe(model.surfaces![1].positions);
    options.maxAdmittedTemplatesPerFrame=0;c.left=c.bottom=-5;c.right=c.top=5;c.updateProjectionMatrix();clock.tick(renderer,c);
    expect(renderer.stats.queued).toBe(1);expect(color(scene)).toEqual([previous]);
    const cleanup=renderer.beginWarmup();cleanup();clock.tick(renderer,c);
    expect(renderer.stats.transitions).toBe(1);expect(color(scene)).toHaveLength(2);settle(renderer,c,clock);
    expect(color(scene)).toHaveLength(1);expect(color(scene)[0].geometry.getAttribute("position").array).toBe(model.surfaces![0].positions);
  } finally {renderer.dispose();}
});

test("returning camera targets reverse a fade without revealing a stale coarser target",()=>{
  const scene=new Scene(),model=baked(),art=voxelObject({model}),c=camera(),clock=new Frames(),renderer=new VoxelMeshes(scene);art.group.position.x=2;scene.add(art.group);
  try {
    renderer.replace([{art}]);const cleanup=renderer.beginWarmup();cleanup();settle(renderer,c,clock);
    c.left=c.bottom=-100;c.right=c.top=100;c.updateProjectionMatrix();clock.tick(renderer,c);clock.tick(renderer,c);
    expect(color(scene)).toHaveLength(2);
    c.left=c.bottom=-5;c.right=c.top=5;c.updateProjectionMatrix();clock.tick(renderer,c);
    settle(renderer,c,clock);
    expect(color(scene)).toHaveLength(1);expect(color(scene)[0].geometry.getAttribute("position").array).toBe(model.surfaces![0].positions);
    expect(renderer.stats.objectLods).toEqual([1,0,0,0,0]);
  } finally {renderer.dispose();}
});

test("dedicated cheaper casters share silhouette buffers and contribute zero normal draw range",()=>{
  const scene=new Scene(),model=baked(4),c=camera(40,0),clock=new Frames(),renderer=new VoxelMeshes(scene);
  const arts=[0,18].map(x=>{const art=voxelObject({model});art.group.position.x=x;scene.add(art.group);return {art};});
  try {
    expect(model.surfaces![0].shadow).toBeDefined();renderer.replace(arts);settle(renderer,c,clock);
    const normal=color(scene),casters=shadow(scene);expect(normal).toHaveLength(2);expect(casters).toHaveLength(2);
    expect(normal.every(mesh=>!mesh.castShadow)).toBe(true);
    expect(casters[0].geometry.getAttribute("position")).toBe(casters[1].geometry.getAttribute("position"));
    expect(casters[0].geometry.getAttribute("position").array).toBe(model.surfaces![0].shadow!.positions);
    for(const caster of casters) {
      expect(normal.some(mesh=>mesh.instanceMatrix===caster.instanceMatrix)).toBe(true);
      expect((caster.material as MeshBasicMaterial).colorWrite).toBe(false);expect((caster.material as MeshBasicMaterial).depthWrite).toBe(false);
      expect(caster.geometry.drawRange.count).toBe(0);
      expect(caster.count).toBe(0);
      caster.onBeforeShadow(null as never,scene,c,c,caster.geometry,caster.customDepthMaterial!,null as never);
      expect(caster.geometry.drawRange.count).toBe(model.surfaces![0].shadow!.indices.length);
      expect(caster.count).toBeGreaterThan(0);
      caster.onAfterShadow(null as never,scene,c,c,caster.geometry,caster.customDepthMaterial!,null as never);
      expect(caster.geometry.drawRange.count).toBe(0);expect(caster.count).toBe(0);
    }
    expect(renderer.stats.shadowTriangles).toBeLessThan(renderer.stats.visibleTriangles);
    expect(renderer.stats.geometryBytes).toBe(model.surfaces![0].bytes+model.surfaces![0].shadow!.bytes);
  } finally {renderer.dispose();}
});

test("an already minimal uniform surface reuses its own exact depth geometry",()=>{
  const scene=new Scene(),model=baked(2,false),art=voxelObject({model}),c=camera(),clock=new Frames(),renderer=new VoxelMeshes(scene);art.group.position.x=2;scene.add(art.group);
  try {expect(model.surfaces![0].shadow).toBeUndefined();renderer.replace([{art}]);settle(renderer,c,clock);expect(shadow(scene)).toHaveLength(0);expect(color(scene)[0].castShadow).toBe(true);}
  finally {renderer.dispose();}
});

test("all visible LODs retain shared proxy or exact-geometry shadows through detail changes",()=>{
  const scene=new Scene(),model=baked(),art=voxelObject({model}),c=camera(),clock=new Frames(),renderer=new VoxelMeshes(scene);
  art.group.position.x=2;scene.add(art.group);
  try {
    renderer.replace([{art}]);const cleanup=renderer.beginWarmup();cleanup();
    settle(renderer,c,clock);
    const builds=renderer.stats.templateBuilds;
    for(const lod of [0,1,2,3,4,0]) {
      settle(renderer,c,clock,lod===0?2000:160/2**lod);
      expect(renderer.stats.objectLods[lod]).toBe(1);
      expect(renderer.stats.shadowTriangles).toBeGreaterThan(0);
      expect(renderer.stats.shadowTriangles).toBeLessThanOrEqual(renderer.stats.visibleTriangles);
      const main=color(scene)[0],proxy=shadow(scene)[0];
      if(proxy) {
        expect(main.castShadow).toBe(false);expect(proxy.castShadow).toBe(true);
        expect(proxy.instanceMatrix).toBe(main.instanceMatrix);
        expect(proxy.geometry.getAttribute("voxelTransition")).toBe(main.geometry.getAttribute("voxelTransition"));
        expect(proxy.count).toBe(0);expect(proxy.geometry.drawRange.count).toBe(0);
        proxy.onBeforeShadow(null as never,scene,c,c,proxy.geometry,proxy.customDepthMaterial!,null as never);
        expect(proxy.count).toBe(1);expect(proxy.geometry.drawRange.count).toBeGreaterThan(0);
        proxy.onAfterShadow(null as never,scene,c,c,proxy.geometry,proxy.customDepthMaterial!,null as never);
        expect(proxy.count).toBe(0);expect(proxy.geometry.drawRange.count).toBe(0);
      } else expect(main.castShadow).toBe(true);
    }
    expect(renderer.stats.templateBuilds).toBe(builds);
  } finally {renderer.dispose();}
});

test("depletion, removal and restoration reuse baked geometry and preserve object state",()=>{
  const scene=new Scene(),model=baked(4),depleted=baked(4,true,.125),art=voxelObject({model,depleted}),c=camera(),clock=new Frames(),renderer=new VoxelMeshes(scene);art.group.position.x=2;scene.add(art.group);
  try {
    renderer.replace([{art}]);const cleanup=renderer.beginWarmup();cleanup();settle(renderer,c,clock);const builds=renderer.stats.templateBuilds;
    art.depleted.visible=true;art.available.visible=false;settle(renderer,c,clock);
    expect(color(scene)[0].geometry.getAttribute("position").array).toBe(depleted.surfaces![0].positions);
    expect(renderer.stats.equivalentCells).toBe(depleted.levels[0].count);
    art.group.visible=false;clock.tick(renderer,c);expect(renderer.stats.instances).toBe(0);expect(shadow(scene)).toHaveLength(0);
    art.group.visible=true;art.depleted.visible=false;art.available.visible=true;settle(renderer,c,clock);
    expect(color(scene)[0].geometry.getAttribute("position").array).toBe(model.surfaces![0].positions);
    expect(renderer.stats.templateBuilds).toBe(builds);
  } finally {renderer.dispose();}
});

test("same-count replacement refreshes transforms and affine object matrices keep source geometry unexpanded",()=>{
  const scene=new Scene(),model=baked(4),art=voxelObject({model}),c=camera(),clock=new Frames(),renderer=new VoxelMeshes(scene);scene.add(art.group);
  try {
    renderer.replace([{art}]);settle(renderer,c,clock);const builds=renderer.stats.templateBuilds;
    art.group.position.x=3;renderer.replace([{art}]);settle(renderer,c,clock);
    const actual=new Matrix4();color(scene)[0].getMatrixAt(0,actual);expect(actual.elements[12]).toBe(3);
    const root=new Matrix4().set(.8,.12,-.4,3.5,-.3,1.3,.05,2.1,.2,-.15,-.7,-1.2,0,0,0,1);
    art.group.matrixAutoUpdate=false;art.group.matrix.copy(root);art.group.matrixWorldNeedsUpdate=true;clock.tick(renderer,c);
    color(scene)[0].getMatrixAt(0,actual);expect(new Float32Array(actual.elements)).toEqual(new Float32Array(root.elements));
    expect(renderer.stats.templateBuilds).toBe(builds);expect(color(scene)[0].count).toBe(1);
    expect(color(scene)[0].geometry.getAttribute("position").array).toBe(model.surfaces![0].positions);
  } finally {renderer.dispose();}
});

test("batch deactivation retains shared attributes until the cache is disposed",()=>{
  const scene=new Scene(),model=baked(4),art=voxelObject({model}),c=camera(),clock=new Frames(),renderer=new VoxelMeshes(scene);art.group.position.x=2;scene.add(art.group);
  const geometries=new Set<BufferGeometry>();let released=0;
  try {
    renderer.replace([{art}]);settle(renderer,c,clock);
    for(const mesh of meshes(scene)){geometries.add(mesh.geometry);mesh.geometry.addEventListener("dispose",()=>released++);}
    const position=color(scene)[0].geometry.getAttribute("position"),builds=renderer.stats.templateBuilds;
    move(c,100);clock.tick(renderer,c);expect(released).toBe(0);expect(color(scene)).toHaveLength(0);
    move(c,2);settle(renderer,c,clock);expect(color(scene)[0].geometry.getAttribute("position")).toBe(position);expect(renderer.stats.templateBuilds).toBe(builds);
    renderer.dispose();expect(released).toBe(geometries.size);expect(meshes(scene)).toHaveLength(0);
  } finally {renderer.dispose();}
});

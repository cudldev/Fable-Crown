import { expect, test } from "@playwright/test";
import { build } from "esbuild";
import { mkdir, readFile, writeFile } from "node:fs/promises";

test("shared greedy shadow meshes darken receivers while contributing zero primary color/depth draws", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", error => errors.push(error.message));
  page.on("console", message => { if (message.type() === "error") errors.push(message.text()); });
  const bundle = await build({ stdin: { resolveDir: process.cwd(), sourcefile: "voxel-shadow-lab.ts", contents: `
import * as THREE from 'three';
import {VoxelMeshes} from './src/render/three/voxel-meshes';
import {voxelModel} from './src/render/three/voxel-data';
import {bakeVoxelModelSurfaces} from './src/render/three/voxel-surface';
import {voxelObject} from './src/render/three/voxel-assets';
import {WorldCurve} from './src/render/three/world-curve';
void (async()=>{
const renderer=new THREE.WebGLRenderer({canvas:document.querySelector('canvas'),antialias:false,preserveDrawingBuffer:true});
renderer.setSize(256,256);renderer.outputColorSpace=THREE.SRGBColorSpace;renderer.toneMapping=THREE.NoToneMapping;renderer.shadowMap.enabled=true;renderer.shadowMap.type=THREE.PCFShadowMap;
const scene=new THREE.Scene();scene.background=new THREE.Color(.04,.08,.12);
const camera=new THREE.OrthographicCamera(-3,3,3,-3,.1,30);camera.position.set(5.8,5,6);camera.lookAt(1.8,.4,0);camera.updateMatrixWorld();
const sun=new THREE.DirectionalLight(0xffffff,2);sun.position.set(-1.2,6,3);sun.target.position.set(1.8,0,0);sun.castShadow=true;
Object.assign(sun.shadow.camera,{left:-4,right:4,top:4,bottom:-4,near:.1,far:20});sun.shadow.mapSize.set(256,256);sun.shadow.bias=-.00005;sun.shadow.normalBias=0;sun.shadow.radius=1;
const ambient=new THREE.AmbientLight(0xffffff,.25);scene.add(sun,sun.target,ambient);
const floor=new THREE.Mesh(new THREE.PlaneGeometry(8,8),new THREE.MeshLambertMaterial({color:0xffffff}));floor.rotation.x=-Math.PI/2;floor.position.set(1.8,-.02,0);floor.receiveShadow=true;scene.add(floor);
const grid={size:[4,4,4],cells:new Uint8Array(64).fill(1),palette:new Uint8Array([180,120,60,255,50,100,180,255])};
for(let x=2;x<4;x++)for(let y=0;y<4;y++)for(let z=0;z<4;z++)grid.cells[(x*4+y)*4+z]=2;
const model=voxelModel(grid,.25,[2,2,0]);bakeVoxelModelSurfaces(grid,model,.25,[2,2,0]);const surface=model.surfaces[0];
const objects=[.8,2.8].map(x=>{const art=voxelObject({model});art.group.position.x=x;art.group.userData.voxelAsset='tree';scene.add(art.group);return {art};});
const voxels=new VoxelMeshes(scene),curve=new WorldCurve();curve.update(new THREE.Vector3(1.8,0,0),2,1,true);voxels.replace(objects);
const endWarmup=voxels.beginWarmup(),warmNodes=scene.children.filter(n=>n.userData.voxelStatic||n.userData.voxelStaticShadow).length;
const depthSources=[];const warmCaster=scene.children.find(n=>n.userData.voxelStaticShadow),depthMaterial=warmCaster.customDepthMaterial,previousCompile=depthMaterial.onBeforeCompile;
depthMaterial.onBeforeCompile=function(shader,r){previousCompile.call(this,shader,r);depthSources.push({vertex:shader.vertexShader,fragment:shader.fragmentShader});};
curve.decorate(scene);curve.prepareCulling(scene);await renderer.compileAsync(scene,camera);renderer.render(scene,camera);endWarmup();
const warmRemaining=scene.children.filter(n=>n.userData.voxelStatic||n.userData.voxelStaticShadow).length;
const gl=renderer.getContext(),calls=[];let activeShadow=false,pass='color';
const renderDirect=renderer.renderBufferDirect.bind(renderer);renderer.renderBufferDirect=function(c,s,g,m,o,group){const prior=activeShadow,priorPass=pass;activeShadow=o.userData.voxelStaticShadow===true;if(c===sun.shadow.camera)pass='shadow';try{return renderDirect(c,s,g,m,o,group);}finally{activeShadow=prior;pass=priorPass;}};
const drawInstances=gl.drawElementsInstanced.bind(gl);gl.drawElementsInstanced=function(mode,count,type,offset,instances){if(activeShadow)calls.push({pass,count,instances});return drawInstances(mode,count,type,offset,instances);};
function update(time){voxels.update(camera,256,curve,time);curve.decorate(scene);curve.prepareCulling(scene);}
function draw(){renderer.render(scene,camera);const p=new Uint8Array(256*256*4);gl.readPixels(0,0,256,256,gl.RGBA,gl.UNSIGNED_BYTE,p);return p;}
function changed(a,b){let n=0;for(let i=0;i<a.length;i+=4)if(Math.abs(a[i]-b[i])+Math.abs(a[i+1]-b[i+1])+Math.abs(a[i+2]-b[i+2])>6)n++;return n;}
update(0);const emptyReveal=draw(),liveNodes=scene.children.filter(n=>n.userData.voxelStatic||n.userData.voxelStaticShadow);for(const n of liveNodes)n.visible=false;const emptyBaseline=draw();for(const n of liveNodes)n.visible=true;
const revealShadowError=changed(emptyReveal,emptyBaseline);
renderer.shadowMap.enabled=false;sun.intensity=0;ambient.intensity=1;
const blank=draw();update(70);const half=draw();update(140);const full=draw();
const halfCoverage=changed(blank,half),fullCoverage=changed(blank,full);
const main=scene.children.find(n=>n.userData.voxelStatic&&n.visible),caster=scene.children.find(n=>n.userData.voxelStaticShadow&&n.visible);
const shared={positions:main.geometry.getAttribute('position').array===surface.positions,indices:main.geometry.index.array===surface.indices,
  matrix:caster.instanceMatrix===main.instanceMatrix,fade:caster.geometry.getAttribute('voxelTransition')===main.geometry.getAttribute('voxelTransition'),
  bounds:caster.boundingBox.equals(main.boundingBox)&&caster.boundingSphere.equals(main.boundingSphere),instances:main.count,drawRange:caster.geometry.drawRange.count,casterCount:caster.count};
update(200);const builds=voxels.stats.templateBuilds;update(220);const buildsStable=voxels.stats.templateBuilds===builds;
renderer.shadowMap.enabled=true;sun.intensity=2;ambient.intensity=.25;calls.length=0;const shadowed=draw();const shadowCalls=calls.slice();
caster.castShadow=false;const unshadowed=draw();caster.castShadow=true;
let receiverDarkPixels=0;for(let i=0;i<shadowed.length;i+=4){const white=Math.max(unshadowed[i],unshadowed[i+1],unshadowed[i+2])-Math.min(unshadowed[i],unshadowed[i+1],unshadowed[i+2])<3;if(white&&unshadowed[i]-shadowed[i]>8)receiverDarkPixels++;}
renderer.shadowMap.enabled=false;calls.length=0;pass='color';draw();const colorCalls=calls.slice(),colorTriangles=renderer.info.render.triangles;
const override=new THREE.MeshDepthMaterial();scene.overrideMaterial=override;calls.length=0;pass='depth';draw();const depthCalls=calls.slice(),depthTriangles=renderer.info.render.triangles;scene.overrideMaterial=null;
const logicalDepth=depthSources.length>0&&depthSources.every(source=>!source.vertex.includes('fableCurvePoint')&&source.fragment.includes('fableVoxelThreshold(gl_FragCoord.xy)'));
voxels.dispose();const remaining=scene.children.filter(n=>n.userData.voxelStatic||n.userData.voxelStaticShadow).length,memoryGeometries=renderer.info.memory.geometries;
renderer.render(scene,camera);
window.voxelShadowLab={warmNodes,warmRemaining,revealShadowError,halfCoverage,fullCoverage,receiverDarkPixels,shared,buildsStable,logicalDepth,shadowCalls,colorCalls,depthCalls,colorTriangles,depthTriangles,
  visibleTriangles:surface.triangles,shadowTriangles:surface.shadow.triangles,remaining,memoryGeometries,glError:gl.getError()};
curve.dispose();floor.geometry.dispose();floor.material.dispose();override.dispose();sun.shadow.map?.dispose();sun.dispose();renderer.dispose();
})().catch(error=>{window.voxelShadowLabError=String(error?.stack??error);});
` }, bundle: true, format: "iife", write: false, logLevel: "error" });
  await page.setContent('<!doctype html><style>body{margin:0}</style><canvas></canvas>');
  await page.addScriptTag({ content: bundle.outputFiles[0].text });
  await page.waitForFunction(() => (window as unknown as { voxelShadowLab?: unknown; voxelShadowLabError?: string }).voxelShadowLab || (window as unknown as { voxelShadowLabError?: string }).voxelShadowLabError);
  const state = await page.evaluate(() => ({ result: (window as unknown as { voxelShadowLab?: {
    warmNodes: number; warmRemaining: number; revealShadowError: number; halfCoverage: number; fullCoverage: number; receiverDarkPixels: number;
    shared: { positions: boolean; indices: boolean; matrix: boolean; fade: boolean; bounds: boolean; instances: number; drawRange: number; casterCount: number };
    buildsStable: boolean; logicalDepth: boolean; shadowCalls: { pass: string; count: number; instances: number }[];
    colorCalls: unknown[]; depthCalls: unknown[]; colorTriangles: number; depthTriangles: number; visibleTriangles: number; shadowTriangles: number;
    remaining: number; memoryGeometries: number; glError: number;
  } }).voxelShadowLab, error: (window as unknown as { voxelShadowLabError?: string }).voxelShadowLabError }));
  expect(state.error).toBeUndefined(); const result = state.result!;
  expect(result.warmNodes).toBeGreaterThan(0); expect(result.warmRemaining).toBe(0);
  expect(result.revealShadowError, "a fully hidden reveal must not cast a solid phantom shadow").toBe(0);
  expect(result.fullCoverage).toBeGreaterThan(100); expect(result.halfCoverage / result.fullCoverage).toBeGreaterThan(.45); expect(result.halfCoverage / result.fullCoverage).toBeLessThan(.55);
  expect(result.receiverDarkPixels).toBeGreaterThan(15);
  expect(result.shared).toEqual({ positions: true, indices: true, matrix: true, fade: true, bounds: true, instances: 2, drawRange: 0, casterCount: 0 });
  expect(result.shadowTriangles).toBeLessThan(result.visibleTriangles);
  expect(result.shadowCalls.length).toBeGreaterThan(0); expect(result.shadowCalls.every(call => call.pass === "shadow" && call.count > 0)).toBe(true);
  expect(result.shadowCalls.reduce((sum, call) => sum + call.count * call.instances / 3, 0)).toBe(result.shadowTriangles * 2);
  expect(result.colorCalls).toEqual([]); expect(result.depthCalls).toEqual([]);
  expect(result.colorTriangles).toBe(result.visibleTriangles * 2 + 2); expect(result.depthTriangles).toBe(result.colorTriangles);
  expect(result.logicalDepth).toBe(true); expect(result.buildsStable).toBe(true);
  expect(result.remaining).toBe(0); expect(result.memoryGeometries).toBe(1); expect(result.glError).toBe(0); expect(errors).toEqual([]);
});

test("native oak shadow proxy and shadow-only density candidates retain projected shape across three sun directions", async ({ page }) => {
  const output = "docs/performance/voxel-shadow-proxy"; await mkdir(output, { recursive: true });
  const bytes = await readFile("public/art3d/voxel/tree.vox"), errors: string[] = [];
  page.on("pageerror", error => errors.push(error.message));
  page.on("console", message => { if (message.type() === "error") errors.push(message.text()); });
  const bundle = await build({ stdin: { resolveDir: process.cwd(), sourcefile: "native-shadow-proxy-lab.ts", contents: `
import * as THREE from 'three';
import {VoxelMeshes} from './src/render/three/voxel-meshes';
import {parseVox,voxelModel} from './src/render/three/voxel-data';
import {bakeVoxelModelSurfaces,bakeDensityShadowProxy} from './src/render/three/voxel-surface';
import {voxelObject} from './src/render/three/voxel-assets';
void(async()=>{
const input=Uint8Array.from(atob(${JSON.stringify(bytes.toString("base64"))}),char=>char.charCodeAt(0)),grid=parseVox(input.buffer);
const model=voxelModel(grid,.0625,[34,35,0]);bakeVoxelModelSurfaces(grid,model,.0625,[34,35,0]);
const renderer=new THREE.WebGLRenderer({canvas:document.querySelector('canvas'),antialias:false,preserveDrawingBuffer:true});
const size=512;renderer.setSize(size,size);renderer.outputColorSpace=THREE.SRGBColorSpace;renderer.toneMapping=THREE.NoToneMapping;renderer.shadowMap.enabled=true;renderer.shadowMap.type=THREE.PCFShadowMap;
const scene=new THREE.Scene();scene.background=new THREE.Color(0xf5f2e9);
const camera=new THREE.OrthographicCamera(-12,12,12,-12,.1,100);camera.position.set(0,30,0);camera.up.set(0,0,-1);camera.lookAt(0,0,0);camera.updateMatrixWorld();
const sun=new THREE.DirectionalLight(0xffffff,2);sun.castShadow=true;sun.shadow.mapSize.set(2048,2048);sun.shadow.bias=-.00005;sun.shadow.normalBias=0;sun.shadow.radius=1;
Object.assign(sun.shadow.camera,{left:-16,right:16,top:16,bottom:-16,near:.1,far:80});scene.add(sun,sun.target,new THREE.AmbientLight(0xffffff,.15));
const floor=new THREE.Mesh(new THREE.PlaneGeometry(30,30),new THREE.MeshLambertMaterial({color:0xffffff}));floor.rotation.x=-Math.PI/2;floor.position.y=-.02;floor.receiveShadow=true;scene.add(floor);
const directions=[[-6,10,7],[9,8,-4],[-8,5,-7]],captured={};
const policies=[{name:'exact',shadow:undefined},{name:'current',shadow:model.shadowSurfaces[0]},{name:'rejected-or-1446',shadow:model.surfaces[2].shadow??model.surfaces[2]},{name:'lod1-exact',shadow:model.surfaces[1].shadow??model.surfaces[1]},
 ...[.125,.25,.375,.5].map(density=>({name:'density-'+String(density).replace('.',''),shadow:bakeDensityShadowProxy(grid,.0625,[34,35,0],4,density)}))];
function draw(){renderer.render(scene,camera);const pixels=new Uint8Array(size*size*4),gl=renderer.getContext();gl.readPixels(0,0,size,size,gl.RGBA,gl.UNSIGNED_BYTE,pixels);return {pixels,view:renderer.domElement.toDataURL('image/png')};}
function mask(baseline,actual){const result=new Uint8Array(size*size);for(let i=0;i<result.length;i++)result[i]=Number(baseline[i*4]-actual[i*4]>15);return result;}
function image(mask,other){const canvas=document.createElement('canvas');canvas.width=canvas.height=size;const context=canvas.getContext('2d'),pixels=context.createImageData(size,size);
for(let i=0;i<mask.length;i++){const target=((size-1-Math.floor(i/size))*size+i%size)*4,a=mask[i],b=other?.[i];const color=other?(a&&b?[30,30,30]:a?[40,90,220]:b?[235,150,40]:[245,242,233]):a?[0,0,0]:[255,255,255];pixels.data.set([...color,255],target);}context.putImageData(pixels,0,0);return canvas.toDataURL('image/png');}
for(const policy of policies){
 captured[policy.name]=[];const shadows=model.shadowSurfaces.slice();shadows[0]=policy.shadow;
 const source={...model,shadowSurfaces:policy.name==='exact'?undefined:shadows},art=voxelObject({model:source});scene.add(art.group);
 const voxels=new VoxelMeshes(scene);voxels.replace([{art}]);voxels.update(camera,size,undefined,0);voxels.update(camera,size,undefined,200);
 const colorMeshes=scene.children.filter(node=>node.userData.voxelStatic);for(const mesh of colorMeshes)mesh.visible=false;
 const caster=scene.children.find(node=>node.userData.voxelStaticShadow&&node.visible);if(!caster)throw Error('Native oak optimized caster not admitted');
 for(const direction of directions){sun.position.fromArray(direction).normalize().multiplyScalar(35);sun.target.position.set(0,0,0);sun.target.updateMatrixWorld();caster.castShadow=false;const baseline=draw();caster.castShadow=true;const actual=draw();const pixels=mask(baseline.pixels,actual.pixels);
 captured[policy.name].push({direction,mask:pixels,maskPNG:image(pixels),viewPNG:actual.view,triangles:voxels.stats.shadowTriangles});}
 voxels.dispose();scene.remove(art.group);
}
const profiles=policies.filter(policy=>policy.name!=='exact').map(policy=>({name:policy.name,bounds:policy.shadow.bounds,samples:directions.map((direction,index)=>{const exact=captured.exact[index],proxy=captured[policy.name][index];let intersection=0,union=0,exactPixels=0,proxyPixels=0;
for(let i=0;i<exact.mask.length;i++){const a=exact.mask[i],b=proxy.mask[i];intersection+=Number(a&&b);union+=Number(a||b);exactPixels+=a;proxyPixels+=b;}
return {direction,intersection,union,exactPixels,proxyPixels,iou:intersection/union,precision:intersection/proxyPixels,recall:intersection/exactPixels,exactTriangles:exact.triangles,proxyTriangles:proxy.triangles,
 exactMask:exact.maskPNG,proxyMask:proxy.maskPNG,exactView:exact.viewPNG,proxyView:proxy.viewPNG,overlay:image(exact.mask,proxy.mask)};})}));
window.nativeShadowProxyLab={profiles,exactBounds:model.surfaces[0].shadow.bounds,visibleTriangles:model.surfaces[0].triangles,glError:renderer.getContext().getError()};
floor.geometry.dispose();floor.material.dispose();sun.shadow.map?.dispose();sun.dispose();renderer.dispose();
})().catch(error=>{window.nativeShadowProxyLabError=String(error?.stack??error);});
` }, bundle: true, format: "iife", write: false, logLevel: "error" });
  await page.setContent('<!doctype html><style>body{margin:0}</style><canvas></canvas>');
  await page.addScriptTag({ content: bundle.outputFiles[0].text });
  await page.waitForFunction(() => (window as unknown as { nativeShadowProxyLab?: unknown; nativeShadowProxyLabError?: string }).nativeShadowProxyLab || (window as unknown as { nativeShadowProxyLabError?: string }).nativeShadowProxyLabError, null, { timeout: 30_000 });
  const state = await page.evaluate(() => ({ result: (window as unknown as { nativeShadowProxyLab?: {
    profiles: { name: string; bounds: { min: number[]; max: number[] }; samples: { direction: number[]; iou: number; exactPixels: number; proxyPixels: number; precision: number; recall: number; exactTriangles: number; proxyTriangles: number;
      exactMask: string; proxyMask: string; exactView: string; proxyView: string; overlay: string }[] }[];
    exactBounds: { min: number[]; max: number[] }; visibleTriangles: number; glError: number;
  } }).nativeShadowProxyLab, error: (window as unknown as { nativeShadowProxyLabError?: string }).nativeShadowProxyLabError }));
  expect(state.error).toBeUndefined(); const result = state.result!;
  const profiles = [];
  for (const profile of result.profiles) {
  const samples = [];
  for (const [index, sample] of profile.samples.entries()) {
    const { exactMask, proxyMask, exactView, proxyView, overlay, ...metrics } = sample;
    for (const [label, data] of Object.entries({ exactMask, proxyMask, exactView, proxyView, overlay })) await writeFile(`${output}/${profile.name}-sun-${index}-${label}.png`, Buffer.from(data.split(",")[1], "base64"));
    samples.push(metrics);
  }
  profiles.push({ name: profile.name, bounds: profile.bounds, samples });
  }
  const eligible = profiles.filter(profile => profile.samples.every(sample => sample.proxyTriangles <= 2000 && sample.iou >= .9));
  await writeFile(`${output}/candidate-review.json`, JSON.stringify({ profiles, eligible: eligible.map(profile => profile.name), exactBounds: result.exactBounds,
    visibleTriangles: result.visibleTriangles, glError: result.glError, errors,
    budget: 2000, minimumIoU: .9, boundsDelta: { min: [0, 0, -.125], max: [0, 0, 0] },
    note: "Production shadow-only factor4 density .375; rejected OR1446 and other experimental thresholds retained for comparison. Visible VOX surfaces unchanged. Production proxy expands runtime negative Z by .125m; recall is about .98 across the measured suns. Mask threshold: receiver red channel darkens >15; 512px overhead camera / PCF 2048. Overlay: exact-only blue, proxy-only amber, overlap charcoal. Current production policy must meet the unchanged .9 IoU gate." }, null, 2) + "\n");
  console.log("Native oak shadow candidates", JSON.stringify(profiles.map(profile => ({ name: profile.name, triangles: profile.samples[0].proxyTriangles, iou: profile.samples.map(sample => sample.iou), precision: profile.samples.map(sample => sample.precision), recall: profile.samples.map(sample => sample.recall), bounds: profile.bounds })), null, 2));
  expect(result.visibleTriangles).toBe(49656); expect(result.glError).toBe(0); expect(errors).toEqual([]);
  const current = profiles.find(profile => profile.name === "current")!;
  for (const sample of current.samples) {
    expect(sample.exactTriangles).toBe(9806); expect(sample.proxyTriangles).toBe(1972); expect(sample.proxyTriangles).toBeLessThanOrEqual(2000);
    expect(sample.exactPixels).toBeGreaterThan(500); expect(sample.proxyPixels).toBeGreaterThan(500);
    expect(sample.iou, `projected shadow shape for sun ${sample.direction.join(",")}`).toBeGreaterThanOrEqual(.9);
  }
});

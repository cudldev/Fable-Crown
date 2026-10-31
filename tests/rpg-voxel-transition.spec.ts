import { expect, test } from "@playwright/test";
import { build } from "esbuild";

test("opaque voxel LOD masks partition GPU pixels without holes, blended ghosts or depth-order changes", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", error => errors.push(error.message));
  page.on("console", message => { if (message.type() === "error") errors.push(message.text()); });
  const bundled = await build({ stdin: { resolveDir: process.cwd(), sourcefile: "voxel-transition-lab.ts", contents: `
import * as THREE from 'three';
import { installVoxelTransition,setVoxelTransition,clearVoxelTransition,createVoxelTransitionDepthMaterial } from './src/render/three/voxel-transition';
import { WorldCurve } from './src/render/three/world-curve';
const renderer=new THREE.WebGLRenderer({canvas:document.querySelector('canvas'),antialias:false,preserveDrawingBuffer:true});
renderer.setSize(128,128);renderer.outputColorSpace=THREE.SRGBColorSpace;renderer.toneMapping=THREE.NoToneMapping;
const scene=new THREE.Scene();scene.background=new THREE.Color(0x00ff00);
const camera=new THREE.OrthographicCamera(-1,1,1,-1,.1,20);camera.position.set(0,0,5);camera.lookAt(0,0,0);camera.updateMatrixWorld();
const red=installVoxelTransition(new THREE.MeshBasicMaterial({color:0xff0000})),blue=installVoxelTransition(new THREE.MeshBasicMaterial({color:0x0000ff}));
const outgoing=new THREE.InstancedMesh(new THREE.BoxGeometry(),red,1),incoming=new THREE.InstancedMesh(new THREE.BoxGeometry(),blue,1);
outgoing.setMatrixAt(0,new THREE.Matrix4());incoming.setMatrixAt(0,new THREE.Matrix4().makeTranslation(0,0,.05));
scene.add(outgoing,incoming);clearVoxelTransition(outgoing);setVoxelTransition(incoming,0,true);
const depth=createVoxelTransitionDepthMaterial();outgoing.customDepthMaterial=incoming.customDepthMaterial=depth;
const curve=new WorldCurve();curve.update(new THREE.Vector3(),2,1,true);curve.decorate(scene);
function draw(p,reverse=false){setVoxelTransition(outgoing,p,false);setVoxelTransition(incoming,p,true);outgoing.renderOrder=reverse?1:0;incoming.renderOrder=reverse?0:1;renderer.render(scene,camera);const gl=renderer.getContext(),pixels=new Uint8Array(128*128*4);gl.readPixels(0,0,128,128,gl.RGBA,gl.UNSIGNED_BYTE,pixels);return pixels;}
function inspect(pixels,x0=34,x1=94){let red=0,blue=0,holes=0,other=0;for(let y=34;y<94;y++)for(let x=x0;x<x1;x++){const at=(y*128+x)*4,r=pixels[at],g=pixels[at+1],b=pixels[at+2];if(r===255&&g===0&&b===0)red++;else if(r===0&&g===0&&b===255)blue++;else if(r===0&&g===255&&b===0)holes++;else other++;}return {red,blue,holes,other};}
draw(0);const programsBefore=renderer.info.programs.length;
const samples=[0,.5,1].map(p=>({p,...inspect(draw(p))}));
const thresholdTies=[.03125,.03125000000000001,.96875,.9687500000000001].map(p=>({p,...inspect(draw(p))}));
const forward=draw(.5),reverse=draw(.5,true);let orderError=0;for(let i=0;i<forward.length;i++)orderError=Math.max(orderError,Math.abs(forward[i]-reverse[i]));
const programsAfter=renderer.info.programs.length;
const occluder=new THREE.Mesh(new THREE.BoxGeometry(.5,1,.1),new THREE.MeshBasicMaterial({color:0x00ff00}));occluder.position.set(-.25,0,1);scene.add(occluder);
const masked=inspect(draw(.5),66,94),maskedLeft=inspect(draw(.5),34,62);scene.remove(occluder);
// Equal geometry/depth must reproduce an uninterrupted depth buffer exactly.
incoming.setMatrixAt(0,new THREE.Matrix4());incoming.instanceMatrix.needsUpdate=true;
scene.overrideMaterial=depth;scene.background.set(0xffffff);const reference=draw(0),partitioned=draw(.5);let depthError=0,depthCovered=0;
for(let y=34;y<94;y++)for(let x=34;x<94;x++){if(reference[(y*128+x)*4]<250)depthCovered++;for(let c=0;c<4;c++){const at=(y*128+x)*4+c;depthError=Math.max(depthError,Math.abs(reference[at]-partitioned[at]));}}
scene.overrideMaterial=null;scene.background.set(0x00ff00);outgoing.visible=incoming.visible=false;
const plain=new THREE.InstancedMesh(new THREE.BoxGeometry(),red,1);plain.setMatrixAt(0,new THREE.Matrix4());scene.add(plain);renderer.render(scene,camera);
const gl=renderer.getContext(),plainPixels=new Uint8Array(128*128*4);gl.readPixels(0,0,128,128,gl.RGBA,gl.UNSIGNED_BYTE,plainPixels);
window.voxelTransitionLab={samples,thresholdTies,orderError,depthError,depthCovered,masked,maskedLeft,plain:inspect(plainPixels),programsBefore,programsAfter,glError:gl.getError(),opaque:!red.transparent&&red.depthWrite&&!blue.transparent&&blue.depthWrite};
curve.dispose();for(const mesh of [outgoing,incoming,plain]){mesh.dispose();mesh.geometry.dispose();}occluder.geometry.dispose();occluder.material.dispose();red.dispose();blue.dispose();depth.dispose();renderer.dispose();
` }, bundle: true, format: "iife", write: false, logLevel: "error" });
  await page.setContent('<!doctype html><style>body{margin:0}canvas{display:block}</style><canvas></canvas>');
  await page.addScriptTag({ content: bundled.outputFiles[0].text });
  const result = await page.evaluate(() => (window as unknown as { voxelTransitionLab: {
    samples: { p: number; red: number; blue: number; holes: number; other: number }[];
    thresholdTies: { p: number; red: number; blue: number; holes: number; other: number }[];
    orderError: number; depthError: number; depthCovered: number; programsBefore: number; programsAfter: number; glError: number; opaque: boolean;
    masked: { red: number; blue: number; holes: number; other: number }; maskedLeft: { holes: number; other: number };
    plain: { red: number; blue: number; holes: number; other: number };
  } }).voxelTransitionLab);
  expect(result.samples).toEqual([
    { p: 0, red: 3600, blue: 0, holes: 0, other: 0 },
    { p: .5, red: 1800, blue: 1800, holes: 0, other: 0 },
    { p: 1, red: 0, blue: 3600, holes: 0, other: 0 },
  ]);
  expect(result.thresholdTies.map(sample => [sample.red, sample.blue, sample.holes, sample.other])).toEqual([
    [3600, 0, 0, 0], [3375, 225, 0, 0], [225, 3375, 0, 0], [0, 3600, 0, 0],
  ]);
  expect(result.orderError).toBe(0); expect(result.depthError).toBe(0); expect(result.depthCovered).toBe(3600);
  expect(result.masked.holes).toBe(0); expect(result.masked.other).toBe(0);
  expect(result.masked.red).toBeGreaterThan(0); expect(result.masked.blue).toBeGreaterThan(0);
  expect(result.maskedLeft.holes).toBe(28 * 60); expect(result.maskedLeft.other).toBe(0);
  expect(result.plain).toEqual({ red: 3600, blue: 0, holes: 0, other: 0 });
  expect(result.programsAfter).toBe(result.programsBefore);
  expect(result.opaque).toBe(true); expect(result.glError).toBe(0); expect(errors).toEqual([]);
});

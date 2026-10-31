import { test, expect } from "@playwright/test";
import { build } from "esbuild";
import { mkdir, writeFile } from "node:fs/promises";

type EdgeReview = { mean: number; max: number; changed: number; glError: number };
type EdgeWindow = Window & { edgeReview: EdgeReview[]; edgePreview: () => void; edgeDispose: () => void };
test("fully fogged geometry merges into sky without a depth or grading outline", async ({ page }) => {
  const output = "docs/art-audit/fog-edge-v1"; await mkdir(output, { recursive: true }); const errors: string[] = [];
  page.on("pageerror", e => errors.push(e.message)); page.on("console", e => { if (e.type() === "error") errors.push(e.text()); });
  const bundle = await build({ stdin: { resolveDir: process.cwd(), contents: `
import * as T from 'three';import {SkySystem} from './src/render/three/sky';import {WorldCurve} from './src/render/three/world-curve';import {PostProcessing} from './src/render/three/post-processing';import {LightingRig} from './src/render/three/lighting';import {DEFAULT_VISUAL_SETTINGS as D} from './src/render/three/visual-settings';
const renderer=new T.WebGLRenderer({canvas:document.querySelector('canvas'),preserveDrawingBuffer:true});renderer.setSize(640,480);renderer.outputColorSpace=T.SRGBColorSpace;renderer.toneMapping=T.ACESFilmicToneMapping;renderer.shadowMap.enabled=true;renderer.shadowMap.type=T.PCFShadowMap;
const scene=new T.Scene(),sky=new SkySystem(scene),rig=new LightingRig(scene),curve=new WorldCurve(),post=new PostProcessing(renderer);
const camera=new T.PerspectiveCamera(45,640/480,.1,650);camera.position.set(0,20,40);camera.lookAt(0,0,0);camera.updateMatrixWorld();
const visual={...D,dayNightCycle:false,cloudCoverage:0,cloudSpeed:0,bloom:.12,lightRays:.65};rig.setVisual(visual);rig.setPreset('dusk');rig.update([],new T.Vector3(),0,false,45);sky.update(0,'dusk',visual);
curve.update(new T.Vector3(),2,2,true);curve.view.update(camera,new T.Vector3(),12,60,false);curve.setFogPalette(sky.fogPalette.low,sky.fogPalette.high,visual.fogGradient);curve.setAtmosphere(visual.atmosphereStrength);
const objects=[];for(let i=0;i<9;i++){const mesh=new T.Mesh(new T.PlaneGeometry(.08,2+(i%3)),new T.MeshLambertMaterial({color:i%2?0x12aa22:0xdd2211,side:T.DoubleSide}));mesh.position.set((i-4)*.14,3,-23.999);scene.add(mesh);objects.push(mesh);}
const batch=new T.InstancedMesh(new T.PlaneGeometry(.08,2),new T.MeshLambertMaterial({color:0x22cc22,side:T.DoubleSide}),3);for(let i=0;i<3;i++)batch.setMatrixAt(i,new T.Matrix4().makeTranslation(.7+i*.1,4,-23.999));scene.add(batch);objects.push(batch);
const curveState={center:new T.Vector3(),strength:curve.strength,range:curve.view.range.y};
function draw(show,settings=visual){objects.forEach(o=>o.visible=show);curve.decorate(scene);curve.prepareCulling(scene);post.render(renderer,scene,camera,settings,45,1,false,1,sky.lightSource,rig.sun,curveState);const gl=renderer.getContext(),pixels=new Uint8Array(640*480*4);gl.readPixels(0,0,640,480,gl.RGBA,gl.UNSIGNED_BYTE,pixels);return pixels;}
const review=[];for(const enabled of [true,false])for(const amount of [.65,0]){sky.mesh.visible=enabled;curve.setFogPalette(sky.fogPalette.low,sky.fogPalette.high,enabled?visual.fogGradient:0);const settings={...visual,skyEnabled:enabled,lightRays:amount},a=draw(false,settings),b=draw(true,settings);let total=0,max=0,changed=0;for(let i=0;i<a.length;i++)if(i%4!==3){const d=Math.abs(a[i]-b[i]);total+=d;max=Math.max(max,d);if(d>2)changed++;}review.push({mean:total/(a.length*.75),max,changed,glError:renderer.getContext().getError()});}
window.edgeReview=review;window.edgePreview=()=>{sky.mesh.visible=true;curve.setFogPalette(sky.fogPalette.low,sky.fogPalette.high,visual.fogGradient);draw(true);};window.edgeDispose=()=>{curve.dispose();post.dispose();sky.dispose();rig.dispose();scene.traverse(o=>{o.geometry?.dispose();o.material?.dispose();});renderer.dispose();};
` }, bundle: true, format: "iife", write: false, logLevel: "error" });
  await page.setContent('<!doctype html><style>body{margin:0}canvas{display:block}</style><canvas></canvas>'); await page.addScriptTag({ content: bundle.outputFiles[0].text });
  const review = await page.evaluate(() => (window as unknown as EdgeWindow).edgeReview);
  await page.evaluate(() => (window as unknown as EdgeWindow).edgePreview()); await page.screenshot({ path: output + "/cutoff.png" });
  await writeFile(output + "/review.json", JSON.stringify({ review, errors }, null, 2));
  for (const result of review) { expect(result.glError).toBe(0); expect(result.max).toBeLessThanOrEqual(2); expect(result.changed).toBe(0); }
  await page.evaluate(() => (window as unknown as EdgeWindow).edgeDispose()); expect(errors).toEqual([]);
});

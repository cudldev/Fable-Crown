import { test, expect } from "@playwright/test";
import { build } from "esbuild";
import { mkdir, writeFile } from "node:fs/promises";
type Result = { sun: number[]; noSun: number[]; moon: number[]; noMoon: number[]; rayDelta: number; blockedRayChange: number; passes: number };
type FogResult = { top: number[]; bottom: number[]; flatTop: number[]; flatBottom: number[]; glError: number };
type LabWindow = Window & { celestialLab: Result; previewSun: () => void; previewMoon: () => void; previewRays: () => void; fogLab: () => FogResult; disposeLab: () => void };

test("GPU sun/moon discs, safe missing-shadow fallback and vertical fog gradient", async ({ page }) => {
  const output = "docs/art-audit/celestial-rays-v1"; await mkdir(output, { recursive: true }); const errors: string[] = [];
  page.on("pageerror", e => errors.push(e.message)); page.on("console", e => { if (e.type() === "error") errors.push(e.text()); });
  const bundle = await build({ stdin: { resolveDir: process.cwd(), contents: `
import * as T from 'three';
import {SkySystem} from './src/render/three/sky';
import {WorldCurve} from './src/render/three/world-curve';
import {PostProcessing} from './src/render/three/post-processing';
import {DEFAULT_VISUAL_SETTINGS as D} from './src/render/three/visual-settings';
const renderer=new T.WebGLRenderer({canvas:document.querySelector('canvas'),preserveDrawingBuffer:true});renderer.setSize(640,480);renderer.outputColorSpace=T.SRGBColorSpace;renderer.toneMapping=T.ACESFilmicToneMapping;
const scene=new T.Scene(),camera=new T.PerspectiveCamera(50,640/480,.1,100);camera.updateMatrixWorld();
const sky=new SkySystem(scene),post=new PostProcessing(renderer),curve=new WorldCurve();
const visual={...D,dayNightCycle:false,sunAzimuth:270,sunElevation:5,cloudCoverage:0,bloom:0,chromaticAberration:0,lensDistortion:0,depthOfField:0,colorBalance:0,lightRays:0};
const occluder=new T.Mesh(new T.PlaneGeometry(.35,5),new T.MeshBasicMaterial({color:0}));occluder.position.set(.4,0,-6);scene.add(occluder);
function draw(p='day',v=visual){sky.update(0,p,v);post.render(renderer,scene,camera,v,5,1,false,1,sky.lightSource);return read();}
function read(){const gl=renderer.getContext(),data=new Uint8Array(640*480*4);gl.readPixels(0,0,640,480,gl.RGBA,gl.UNSIGNED_BYTE,data);return data;}
function at(data,x,y){return [...data.slice((y*640+x)*4,(y*640+x)*4+3)];}
function delta(a,b){let n=0;for(let i=0;i<a.length;i++)if(i%4!==3)n+=Math.abs(a[i]-b[i]);return n/(a.length*.75);}
const sun=draw(),noSun=draw('day',{...visual,sunStrength:0});
const point=sky.lightSource.direction.clone().multiplyScalar(20).project(camera),sx=Math.round((point.x+1)*320),sy=Math.round((point.y+1)*240);
const moon=draw('night'),noMoon=draw('night',{...visual,sunStrength:0});
const off=draw(),on=draw('day',{...visual,lightRays:1});
const contribution=new Int16Array(on.length);for(let i=0;i<on.length;i++)contribution[i]=on[i]-off[i];
occluder.position.x=-.4;const off2=draw(),on2=draw('day',{...visual,lightRays:1});let changed=0;for(let i=0;i<on.length;i++)if(i%4!==3)changed+=Math.abs((on2[i]-off2[i])-contribution[i]);
const result={sun:at(sun,sx,sy),noSun:at(noSun,sx,sy),moon:at(moon,sx,sy),noMoon:at(noMoon,sx,sy),rayDelta:delta(on,off),blockedRayChange:changed/(on.length*.75),passes:post.stats.rayPasses};
window.previewSun=()=>draw();window.previewMoon=()=>draw('night');window.previewRays=()=>draw('day',{...visual,lightRays:1});
window.fogLab=()=>{
 sky.mesh.visible=false;occluder.visible=false;scene.fog=new T.Fog(0x34505f,1,100);scene.background=new T.Color(0x34505f);
 camera.lookAt(0,-.5,-1);camera.updateMatrixWorld();
 const plane=new T.Mesh(new T.PlaneGeometry(50,50),new T.MeshBasicMaterial({color:0xffffff}));plane.position.set(0,-10,-20);scene.add(plane);
 curve.update(new T.Vector3(),2,0,true);curve.view.update(camera,new T.Vector3(),12,60,false);curve.view.range.set(1,21);curve.setAtmosphere(0);curve.setFogPalette(new T.Color(0xc99f78),new T.Color(0x586c9f),1);curve.decorate(scene);
 renderer.render(scene,camera);const g=read();curve.setFogPalette(new T.Color(),new T.Color(),0);renderer.render(scene,camera);const flat=read();
 curve.setFogPalette(new T.Color(0xc99f78),new T.Color(0x586c9f),1);renderer.render(scene,camera);
 return {top:at(g,320,400),bottom:at(g,320,80),flatTop:at(flat,320,400),flatBottom:at(flat,320,80),glError:renderer.getContext().getError()};
};window.celestialLab=result;
window.disposeLab=()=>{curve.dispose();post.dispose();sky.dispose();scene.traverse(o=>{o.geometry?.dispose();o.material?.dispose();});renderer.dispose();};
` }, bundle: true, format: "iife", write: false, logLevel: "error" });
  await page.setContent('<!doctype html><style>body{margin:0}canvas{display:block}</style><canvas></canvas>'); await page.addScriptTag({ content: bundle.outputFiles[0].text });
  const result = await page.evaluate(() => (window as unknown as LabWindow).celestialLab);
  expect(result.sun[0] - result.noSun[0]).toBeGreaterThan(20); expect(result.moon[2] - result.noMoon[2]).toBeGreaterThan(20);
  expect(result.rayDelta).toBe(0); expect(result.blockedRayChange).toBe(0); expect(result.passes).toBe(0);
  for (const kind of ["Sun", "Moon"] as const) { await page.evaluate(k => (window as unknown as LabWindow)[`preview${k}`](), kind); await page.screenshot({ path: output + "/" + kind.toLowerCase() + ".png" }); }
  const fog = await page.evaluate(() => (window as unknown as LabWindow).fogLab());
  const difference = (a: number[], b: number[]) => a.reduce((sum, v, i) => sum + Math.abs(v - b[i]), 0);
  expect(difference(fog.top, fog.bottom)).toBeGreaterThan(20); expect(difference(fog.flatTop, fog.flatBottom)).toBeLessThan(4); expect(fog.glError).toBe(0);
  await page.screenshot({ path: output + "/fog-gradient.png" }); await page.evaluate(() => (window as unknown as LabWindow).disposeLab());
  expect(errors).toEqual([]); await writeFile(output + "/review.json", JSON.stringify({ result, fog, errors }, null, 2));
});

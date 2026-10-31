import { expect, test } from "@playwright/test";
import { build } from "esbuild";
import { mkdir, writeFile } from "node:fs/promises";

test("game daylight still advances, fixed presets work and cycling reloads offline", async ({ page, context }) => {
  const output = "docs/art-audit/daylight-shadows-v1"; await mkdir(output, { recursive: true });
  const errors: string[] = [], external: string[] = [];
  page.on("pageerror", e => errors.push(e.message)); page.on("console", e => { if (e.type() === "error") errors.push(e.text()); });
  page.on("request", r => { const u = new URL(r.url()); if (u.protocol.startsWith("http") && u.hostname !== "127.0.0.1") external.push(u.href); });
  await page.goto("./"); const world = page.getByTestId("rpg-world");
  await expect(world).toHaveAttribute("data-status", "ready", { timeout: 60000 });
  await expect(world).toHaveAttribute("data-day-night-cycle", "true");
  const hour = Number(await world.getAttribute("data-day-hour"));
  await expect.poll(async () => Number(await world.getAttribute("data-day-hour"))).toBeGreaterThan(hour);
  await page.getByRole("button", { name: "Day lighting", exact: true }).click();
  await expect(world).toHaveAttribute("data-day-hour", "fixed");
  await page.getByRole("button", { name: "Day–night cycle", exact: true }).click();
  await expect(world).toHaveAttribute("data-day-night-cycle", "true");
  await page.screenshot({ path: `${output}/game.png` });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.screenshot({ path: `${output}/portrait.png` });
  await page.evaluate(async () => { await navigator.serviceWorker.ready; }); await context.setOffline(true); await page.reload();
  await expect(world).toHaveAttribute("data-status", "ready", { timeout: 60000 });
  await expect(world).toHaveAttribute("data-day-night-cycle", "true");
  expect(errors).toEqual([]); expect(external).toEqual([]);
  await writeFile(`${output}/game-review.json`, JSON.stringify({ errors, external }, null, 2));
});

test("cycling shadow pixels avoid the old rotating-grid jumps", async ({ page }) => {
  const output = "docs/art-audit/daylight-shadows-v1"; await mkdir(output, { recursive: true });
  const errors: string[] = []; page.on("pageerror", e => errors.push(e.message));
  page.on("console", e => { if (e.type() === "error") errors.push(e.text()); });
  const bundle = await build({ stdin: { resolveDir: process.cwd(), sourcefile: "shadow-lab.ts", contents: `
import * as THREE from 'three';
import { LightingRig } from './src/render/three/lighting';
import { cycleVisual,normalizeVisualSettings } from './src/render/three/visual-settings';
const renderer=new THREE.WebGLRenderer({canvas:document.querySelector('canvas'),preserveDrawingBuffer:true});renderer.setSize(640,480);renderer.shadowMap.enabled=true;renderer.shadowMap.type=THREE.PCFShadowMap;
const scene=new THREE.Scene(),rig=new LightingRig(scene),target=new THREE.Vector3(60,0,106);
const settings=normalizeVisualSettings({dayTime:16,ambientStrength:0,atmosphereStrength:0,shadowBias:-.0007,shadowNormalBias:.08});
const floor=new THREE.Mesh(new THREE.PlaneGeometry(40,40),new THREE.MeshLambertMaterial({color:0xffffff}));floor.rotation.x=-Math.PI/2;floor.position.copy(target);floor.receiveShadow=true;scene.add(floor);
for(let i=0;i<5;i++){const box=new THREE.Mesh(new THREE.BoxGeometry(.4+i*.15,2+i*.4,.4),new THREE.MeshLambertMaterial({color:0x9c8d70}));box.position.copy(target).add(new THREE.Vector3(-4+i*2,1+i*.2,0));box.castShadow=true;scene.add(box);}
const camera=new THREE.PerspectiveCamera(35,640/480,.1,200);camera.position.copy(target).add(new THREE.Vector3(10,13,16));camera.lookAt(target);
const gl=renderer.getContext();function trial(legacy){let prev,previousTarget,maxAnchorStep=0;const deltas=[];
for(let f=0;f<180;f++){
const visual=cycleVisual(settings,f/60);rig.setVisual(visual);rig.setPreset('day');rig.update([],target,f*1000/60,false);scene.fog=null;
// Hold palette/gain constant to isolate shadow motion from 8-bit daylight color changes.
rig.sun.color.setHex(0xffffff);rig.sun.intensity=1;rig.fill.intensity=0;
if(legacy){const offset=rig.sun.position.clone().sub(rig.sun.target.position),right=new THREE.Vector3(offset.z,0,-offset.x).normalize(),up=offset.clone().normalize().cross(right).normalize(),texel=visual.shadowCoverage/visual.shadowResolution;
const snapped=target.clone().addScaledVector(right,Math.round(target.dot(right)/texel)*texel-target.dot(right)).addScaledVector(up,Math.round(target.dot(up)/texel)*texel-target.dot(up));
rig.sun.target.position.copy(snapped);rig.sun.position.copy(snapped).add(offset);rig.sun.target.updateMatrixWorld();}
if(previousTarget)maxAnchorStep=Math.max(maxAnchorStep,rig.sun.target.position.distanceTo(previousTarget));previousTarget=rig.sun.target.position.clone();
renderer.render(scene,camera);const pixels=new Uint8Array(640*480*4);gl.readPixels(0,0,640,480,gl.RGBA,gl.UNSIGNED_BYTE,pixels);
if(prev){let delta=0;for(let y=180;y<400;y++)for(let x=90;x<550;x++){const at=(y*640+x)*4;delta+=Math.abs(pixels[at]-prev[at]);}deltas.push(delta/(220*460));}prev=pixels;}
deltas.sort((a,b)=>a-b);return {maxAnchorStep,mean:deltas.reduce((a,b)=>a+b,0)/deltas.length,p95:deltas[Math.floor(deltas.length*.95)],max:deltas.at(-1)};}
const legacy=trial(true),fixed=trial(false);window.shadowLab={legacy,fixed,glError:gl.getError()};rig.dispose();renderer.dispose();
` }, bundle: true, format: "iife", write: false, logLevel: "error" });
  await page.setContent('<!doctype html><style>body{margin:0}</style><canvas></canvas>');
  await page.addScriptTag({ content: bundle.outputFiles[0].text });
  const result = await page.evaluate(() => (window as unknown as { shadowLab: { legacy: { maxAnchorStep: number; max: number; p95: number; mean: number }; fixed: { maxAnchorStep: number; max: number; p95: number; mean: number }; glError: number } }).shadowLab);
  await writeFile(`${output}/review.json`, JSON.stringify({ ...result, errors }, null, 2));
  await page.screenshot({ path: `${output}/shadow-lab.png` });
  expect(result.legacy.maxAnchorStep).toBeGreaterThan(.02); expect(result.fixed.maxAnchorStep).toBe(0);
  expect(result.fixed.p95).toBeLessThan(result.legacy.p95 * .5);
  expect(result.fixed.mean).toBeLessThan(result.legacy.mean * .5);
  expect(result.glError).toBe(0); expect(errors).toEqual([]);
});

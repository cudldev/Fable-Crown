import { renderFrameCount } from "./render-profile";
import { test, expect } from "@playwright/test";
import { build } from "esbuild";
import { mkdir, writeFile } from "node:fs/promises";
import { createRpg } from "../src/rpg/engine";
import { interactionTiles, WORLD } from "../src/rpg/world";

type Review = { sourceBehindCamera: boolean; effect: number; blocked: number; stable: number; ortho: number; passes: number; disabled: number; glError: number };
type ShaftWindow = Window & { shaftReview: Review; shaftPreview: (kind: "off" | "on" | "ortho") => void; shaftDispose: () => void };
test("world fog shafts work with an offscreen sun, canopy shadows and both gameplay projections", async ({ page }) => {
  const output = "docs/art-audit/world-fog-shafts-v1"; await mkdir(output, { recursive: true }); const errors: string[] = [];
  page.on("pageerror", e => errors.push(e.message)); page.on("console", e => { if (e.type() === "error") errors.push(e.text()); });
  const bundle = await build({ stdin: { resolveDir: process.cwd(), contents: `
import * as T from 'three';import {PostProcessing} from './src/render/three/post-processing';import {DEFAULT_VISUAL_SETTINGS as D} from './src/render/three/visual-settings';
const renderer=new T.WebGLRenderer({canvas:document.querySelector('canvas'),preserveDrawingBuffer:true});renderer.setSize(640,480);renderer.outputColorSpace=T.SRGBColorSpace;renderer.toneMapping=T.ACESFilmicToneMapping;renderer.shadowMap.enabled=true;renderer.shadowMap.type=T.PCFShadowMap;
const scene=new T.Scene();scene.background=new T.Color(0x536271);scene.add(new T.HemisphereLight(0xbbc9d4,0x626f48,.7));
const sun=new T.DirectionalLight(0xffd29c,2);sun.position.set(12,16,22);sun.castShadow=true;sun.shadow.mapSize.set(1024,1024);Object.assign(sun.shadow.camera,{left:-18,right:18,top:18,bottom:-18,near:1,far:70});sun.shadow.bias=-.0005;scene.add(sun,sun.target);
const ground=new T.Mesh(new T.PlaneGeometry(40,40),new T.MeshLambertMaterial({color:0x556f33}));ground.rotation.x=-Math.PI/2;ground.receiveShadow=true;scene.add(ground);
const blockers=[];for(let i=-2;i<=2;i++){const b=new T.Mesh(new T.BoxGeometry(1.5,.7,7),new T.MeshLambertMaterial({color:0x394d28}));b.position.set(i*2.8,4,-2);b.castShadow=true;b.receiveShadow=true;scene.add(b);blockers.push(b);}
const camera=new T.PerspectiveCamera(35,640/480,.1,100);camera.position.set(14,18,24);camera.lookAt(0,0,0);camera.updateMatrixWorld();
const ortho=new T.OrthographicCamera(-12,12,9,-9,.1,100);ortho.position.copy(camera.position);ortho.quaternion.copy(camera.quaternion);ortho.updateMatrixWorld();
const post=new PostProcessing(renderer),light={direction:sun.position.clone().normalize(),color:new T.Color(0xffd29c),power:2};
const visual={...D,skyEnabled:false,fogEnabled:true,bloom:0,chromaticAberration:0,lensDistortion:0,depthOfField:0,colorBalance:0};
function draw(amount,view=camera){post.render(renderer,scene,view,{...visual,lightRays:amount},34,1,false,1,light,sun);const gl=renderer.getContext(),pixels=new Uint8Array(640*480*4);gl.readPixels(0,0,640,480,gl.RGBA,gl.UNSIGNED_BYTE,pixels);return pixels;}
function delta(a,b){let sum=0;for(let i=0;i<a.length;i++)if(i%4!==3)sum+=Math.abs(a[i]-b[i]);return sum/(a.length*.75);}
const off=draw(0),on=draw(1),again=draw(1);const contribution=new Int16Array(on.length);for(let i=0;i<on.length;i++)contribution[i]=on[i]-off[i];
blockers.forEach(b=>b.castShadow=false);const offOpen=draw(0),onOpen=draw(1);let blocked=0;for(let i=0;i<on.length;i++)if(i%4!==3)blocked+=Math.abs((onOpen[i]-offOpen[i])-contribution[i]);blockers.forEach(b=>b.castShadow=true);
const orthoOff=draw(0,ortho),orthoOn=draw(1,ortho);const passes=post.stats.rayPasses;
sun.castShadow=false;draw(1);const disabled=post.stats.rayPasses;sun.castShadow=true;
window.shaftReview={sourceBehindCamera:light.direction.clone().transformDirection(camera.matrixWorldInverse).z>0,effect:delta(on,off),blocked:blocked/(on.length*.75),stable:delta(on,again),ortho:delta(orthoOn,orthoOff),passes,disabled,glError:renderer.getContext().getError()};
window.shaftPreview=kind=>draw(kind==='off'?0:.6,kind==='ortho'?ortho:camera);
window.shaftDispose=()=>{post.dispose();scene.traverse(o=>{o.geometry?.dispose();o.material?.dispose();});sun.shadow.map?.dispose();sun.dispose();renderer.dispose();};
` }, bundle: true, format: "iife", write: false, logLevel: "error" });
  await page.setContent('<!doctype html><style>body{margin:0}canvas{display:block}</style><canvas></canvas>'); await page.addScriptTag({ content: bundle.outputFiles[0].text });
  const result = await page.evaluate(() => (window as unknown as ShaftWindow).shaftReview);
  expect(result.sourceBehindCamera).toBe(true); expect(result.effect).toBeGreaterThan(.5); expect(result.blocked).toBeGreaterThan(.1);
  expect(result.stable).toBeLessThan(.01); expect(result.ortho).toBeGreaterThan(.5); expect(result.passes).toBe(1); expect(result.disabled).toBe(0); expect(result.glError).toBe(0);
  for (const kind of ["off", "on", "ortho"] as const) { await page.evaluate(k => (window as unknown as ShaftWindow).shaftPreview(k), kind); await page.screenshot({ path: output + "/" + kind + ".png" }); }
  await page.evaluate(() => (window as unknown as ShaftWindow).shaftDispose()); expect(errors).toEqual([]);
  await writeFile(output + "/review.json", JSON.stringify({ result, errors }, null, 2));
});

test("forest shafts are visible from the normal gameplay camera with an offscreen light", async ({ page }) => {
  const output = "docs/art-audit/world-fog-shafts-v1"; await mkdir(output, { recursive: true }); const errors: string[] = [];
  page.on("pageerror", e => errors.push(e.message)); page.on("console", e => { if (e.type() === "error") errors.push(e.text()); });
  await page.emulateMedia({ reducedMotion: "reduce" }); await page.setViewportSize({ width: 1280, height: 800 }); await page.goto("./?renderer=3d");
  const world = page.getByTestId("rpg-world"); await expect(world).toHaveAttribute("data-status", "ready", { timeout: 60000 });
  const fixture = createRpg(Date.now(), 8128), tree = WORLD.objects.filter(o => o.kind === "tree").sort((a, b) => Math.hypot(a.position.x - 45, a.position.y - 87) - Math.hypot(b.position.x - 45, b.position.y - 87))[0];
  Object.assign(fixture.control, { waiting: true, goal: null, active: null, source: null, queue: [], thought: null, thinkingUntil: 1e9 });
  fixture.player.position = interactionTiles(tree, WORLD)[0]; fixture.player.previousPosition = { ...fixture.player.position }; fixture.player.path = []; fixture.player.action = null; fixture.player.movement = null;
  await page.getByRole("button", { name: "Open game menu" }).click(); await page.locator('input[type="file"]').setInputFiles({ name: "shafts-forest.json", mimeType: "application/json", buffer: Buffer.from(JSON.stringify(fixture)) });
  await expect(page.getByRole("status")).toContainText("Chronicle restored"); await page.getByRole("button", { name: "Close panel" }).click();
  await page.getByRole("button", { name: "Follow Alden", exact: true }).click(); await page.getByRole("button", { name: "Dusk lighting", exact: true }).click();
  await expect(world).toHaveAttribute("data-gi-state", "ready", { timeout: 60000 });
  const trials = [];
  for (const amount of [0, .65, .22]) {
    await page.getByRole("button", { name: "Visual settings", exact: true }).click();
    await page.getByRole("slider", { name: "Light rays", exact: true }).evaluate((el, v) => { Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!.call(el, String(v)); el.dispatchEvent(new Event("input", { bubbles: true })); }, amount);
    await page.getByRole("button", { name: "Done", exact: true }).click(); await expect(world).toHaveAttribute("data-light-ray-passes", amount ? "1" : "0");
    const timings = await page.evaluate(async count => {
      let previous = await new Promise<number>(resolve => requestAnimationFrame(resolve)); const intervals: number[] = [];
      for (let i = 0; i < count; i++) { const now = await new Promise<number>(resolve => requestAnimationFrame(resolve)); intervals.push(now - previous); previous = now; }
      intervals.sort((a, b) => a - b); return { meanMs: intervals.reduce((a, b) => a + b, 0) / intervals.length, p95Ms: intervals[Math.floor(intervals.length * .95)] };
    }, renderFrameCount(90));
    trials.push({ amount, ...timings, counters: await world.evaluate(e => ({ ...(e as HTMLElement).dataset })) }); await page.screenshot({ path: output + "/forest-" + amount + ".png" });
  }
  expect(errors).toEqual([]); await writeFile(output + "/forest-review.json", JSON.stringify({ trials, errors, note: "Short host full-scene observations, not isolated cost or physical mobile measurements." }, null, 2));
});

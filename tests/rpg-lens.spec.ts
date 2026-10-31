import { expect, test } from "@playwright/test";
import { build } from "esbuild";
import { mkdir, writeFile } from "node:fs/promises";
import { createRpg } from "../src/rpg/engine";
import { tile } from "../src/rpg/world";

const output = "docs/art-audit/lens-bokeh-v2";
test.use({ actionTimeout: 15000 });

test("subtle lens controls, lower close camera and curved ground survive mobile and offline reload", async ({ page, context }) => {
  await mkdir(output, { recursive: true });
  const errors: string[] = [], external: string[] = [];
  page.on("pageerror", e => errors.push(e.message));
  page.on("console", e => { if (e.type() === "error") errors.push(e.text()); });
  page.on("request", r => { const url = new URL(r.url()); if (url.protocol.startsWith("http") && url.hostname !== "127.0.0.1") external.push(url.href); });
  await page.setViewportSize({ width: 1280, height: 800 }); await page.goto("./");
  const world = page.getByTestId("rpg-world"), panel = page.getByRole("dialog", { name: "Visual settings" });
  await expect(world).toHaveAttribute("data-status", "ready", { timeout: 60000 });
  const fixture = createRpg(Date.now(), 8128);
  Object.assign(fixture.control, { waiting: true, goal: null, active: null, source: null, queue: [], thought: null, thinkingUntil: 1_000_000_000 });
  fixture.player.path = []; fixture.player.action = null; fixture.player.movement = null;
  fixture.player.position = tile(60, 106); fixture.player.previousPosition = { ...fixture.player.position };
  await page.getByRole("button", { name: "Open game menu" }).click();
  await page.locator('input[type="file"]').setInputFiles({ name: "lens-fixture.json", mimeType: "application/json", buffer: Buffer.from(JSON.stringify(fixture)) });
  await expect(page.getByRole("status")).toContainText("Chronicle restored"); await page.getByRole("button", { name: "Close panel" }).click();
  await expect(world).toHaveAttribute("data-post-passes", /^[34]$/);
  for (let i = 0; i < 6; i++) await page.getByRole("button", { name: "Zoom out", exact: true }).click();
  await expect.poll(async () => Number(await world.getAttribute("data-camera-zoom"))).toBeLessThan(1.6);
  const initialPitch = Number(await world.getAttribute("data-camera-pitch"));
  await page.screenshot({ path: `${output}/default.png` });
  for (let i = 0; i < 6; i++) await page.getByRole("button", { name: "Zoom in", exact: true }).click();
  await expect(world).toHaveAttribute("data-camera-zoom", "2.0000");
  await expect.poll(async () => Number(await world.getAttribute("data-camera-pitch"))).toBeLessThan(initialPitch - 4);
  await expect(world).toHaveAttribute("data-world-curve", "0.008000");
  await page.screenshot({ path: `${output}/close.png` });
  await world.getByRole("button", { name: "Inspect Alden", exact: true }).click();
  await expect(page.getByRole("region", { name: "Character details" })).toBeVisible();
  await page.getByRole("button", { name: "Close actions" }).click();
  await page.getByRole("button", { name: "Visual settings", exact: true }).click();
  for (const name of ["Bloom", "Chromatic aberration", "Lens distortion", "Depth of field", "World curvature", "Warm light / cool shadows", "Light rays"]) await panel.getByRole("slider", { name, exact: true }).press("Home");
  await expect(world).toHaveAttribute("data-post-passes", "0"); await expect(world).toHaveAttribute("data-world-curve", "0.000000");
  await panel.getByRole("button", { name: "Done", exact: true }).click();
  await page.screenshot({ path: `${output}/close-off.png` });
  await page.getByRole("button", { name: "Visual settings", exact: true }).click();
  await panel.getByRole("button", { name: "Reset visual settings", exact: true }).click();
  await panel.getByRole("button", { name: "Done", exact: true }).click();
  await page.getByRole("button", { name: "Orthographic camera", exact: true }).click();
  await expect(world).toHaveAttribute("data-world-curve", "0.000000");
  await page.screenshot({ path: `${output}/orthographic.png` });
  await page.getByRole("button", { name: "Perspective camera", exact: true }).click();
  for (const viewport of [{ width: 390, height: 844 }, { width: 844, height: 390 }]) {
    await page.setViewportSize(viewport);
    await expect(world).toHaveAttribute("data-post-passes", /^[34]$/);
    await page.screenshot({ path: `${output}/${viewport.width < 500 ? "portrait" : "landscape"}.png` });
    expect(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth + 1)).toBe(false);
  }
  await page.getByRole("button", { name: "Open game menu" }).click(); await page.getByRole("button", { name: "Save on device" }).click();
  await expect(page.getByRole("status")).toContainText("Chronicle saved");
  await page.getByRole("button", { name: "Close panel" }).click();
  await page.evaluate(async () => { await navigator.serviceWorker.ready; });
  await context.setOffline(true); await page.reload();
  await expect(world).toHaveAttribute("data-status", "ready", { timeout: 60000 });
  await expect(world).toHaveAttribute("data-post-passes", /^[34]$/);
  expect(errors).toEqual([]); expect(external).toEqual([]);
  await writeFile(`${output}/game-review.json`, JSON.stringify({ errors, external, initialPitch, counters: await world.evaluate(e => ({ ...(e as HTMLElement).dataset })) }, null, 2));
});

test("GPU lens passes preserve plain colors and add actual bloom, color separation and distance blur", async ({ page }) => {
  await mkdir(output, { recursive: true }); const errors: string[] = [];
  page.on("pageerror", e => errors.push(e.message)); page.on("console", e => { if (e.type() === "error") errors.push(e.text()); });
  const bundled = await build({ stdin: { resolveDir: process.cwd(), sourcefile: "lens-lab.ts", contents: `
import * as THREE from 'three';
import { PostProcessing } from './src/render/three/post-processing';
import { WorldCurve } from './src/render/three/world-curve';
import { DEFAULT_VISUAL_SETTINGS } from './src/render/three/visual-settings';
const renderer=new THREE.WebGLRenderer({canvas:document.querySelector('canvas'),preserveDrawingBuffer:true,antialias:true}); renderer.setSize(640,480);
renderer.outputColorSpace=THREE.SRGBColorSpace;renderer.toneMapping=THREE.ACESFilmicToneMapping;renderer.toneMappingExposure=1.05;
const scene=new THREE.Scene();scene.background=new THREE.Color(.025,.025,.025);
const camera=new THREE.PerspectiveCamera(45,640/480,.1,100);camera.position.set(0,0,10);camera.updateMatrixWorld();
const post=new PostProcessing(renderer),curve=new WorldCurve(),geo=new THREE.PlaneGeometry(1,1);
function add(x,y,z,color){const mesh=new THREE.Mesh(geo,new THREE.MeshBasicMaterial({color}));mesh.position.set(x,y,z);scene.add(mesh);return mesh;}
const backdrop=add(0,0,-40,0x2c2c2c);backdrop.scale.set(100,100,1);
const bright=add(0,1.4,0,0xffffff);bright.material.color.setRGB(8,8,8);
for(let i=0;i<20;i++){let mesh=add(-3+i*.32,-1,-10,i%2===0?0xffffff:0x151515);mesh.scale.set(.32,2,1);}
const focus=add(0,-1,0,0x608040);focus.scale.set(1.5,1,1);
add(3,1,0,0xffffff);
for(let i=0;i<4;i++){const light=add(-2.4+i*1.6,2,-10,0xffffff);light.scale.set(.12,.12,1);light.material.color.setRGB(6,5,3);}
const off={...DEFAULT_VISUAL_SETTINGS,bloom:0,chromaticAberration:0,lensDistortion:0,depthOfField:0,colorBalance:0};
function read(){const gl=renderer.getContext(),p=new Uint8Array(640*480*4);gl.readPixels(0,0,640,480,gl.RGBA,gl.UNSIGNED_BYTE,p);return p;}
function draw(v){post.render(renderer,scene,camera,v,10,1,false,1);return read();}
function delta(a,b){let total=0,changed=0;for(let i=0;i<a.length;i++)if(i%4!==3){const d=Math.abs(a[i]-b[i]);total+=d;if(d>1)changed++;}return {mean:total/(a.length*.75),changed};}
const plain=draw(off);const neutral=draw({...off,chromaticAberration:.000001});
const bloom=draw({...off,bloom:.12}),ca=draw({...off,chromaticAberration:.18}),dof=draw({...off,depthOfField:.18});
function contrast(p){let total=0;for(let y=220;y<235;y++)for(let x=230;x<410;x++){const at=(y*640+x)*4;total+=Math.abs(p[at]-p[at+4]);}return total;}
const focusPixel=(182*640+320)*4;
const bokeh={farContrastRatio:contrast(dof)/contrast(neutral),focusError:Math.max(...[0,1,2].map(i=>Math.abs(dof[focusPixel+i]-neutral[focusPixel+i]))),neutralColorError:Math.max(...[0,1,2].map(i=>Math.abs(plain[focusPixel+i]-neutral[focusPixel+i])))};
curve.update(new THREE.Vector3(0,0,0),2,1,true);curve.decorate(scene);const bent=draw(off);
window.lensLab={neutral:delta(plain,neutral),bloom:delta(neutral,bloom),ca:delta(neutral,ca),dof:delta(neutral,dof),curve:delta(plain,bent),bokeh,glError:renderer.getContext().getError()};
draw(DEFAULT_VISUAL_SETTINGS);window.lensDispose=()=>{post.dispose();curve.dispose();geo.dispose();scene.children.forEach(m=>m.material?.dispose());renderer.dispose();};
` }, bundle: true, format: "iife", write: false, logLevel: "error" });
  await page.setContent('<!doctype html><style>body{margin:0}canvas{display:block}</style><canvas></canvas>');
  await page.addScriptTag({ content: bundled.outputFiles[0].text });
  const result = await page.evaluate(() => (window as unknown as { lensLab: Record<string, { mean: number; changed: number }> & { glError: number; bokeh: { farContrastRatio: number; focusError: number; neutralColorError: number } } }).lensLab);
  await writeFile(`${output}/gpu-review.json`, JSON.stringify({ ...result, errors }, null, 2));
  await page.screenshot({ path: `${output}/gpu-lab.png` });
  expect(result.glError).toBe(0); expect(result.neutral.mean).toBeLessThan(1); // Edge filtering differs; flat color must stay within one 8-bit step.
  expect(result.bokeh.neutralColorError).toBeLessThanOrEqual(1);
  expect(result.bloom.changed).toBeGreaterThan(100); expect(result.ca.mean).toBeGreaterThan(.0001);
  expect(result.dof.changed).toBeGreaterThan(100); expect(result.curve.changed).toBeGreaterThan(100);
  expect(result.bokeh.farContrastRatio).toBeLessThan(.85); expect(result.bokeh.focusError).toBeLessThanOrEqual(1);
  await page.screenshot({ path: `${output}/gpu-lab.png` }); await writeFile(`${output}/gpu-review.json`, JSON.stringify({ ...result, errors }, null, 2));
  await page.evaluate(() => (window as unknown as { lensDispose: () => void }).lensDispose()); expect(errors).toEqual([]);
});


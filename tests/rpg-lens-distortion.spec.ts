import { expect, test } from "@playwright/test";
import { build } from "esbuild";
import { mkdir, writeFile } from "node:fs/promises";

const output = "docs/art-audit/lens-distortion-v1";

test("lens distortion control previews, copies, resets and persists offline on phone layouts", async ({ page, context, baseURL }) => {
  await mkdir(output, { recursive: true });
  await context.grantPermissions(["clipboard-read", "clipboard-write"], { origin: new URL(baseURL!).origin });
  const errors: string[] = [], external: string[] = [];
  page.on("pageerror", e => errors.push(e.message));
  page.on("console", e => { if (e.type() === "error") errors.push(e.text()); });
  page.on("request", r => { const url = new URL(r.url()); if (url.protocol.startsWith("http") && url.hostname !== "127.0.0.1") external.push(url.href); });
  await page.setViewportSize({ width: 1280, height: 800 }); await page.goto("./");
  const world = page.getByTestId("rpg-world"), panel = page.getByRole("dialog", { name: "Visual settings" });
  await expect(world).toHaveAttribute("data-status", "ready", { timeout: 60000 });
  await page.getByRole("button", { name: "Visual settings", exact: true }).click();
  const slider = panel.getByRole("slider", { name: "Lens distortion", exact: true });
  await expect(slider).toHaveValue("0.15");
  await page.screenshot({ path: `${output}/default.png` });
  await slider.press("End");
  await expect.poll(async () => JSON.parse((await world.getAttribute("data-visual-settings"))!).lensDistortion).toBe(1);
  await panel.getByRole("button", { name: "Copy settings", exact: true }).click();
  expect(JSON.parse(await page.evaluate(() => navigator.clipboard.readText())).visual.lensDistortion).toBe(1);
  await panel.getByRole("button", { name: "Done", exact: true }).click();
  await world.getByRole("button", { name: "Inspect Alden", exact: true }).click();
  await expect(page.getByRole("region", { name: "Character details" })).toContainText("Alden");
  await page.getByRole("button", { name: "Close actions" }).click();
  await page.screenshot({ path: `${output}/maximum.png` });
  await page.getByRole("button", { name: "Visual settings", exact: true }).click();
  await slider.press("Home");
  await expect.poll(async () => JSON.parse((await world.getAttribute("data-visual-settings"))!).lensDistortion).toBe(0);
  await panel.getByRole("button", { name: "Done", exact: true }).click();
  await page.screenshot({ path: `${output}/off.png` });
  await page.getByRole("button", { name: "Visual settings", exact: true }).click();
  await panel.getByRole("button", { name: "Reset visual settings", exact: true }).click();
  await expect(slider).toHaveValue("0.15");
  await slider.press("End");
  for (const viewport of [{ width: 390, height: 844 }, { width: 844, height: 390 }]) {
    await page.setViewportSize(viewport); await slider.scrollIntoViewIfNeeded(); await expect(slider).toBeInViewport();
    await page.screenshot({ path: `${output}/${viewport.width < 500 ? "portrait" : "landscape"}.png` });
    expect(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth + 1)).toBe(false);
  }
  await panel.getByRole("button", { name: "Done", exact: true }).click();
  await page.evaluate(async () => { await navigator.serviceWorker.ready; });
  await context.setOffline(true); await page.reload();
  await expect(world).toHaveAttribute("data-status", "ready", { timeout: 60000 });
  await page.getByRole("button", { name: "Visual settings", exact: true }).click();
  await expect(slider).toHaveValue("1");
  await panel.getByRole("button", { name: "Reset visual settings", exact: true }).click();
  expect(errors).toEqual([]); expect(external).toEqual([]);
  await writeFile(`${output}/game-review.json`, JSON.stringify({ errors, external }, null, 2));
});

test("GPU distortion matches picking math, keeps center fixed and fills the whole frame", async ({ page }) => {
  await mkdir(output, { recursive: true }); const errors: string[] = [];
  page.on("pageerror", e => errors.push(e.message)); page.on("console", e => { if (e.type() === "error") errors.push(e.text()); });
  const bundle = await build({ stdin: { resolveDir: process.cwd(), sourcefile: "distortion-lab.ts", contents: `
import * as THREE from 'three';
import { PostProcessing } from './src/render/three/post-processing';
import { DEFAULT_VISUAL_SETTINGS } from './src/render/three/visual-settings';
const renderer=new THREE.WebGLRenderer({canvas:document.querySelector('canvas'),preserveDrawingBuffer:true});renderer.setSize(640,480);
renderer.outputColorSpace=THREE.SRGBColorSpace;
const scene=new THREE.Scene(),camera=new THREE.OrthographicCamera(-1,1,1,-1,.1,10);camera.position.z=1;
const geometry=new THREE.PlaneGeometry(2,2),material=new THREE.ShaderMaterial({vertexShader:'varying vec2 vUv;void main(){vUv=uv;gl_Position=vec4(position.xy,0.,1.);}',fragmentShader:'varying vec2 vUv;void main(){gl_FragColor=vec4(.2+vUv.x*.6,.2+vUv.y*.6,.3,1.);\\n#include <colorspace_fragment>\\n}'});
scene.add(new THREE.Mesh(geometry,material));const post=new PostProcessing(renderer);
const off={...DEFAULT_VISUAL_SETTINGS,bloom:0,chromaticAberration:0,lensDistortion:0,depthOfField:0,colorBalance:0};
const gl=renderer.getContext();function draw(strength,overview=false){post.render(renderer,scene,camera,{...off,lensDistortion:strength},1,1,overview,1);const pixels=new Uint8Array(640*480*4);gl.readPixels(0,0,640,480,gl.RGBA,gl.UNSIGNED_BYTE,pixels);return pixels;}
const plain=draw(0),passesOff=post.stats.passes,warped=draw(1),passesOn=post.stats.passes;
function at(p,x,y){return [...p.slice((y*640+x)*4,(y*640+x)*4+3)];}
let min=255,changed=0;for(let i=0;i<warped.length;i++)if(i%4!==3){min=Math.min(min,warped[i]);if(Math.abs(warped[i]-plain[i])>1)changed++;}
const centerError=Math.max(...at(plain,320,240).map((v,i)=>Math.abs(v-at(warped,320,240)[i])));
// UV gradient supplies a measurable, independent GPU correspondence test.
const point={x:.75,y:.4};post.screenToScene(point);const expected=at(plain,Math.floor((point.x+1)*320),Math.floor((point.y+1)*240)),actual=at(warped,560,336);
const correspondenceError=Math.max(...expected.map((v,i)=>Math.abs(v-actual[i])));
const overview=draw(1,true);let overviewError=0;for(let i=0;i<plain.length;i++)overviewError=Math.max(overviewError,Math.abs(plain[i]-overview[i]));
window.distortionLab={changed,min,centerError,correspondenceError,overviewError,passesOff,passesOn,glError:gl.getError()};draw(1);
post.dispose();geometry.dispose();material.dispose();
` }, bundle: true, format: "iife", write: false, logLevel: "error" });
  await page.setContent('<!doctype html><style>body{margin:0}</style><canvas></canvas>');
  await page.addScriptTag({ content: bundle.outputFiles[0].text });
  const result = await page.evaluate(() => (window as unknown as { distortionLab: Record<string, number> }).distortionLab);
  await writeFile(`${output}/gpu-review.json`, JSON.stringify({ ...result, errors }, null, 2));
  expect(result.changed).toBeGreaterThan(1000); expect(result.min).toBeGreaterThan(40);
  expect(result.centerError).toBeLessThanOrEqual(1); expect(result.correspondenceError).toBeLessThanOrEqual(2);
  expect(result.overviewError).toBe(0); expect(result.passesOff).toBe(0); expect(result.passesOn).toBe(1);
  expect(result.glError).toBe(0); expect(errors).toEqual([]);
});

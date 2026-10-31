import { expect, test, type Page } from "@playwright/test";
import { renderFrameCount } from "./render-profile";
import { mkdir, writeFile } from "node:fs/promises";
import { build } from "esbuild";
import { createRpg } from "../src/rpg/engine";
import { tile } from "../src/rpg/world";

const output = "docs/art-audit/sky-v1";
test.use({ serviceWorkers: "block", actionTimeout: 20000 });
async function frames(page: Page, count = 90) {
  await page.evaluate(async n => { for (let i = 0; i < n; i++) await new Promise(resolve => requestAnimationFrame(resolve)); }, renderFrameCount(count));
}
async function measure(page: Page) {
  return page.evaluate(async () => {
    const intervals: number[] = [], counters = []; let last = await new Promise<number>(resolve => requestAnimationFrame(resolve)), start = last, next = last;
    while (last - start < 4000) { const now = await new Promise<number>(resolve => requestAnimationFrame(resolve)); intervals.push(now - last); last = now;
      if (now >= next) { counters.push({ ...document.querySelector<HTMLElement>('[data-renderer="3d"]')!.dataset }); next = now + 500; }
    }
    const sorted = [...intervals].sort((a, b) => a - b), gl = document.querySelector<HTMLCanvasElement>('[data-testid="three-canvas"]')!.getContext("webgl2")!;
    return { fps: 1000 * intervals.length / (last - start), p95Ms: sorted[Math.floor(sorted.length * .95)], intervals, counters, glError: gl.getError() };
  });
}

test("cloud controls animate reflected sky in the actual game and fit on mobile", async ({ page }) => {
  await mkdir(output, { recursive: true }); const errors: string[] = [], external: string[] = [];
  page.on("pageerror", error => errors.push(error.message)); page.on("console", message => { if (message.type() === "error") errors.push(message.text()); });
  page.on("request", request => { const url = new URL(request.url()); if (url.protocol.startsWith("http") && url.hostname !== "127.0.0.1") external.push(url.href); });
  await page.setViewportSize({ width: 1280, height: 800 }); await page.goto("./?renderer=3d");
  const world = page.getByTestId("rpg-world"); await expect(world).toHaveAttribute("data-status", "ready", { timeout: 60000 });
  const fixture = createRpg(Date.now(), 8128);
  Object.assign(fixture.control, { waiting: true, goal: null, active: null, source: null, queue: [], thought: null, thinkingUntil: 1_000_000_000 });
  fixture.player.path = []; fixture.player.movement = null; fixture.player.action = null;
  fixture.player.position = tile(112, 24); fixture.player.previousPosition = { ...fixture.player.position };
  await page.getByRole("button", { name: "Open game menu" }).click();
  await page.locator('input[type="file"]').setInputFiles({ name: "sky-fixture.json", mimeType: "application/json", buffer: Buffer.from(JSON.stringify(fixture)) });
  await expect(page.getByRole("status")).toContainText("Chronicle restored"); await page.getByRole("button", { name: "Close panel" }).click();
  await page.getByRole("button", { name: "Follow Alden", exact: true }).click(); await expect(world).toHaveAttribute("data-camera-x", "112.00");
  const panel = page.getByRole("dialog", { name: "Visual settings" }), trials = [];
  for (const enabled of [false, true, false]) {
    await page.getByRole("button", { name: "Visual settings", exact: true }).click();
    await panel.getByRole("checkbox", { name: "Enable sky and clouds", exact: true }).setChecked(enabled);
    await panel.getByRole("button", { name: "Done", exact: true }).click(); await frames(page);
    const result = await measure(page); expect(result.glError).toBe(0); trials.push({ enabled, ...result });
    if (enabled) await page.screenshot({ path: `${output}/world-dusk.png` });
  }
  await page.getByRole("button", { name: "Visual settings", exact: true }).click();
  await panel.getByRole("checkbox", { name: "Enable sky and clouds", exact: true }).check();
  await panel.getByRole("slider", { name: "Cloud speed", exact: true }).press("Home");
  await expect.poll(async () => JSON.parse((await world.getAttribute("data-visual-settings"))!).cloudSpeed).toBe(0);
  const frozen = await world.getAttribute("data-cloud-time"); await frames(page);
  expect(await world.getAttribute("data-cloud-time")).toBe(frozen);
  await panel.getByRole("slider", { name: "Cloud speed", exact: true }).press("End");
  await expect.poll(async () => Number(await world.getAttribute("data-cloud-time"))).toBeGreaterThan(Number(frozen));
  await panel.getByRole("slider", { name: "Cloud coverage", exact: true }).press("Home");
  await expect(world).toHaveAttribute("data-cloud-coverage", "0");
  await panel.getByRole("button", { name: "Reset visual settings", exact: true }).click();
  await panel.getByRole("button", { name: "Done", exact: true }).click();
  await page.getByRole("button", { name: "Day lighting", exact: true }).click(); await frames(page); await page.screenshot({ path: `${output}/world-day.png` });
  await page.getByRole("button", { name: "Night lighting", exact: true }).click(); await frames(page); await page.screenshot({ path: `${output}/world-night.png` });
  await page.getByRole("button", { name: "Orthographic camera", exact: true }).click(); await frames(page);
  await page.screenshot({ path: `${output}/world-orthographic.png` });
  await page.setViewportSize({ width: 390, height: 844 }); await page.getByRole("button", { name: "Visual settings", exact: true }).click();
  await panel.getByRole("slider", { name: "Cloud size", exact: true }).scrollIntoViewIfNeeded(); await page.screenshot({ path: `${output}/phone-controls.png` });
  expect(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth + 1)).toBe(false);
  expect(errors).toEqual([]); expect(external).toEqual([]);
  await writeFile(`${output}/game-review.json`, JSON.stringify({ trials, errors, external, note: "Matched sky off/on/off host RAF observations; not isolated GPU cost or physical-phone performance." }, null, 2) + "\n");
});

test("moving clouds alter actual water pixels and freezing speed preserves the reflection", async ({ page }) => {
  await mkdir(output, { recursive: true });
  const bundled = await build({ stdin: { resolveDir: process.cwd(), sourcefile: "sky-water-lab.ts", contents: `
    import * as THREE from 'three';
    import { SkySystem } from './src/render/three/sky';
    import { WaterSystem, WATER_HEIGHT } from './src/render/three/water';
    import { DEFAULT_VISUAL_SETTINGS } from './src/render/three/visual-settings';
    const renderer=new THREE.WebGLRenderer({canvas:document.querySelector('canvas'),preserveDrawingBuffer:true});renderer.setSize(640,480);
    renderer.outputColorSpace=THREE.SRGBColorSpace;renderer.toneMapping=THREE.ACESFilmicToneMapping;renderer.toneMappingExposure=1.05;
    const scene=new THREE.Scene();scene.background=new THREE.Color(0x8f9aa4);scene.add(new THREE.AmbientLight(0xffffff,1));
    const sky=new SkySystem(scene),system=new WaterSystem(),geometry=new THREE.PlaneGeometry(80,80),water=new THREE.Mesh(geometry,system.material);
    water.rotation.x=-Math.PI/2;water.position.y=WATER_HEIGHT;scene.add(water);
    const camera=new THREE.PerspectiveCamera(50,640/480,.1,1000);camera.position.set(0,7,12);camera.lookAt(0,0,0);camera.updateMatrixWorld();
    let visual={...DEFAULT_VISUAL_SETTINGS,waterReflectionStrength:1,waterRippleStrength:0,waterReflectionResolution:0,cloudSpeed:3};
    function draw(time){sky.update(time,'day',visual,false);system.update(renderer,scene,camera,[water],[],time,'day',visual,false);renderer.render(scene,camera);}
    function read(){const gl=renderer.getContext(),pixels=new Uint8Array(320*140*4);gl.readPixels(160,30,320,140,gl.RGBA,gl.UNSIGNED_BYTE,pixels);return pixels;}
    function delta(a,b){let total=0;for(let i=0;i<a.length;i++)if(i%4!==3)total+=Math.abs(a[i]-b[i]);return total/(a.length*.75);}
    visual.cloudCoverage=0;draw(0);const clear=read();visual.cloudCoverage=.55;draw(0);const cloudy=read();
    for(let i=1;i<=90;i++)draw(i*1000/30);const moving=read();
    visual.cloudSpeed=0;for(let i=91;i<=105;i++)draw(i*1000/30);const frozen=read();
    window.skyLab={clearToCloudy:delta(clear,cloudy),cloudMotion:delta(cloudy,moving),frozenDelta:delta(moving,frozen),glError:renderer.getContext().getError()};
    window.previewSkyLab=()=>{camera.position.set(0,4,0);camera.lookAt(0,30,-50);camera.updateMatrixWorld();draw(4000);};
    window.disposeSkyLab=()=>{sky.dispose();system.dispose();geometry.dispose();renderer.dispose();};
  ` }, bundle: true, format: "iife", write: false, logLevel: "error" });
  const errors: string[] = []; page.on("pageerror", error => errors.push(error.message)); page.on("console", message => { if (message.type() === "error") errors.push(message.text()); });
  await page.setContent('<!doctype html><style>body{margin:0;background:#203040}canvas{display:block}</style><canvas></canvas>');
  await page.addScriptTag({ content: bundled.outputFiles[0].text });
  const result = await page.evaluate(() => (window as unknown as { skyLab: { clearToCloudy: number; cloudMotion: number; frozenDelta: number; glError: number } }).skyLab);
  expect(result.glError).toBe(0); expect(result.clearToCloudy).toBeGreaterThan(.5); expect(result.cloudMotion).toBeGreaterThan(.1); expect(result.frozenDelta).toBe(0);
  await page.screenshot({ path: `${output}/reflected-clouds-lab.png` }); await writeFile(`${output}/lab-review.json`, JSON.stringify({ ...result, errors }, null, 2) + "\n");
  await page.evaluate(() => (window as unknown as { previewSkyLab: () => void }).previewSkyLab());
  await page.screenshot({ path: `${output}/sky-look-up.png` });
  await page.evaluate(() => (window as unknown as { disposeSkyLab: () => void }).disposeSkyLab()); expect(errors).toEqual([]);
});

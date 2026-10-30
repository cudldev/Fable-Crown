import { expect, test, type Page } from "@playwright/test";
import { mkdir, writeFile } from "node:fs/promises";
import { createRpg } from "../src/rpg/engine";
import { tile, worldForState } from "../src/rpg/world";
import { build } from "esbuild";

const output = "docs/art-audit/water-realtime-v1";
test.use({ serviceWorkers: "block", actionTimeout: 20000 });
async function warm(page: Page, count = 90) {
  await page.evaluate(async frames => { for (let i = 0; i < frames; i++) await new Promise(resolve => requestAnimationFrame(resolve)); }, count);
}
async function measure(page: Page) {
  return page.evaluate(async () => {
    const root = document.querySelector<HTMLElement>('[data-renderer="3d"]')!, intervals: number[] = [], counters: Record<string, string | undefined>[] = [];
    const start = await new Promise<number>(resolve => requestAnimationFrame(resolve)); let last = start, next = start;
    while (last - start < 4000) {
      const now = await new Promise<number>(resolve => requestAnimationFrame(resolve)); intervals.push(now - last); last = now;
      if (now >= next) { counters.push({ ...root.dataset }); next = now + 500; }
    }
    const sorted = [...intervals].sort((a, b) => a - b), mean = (last - start) / intervals.length;
    const gl = document.querySelector<HTMLCanvasElement>('[data-testid="three-canvas"]')!.getContext("webgl2")!;
    return { frames: intervals.length, meanFps: 1000 / mean, meanMs: mean, p95Ms: sorted[Math.floor(sorted.length * .95)], intervals, counters, glError: gl.getError() };
  });
}

test("shared water reflections, quality controls and camera modes stay drawable", async ({ page }) => {
  await mkdir(output, { recursive: true });
  const errors: string[] = [], external: string[] = [];
  page.on("pageerror", error => errors.push(error.message));
  page.on("console", message => { if (message.type() === "error") errors.push(message.text()); });
  page.on("request", request => { const url = new URL(request.url()); if (url.protocol.startsWith("http") && url.hostname !== "127.0.0.1") external.push(url.href); });
  await page.setViewportSize({ width: 1280, height: 800 }); await page.goto("./?renderer=3d");
  const world = page.getByTestId("rpg-world"); await expect(world).toHaveAttribute("data-status", "ready", { timeout: 60000 });
  await warm(page); await page.screenshot({ path: `${output}/ground-joins.png` });
  const state = createRpg(Date.now(), 8128);
  Object.assign(state.control, { waiting: true, goal: null, active: null, source: null, queue: [], thought: null, thinkingUntil: 1_000_000_000 });
  state.player.path = []; state.player.movement = null; state.player.action = null;
  state.player.position = tile(112, 24); state.player.previousPosition = { ...state.player.position };
  const definition = worldForState(state);
  expect(definition.terrain[24 * definition.width + 112]).not.toBe("water");
  await page.getByRole("button", { name: "Open game menu" }).click();
  await page.locator('input[type="file"]').setInputFiles({ name: "water-fixture.json", mimeType: "application/json", buffer: Buffer.from(JSON.stringify(state)) });
  await expect(page.getByRole("status")).toContainText("Chronicle restored"); await page.getByRole("button", { name: "Close panel" }).click();
  await page.getByRole("button", { name: "Follow Alden", exact: true }).click();
  await expect(world).toHaveAttribute("data-camera-x", "112.00");
  await expect(world).toHaveAttribute("data-camera-y", "24.00");
  await page.getByRole("button", { name: "Zoom in", exact: true }).click();
  await expect(world).toHaveAttribute("data-water-reflection-state", "ready");
  const open = async () => { await page.getByRole("button", { name: "Visual settings", exact: true }).click(); return page.getByRole("dialog", { name: "Visual settings" }); };
  const trials = [];
  for (const enabled of [false, true, false]) {
    const panel = await open();
    await panel.getByRole("checkbox", { name: "Enable water reflections", exact: true }).setChecked(enabled);
    await panel.getByRole("button", { name: "Done", exact: true }).click(); await warm(page);
    await expect(world).toHaveAttribute("data-water-reflection-state", enabled ? "ready" : "disabled");
    const before = Number(await world.getAttribute("data-water-reflection-passes")), result = await measure(page);
    const after = Number(await world.getAttribute("data-water-reflection-passes"));
    expect(result.glError).toBe(0); if (enabled) expect(after - before).toBeGreaterThan(result.frames * .5); else expect(after).toBe(before);
    trials.push({ style: "smooth", reflections: enabled, ...result });
    if (enabled) await page.screenshot({ path: `${output}/smooth-dusk.png` });
  }
  const panel = await open(); await panel.getByRole("checkbox", { name: "Enable water reflections", exact: true }).check();
  await expect(panel.getByRole("combobox", { name: "Reflection update rate", exact: true })).toHaveValue("0");
  await panel.getByRole("combobox", { name: "Reflection update rate", exact: true }).selectOption("30");
  await panel.getByRole("slider", { name: "Water reflection strength", exact: true }).press("End");
  await panel.getByRole("slider", { name: "Water ripples", exact: true }).press("Home");
  await panel.getByRole("combobox", { name: "Reflection resolution", exact: true }).selectOption("256");
  await panel.getByRole("button", { name: "Done", exact: true }).click();
  await expect(world).toHaveAttribute("data-water-reflection-size", "256x160");
  await expect.poll(async () => JSON.parse((await world.getAttribute("data-visual-settings"))!).waterReflectionRate).toBe(30);
  await page.getByRole("button", { name: "Orthographic camera", exact: true }).click(); await warm(page);
  await page.screenshot({ path: `${output}/orthographic.png` });
  await page.getByRole("button", { name: "Day lighting", exact: true }).click(); await warm(page);
  await page.screenshot({ path: `${output}/day.png` });
  await page.getByRole("button", { name: "World overview", exact: true }).click();
  await expect(world).toHaveAttribute("data-water-reflection-state", "disabled");
  await page.getByRole("button", { name: "Follow Alden", exact: true }).click();
  await page.setViewportSize({ width: 390, height: 844 }); await warm(page);
  await expect(world).toHaveAttribute("data-water-reflection-state", "ready");
  await page.screenshot({ path: `${output}/phone.png` });
  expect(errors).toEqual([]); expect(external).toEqual([]);
  await writeFile(`${output}/review.json`, JSON.stringify({ trials, finalCounters: await world.evaluate(element => ({ ...(element as HTMLElement).dataset })), errors, external,
    note: "Sequential off/on/off whole-game RAF measurements at display resolution; same shoreline/player, active NPCs. Refresh capped host observations, not isolated GPU cost or physical-phone results. Reflection CPU capture cost is separate; total draw/GPU counters include both passes." }, null, 2) + "\n");
});

test.describe("high-DPI reflections", () => {
  test.use({ viewport: { width: 2560, height: 1294 }, deviceScaleFactor: 1.5 });
  test("full resolution matches the Smooth render buffer and higher caps remain selectable", async ({ page }) => {
    const directory = "docs/art-audit/water-resolution-v1"; await mkdir(directory, { recursive: true });
    const errors: string[] = []; page.on("pageerror", error => errors.push(error.message));
    page.on("console", message => { if (message.type() === "error") errors.push(message.text()); });
    await page.goto("./?renderer=3d"); const world = page.getByTestId("rpg-world");
    await expect(world).toHaveAttribute("data-status", "ready", { timeout: 60000 });
    const fixture = createRpg(Date.now(), 8128);
    Object.assign(fixture.control, { waiting: true, goal: null, active: null, source: null, queue: [], thought: null, thinkingUntil: 1_000_000_000 });
    fixture.player.path = []; fixture.player.movement = null; fixture.player.action = null;
    fixture.player.position = tile(112, 24); fixture.player.previousPosition = { ...fixture.player.position };
    await page.getByRole("button", { name: "Open game menu" }).click();
    await page.locator('input[type="file"]').setInputFiles({ name: "water-resolution.json", mimeType: "application/json", buffer: Buffer.from(JSON.stringify(fixture)) });
    await expect(page.getByRole("status")).toContainText("Chronicle restored"); await page.getByRole("button", { name: "Close panel" }).click();
    await page.getByRole("button", { name: "Follow Alden", exact: true }).click();
    await expect(world).toHaveAttribute("data-camera-x", "112.00");
    await page.getByRole("button", { name: "Visual settings", exact: true }).click();
    const panel = page.getByRole("dialog", { name: "Visual settings" });
    await expect(panel.getByRole("combobox", { name: "Reflection resolution", exact: true })).toHaveValue("0");
    await expect(world).toHaveAttribute("data-render-width", "3840");
    const height = Number(await world.getAttribute("data-render-height"));
    await expect(world).toHaveAttribute("data-water-reflection-size", `3840x${height}`);
    await panel.getByRole("combobox", { name: "Reflection resolution", exact: true }).selectOption("2048");
    await expect(world).toHaveAttribute("data-water-reflection-size", `2048x${Math.round(height * 2048 / 3840)}`);
    await panel.getByRole("combobox", { name: "Reflection resolution", exact: true }).selectOption("4096");
    await expect(world).toHaveAttribute("data-water-reflection-size", `3840x${height}`);
    await panel.getByRole("button", { name: "Done", exact: true }).click();
    const trials = [];
    for (const limit of [512, 0, 512]) {
      await page.getByRole("button", { name: "Visual settings", exact: true }).click();
      await panel.getByRole("combobox", { name: "Reflection resolution", exact: true }).selectOption(String(limit));
      await panel.getByRole("button", { name: "Done", exact: true }).click(); await warm(page);
      await expect(world).toHaveAttribute("data-water-reflection-size", limit ? `512x${Math.round(height * 512 / 3840)}` : `3840x${height}`);
      const result = await measure(page); expect(result.glError).toBe(0); trials.push({ limit, ...result });
      if (!limit) await page.screenshot({ path: `${directory}/full-resolution.png` });
    }
    expect(errors).toEqual([]);
    await writeFile(`${directory}/review.json`, JSON.stringify({ trials, viewport: [2560, 1294], deviceScaleFactor: 1.5, errors,
      note: "Actual 3840-wide Smooth game buffer. Sequential512/full/512 reflection brackets with active NPCs; host observations only, not physical-device guarantee." }, null, 2) + "\n");
  });
});

test("a reflected object's pigment reaches the projected water pixel", async ({ page }) => {
  await mkdir(output, { recursive: true });
  const compiled = await build({ stdin: { resolveDir: process.cwd(), sourcefile: "water-projection-lab.ts", contents: `
    import * as THREE from 'three';
    import { WaterSystem, WATER_HEIGHT } from './src/render/three/water';
    import { DEFAULT_VISUAL_SETTINGS } from './src/render/three/visual-settings';
    const renderer = new THREE.WebGLRenderer({canvas:document.querySelector('canvas'),preserveDrawingBuffer:true}); renderer.setSize(640,480);
    renderer.outputColorSpace=THREE.SRGBColorSpace; renderer.toneMapping=THREE.ACESFilmicToneMapping;
    const scene=new THREE.Scene();scene.background=new THREE.Color(0x203040);scene.add(new THREE.AmbientLight(0xffffff,1));
    const system=new WaterSystem(), geometry=new THREE.PlaneGeometry(40,40), water=new THREE.Mesh(geometry,system.material);
    water.rotation.x=-Math.PI/2;water.position.y=WATER_HEIGHT;scene.add(water);
    const boxGeometry=new THREE.BoxGeometry(2,6,2), material=new THREE.MeshBasicMaterial({color:0xff0000});
    const box=new THREE.Mesh(boxGeometry,material);box.position.y=3;scene.add(box);
    const camera=new THREE.PerspectiveCamera(50,640/480,.1,100);camera.position.set(0,7,12);camera.lookAt(0,0,0);camera.updateMatrixWorld();
    const reflected=new THREE.Vector3(0,2*WATER_HEIGHT-3,0).project(camera);
    const x=Math.round((reflected.x*.5+.5)*640),y=Math.round((reflected.y*.5+.5)*480);
    const visual={...DEFAULT_VISUAL_SETTINGS,waterRippleStrength:0,waterReflectionStrength:1,waterReflectionResolution:512};
    function draw(enabled,time){system.update(renderer,scene,camera,[water],[],time,'dusk',{...visual,waterReflections:enabled},false);renderer.render(scene,camera);
      const pixel=new Uint8Array(4),gl=renderer.getContext();gl.readPixels(x,y,1,1,gl.RGBA,gl.UNSIGNED_BYTE,pixel);return [...pixel];}
    const off=draw(false,0),on=draw(true,1000);
    window.waterLab={off,on,pixel:[x,y],glError:renderer.getContext().getError(),passes:system.stats.reflectionPasses};
    window.disposeWaterLab=()=>{system.dispose();geometry.dispose();boxGeometry.dispose();material.dispose();renderer.dispose();};
  ` }, bundle: true, format: "iife", write: false, logLevel: "error" });
  const errors: string[] = []; page.on("pageerror", error => errors.push(error.message)); page.on("console", message => { if (message.type() === "error") errors.push(message.text()); });
  await page.setContent('<!doctype html><style>body{margin:0;background:#203040}canvas{display:block}</style><canvas></canvas>');
  await page.addScriptTag({ content: compiled.outputFiles[0].text });
  const result = await page.evaluate(() => (window as unknown as { waterLab: { off: number[]; on: number[]; glError: number; passes: number } }).waterLab);
  expect(result.glError).toBe(0); expect(result.passes).toBe(1);
  expect(result.on[0]).toBeGreaterThan(result.off[0] + 15);
  expect(result.on[1]).toBeLessThanOrEqual(result.off[1] + 3); expect(result.on[2]).toBeLessThanOrEqual(result.off[2] + 3);
  await page.screenshot({ path: `${output}/lab-projection.png` });
  await writeFile(`${output}/lab-projection.json`, JSON.stringify({ ...result, errors }, null, 2) + "\n");
  await page.evaluate(() => (window as unknown as { disposeWaterLab: () => void }).disposeWaterLab()); expect(errors).toEqual([]);
});

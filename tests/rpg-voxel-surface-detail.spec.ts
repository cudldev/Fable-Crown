import { expect, test, type Locator, type Page } from "@playwright/test";
import { build } from "esbuild";
import { mkdir, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { DEFAULT_VISUAL_SETTINGS } from "../src/render/three/visual-settings";
import { createValleySave } from "../src/valley/save";
import { tile } from "../src/rpg/world";
import { openWorldTools } from "./world-tools";
import type { SurfaceLabResult } from "./voxel-surface-detail-lab";
import {VOXEL_SURFACE_DETAIL_PROFILE} from "../src/render/three/voxel-surface-detail";
import { LinearMipmapLinearFilter, NearestFilter, NoColorSpace, RedFormat, UnsignedByteType } from "three";

// Local GPU evidence only. Do not add these tests to the two-case release suite.
const reports = process.env.SURFACE_REPORTS || "docs/performance/voxel-surface-detail";
const captures = process.env.SURFACE_CAPTURES || "docs/screenshots/voxel-surface-detail";
const world = (page: Page) => page.getByTestId("rpg-world");
const defaults = { strength: DEFAULT_VISUAL_SETTINGS.voxelSurfaceStrength, variation: DEFAULT_VISUAL_SETTINGS.voxelSurfaceVariation };
const errors = new WeakMap<Page, string[]>();
test.beforeEach(async ({ page }) => {
  const captured: string[] = []; errors.set(page, captured);
  page.on("pageerror", error => captured.push(error.message));
  page.on("console", message => { if (message.type() === "error"||message.type()==="warning"&&/GL_INVALID|INVALID_OPERATION|shader.*error/i.test(message.text())) captured.push(message.text()); });
  await mkdir(reports, { recursive: true }); await mkdir(captures, { recursive: true });
});
test.afterEach(async ({ page }) => { expect(errors.get(page)).toEqual([]); });

test("native-pitch normals turn off exactly, stay anchored and minify without growing extreme contrast", async ({ page }) => {
  await page.setViewportSize({ width: 640, height: 480 });
  const bundled = await build({ entryPoints: [resolve("tests/voxel-surface-detail-lab.ts")], bundle: true, format: "iife", write: false, logLevel: "error" });
  await page.setContent('<!doctype html><style>body{margin:0}canvas{display:block}</style><canvas></canvas>');
  await page.addScriptTag({ content: bundled.outputFiles[0].text });
  const result: SurfaceLabResult = await page.evaluate(() => window.voxelSurfaceLab.result);
  const labReport = { ...result, errors: errors.get(page), note: "Actual WebGL pixels from a fixed 0.0625 m grid with uniform source albedo and fixed directional lighting. One shared baked R8 16³ diffuse texture uses hardware mipmaps; there is no procedural grid growth. Interior color range excludes bevels; edge energy references each cell's own center. Eighteen minification phases use actual 16,8,4,2,1,0.5 pixels/cell and three subpixel offsets. Surface masks exclude background; native captures are not upscaled. Mip allocation is checked using real GPU framebuffer attachments at all five levels." };
  await writeFile(`${reports}/shader-lab.json`, JSON.stringify(labReport, null, 2) + "\n");
  for (const mode of ["stock", "off", "uniform", "varied", "instanced"] as const) {
    await page.evaluate(mode => window.voxelSurfaceLab.show(mode), mode);
    await page.locator("canvas").screenshot({ path: `${captures}/lab-${mode}.png` });
  }
  for (const pixelsPerCell of [16, 4, 1, .5]) {
    await page.evaluate(value => window.voxelSurfaceLab.showMinification(value, [.17, .31]), pixelsPerCell);
    await expect(page.locator("canvas")).toHaveAttribute("width", String(8 * pixelsPerCell));
    await expect(page.locator("canvas")).toHaveAttribute("height", String(6 * pixelsPerCell));
    const size = await page.locator("canvas").boundingBox();
    expect(size!.width).toBe(8 * pixelsPerCell); expect(size!.height).toBe(6 * pixelsPerCell);
    await page.locator("canvas").screenshot({ path: `${captures}/lab-minified-${pixelsPerCell}px-cell.png` });
  }
  expect(result.pitch).toBe(.0625*VOXEL_SURFACE_DETAIL_PROFILE.cellScale);
  expect(result.offDelta).toBe(0);
  expect(result.shadingDelta).toBeGreaterThan(.1);
  expect(result.variationDelta).toBeGreaterThan(.05);
  expect(result.repeatDelta).toBe(0);
  expect(result.variedCellDelta).toBeGreaterThan(result.uniformCellDelta + .01);
  expect(result.cellRelief.interiorDelta).toBeGreaterThan(0);
  expect(result.cellRelief.interiorDelta).toBeLessThanOrEqual(4);
  expect(result.cellRelief.interiorColorRange).toBe(0);
  expect(result.cellRelief.cellCenterShadeRange).toBeGreaterThan(0);
  expect(result.cellRelief.centerBrightening).toBe(0);
  expect(result.cellRelief.cells).toHaveLength(48);
  for (const cell of result.cellRelief.cells) expect(cell.interiorColorRange, `cell ${cell.column},${cell.row}`).toBe(0);
  expect(result.cellRelief.maxMean).toBeGreaterThan(.1);
  expect(result.cellRelief.minMean).toBeGreaterThan(.1);
  expect(result.cellRelief.maxMean).toBeGreaterThan(result.cellRelief.minMean+.05);
  expect(result.cellRelief.lowReliefCells).toBeGreaterThan(0);
  for (const transform of result.transformDeltas) expect(transform.delta, transform.name).toBeLessThan(.12);
  expect(result.minification).toHaveLength(18);
  const nearPeak = Math.max(...result.minification.filter(sample => sample.pixelsPerCell === 16).map(sample => sample.maxChannelDelta));
  expect(nearPeak).toBeGreaterThan(0); // The distance test must not pass by filtering out every near detail.
  for (const sample of result.minification) {
    const phase = `${sample.pixelsPerCell}px/cell at ${sample.offsetPixels.join(",")}`;
    expect(sample.buffer, phase).toEqual([8 * sample.pixelsPerCell, 6 * sample.pixelsPerCell]);
    expect(sample.surfacePixels, phase).toBeGreaterThan(0);
    expect(sample.offDelta, phase).toBe(0); expect(sample.repeatDelta, phase).toBe(0);
    // Allow quantization/sampling headroom instead of demanding a brittle
    // monotonic mean. Minification must not produce a stronger contrast spike
    // than the near surface, or an extreme dark/light rim at any phase.
    expect(sample.maxChannelDelta, phase).toBeLessThanOrEqual(nearPeak + 8);
    expect(sample.maxChannelDelta, phase).toBeLessThanOrEqual(64);
    if (sample.pixelsPerCell <= 1) {
      expect(sample.surfaceColorRange, phase).toBeLessThanOrEqual(2);
      expect(sample.meanDelta, phase).toBeGreaterThan(0);
      expect(sample.meanDelta, phase).toBeLessThanOrEqual(4);
      expect(sample.maxChannelDelta, phase).toBeLessThanOrEqual(4);
      expect(sample.maxBrightening, phase).toBe(0);
    }
  }
  expect(result.topologyUnchanged).toBe(true); expect(result.textures).toBe(1);
  expect(result.bakedTexture).toMatchObject({ size: [16, 16, 16], bytes: 4096, minimum: 250, maximum: 255, sharedIdentity: true, generateMipmaps: true,
    minFilter: LinearMipmapLinearFilter, magFilter: NearestFilter, format: RedFormat, type: UnsignedByteType, colorSpace: NoColorSpace,
    hardwareMinFilter: 0x2703, hardwareMagFilter: 0x2600, texturesAfterUniformChanges: 1 });
  expect(result.bakedTexture.mipLevels.map(level => level.size)).toEqual([16, 8, 4, 2, 1]);
  for (const level of result.bakedTexture.mipLevels) expect(level.complete, `GPU mip ${level.level}`).toBe(true);
  expect(result.programCounts[1]).toBe(result.programCounts[0]); expect(result.glError).toBe(0);
  const disposal = await page.evaluate(() => window.voxelSurfaceLab.inspectDisposal());
  await writeFile(`${reports}/shader-lab.json`, JSON.stringify({ ...labReport, disposal }, null, 2) + "\n");
  expect(disposal).toEqual({ before: 1, afterOneMaterial: 1, afterLastMaterial: 1, afterLastLease: 0, disposeEvents: 1 });
});

async function setRange(slider: Locator, value: number) {
  await slider.scrollIntoViewIfNeeded(); await slider.press("Home");
  const step = Number(await slider.getAttribute("step"));
  for (let index = 0; index < Math.round(value / step); index++) await slider.press("ArrowRight");
  await expect(slider).toHaveValue(String(value));
}
async function surfaceValues(page: Page, strength: number, variation: number) {
  await expect.poll(async () => Number(await world(page).getAttribute("data-voxel-surface-strength"))).toBeCloseTo(strength, 8);
  await expect.poll(async () => Number(await world(page).getAttribute("data-voxel-surface-variation"))).toBeCloseTo(variation, 8);
}
async function settings(page: Page) {
  await page.getByRole("button", { name: "Camera", exact: true }).click();
  const dialog = page.getByRole("dialog"); await expect(dialog).toHaveAttribute("data-menu-panel", "settings"); return dialog;
}
async function settle(page: Page) {
  await expect(world(page)).toHaveAttribute("data-voxel-queued", "0", { timeout: 30000 });
  await expect(world(page)).toHaveAttribute("data-foliage-queued", "0", { timeout: 30000 });
  // Runtime counters publish once per second. Warm all visible material/LOD paths
  // before taking a baseline; changing these two uniforms must not rebuild them.
  await page.waitForTimeout(1200);
}
const stableKeys = ["terrainBakes", "terrainChunks", "staticBatchBuilds", "voxelTemplates", "voxelTemplateBuilds", "voxelGeometryBytes", "voxelInstanceBytes", "voxelUploads"] as const;
async function cacheCounters(page: Page) {
  return world(page).evaluate((element, keys) => Object.fromEntries(keys.map(key => [key, (element as HTMLElement).dataset[key]])), [...stableKeys]);
}
async function measure(page: Page) {
  return page.evaluate(async () => {
    const canvas = document.querySelector<HTMLCanvasElement>('[data-testid="three-canvas"]')!, gl = canvas.getContext("webgl2")!;
    const extension = gl.getExtension("WEBGL_debug_renderer_info"), intervals: number[] = [];
    let previous = await new Promise<number>(resolve => requestAnimationFrame(resolve)); const start = previous;
    while (previous - start < 1500) {
      const now = await new Promise<number>(resolve => requestAnimationFrame(resolve)); intervals.push(now - previous); previous = now;
    }
    const sorted = [...intervals].sort((a, b) => a - b), sum = intervals.reduce((a, b) => a + b, 0);
    const current = document.querySelector<HTMLElement>('[data-testid="rpg-world"]')!;
    return { intervalsMs: intervals, meanMs: sum / intervals.length, medianMs: sorted[Math.floor(sorted.length * .5)], p95Ms: sorted[Math.floor(sorted.length * .95)],
      elapsedMs: previous - start, browser: navigator.userAgent, viewport: [innerWidth, innerHeight], devicePixelRatio,
      buffer: [gl.drawingBufferWidth, gl.drawingBufferHeight], renderer: extension ? String(gl.getParameter(extension.UNMASKED_RENDERER_WEBGL)) : String(gl.getParameter(gl.RENDERER)),
      camera: JSON.parse(current.dataset.cameraPose!), counters: { ...current.dataset }, glError: gl.getError() };
  });
}
async function copyPreset(page: Page, panel: Locator) {
  await panel.getByRole("button", { name: "Copy settings", exact: true }).click();
  const text = panel.getByRole("textbox", { name: "Settings to copy", exact: true });
  await expect(text).toBeAttached();
  return JSON.parse(await text.inputValue()) as { type: string; visual: { voxelSurfaceStrength: number; voxelSurfaceVariation: number } };
}

async function runtimeReview(page: Page, label: "desktop" | "mobile") {
  await page.addInitScript(() => {
    const pad={buttons:Array.from({length:17},()=>({pressed:false,touched:false,value:0})),axes:[0,0,0,0]};
    Object.assign(window,{surfaceQaPad:pad});Object.defineProperty(navigator,"getGamepads",{value:()=>[{...pad,connected:true,index:0,id:"Surface controls QA",mapping:"standard",timestamp:performance.now()}]});
    // Existing user-facing cosmetic preferences keep the lighting and grass
    // fixed. These are fixture inputs, not a hidden renderer control path.
    localStorage.setItem("fable-crown.daylight-settings", JSON.stringify({ dayNightCycle: false, dayTime: 12, cycleMinutes: 30 }));
    localStorage.setItem("fable-crown.foliage-settings", JSON.stringify({ foliageEnabled: true, foliageDensity: .7, windStrength: 0 }));
    localStorage.removeItem("fable-crown.voxel-surface-settings");
  });
  await page.goto("./?chapter=valley");
  await expect(page.getByTestId("valley-app")).toHaveAttribute("data-ready", "true", { timeout: 90000 });
  await expect(page.getByTestId("valley-app")).toHaveAttribute("data-mode", "world");
  await expect(world(page)).toHaveAttribute("data-voxel-surface-cell-scale",String(VOXEL_SURFACE_DETAIL_PROFILE.cellScale));
  const save = createValleySave(Date.now());
  Object.assign(save.action.player, { x: 25, z: 142 });
  Object.assign(save.chapter.player, { position: tile(25, 142), previousPosition: tile(25, 142), path: [], movement: null, action: null });
  let panel = await settings(page);
  await page.getByLabel("Import valley archive").setInputFiles({ name: "surface-fixture.json", mimeType: "application/json", buffer: Buffer.from(JSON.stringify(save)) });
  await expect(panel).toContainText("Chapter restored");
  for (let index = 0; index < 5; index++) await panel.getByRole("button", { name: "Zoom in", exact: true }).click();
  await panel.getByRole("button", { name: "Reset voxel surfaces", exact: true }).click();
  await surfaceValues(page, defaults.strength, defaults.variation);
  await panel.getByRole("button", { name: "Close", exact: true }).click();
  await settle(page);
  await expect(world(page)).toHaveAttribute("data-day-hour", "fixed");
  const trials = [];
  for (const [index, strength] of [0, defaults.strength, 0].entries()) {
    panel = await settings(page);
    await setRange(panel.getByRole("slider", { name: "Voxel depth", exact: true }), strength);
    await setRange(panel.getByRole("slider", { name: "Voxel variation", exact: true }), defaults.variation);
    await surfaceValues(page, strength, defaults.variation);
    await panel.getByRole("button", { name: "Close", exact: true }).click();
    await settle(page);
    const cache = await cacheCounters(page), observation = await measure(page);
    trials.push({ strength, variation: defaults.variation, cache, ...observation });
    await page.screenshot({ path: `${captures}/${label}-${index === 1 ? "on" : index === 0 ? "off-before" : "off-after"}.png` });
  }
  const report = { capturedAt: new Date().toISOString(), trials, defaults, errors: errors.get(page),
    note: "Sequential off/on/off host requestAnimationFrame intervals on one fixed-light, fixed-camera valley scene. Full renderer and ambient scene cost; not isolated shader GPU cost or a physical-mobile benchmark. No FPS pass threshold." };
  await writeFile(`${reports}/${label}.json`, JSON.stringify(report, null, 2) + "\n");
  for (const trial of trials) {
    expect(trial.intervalsMs.length).toBeGreaterThan(2); expect(trial.glError).toBe(0);
    for (const key of stableKeys) expect(trial.cache[key], key).toBeDefined();
    expect(trial.cache).toEqual(trials[0].cache);
    expect(trial.camera).toEqual(trials[0].camera);
  }
  panel = await settings(page);
  const depth = panel.getByRole("slider", { name: "Voxel depth", exact: true }), variation = panel.getByRole("slider", { name: "Voxel variation", exact: true });
  await expect(panel.getByRole("slider", { name: "Voxel distance blend", exact: true })).toHaveCount(0);
  await setRange(depth, defaults.strength); await setRange(variation, 1);
  if(label==="desktop"){
    const padButton=async(index:number,pressed:boolean)=>{await page.evaluate(({index,pressed})=>{const pad=(window as unknown as {surfaceQaPad:{buttons:{pressed:boolean;value:number}[]}}).surfaceQaPad;pad.buttons[index].pressed=pressed;pad.buttons[index].value=pressed?1:0;},{index,pressed});await page.waitForTimeout(60);};
    await depth.focus();await padButton(15,true);await expect(depth).toHaveValue(String(Number((defaults.strength+.05).toFixed(2))));
    await page.waitForTimeout(180);await expect(depth).toHaveValue(String(Number((defaults.strength+.05).toFixed(2))));await padButton(15,false);
    await padButton(13,true);await expect(variation).toBeFocused();await padButton(13,false);
    await padButton(14,true);await expect(variation).toHaveValue("0.95");await padButton(14,false);
    await variation.press("ArrowLeft");await expect(variation).toHaveValue("0.9");
  }
  if (label === "mobile") {
    await depth.scrollIntoViewIfNeeded(); const bounds = await depth.boundingBox(); expect(bounds).not.toBeNull();
    expect(bounds!.height).toBeGreaterThanOrEqual(44);
    await depth.tap({ position: { x: bounds!.width / 2, y: bounds!.height / 2 } });
    expect(Number(await depth.inputValue())).toBeGreaterThanOrEqual(.4); expect(Number(await depth.inputValue())).toBeLessThanOrEqual(.6);
    await page.setViewportSize({ width: 844, height: 390 });
    await expect(variation).toHaveValue("1");
    await variation.scrollIntoViewIfNeeded();
    await page.screenshot({ path: `${captures}/mobile-landscape-controls.png` });
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  }
  await panel.getByRole("button", { name: "Reset voxel surfaces", exact: true }).click();
  await expect(depth).toHaveValue(String(defaults.strength)); await expect(variation).toHaveValue(String(defaults.variation));
  await surfaceValues(page, defaults.strength, defaults.variation);
  const persisted = await page.evaluate(() => JSON.parse(localStorage.getItem("fable-crown.voxel-surface-settings")!));
  expect(persisted).toMatchObject({ voxelSurfaceStrength: defaults.strength, voxelSurfaceVariation: defaults.variation });
  await writeFile(`${reports}/${label}.json`, JSON.stringify({ ...report, persisted }, null, 2) + "\n");

  // The standard renderer controls must also transport and reset these fields.
  // Visit the retained chapter through its public route, with no hidden buttons.
  await page.goto("./?chapter=legacy&renderer=3d");
  await expect(world(page)).toHaveAttribute("data-status", "ready", { timeout: 90000 });
  await openWorldTools(page); await page.getByRole("button", { name: "Visual settings", exact: true }).click();
  const visual = page.getByRole("dialog", { name: "Visual settings", exact: true });
  await setRange(visual.getByRole("slider", { name: "Voxel depth", exact: true }), 0);
  await setRange(visual.getByRole("slider", { name: "Voxel variation", exact: true }), 1);
  await expect(visual.getByRole("slider", { name: "Voxel distance blend", exact: true })).toHaveCount(0);
  const configured = await copyPreset(page, visual);
  expect(configured.type).toBe("fable-crown.visual-settings");
  expect(configured.visual).toMatchObject({ voxelSurfaceStrength: 0, voxelSurfaceVariation: 1 });
  await visual.getByRole("button", { name: "Reset visual settings", exact: true }).click();
  await expect(visual.getByRole("slider", { name: "Voxel depth", exact: true })).toHaveValue(String(defaults.strength));
  await expect(visual.getByRole("slider", { name: "Voxel variation", exact: true })).toHaveValue(String(defaults.variation));
  const reset = await copyPreset(page, visual);
  expect(reset.visual).toMatchObject({ voxelSurfaceStrength: defaults.strength, voxelSurfaceVariation: defaults.variation });
  await visual.getByRole("slider", { name: "Voxel depth", exact: true }).scrollIntoViewIfNeeded();
  await page.screenshot({ path: `${captures}/${label}-visual-settings.png` });
  await writeFile(`${reports}/${label}-presets.json`, JSON.stringify({ configured, reset }, null, 2) + "\n");
}

test("actual desktop valley exposes live normal tuning without geometry or cache rebuilds", async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 720 }); await runtimeReview(page, "desktop");
});
test.describe("coarse mobile surface controls", () => {
  test.use({ hasTouch: true, isMobile: true, deviceScaleFactor: 1, viewport: { width: 390, height: 844 } });
  test("actual portrait and landscape tuning preserves fixed-camera A/B and copied/reset defaults", async ({ page }) => {
    await runtimeReview(page, "mobile");
  });
});

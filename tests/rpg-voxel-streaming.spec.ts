import { expect, test, type Locator, type Page } from "@playwright/test";
import { mkdir, writeFile } from "node:fs/promises";
import { createRpg } from "../src/rpg/engine";
import { WORLD, interactionTiles } from "../src/rpg/world";
import { VOXEL_VISIBLE_CELL_BUDGET, VOXEL_RESIDENT_CELL_BUDGET } from "../src/render/three/voxel-buckets";
import { renderFrameCount } from "./render-profile";

const output = "docs/performance/async-streaming";
const expectedObjects = { tree: 240, anvil: 3, supplies: 7, "ore-copper": 12, "ore-tin": 6, "ore-iron": 6, "ore-coal": 6 };

async function settled(world: Locator) {
  // Counter publication is twice per second; inspect the actual runtime queue,
  // not an arbitrary warm-up delay after a gesture.
  await expect(world).toHaveAttribute("data-voxel-queued", "0", { timeout: 60000 });
  await expect(world).toHaveAttribute("data-voxel-staged-cells", "0");
  await expect(world).toHaveAttribute("data-voxel-budget-exceeded", "false");
  expect(Number(await world.getAttribute("data-voxel-instances"))).toBeGreaterThan(0);
  expect(Number(await world.getAttribute("data-voxel-instances"))).toBeLessThanOrEqual(VOXEL_VISIBLE_CELL_BUDGET);
  expect(Number(await world.getAttribute("data-voxel-resident-cells"))).toBeLessThanOrEqual(VOXEL_RESIDENT_CELL_BUDGET);
}

async function sample(page: Page) {
  return page.evaluate(async frames => {
    const root = document.querySelector<HTMLElement>('[data-testid="rpg-world"]')!;
    const samples: { applied: number; preset: string | undefined; commits: number; instances: number }[] = [];
    for (let frame = 0; frame < frames; frame++) {
      await new Promise<void>(resolve => requestAnimationFrame(() => resolve()));
      samples.push({ applied: Number(root.dataset.giApplied), preset: root.dataset.giLighting, commits: Number(root.dataset.voxelCommits), instances: Number(root.dataset.voxelInstances) });
    }
    const gl = document.querySelector<HTMLCanvasElement>('[data-testid="three-canvas"]')!.getContext("webgl2")!;
    return { samples, counters: { ...root.dataset }, glError: gl.getError() };
  }, renderFrameCount(120));
}

test("asynchronous voxel and probe work converges after rapid camera changes and offline worker reload", async ({ page, context }) => {
  test.setTimeout(180000);
  await mkdir(output, { recursive: true });
  const errors: string[] = [], external: string[] = [], workers: string[] = [];
  page.on("pageerror", error => errors.push(error.message));
  page.on("console", message => { if (message.type() === "error") errors.push(message.text()); });
  page.on("worker", worker => workers.push(worker.url()));
  page.on("request", request => {
    const url = new URL(request.url());
    if (url.protocol.startsWith("http") && page.url().startsWith("http") && url.origin !== new URL(page.url()).origin) external.push(url.href);
  });
  await page.setViewportSize({ width: 1280, height: 800 });
  await page.goto("./?renderer=3d");
  const world = page.getByTestId("rpg-world"), canvas = page.getByTestId("three-canvas");
  await expect(world).toHaveAttribute("data-status", "ready", { timeout: 60000 });
  const fixture = createRpg(Date.now(), 8128), tree = WORLD.objects.find(object => object.kind === "tree")!;
  Object.assign(fixture.control, { autoplay: false, waiting: true, goal: null, active: null, source: null, queue: [], thought: null, thinkingUntil: 1_000_000_000 });
  const position = interactionTiles(tree)[0];
  Object.assign(fixture.player, { path: [], movement: null, action: null, position, previousPosition: { ...position } });
  await page.getByRole("button", { name: "Open game menu", exact: true }).click();
  await page.locator('input[type="file"]').setInputFiles({ name: "streaming-forest.json", mimeType: "application/json", buffer: Buffer.from(JSON.stringify(fixture)) });
  await expect(page.getByRole("status")).toContainText("Chronicle restored");
  await page.getByRole("button", { name: "Close panel", exact: true }).click();
  await page.getByRole("button", { name: "Follow Alden", exact: true }).dispatchEvent("click");
  await page.getByRole("button", { name: "Day lighting", exact: true }).dispatchEvent("click");
  await expect.poll(async () => JSON.parse((await world.getAttribute("data-voxel-object-counts"))!), { timeout: 60000 }).toEqual(expectedObjects);
  await settled(world);
  await expect.poll(async () => Number(await world.getAttribute("data-voxel-native-trees")), { timeout: 60000 }).toBeGreaterThan(0);
  await expect(world).toHaveAttribute("data-gi-lighting", "day", { timeout: 60000 });
  await expect.poll(async () => Number(await world.getAttribute("data-gi-yields"))).toBeGreaterThan(0);
  expect(Number(await world.getAttribute("data-gi-max-slice-ms"))).toBeGreaterThan(0);
  const initial = await sample(page);

  // Change the desired detail while old replacements can still be in flight.
  for (let gesture = 0; gesture < 8; gesture++) await canvas.dispatchEvent("wheel", { deltaY: gesture % 2 ? -1200 : 1200, bubbles: true });
  await page.getByRole("button", { name: "World overview", exact: true }).dispatchEvent("click");
  await expect.poll(async () => Number(await world.getAttribute("data-voxel-parent-buckets")), { timeout: 60000 }).toBeGreaterThan(0);
  await settled(world);
  const overview = await sample(page);
  expect((overview.counters.voxelLods ?? "").split(",").map(Number)[0]).toBe(0);
  await page.getByRole("button", { name: "World overview", exact: true }).dispatchEvent("click");
  for (let step = 0; step < 8; step++) await page.getByRole("button", { name: "Zoom in", exact: true }).dispatchEvent("click");
  await expect(world).toHaveAttribute("data-camera-zoom", "2.0000");
  await settled(world);
  await expect.poll(async () => Number(await world.getAttribute("data-voxel-native-trees")), { timeout: 60000 }).toBeGreaterThan(0);

  const applied = Number(await world.getAttribute("data-gi-applied"));
  for (const preset of ["Night lighting", "Day lighting", "Night lighting"]) await page.getByRole("button", { name: preset, exact: true }).dispatchEvent("click");
  await expect(world).toHaveAttribute("data-gi-lighting", "night", { timeout: 60000 });
  await expect.poll(async () => Number(await world.getAttribute("data-gi-applied"))).toBeGreaterThan(applied);
  const finalNight = await sample(page);
  expect(finalNight.samples.every(value => value.preset === "night" && value.applied > applied)).toBe(true);
  for (let i = 1; i < finalNight.samples.length; i++) expect(finalNight.samples[i].applied).toBeGreaterThanOrEqual(finalNight.samples[i - 1].applied);
  await page.screenshot({ path: `${output}/runtime-desktop.png` });

  const phones = [];
  for (const viewport of [{ width: 390, height: 844 }, { width: 844, height: 390 }]) {
    await page.setViewportSize(viewport); await settled(world);
    expect(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth + 1)).toBe(false);
    phones.push({ viewport, ...await sample(page) });
    await page.screenshot({ path: `${output}/runtime-${viewport.width}.png` });
  }

  await page.evaluate(async () => { await navigator.serviceWorker.ready; });
  await expect.poll(() => page.evaluate(() => !!navigator.serviceWorker.controller), { timeout: 60000 }).toBe(true);
  const decoderUrl = workers.find(url => /voxel-assets\.worker-/.test(url));
  expect(decoderUrl).toBeTruthy();
  expect(await page.evaluate(async url => !!(await caches.match(url)), decoderUrl!)).toBe(true);
  const decoderCount = workers.filter(url => /voxel-assets\.worker-/.test(url)).length;
  await context.setOffline(true); await page.reload();
  await expect(world).toHaveAttribute("data-status", "ready", { timeout: 60000 });
  await expect.poll(async () => JSON.parse((await world.getAttribute("data-voxel-object-counts"))!), { timeout: 60000 }).toEqual(expectedObjects);
  await settled(world);
  await expect.poll(async () => Number(await world.getAttribute("data-gi-applied")), { timeout: 60000 }).toBeGreaterThan(0);
  expect(workers.filter(url => /voxel-assets\.worker-/.test(url)).length).toBeGreaterThan(decoderCount);
  const offline = await sample(page);
  for (const result of [initial, overview, finalNight, ...phones, offline]) {
    expect(result.glError).toBe(0);
    expect(result.samples.every(value => value.commits >= 0 && value.commits <= 1 && value.instances > 0)).toBe(true);
  }
  expect(errors).toEqual([]); expect(external).toEqual([]);
  await writeFile(`${output}/runtime-review.json`, JSON.stringify({ initial, overview, finalNight, phones, offline, workers, errors, external,
    note: "Actual production WebGL, asynchronous queue convergence, final preset ordering and cached worker restart offline. Phone viewports are host emulation; sampled diagnostics are not hard per-frame timing guarantees." }, null, 2) + "\n");
});

import { expect, test, type Page } from "@playwright/test";
import { mkdir, writeFile } from "node:fs/promises";
import { createRpg } from "../src/rpg/engine";
import { tile } from "../src/rpg/world";

async function restore(page: Page, x: number, z: number) {
  const state = createRpg(Date.now(), 8128), position = tile(x, z);
  Object.assign(state.control, { autoplay: false, waiting: true, active: null, goal: null, source: null, queue: [], thought: null, thinkingUntil: 1e9 });
  Object.assign(state.player, { position, previousPosition: { ...position }, path: [], movement: null, action: null });
  await page.getByRole("button", { name: "Open game menu", exact: true }).click();
  await page.locator('input[type="file"]').setInputFiles({ name: "camera-stutter.json", mimeType: "application/json", buffer: Buffer.from(JSON.stringify(state)) });
  await expect(page.getByRole("status")).toContainText("Chronicle restored");
  await page.getByRole("button", { name: "Close panel", exact: true }).click();
  await page.locator('button[aria-label="Follow Alden"]').dispatchEvent("click");
  const world = page.getByTestId("rpg-world");
  await expect(world).toHaveAttribute("data-camera-x", x.toFixed(2));
  await expect(world).toHaveAttribute("data-camera-y", z.toFixed(2));
  await expect(world).toHaveAttribute("data-foliage-queued", "0", { timeout: 60000 });
  await page.waitForTimeout(550);
  await expect(world).toHaveAttribute("data-foliage-queued", "0", { timeout: 60000 });
  await expect(page.locator(".world-health-player")).toBeVisible();
}

test("camera pans retain foliage and cached label dimensions in forest and open grassland", async ({ page }) => {
  test.setTimeout(120000);
  await mkdir("docs/performance/camera-stutter", { recursive: true });
  const errors: string[] = []; page.on("pageerror", error => errors.push(error.message));
  await page.setViewportSize({ width: 1280, height: 800 }); await page.goto("./");
  const world = page.getByTestId("rpg-world");
  await expect(world).toHaveAttribute("data-status", "ready", { timeout: 60000 });
  await expect(world).toHaveAttribute("data-voxel-template-builds", "37");
  const results = [];
  for (const route of [{ name: "forest", x: 42, z: 90 }, { name: "open", x: 222, z: 72 }]) {
    await restore(page, route.x, route.z);
    if (route.name === "open") await expect(world).toHaveAttribute("data-voxel-closest-tree-id", "");
    await expect.poll(async () => Number(await world.getAttribute("data-foliage-plants"))).toBeGreaterThan(0);
    const initial = await world.evaluate(element => ({ ...element.dataset }));
    await page.evaluate(() => {
      const state = window as typeof window & { labelOffsetReads?: number; restoreLabelOffsets?: () => void; cameraStutterMeasuring?: boolean };
      state.labelOffsetReads = 0; state.cameraStutterMeasuring = true;
      const descriptors = ["offsetWidth", "offsetHeight"].map(key => [key, Object.getOwnPropertyDescriptor(HTMLElement.prototype, key)!] as const);
      for (const [key, descriptor] of descriptors) Object.defineProperty(HTMLElement.prototype, key, { ...descriptor, get(this: HTMLElement) {
        if (this.closest(".world-health,.world-work,.three-feedback")) state.labelOffsetReads!++;
        return descriptor.get!.call(this);
      } });
      state.restoreLabelOffsets = () => { for (const [key, descriptor] of descriptors) Object.defineProperty(HTMLElement.prototype, key, descriptor); };
    });
    let moving;
    try {
      const canvas = page.getByTestId("three-canvas"), start = await canvas.evaluate(element => {
        const bounds = element.getBoundingClientRect();
        for (const [x, y] of [[.5, .43], [.6, .4], [.4, .5]]) {
          const point = { x: bounds.x + bounds.width * x, y: bounds.y + bounds.height * y }, hit = document.elementFromPoint(point.x, point.y);
          if (hit === element || hit?.closest("[data-three-selection]")) return point;
        }
        throw Error("No exposed drag start");
      });
      await page.mouse.move(start.x, start.y); await page.mouse.down();
      try {
        const measuring = page.evaluate(async () => {
          const root = document.querySelector<HTMLElement>('[data-testid="rpg-world"]')!, canvas = root.querySelector("canvas")!, samples = [];
          const state = window as typeof window & { labelOffsetReads?: number; cameraStutterMeasuring?: boolean };
          while (state.cameraStutterMeasuring) {
            await new Promise(requestAnimationFrame);
            samples.push({ x: Number(root.dataset.cameraX), z: Number(root.dataset.cameraY), plants: Number(root.dataset.foliagePlants) });
          }
          return { samples, offsetReads: state.labelOffsetReads, glError: canvas.getContext("webgl2")!.getError() };
        });
        try {
          // Native pointer movement plus endpoint holds avoids aliasing a whole
          // sinusoidal cycle with camera diagnostics published every500ms.
          for (const [dx, dy] of [[460, 160], [-360, -120], [0, 0]]) {
            await page.mouse.move(start.x + dx, start.y + dy, { steps: 24 });
            await page.waitForTimeout(650);
          }
        } finally {
          await page.evaluate(() => { (window as typeof window & { cameraStutterMeasuring?: boolean }).cameraStutterMeasuring = false; });
          moving = await measuring;
        }
      } finally { await page.mouse.up(); }
      await writeFile("docs/performance/camera-stutter/last-motion.json", JSON.stringify({ route, moving }, null, 2));
      expect(moving.offsetReads).toBe(0);
      expect(moving.samples.every(sample => sample.plants > 0)).toBe(true);
      expect(new Set(moving.samples.map(sample => `${Math.round(sample.x / 8)}:${Math.round(sample.z / 8)}`)).size).toBeGreaterThan(1);
      expect(moving.glError).toBe(0);
    } finally { await page.evaluate(() => (window as typeof window & { restoreLabelOffsets?: () => void }).restoreLabelOffsets?.()); }
    await expect(world).toHaveAttribute("data-foliage-queued", "0", { timeout: 60000 });
    await page.waitForTimeout(550);
    const final = await world.evaluate(element => ({ ...element.dataset }));
    expect(Number(final.hitLayoutReads)).toBe(Number(initial.hitLayoutReads));
    const commits = Number(final.foliageCommits) - Number(initial.foliageCommits), windows = Number(final.foliageUploads) - Number(initial.foliageUploads), cancelled = Number(final.foliageCancelled) - Number(initial.foliageCancelled);
    expect(commits).toBeLessThanOrEqual(7 * (windows + cancelled + 1));
    await page.locator('button[aria-label="Follow Alden"]').dispatchEvent("click");
    await expect(world).toHaveAttribute("data-camera-x", route.x.toFixed(2));
    await expect(world).toHaveAttribute("data-foliage-queued", "0", { timeout: 60000 });
    await expect(world).toHaveAttribute("data-foliage-plants", initial.foliagePlants!, { timeout: 60000 });
    await expect(page.locator(".world-health-player")).toBeVisible();
    const projection = await page.evaluate(() => {
      const health = document.querySelector(".world-health-player")!.getBoundingClientRect();
      const actor = document.querySelector('[data-three-selection=\'{"kind":"actor","id":0}\']')!.getBoundingClientRect();
      return { xDelta: Math.abs((health.left + health.width / 2) - (actor.left + actor.width / 2)), healthBottom: health.bottom, actorBottom: actor.bottom,
        inside: health.left >= 0 && health.right <= innerWidth && health.top >= 0 && health.bottom <= innerHeight };
    });
    expect(projection.xDelta).toBeLessThan(3); expect(projection.inside).toBe(true); expect(projection.healthBottom).toBeLessThan(projection.actorBottom);
    await page.screenshot({ path: `docs/performance/camera-stutter/settled-${route.name}.png` });
    if (route.name === "open") {
      await page.locator('[data-three-selection=\'{"kind":"actor","id":0}\']').click({ button: "right" });
      await expect(page.getByRole("menu", { name: "World actions" })).toBeVisible(); await page.keyboard.press("Escape");
    }
    results.push({ route, initial, moving, final, projection });
  }
  expect(errors).toEqual([]);
  await mkdir("docs/performance/camera-stutter", { recursive: true });
  await writeFile("docs/performance/camera-stutter/runtime-review.json", JSON.stringify({ results, errors,
    note: "Functional GPU check only: settled forest/open native pointer pans retain plants, cross8m windows, perform no recurring offset dimension reads, preserve projected label bounds and actual actor hit targeting. Endpoint holds avoid500ms diagnostic aliasing; no frame-rate assertion." }, null, 2));
});

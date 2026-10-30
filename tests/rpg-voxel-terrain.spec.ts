import { expect, test, type Page } from "@playwright/test";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { createRpg } from "../src/rpg/engine";
import type { RpgState } from "../src/rpg/types";

const output = "docs/art-audit/terrain-runtime-v1";
test.use({ actionTimeout: 20000 });

function fixture() {
  const state = createRpg(Date.now(), 8128);
  Object.assign(state.control, { waiting: true, goal: null, active: null, source: null, queue: [], thought: null, thinkingUntil: 1_000_000_000 });
  state.player.path = []; state.player.movement = null; state.player.action = null;
  return state;
}
async function restore(page: Page, state: RpgState) {
  await page.getByRole("button", { name: "Open game menu" }).click();
  await page.locator('input[type="file"]').setInputFiles({ name: "terrain-fixture.json", mimeType: "application/json", buffer: Buffer.from(JSON.stringify(state)) });
  await expect(page.getByRole("status")).toContainText("Chronicle restored");
  await page.getByRole("button", { name: "Close panel" }).click();
}
async function savedPlayer(page: Page) {
  await page.getByRole("button", { name: "Open game menu" }).click();
  await page.getByRole("button", { name: "Save on device" }).click();
  await expect(page.getByRole("status")).toContainText("Chronicle saved");
  const saved = await page.evaluate(() => new Promise<RpgState>((resolve, reject) => {
    const request = indexedDB.open("fable-crown", 1);
    request.onerror = () => reject(request.error);
    request.onsuccess = () => {
      const db = request.result, get = db.transaction("saves").objectStore("saves").get("v5");
      get.onsuccess = () => { resolve(get.result); db.close(); };
      get.onerror = () => { reject(get.error); db.close(); };
    };
  }));
  await page.getByRole("button", { name: "Close panel" }).click();
  return { position: saved.player.position, inventory: saved.player.inventory, skills: saved.player.skills, worldRevision: saved.worldRevision, version: saved.version };
}
async function sample(page: Page, frames = 45) {
  return page.evaluate(async count => {
    const root = document.querySelector<HTMLElement>('[data-renderer="3d"]')!, intervals: number[] = [];
    let last = performance.now();
    for (let i = 0; i < count; i++) { const now = await new Promise<number>(resolve => requestAnimationFrame(resolve)); intervals.push(now - last); last = now; }
    intervals.sort((a, b) => a - b);
    const gl = document.querySelector<HTMLCanvasElement>('[data-testid="three-canvas"]')!.getContext("webgl2")!, extension = gl.getExtension("WEBGL_debug_renderer_info");
    return { counters: { ...root.dataset }, rafMedianMs: intervals[Math.floor(count / 2)], rafP95Ms: intervals[Math.floor(count * .95)], viewport: [innerWidth, innerHeight], browser: navigator.userAgent,
      gpu: extension ? gl.getParameter(extension.UNMASKED_RENDERER_WEBGL) : "unavailable", contextLost: gl.isContextLost(), glError: gl.getError() };
  }, frames);
}

test("native VOX terrain paints the actual flat world crisply, reuses its bake and reloads offline", async ({ page, context }) => {
  const errors: string[] = [], external: string[] = [], terrainRequests: string[] = [];
  const published = JSON.parse(await readFile("public/art3d/terrain/manifest.json", "utf8")) as { version: string };
  page.on("pageerror", error => errors.push(error.message));
  page.on("console", message => { if (message.type() === "error") errors.push(message.text()); });
  page.on("request", request => {
    const url = new URL(request.url());
    if (url.pathname.includes("/art3d/terrain/")) terrainRequests.push(url.pathname + url.search);
    if (url.protocol.startsWith("http") && page.url().startsWith("http") && url.origin !== new URL(page.url()).origin) external.push(url.href);
  });
  await mkdir(output, { recursive: true });
  await page.setViewportSize({ width: 1280, height: 800 });
  await page.goto("./?renderer=3d");
  const world = page.getByTestId("rpg-world");
  await expect(world).toHaveAttribute("data-status", "ready", { timeout: 60000 });
  await expect(world).toHaveAttribute("data-terrain-source", "vox");
  await expect(world).toHaveAttribute("data-terrain-filter", "nearest");
  await expect(world).toHaveAttribute("data-terrain-elevation", "flat");
  await expect(world).toHaveAttribute("data-terrain-geometry", "flat-top-surfaces");
  await expect(world).toHaveAttribute("data-terrain-version", published.version);
  await expect.poll(async () => Number(await world.getAttribute("data-terrain-texture-bytes"))).toBeGreaterThan(0);
  await expect.poll(async () => Number(await world.getAttribute("data-terrain-chunks"))).toBeGreaterThan(0);
  await restore(page, fixture());
  const before = await savedPlayer(page);
  await page.getByRole("button", { name: "Day lighting", exact: true }).click();
  await page.getByRole("button", { name: "Follow Alden", exact: true }).click();
  await page.getByRole("button", { name: "Zoom in", exact: true }).click();
  await page.getByRole("button", { name: "Zoom in", exact: true }).click();
  const initial = await sample(page, 90), bakes = initial.counters.terrainBakes, bytes = initial.counters.terrainTextureBytes;
  expect(initial.contextLost).toBe(false); expect(initial.glError).toBe(0); expect(Number(bakes)).toBeGreaterThan(0);
  await page.screenshot({ path: output + "/world-day-close.png" });
  await page.getByRole("button", { name: "Dusk lighting", exact: true }).click();
  const dusk = await sample(page); await page.screenshot({ path: output + "/world-dusk-close.png" });
  await page.getByRole("button", { name: "Orthographic camera", exact: true }).click();
  const orthographic = await sample(page); await page.screenshot({ path: output + "/world-ortho.png" });
  await page.getByRole("button", { name: "World overview", exact: true }).click();
  const overview = await sample(page); await page.screenshot({ path: output + "/world-overview.png" });
  await page.getByRole("button", { name: "World overview", exact: true }).click();
  await page.getByRole("button", { name: "Perspective camera", exact: true }).click();
  await page.getByRole("button", { name: "Follow Alden", exact: true }).click();
  await page.setViewportSize({ width: 390, height: 844 });
  const phone = await sample(page); await page.screenshot({ path: output + "/world-phone.png" });
  expect(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth + 1)).toBe(false);
  await page.setViewportSize({ width: 844, height: 390 });
  const landscape = await sample(page); await page.screenshot({ path: output + "/world-landscape.png" });
  for (const view of [dusk, orthographic, overview, phone, landscape]) {
    expect(view.counters.terrainBakes).toBe(bakes); expect(view.counters.terrainTextureBytes).toBe(bytes);
    expect(view.counters.terrainSource).toBe("vox"); expect(view.contextLost).toBe(false); expect(view.glError).toBe(0);
  }
  expect(await savedPlayer(page)).toEqual(before);
  await page.evaluate(async () => { await navigator.serviceWorker.ready; });
  await expect.poll(() => page.evaluate(async () => !!navigator.serviceWorker.controller)).toBe(true);
  await expect.poll(() => page.evaluate(async version => {
    const url = new URL("art3d/terrain/tiles.bin", location.href); url.searchParams.set("v", version);
    return !!(await caches.match(url.href));
  }, published.version)).toBe(true);
  // Reproduce stale unversioned terrain entries without touching the real user's cache.
  // The versioned pack must still win on an offline reload of this isolated context.
  await page.evaluate(async version => {
    const name = (await caches.keys()).find(key => key.startsWith("fable-art-"));
    if (!name) throw Error("Missing active PWA artwork cache");
    const cache = await caches.open(name), manifest = new URL("art3d/terrain/manifest.json", location.href), pack = new URL("art3d/terrain/tiles.bin", location.href);
    const versioned = new URL(manifest); versioned.searchParams.set("v", version);
    const response = await cache.match(versioned.href); if (!response) throw Error("Missing versioned terrain manifest");
    const stale = await response.json(); stale.version = "0000000000000000";
    await cache.put(manifest.href, new Response(JSON.stringify(stale), { headers: { "Content-Type": "application/json" } }));
    await cache.put(pack.href, new Response(new Uint8Array([0, 1, 2, 3])));
  }, published.version);
  await context.setOffline(true); await page.reload();
  await expect(world).toHaveAttribute("data-status", "ready", { timeout: 60000 });
  await expect(world).toHaveAttribute("data-terrain-source", "vox");
  await expect(world).toHaveAttribute("data-terrain-filter", "nearest");
  await expect(world).toHaveAttribute("data-terrain-version", published.version);
  const offline = await sample(page);
  expect(terrainRequests.some(url => url.endsWith("/manifest.json?v=" + published.version))).toBe(true);
  expect(terrainRequests.some(url => url.endsWith("/tiles.bin?v=" + published.version))).toBe(true);
  expect(errors).toEqual([]); expect(external).toEqual([]);
  await writeFile(output + "/browser-review.json", JSON.stringify({ initial, dusk, orthographic, overview, phone, landscape, offline, terrainRequests, errors, externalRequests: external,
    bakeStableAcrossCameraAndLighting: true, offlineNativeTerrain: true, staleUnversionedTerrainIgnored: true, preservedPlayerState: before, physicalPhoneTest: false,
    note: "Actual game screenshots and observed host-browser RAF/GPU counters. Neither isolated terrain overhead nor physical-phone performance is established. Terrain remains flat and presentation-only; source VOX height/physics changes are outside this pass." }, null, 2) + "\n");
});

test.describe("native terrain fallback", () => {
  test.use({ serviceWorkers: "block" });
  test("an unavailable native pack keeps the game drawable with explicit fallback", async ({ page }) => {
    await mkdir(output, { recursive: true });
    const errors: string[] = []; page.on("pageerror", error => errors.push(error.message));
    await page.route("**/art3d/terrain/tiles.bin*", route => route.abort());
    await page.goto("./?renderer=3d");
    const world = page.getByTestId("rpg-world");
    await expect(world).toHaveAttribute("data-status", "ready", { timeout: 60000 });
    await expect(world).toHaveAttribute("data-terrain-source", "fallback");
    await expect.poll(async () => Number(await world.getAttribute("data-draw-calls"))).toBeGreaterThan(0);
    await expect(page.getByTestId("three-canvas")).toBeVisible();
    expect(errors).toEqual([]);
    await writeFile(output + "/fallback-review.json", JSON.stringify({ source: "fallback", pageErrors: errors, injectedPackFailure: true, serviceWorkersBlocked: true }) + "\n");
  });
});

import { expect, test, type Page } from "@playwright/test";
import { mkdir, writeFile } from "node:fs/promises";
import { createRpg } from "../src/rpg/engine";
import { WORLD, interactionTiles, tile } from "../src/rpg/world";
import { VOXEL_VERSION } from "../src/render/three/voxel-version";
import { VOXEL_RESIDENT_CELL_BUDGET } from "../src/render/three/voxel-buckets";
import type { RpgState, TilePosition } from "../src/rpg/types";

const output = "docs/art-audit/voxel-props-runtime-v1";
test.use({ actionTimeout: 20000 });
function fixture(position: TilePosition) {
  const state = createRpg(Date.now(), 8128);
  Object.assign(state.control, { waiting: true, goal: null, active: null, source: null, queue: [], thought: null, thinkingUntil: 1_000_000_000 });
  state.player.path = []; state.player.movement = null; state.player.action = null; state.player.position = position; state.player.previousPosition = { ...position };
  return state;
}
async function restore(page: Page, state: RpgState) {
  await page.getByRole("button", { name: "Open game menu" }).click();
  await page.locator('input[type="file"]').setInputFiles({ name: "voxel-props.json", mimeType: "application/json", buffer: Buffer.from(JSON.stringify(state)) });
  await expect(page.getByRole("status")).toContainText("Chronicle restored"); await page.getByRole("button", { name: "Close panel" }).click();
  await page.getByRole("button", { name: "Follow Alden", exact: true }).click();
}
async function sample(page: Page) {
  return page.evaluate(async () => {
    let previous = await new Promise<number>(resolve => requestAnimationFrame(resolve)); const intervals = [];
    for (let i = 0; i < 120; i++) { const now = await new Promise<number>(resolve => requestAnimationFrame(resolve)); intervals.push(now - previous); previous = now; }
    const gl = document.querySelector<HTMLCanvasElement>('[data-testid="three-canvas"]')!.getContext("webgl2")!;
    return { counters: { ...document.querySelector<HTMLElement>('[data-renderer="3d"]')!.dataset }, intervals, glError: gl.getError() };
  });
}

test("reviewed voxel props replace world bindings, deplete and survive stale-cache offline reload", async ({ page, context }) => {
  await mkdir(output, { recursive: true }); const errors: string[] = [], external: string[] = [], requests: string[] = [];
  page.on("pageerror", error => errors.push(error.message)); page.on("console", message => { if (message.type() === "error") errors.push(message.text()); });
  page.on("request", request => { const url = new URL(request.url()); if (url.pathname.includes("/art3d/voxel/")) requests.push(url.href);
    if (url.protocol.startsWith("http") && page.url().startsWith("http") && url.origin !== new URL(page.url()).origin) external.push(url.href); });
  await page.setViewportSize({ width: 1280, height: 800 }); await page.goto("./?renderer=3d");
  const world = page.getByTestId("rpg-world"); await expect(world).toHaveAttribute("data-status", "ready", { timeout: 60000 });
  const expected = { tree: 240, anvil: 3, supplies: 7, "ore-copper": 12, "ore-tin": 6, "ore-iron": 6, "ore-coal": 6 };
  await expect.poll(async () => JSON.parse((await world.getAttribute("data-voxel-object-counts"))!)).toEqual(expected);
  const anvil = WORLD.objects.find(object => object.kind === "anvil")!;
  await restore(page, fixture(interactionTiles(anvil)[0])); await sample(page); await page.screenshot({ path: `${output}/workshop-anvil.png` });
  await restore(page, fixture(tile(61, 105))); const supplies = await sample(page); await page.screenshot({ path: `${output}/supply-crate-barrel.png` });
  const quarry = fixture(tile(82, 84)); await restore(page, quarry); const available = await sample(page); await page.screenshot({ path: `${output}/ore-available.png` });
  const uploads = Number(await world.getAttribute("data-voxel-uploads"));
  for (const object of WORLD.objects) if (object.kind === "rock" && object.resourceId) quarry.resources[object.id] = { objectId: object.id, available: false, respawnAt: 1_000_000_000 };
  await restore(page, quarry); await expect.poll(async () => Number(await world.getAttribute("data-voxel-uploads"))).toBeGreaterThan(uploads);
  // GI solves a local window: this quarry has ten outcrops; the other twenty are remote.
  await expect.poll(async () => Number(await world.getAttribute("data-gi-depleted")), { timeout: 60000 }).toBe(10);
  const depleted = await sample(page); await page.screenshot({ path: `${output}/ore-depleted.png` });
  await page.setViewportSize({ width: 390, height: 844 }); const phone = await sample(page); await page.screenshot({ path: `${output}/ore-phone.png` });
  await restore(page, fixture(tile(82, 84)));
  await expect.poll(async () => Number(await world.getAttribute("data-gi-depleted")), { timeout: 60000 }).toBe(0);
  const respawned = await sample(page); await page.screenshot({ path: `${output}/ore-respawned-phone.png` });
  await page.evaluate(async () => { await navigator.serviceWorker.ready; });
  await expect.poll(() => page.evaluate(async version => { const url = new URL("art3d/voxel/ore-depleted.vox", location.href); url.searchParams.set("v", version); return !!(await caches.match(url.href)); }, VOXEL_VERSION)).toBe(true);
  await page.evaluate(async () => {
    const name = (await caches.keys()).find(key => key.startsWith("fable-art-"))!, cache = await caches.open(name);
    await cache.put(new URL("art3d/voxel/manifest.json", location.href).href, new Response(JSON.stringify({ version: "old-tree-only", assets: [] })));
    await cache.put(new URL("art3d/voxel/ore-copper.vox", location.href).href, new Response(new Uint8Array([0, 1, 2, 3])));
  });
  await context.setOffline(true); await page.reload(); await expect(world).toHaveAttribute("data-status", "ready", { timeout: 60000 });
  await expect.poll(async () => JSON.parse((await world.getAttribute("data-voxel-object-counts"))!)).toEqual(expected);
  const offline = await sample(page);
  for (const result of [supplies, available, depleted, phone, respawned, offline]) { expect(result.glError).toBe(0); expect(Number(result.counters.voxelResidentCells)).toBeLessThanOrEqual(VOXEL_RESIDENT_CELL_BUDGET); }
  expect(requests.some(url => url.endsWith("ore-depleted.vox?v=" + VOXEL_VERSION))).toBe(true);
  expect(errors).toEqual([]); expect(external).toEqual([]);
  await writeFile(`${output}/review.json`, JSON.stringify({ expected, supplies, available, depleted, phone, respawned, offline, requests, errors, external, version: VOXEL_VERSION,
    note: "Actual game/native bindings, color variants, depletion, phone viewport and stale unversioned-cache offline check. Observed host frames are not isolated overhead or physical-phone benchmarks." }, null, 2) + "\n");
});

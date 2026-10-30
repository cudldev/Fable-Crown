import { test, expect } from "@playwright/test";
import { mkdir, writeFile } from "node:fs/promises";
import { createRpg } from "../src/rpg/engine";
import { worldForState } from "../src/rpg/world";

test("native VOX trees use chunk instances/LOD in the real world and reload offline", async ({ page, context }) => {
  const errors: string[] = [], sources: string[] = [], external: string[] = [];
  page.on("pageerror", e => errors.push(e.message));
  page.on("request", request => {
    const url = new URL(request.url()); if (url.pathname.endsWith(".vox")) sources.push(url.pathname);
    if (url.protocol.startsWith("http") && page.url().startsWith("http") && url.origin !== new URL(page.url()).origin) external.push(url.href);
  });
  await page.setViewportSize({ width: 1280, height: 800 });
  await page.goto("./?renderer=3d");
  const world = page.getByTestId("rpg-world");
  await expect(world).toHaveAttribute("data-status", "ready", { timeout: 45000 });
  await expect(world).toHaveAttribute("data-voxel-assets", "tree");
  const fixture = createRpg(Date.now(), 8128);
  Object.assign(fixture.control, { waiting: true, goal: null, active: null, source: null, queue: [], thought: null, thinkingUntil: 1_000_000_000 }); fixture.player.path = [];
  await page.getByRole("button", { name: "Open game menu" }).click();
  await page.locator('input[type="file"]').setInputFiles({ name: "voxel-fixture.json", mimeType: "application/json", buffer: Buffer.from(JSON.stringify(fixture)) });
  await expect(page.getByRole("status")).toContainText("Chronicle restored"); await page.getByRole("button", { name: "Close panel" }).click();
  await page.getByRole("button", { name: "Day lighting" }).click();
  await page.getByRole("button", { name: "Sun shadows", exact: true }).click();
  await expect.poll(async () => Number(await world.getAttribute("data-voxel-instances"))).toBeGreaterThan(0);
  const output = "docs/art-audit/voxel-runtime-v2"; await mkdir(output, { recursive: true });
  const measure = async () => page.evaluate(async () => {
    const root = document.querySelector<HTMLElement>('[data-renderer="3d"]')!;
    const intervals: number[] = []; let last = performance.now();
    for (let i = 0; i < 45; i++) { const now = await new Promise<number>(resolve => requestAnimationFrame(resolve)); intervals.push(now - last); last = now; }
    intervals.sort((a, b) => a - b);
    const gl = document.querySelector<HTMLCanvasElement>('[data-testid="three-canvas"]')!.getContext("webgl2")!;
    const extension = gl.getExtension("WEBGL_debug_renderer_info");
    return { counters: { ...root.dataset }, rafMedianMs: intervals[22], rafP95Ms: intervals[42], gpu: extension ? gl.getParameter(extension.UNMASKED_RENDERER_WEBGL) : "unavailable", browser: navigator.userAgent, viewport: [innerWidth, innerHeight] };
  });
  const close = await measure(); await page.screenshot({ path: output + "/world-close.png" });
  await page.getByRole("button", { name: "World overview" }).click();
  await expect.poll(async () => (await world.getAttribute("data-voxel-lods"))!.split(",").slice(2).reduce((sum, n) => sum + Number(n), 0)).toBeGreaterThan(0);
  const overview = await measure(); await page.screenshot({ path: output + "/world-overview.png" });
  await page.getByRole("button", { name: "World overview" }).click();
  await page.setViewportSize({ width: 390, height: 844 });
  const phone = await measure(); await page.screenshot({ path: output + "/world-phone.png" });
  const inventory: Record<string, number> = {};
  for (const object of worldForState(fixture).objects) {
    inventory[object.kind] = (inventory[object.kind] ?? 0) + 1;
    if (object.kind === "tree") fixture.resources[object.id] = { objectId: object.id, available: false, respawnAt: 1_000_000_000 };
  }
  await page.getByRole("button", { name: "Open game menu" }).click();
  await page.locator('input[type="file"]').setInputFiles({ name: "stump-fixture.json", mimeType: "application/json", buffer: Buffer.from(JSON.stringify(fixture)) });
  await expect(page.getByRole("status")).toContainText("Chronicle restored"); await page.getByRole("button", { name: "Close panel" }).click();
  await expect.poll(async () => Number(await world.getAttribute("data-voxel-instances"))).toBeLessThan(Number(phone.counters.voxelInstances));
  const depleted = await measure(); await page.screenshot({ path: output + "/world-stumps.png" });
  expect(sources.some(url => url.endsWith("/art3d/voxel/tree.vox"))).toBe(true);
  await page.evaluate(async () => { await navigator.serviceWorker.ready; });
  await expect.poll(() => page.evaluate(async () => !!(await caches.match(new URL("art3d/voxel/tree.vox", location.href).href)))).toBe(true);
  await context.setOffline(true); await page.reload();
  await expect(world).toHaveAttribute("data-status", "ready", { timeout: 45000 }); await expect(world).toHaveAttribute("data-voxel-assets", "tree");
  expect(errors).toEqual([]); expect(external).toEqual([]);
  await writeFile(output + "/browser-review.json", JSON.stringify({ close, overview, phone, depleted, worldObjectCounts: inventory, nativeSources: sources, errors, external, offlineReload: true, physicalPhoneTest: false, note: "Observed host-browser frame intervals; not an isolated GPU benchmark or a mobile-hardware performance guarantee." }, null, 2) + "\n");
});

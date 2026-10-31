import { test, expect } from "@playwright/test";
import { createRpg } from "../src/rpg/engine";
import { VOXEL_VISIBLE_CELL_BUDGET } from "../src/render/three/voxel-buckets";

test("3D distance is capped across controls and nested voxel batches stay within budget", async ({ page, context }) => {
  const errors: string[] = [];
  page.on("pageerror", error => errors.push(error.message));
  await page.setViewportSize({ width: 1280, height: 800 });
  await page.goto("./?renderer=3d");
  const world = page.getByTestId("rpg-world"), canvas = page.getByTestId("three-canvas");
  await expect(world).toHaveAttribute("data-status", "ready", { timeout: 60000 });
  const fixture = createRpg(Date.now(), 8128);
  Object.assign(fixture.control, { waiting: true, goal: null, active: null, source: null, queue: [], thought: null, thinkingUntil: 1_000_000_000 }); fixture.player.path = [];
  await page.getByRole("button", { name: "Open game menu" }).click();
  await page.locator('input[type="file"]').setInputFiles({ name: "lod.json", mimeType: "application/json", buffer: Buffer.from(JSON.stringify(fixture)) });
  await expect(page.getByRole("status")).toContainText("Chronicle restored");
  await page.getByRole("button", { name: "Close panel" }).click();
  await expect.poll(async () => Number(await world.getAttribute("data-voxel-child-buckets"))).toBeGreaterThan(0);
  await expect.poll(async () => Number((await world.getAttribute("data-voxel-lods"))!.split(",")[0])).toBeGreaterThan(0);
  await expect.poll(async () => Number(await world.getAttribute("data-voxel-native-trees"))).toBeGreaterThan(0);
  await page.screenshot({ path: "docs/art-audit/voxel-lod-v2/close.png" });
  for (let i = 0; i < 10; i++) await page.getByRole("button", { name: "Zoom out", exact: true }).click();
  await expect(world).toHaveAttribute("data-camera-span", "30.00");
  await expect(world).toHaveAttribute("data-camera-zoom", "0.7500");
  await expect.poll(async () => Number(await world.getAttribute("data-camera-distance"))).toBeLessThan(91);
  await expect.poll(async () => Number(await world.getAttribute("data-voxel-instances"))).toBeLessThanOrEqual(VOXEL_VISIBLE_CELL_BUDGET);
  await expect(world).toHaveAttribute("data-voxel-budget-exceeded", "false");
  await page.screenshot({ path: "docs/art-audit/voxel-lod-v2/far.png" });
  await canvas.dispatchEvent("wheel", { deltaY: 100000, bubbles: true });
  await canvas.focus(); await canvas.press("-");
  await expect(world).toHaveAttribute("data-camera-span", "30.00");
  const coarse = await world.getAttribute("data-voxel-lods");
  for (let i = 0; i < 5; i++) await canvas.press("+");
  await expect.poll(async () => Number(await world.getAttribute("data-camera-span"))).toBeLessThan(24);
  await expect.poll(() => world.getAttribute("data-voxel-lods")).not.toBe(coarse);
  for (let i = 0; i < 10; i++) await page.getByRole("button", { name: "Zoom in", exact: true }).click();
  await expect(world).toHaveAttribute("data-camera-zoom", "2.0000");
  await expect.poll(async () => Number(await world.getAttribute("data-voxel-native-trees"))).toBeGreaterThan(0);
  await expect.poll(async () => Number((await world.getAttribute("data-voxel-lods"))!.split(",")[0])).toBeGreaterThan(0);
  await expect(world).toHaveAttribute("data-voxel-budget-exceeded", "false");
  await page.screenshot({ path: "docs/art-audit/voxel-lod-v2/returned-close.png" });
  await canvas.dispatchEvent("wheel", { deltaY: 100000, bubbles: true });
  await page.getByRole("button", { name: "Orthographic camera", exact: true }).click();
  await expect(world).toHaveAttribute("data-camera-span", "30.00");
  await page.getByRole("button", { name: "World overview", exact: true }).click();
  await expect.poll(async () => Number(await world.getAttribute("data-voxel-parent-buckets"))).toBeGreaterThan(0);
  await expect.poll(async () => Number(await world.getAttribute("data-voxel-instances"))).toBeLessThanOrEqual(VOXEL_VISIBLE_CELL_BUDGET);
  const overviewLods = (await world.getAttribute("data-voxel-lods"))!.split(",").map(Number);
  expect(overviewLods.slice(2).reduce((a, b) => a + b, 0)).toBeGreaterThan(0);
  expect(overviewLods[0]).toBe(0);
  await page.getByRole("button", { name: "World overview", exact: true }).click();
  for (const viewport of [{ width: 390, height: 844 }, { width: 844, height: 390 }, { width: 2400, height: 600 }]) {
    await page.setViewportSize(viewport);
    await expect.poll(async () => Number(await world.getAttribute("data-camera-span"))).toBeLessThanOrEqual(32);
    if (viewport.width === 2400) await expect.poll(async () => Number(await world.getAttribute("data-camera-span")) * 4).toBeLessThanOrEqual(48);
  }
  await page.setViewportSize({ width: 390, height: 844 });
  await page.screenshot({ path: "docs/art-audit/voxel-lod-v2/phone.png" });
  for (let i = 0; i < 4; i++) await page.getByRole("button", { name: "Zoom in", exact: true }).click();
  // Pick real exposed world pixels: the responsive HUD can cover fixed touch coordinates.
  const touch = await world.evaluate(root => {
    for (let y = 160; y < innerHeight - 80; y += 20) {
      const xs = [];
      for (let x = 20; x < innerWidth - 20; x += 20) {
        const target = document.elementFromPoint(x, y);
        if (target && root.contains(target) && !target.closest("button, .three-light-controls, .three-visual-settings")) xs.push(x);
      }
      if (xs.length && xs.at(-1)! - xs[0] >= 100) return { left: xs[0], right: xs.at(-1)!, y };
    }
    throw Error("No exposed world strip for touch gesture");
  });
  const middle = (touch.left + touch.right) / 2;
  const cdp = await context.newCDPSession(page);
  await cdp.send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: [{ x: touch.left, y: touch.y, id: 0 }, { x: touch.right, y: touch.y, id: 1 }] });
  await cdp.send("Input.dispatchTouchEvent", { type: "touchMove", touchPoints: [{ x: middle - 5, y: touch.y, id: 0 }, { x: middle + 5, y: touch.y, id: 1 }] });
  await cdp.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });
  await expect(world).toHaveAttribute("data-camera-zoom", "0.7500");
  await cdp.detach();
  await page.evaluate(async () => { await navigator.serviceWorker.ready; });
  await context.setOffline(true); await page.reload();
  await expect(world).toHaveAttribute("data-status", "ready", { timeout: 60000 });
  await expect(world).toHaveAttribute("data-voxel-assets", /\btree\b/);
  expect(errors).toEqual([]);
});

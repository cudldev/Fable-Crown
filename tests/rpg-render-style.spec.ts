import { expect, test } from "@playwright/test";
import { openWorldTools } from "./world-tools";
import { mkdir, writeFile } from "node:fs/promises";
import { createRpg } from "../src/rpg/engine";
import { VOXEL_VERSION } from "../src/render/three/voxel-version";

test.use({ deviceScaleFactor: 2, actionTimeout: 15000 });
test.setTimeout(60000);

test("normal rendering follows display density and ignores legacy pixelation through reset and offline reload", async ({ page, context }) => {
  const errors: string[] = [], external: string[] = [];
  page.on("pageerror", error => errors.push(error.message));
  page.on("request", request => {
    const url = new URL(request.url());
    if (url.protocol.startsWith("http") && page.url().startsWith("http") && url.origin !== new URL(page.url()).origin) external.push(url.href);
  });
  await page.setViewportSize({ width: 1280, height: 800 });
  await page.addInitScript(() => localStorage.setItem("fable-crown.render-style", "pixelated"));
  await page.goto("./?renderer=3d");
  const world = page.getByTestId("rpg-world"), canvas = page.getByTestId("three-canvas");
  await expect(world).toHaveAttribute("data-status", "ready", { timeout: 45000 });
  await expect(world).toHaveAttribute("data-voxel-assets", /\btree\b/);
  const fixture = createRpg(Date.now(), 8128);
  Object.assign(fixture.control, { waiting: true, goal: null, active: null, source: null, queue: [], thought: null, thinkingUntil: 1_000_000_000 }); fixture.player.path = [];
  await page.getByRole("button", { name: "Open game menu" }).click();
  await page.locator('input[type="file"]').setInputFiles({ name: "render-fixture.json", mimeType: "application/json", buffer: Buffer.from(JSON.stringify(fixture)) });
  await expect(page.getByRole("status")).toContainText("Chronicle restored");
  await page.getByRole("button", { name: "Close panel" }).click();
  await page.getByRole("button", { name: "Orthographic camera" }).click();
  await expect(world).toHaveAttribute("data-camera-mode", "orthographic");
  const originalCanvas = await canvas.elementHandle();
  const position = [await world.getAttribute("data-camera-x"), await world.getAttribute("data-camera-y")];
  const output = "docs/art-audit/normal-rendering-v1"; await mkdir(output, { recursive: true });
  const buffer = () => canvas.evaluate(element => {
    const canvas = element as HTMLCanvasElement, box = canvas.getBoundingClientRect();
    return { width: canvas.width, height: canvas.height, cssWidth: box.width, cssHeight: box.height, density: devicePixelRatio,
      scaling: getComputedStyle(canvas).imageRendering, antialias: canvas.getContext("webgl2")!.getContextAttributes()!.antialias };
  });
  await expect(world).toHaveAttribute("data-render-style", "smooth");
  await expect(world).toHaveAttribute("data-render-width", "2560");
  expect(await buffer()).toMatchObject({ width: 2560, height: 1600, scaling: "auto", antialias: true });
  await page.getByRole("button", { name: "Visual settings", exact: true }).click();
  const panel = page.getByRole("dialog", { name: "Visual settings" });
  await expect(panel.getByRole("combobox", { name: "Visual style" })).toHaveCount(0);
  expect(await originalCanvas!.evaluate(element => element === document.querySelector('[data-testid="three-canvas"]'))).toBe(true);
  expect([await world.getAttribute("data-camera-x"), await world.getAttribute("data-camera-y")]).toEqual(position);
  await panel.getByRole("button", { name: "Done", exact: true }).click();
  await page.screenshot({ path: output + "/smooth.png" });
  const smooth = await buffer();
  for (const viewport of [{ width: 390, height: 844 }, { width: 844, height: 390 }]) {
    await page.setViewportSize(viewport);
    await expect(world).toHaveAttribute("data-render-width", String(viewport.width * 2));
    const current = await buffer();
    expect(current.width).toBe(Math.round(current.cssWidth * 2));
    expect(current.height).toBe(Math.round(current.cssHeight * 2));
    await page.screenshot({ path: output + (viewport.width === 390 ? "/smooth-portrait.png" : "/smooth-landscape.png") });
  }
  await page.waitForFunction(async () => !!(await navigator.serviceWorker.getRegistration())?.active, null, { timeout: 15000 });
  await expect.poll(() => page.evaluate(async version => { const url = new URL("art3d/voxel/tree.vox", location.href); url.searchParams.set("v", version); return !!(await caches.match(url.href)); }, VOXEL_VERSION)).toBe(true);
  await context.setOffline(true); await page.reload({ waitUntil: "domcontentloaded", timeout: 15000 });
  await expect(world).toHaveAttribute("data-status", "ready", { timeout: 45000 });
  await expect(world).toHaveAttribute("data-render-style", "smooth");
  await expect(world).toHaveAttribute("data-render-width", "1688");
  await openWorldTools(page);
  await page.getByRole("button", { name: "Visual settings", exact: true }).click();
  await expect(panel.getByRole("combobox", { name: "Visual style" })).toHaveCount(0);
  await page.screenshot({ path: output + "/landscape-settings.png" });
  await panel.getByRole("button", { name: "Reset visual settings" }).click();
  await expect(world).toHaveAttribute("data-render-style", "smooth");
  expect(await buffer()).toMatchObject({ width: 1688, height: 780, scaling: "auto", antialias: true });
  await page.reload({ waitUntil: "domcontentloaded", timeout: 15000 }); await expect(world).toHaveAttribute("data-status", "ready", { timeout: 45000 });
  await expect(world).toHaveAttribute("data-render-style", "smooth");
  expect(await buffer()).toMatchObject({ width: 1688, height: 780, scaling: "auto", antialias: true });
  expect(errors).toEqual([]); expect(external).toEqual([]);
  await writeFile(output + "/review.json", JSON.stringify({ smooth, legacyPixelatedPreferenceIgnored: true, offlineReload: true, errors, external, physicalPhoneTest: false }, null, 2) + "\n");
});

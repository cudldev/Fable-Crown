import { expect, test, type Page } from "@playwright/test";
import { mkdir, writeFile } from "node:fs/promises";
import { createRpg } from "../src/rpg/engine";
import { interactionTiles, objectById } from "../src/rpg/world";

/** Count actual WebGL drawing, since RAF alone also fires when the world skips frames. */
async function sampleDrawing(page: Page, label: string) {
  return page.evaluate(async label => {
    const canvas = document.querySelector<HTMLCanvasElement>('[data-testid="three-canvas"]')!;
    const gl = canvas.getContext("webgl2")!;
    const methods = ["drawArrays", "drawElements", "drawArraysInstanced", "drawElementsInstanced"] as const;
    let draws = 0;
    const restore = methods.map(method => {
      const descriptor = Object.getOwnPropertyDescriptor(gl, method), original = gl[method];
      Object.defineProperty(gl, method, { configurable: true, value: (...args: unknown[]) => {
        draws++;
        return Reflect.apply(original, gl, args);
      } });
      return () => { if (descriptor) Object.defineProperty(gl, method, descriptor); else Reflect.deleteProperty(gl, method); };
    });
    let callbacks = 0, rendered = 0, previousDraws = 0;
    const started = performance.now();
    try {
      while (performance.now() - started < 2000) {
        await new Promise(requestAnimationFrame);
        callbacks++;
        if (draws > previousDraws) rendered++;
        previousDraws = draws;
      }
      const elapsedMs = performance.now() - started;
      return { label, callbacks, rendered, elapsedMs, renderRatio: rendered / callbacks,
        renderedFps: rendered * 1000 / elapsedMs, glError: gl.getError(),
        viewport: [innerWidth, innerHeight], browser: navigator.userAgent };
    } finally { restore.forEach(reset => reset()); }
  }, label);
}

test("tree inspectors and menus keep drawing on foreground animation frames", async ({ page }, testInfo) => {
  const errors: string[] = [], external: string[] = [];
  page.on("pageerror", error => errors.push(error.message));
  page.on("request", request => {
    const url = new URL(request.url());
    if (url.protocol.startsWith("http") && url.origin !== new URL(testInfo.project.use.baseURL!).origin) external.push(url.href);
  });
  await page.setViewportSize({ width: 1280, height: 800 });
  await page.goto("./");
  const world = page.getByTestId("rpg-world");
  await expect(world).toHaveAttribute("data-status", "ready", { timeout: 45000 });
  const fixture = createRpg(Date.now(), 8128), tree = objectById("oakrest-tree-0")!;
  Object.assign(fixture.control, { waiting: true, goal: null, active: null, source: null,
    queue: [], thought: null, thinkingUntil: 1_000_000_000 });
  fixture.player.path = [];
  fixture.player.position = { ...interactionTiles(tree)[0]! };
  fixture.player.previousPosition = { ...fixture.player.position };
  await page.getByRole("button", { name: "Open game menu" }).click();
  await page.locator('input[type="file"]').setInputFiles({ name: "panel-fixture.json", mimeType: "application/json",
    buffer: Buffer.from(JSON.stringify(fixture)) });
  await expect(page.getByRole("status")).toContainText("Chronicle restored");
  await page.getByRole("button", { name: "Close panel" }).click();
  await page.getByRole("button", { name: "Follow Alden", exact: true }).click();
  await expect(world).toHaveAttribute("data-gi-state", "ready", { timeout: 45000 });

  const results = [await sampleDrawing(page, "desktop-closed")];
  await world.locator(`[data-three-selection*="${tree.id}"]`).press("Shift+F10");

  await page.getByRole("menuitem", { name: "More options", exact: true }).click();
  await expect(page.getByRole("region", { name: "Object actions" })).toBeVisible();
  results.push(await sampleDrawing(page, "desktop-tree"));
  await page.getByRole("button", { name: "Close actions" }).click();
  await page.getByRole("button", { name: "Open game menu" }).click();
  results.push(await sampleDrawing(page, "desktop-menu"));
  await page.getByRole("button", { name: "Close panel" }).click();
  results.push(await sampleDrawing(page, "desktop-closed-again"));
  for (const [label, width, height] of [["portrait-tree", 390, 844], ["landscape-tree", 844, 390]] as const) {
    await page.setViewportSize({ width, height });
    await world.locator(`[data-three-selection*="${tree.id}"]`).press("Shift+F10");

    await page.getByRole("menuitem", { name: "More options", exact: true }).click();
    await expect(page.getByRole("region", { name: "Object actions" })).toBeVisible();
    results.push(await sampleDrawing(page, label));
    await page.getByRole("button", { name: "Close actions" }).click();
  }
  const report = JSON.stringify({ results, errors, external,
    scope: "Production Chrome, DPR1, default visual settings; counts actual WebGL draws per foreground RAF. Phone sizes are emulation, not physical-device benchmarks." }, null, 2);
  await testInfo.attach("panel-render-cadence", { body: report, contentType: "application/json" });
  const label = process.env.PANEL_BENCH_LABEL;
  if (label && /^[a-z0-9-]+$/.test(label)) {
    await mkdir("docs/performance/menu-panels", { recursive: true });
    await writeFile(`docs/performance/menu-panels/${label}.json`, report + "\n");
  }
  expect(errors).toEqual([]);
  expect(external).toEqual([]);
  for (const result of results) {
    expect(result.glError, result.label).toBe(0);
    // Relative to available RAFs: works on slow CI without demanding a device FPS.
    expect(result.renderRatio, `${result.label}: ${JSON.stringify(result)}`).toBeGreaterThan(.8);
  }
});

// Development-only measurement: production bundle, real WebGL, no shipping instrumentation patches.
import { chromium } from "@playwright/test";
import { createServer, preview } from "vite";
import os from "node:os";

const target = new URL(process.env.DEMO_URL || "http://127.0.0.1:4174/Fable-Crown/");
target.searchParams.set("renderer", "3d");
const fixtureServer = await createServer({
  optimizeDeps: { noDiscovery: true, entries: [] },
  server: { middlewareMode: true }, appType: "custom",
});
let fixture;
try {
  const { createRpg, stepRpg, calendarDate, validateRpgSave } = await fixtureServer.ssrLoadModule("/src/rpg/engine.ts");
  fixture = createRpg(Date.now(), 1234567);
  if (process.env.BENCH_ACTIVE === "1") stepRpg(fixture, 1200);
  fixture.savedAt = Date.now();
  fixture.calendar = calendarDate(fixture.savedAt);
  if (!validateRpgSave(fixture)) throw Error("Benchmark fixture is not a valid saved chapter");
} finally {
  await fixtureServer.close();
}
const previewServer = process.env.BENCH_START_PREVIEW === "1"
  ? await preview({ base: target.pathname, preview: { host: "127.0.0.1", port: Number(target.port), strictPort: true } }) : null;
let browser;
try {
  browser = await chromium.launch({ channel: process.env.CI ? undefined : "chrome", headless: true });
  const page = await browser.newPage({ viewport: { width: 1280, height: 720 }, deviceScaleFactor: 1 });
  page.setDefaultTimeout(30000);
  const errors = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.goto(target.href);
  await page.locator('[data-testid="rpg-world"][data-renderer="3d"][data-status="ready"]').waitFor();
  await page.getByRole("button", { name: "Open game menu", exact: true }).click();
  await page.locator('input[type="file"]').setInputFiles({
    name: "three-benchmark.json", mimeType: "application/json", buffer: Buffer.from(JSON.stringify(fixture)),
  });
  await page.getByRole("status").filter({ hasText: "Chronicle restored" }).waitFor();
  await page.getByRole("button", { name: "Close panel", exact: true }).click();
  const capabilities = await page.getByTestId("three-canvas").evaluate((canvas) => {
    const gl = canvas.getContext("webgl2");
    if (!gl) return null;
    const debug = gl.getExtension("WEBGL_debug_renderer_info");
    return {
      version: gl.getParameter(gl.VERSION),
      renderer: debug ? gl.getParameter(debug.UNMASKED_RENDERER_WEBGL) : gl.getParameter(gl.RENDERER),
      vendor: debug ? gl.getParameter(debug.UNMASKED_VENDOR_WEBGL) : gl.getParameter(gl.VENDOR),
      drawingBuffer: [gl.drawingBufferWidth, gl.drawingBufferHeight],
    };
  });
  if (!capabilities) throw Error("Real WebGL2 context unavailable; no benchmark claim possible");
  const art = await page.getByTestId("rpg-world").evaluate(root => ({
    source: root.dataset.assets,
    loadedIds: root.dataset.productionAssets?.split(",") ?? [],
    cameraMode: root.dataset.cameraMode,
  }));
  const results = [];
  for (const mode of ["close", "far", "overview", ...(process.env.BENCH_LIGHTING === "1" ? ["day", "night"] : [])]) {
    if (mode === "far") for (let i = 0; i < 8; i++)
      await page.getByRole("button", { name: "Zoom out", exact: true }).click();
    if (mode === "overview") await page.getByRole("button", { name: "World overview", exact: true }).click();
    if (mode === "day" || mode === "night") {
      await page.getByRole("button", { name: "Follow Alden", exact: true }).click();
      if (mode === "day") for (let i = 0; i < 8; i++)
        await page.getByRole("button", { name: "Zoom in", exact: true }).click();
      await page.getByRole("button", { name: `${mode === "day" ? "Day" : "Night"} lighting`, exact: true }).click();
    }
    await page.waitForTimeout(3000);
    results.push(await page.evaluate(async (mode) => {
      const intervals = [], samples = [];
      let previous;
      const start = performance.now();
      return await new Promise((resolve) => {
        const frame = (now) => {
          if (previous !== undefined) intervals.push(now - previous);
          previous = now;
          if (!samples.length || now - samples.at(-1).at >= 500) {
            const root = document.querySelector('[data-testid="rpg-world"]');
            samples.push({
              at: now, drawCalls: Number(root.dataset.drawCalls), triangles: Number(root.dataset.triangles),
              activeLights: Number(root.dataset.activeLights), shadowLights: Number(root.dataset.shadowLights),
              rendererFrameMs: Number(root.dataset.frameMs),
            });
          }
          if (now - start < 5000) { requestAnimationFrame(frame); return; }
          intervals.sort((a, b) => a - b);
          const maximum = (key) => Math.max(...samples.map((sample) => sample[key]));
          resolve({
            mode, frameCount: intervals.length,
            frameIntervalP50Ms: intervals[Math.floor(intervals.length * .5)],
            frameIntervalP95Ms: intervals[Math.floor(intervals.length * .95)],
            maxDrawCalls: maximum("drawCalls"), maxTriangles: maximum("triangles"),
            maxActiveLocalLights: maximum("activeLights"), maxShadowLights: maximum("shadowLights"),
            maxReportedRendererFrameMs: maximum("rendererFrameMs"),
          });
        };
        requestAnimationFrame(frame);
      });
    }, mode));
  }
  if (errors.length) throw Error(`Page errors invalidate benchmark: ${errors.join("; ")}`);
  console.log(JSON.stringify({
    label: process.env.BENCH_LABEL || "three-test",
    url: target.href, browser: await browser.version(),
    platform: `${os.platform()} ${os.release()} ${os.arch()}`,
    cpu: os.cpus()[0]?.model, logicalCpus: os.cpus().length,
    viewport: "1280x720 DPR1; headless; no CPU throttling; 3s warmup and 5s sample per view",
    capabilities, art, simulationWarmupTicks: process.env.BENCH_ACTIVE === "1" ? 1200 : 0,
    npcCompletedAtImport: fixture.npcs.reduce((sum, npc) => sum + npc.completed, 0),
    interpretation: "requestAnimationFrame intervals and renderer counters, not GPU timings, physical-phone measurements or memory measurements",
    results,
  }, null, 2));
} finally {
  if (browser) await browser.close();
  if (previewServer) await new Promise((resolve) => previewServer.httpServer.close(resolve));
}

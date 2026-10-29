// Run against a production preview. Instrumentation is injected only in this browser.
import { chromium } from "@playwright/test";
import { createServer, preview } from "vite";
import os from "node:os";
const vite = await createServer({
  optimizeDeps: { noDiscovery: true, entries: [] },
  server: { middlewareMode: true },
  appType: "custom",
});
const { createRpg } = await vite.ssrLoadModule("/src/rpg/engine.ts");
const fixture = createRpg(Date.now(), 1234567);
await vite.close();
const benchUrl = new URL(process.env.DEMO_URL || "http://127.0.0.1:4174/Fable-Crown/");
const previewServer = process.env.BENCH_START_PREVIEW === "1" ? await preview({base:benchUrl.pathname,preview:{host:"127.0.0.1",port:Number(benchUrl.port),strictPort:true}}) : null;
const browser = await chromium.launch({ channel: "chrome", headless: true });
const page = await browser.newPage({
  viewport: { width: 1280, height: 720 },
  deviceScaleFactor: 1,
});
await page.addInitScript(() => {
  const data = (window.__renderBench = {
    frames: [],
    canvasCpu: 0,
    chunks: 0,
    paints: 0,
    on: false,
  });
  const create = document.createElement.bind(document);
  document.createElement = function (...args) {
    const el = create(...args);
    if (args[0] === "canvas") {
      const context = el.getContext.bind(el);
      el.getContext = function (...a) {
        if (data.on && el.width === 1024 && el.height === 512) data.chunks++;
        return context(...a);
      };
    }
    return el;
  };
  for (const method of [
    "drawImage",
    "fill",
    "stroke",
    "clip",
    "clearRect",
    "fillRect",
    "fillText",
  ]) {
    const original = CanvasRenderingContext2D.prototype[method];
    CanvasRenderingContext2D.prototype[method] = function (...args) {
      const start = performance.now();
      const result = original.apply(this, args);
      if (data.on) {
        data.canvasCpu += performance.now() - start;
        if (method === "clearRect") data.paints++;
      }
      return result;
    };
  }
  let last;
  const frame = (t) => {
    if (data.on && last) data.frames.push(t - last);
    last = t;
    requestAnimationFrame(frame);
  };
  requestAnimationFrame(frame);
});
page.setDefaultTimeout(30000);
await page.goto(process.env.DEMO_URL || "http://127.0.0.1:4174/Fable-Crown/");
await page.getByTestId("rpg-world").waitFor();
await page.getByRole("button", { name: "Open game menu" }).click();
await page.locator("input[type=file]").setInputFiles({
  name: "benchmark.json",
  mimeType: "application/json",
  buffer: Buffer.from(JSON.stringify(fixture)),
});
await page.getByRole("button", { name: "Close panel" }).click();
const results = [];
for (const mode of ["zoom-0.85", "zoom-0.15", "overview"]) {
  if (mode === "zoom-0.15")
    for (let i = 0; i < 8; i++)
      await page.getByRole("button", { name: "Zoom out", exact: true }).click();
  if (mode === "overview")
    await page
      .getByRole("button", { name: "World overview", exact: true })
      .click();
  await page.waitForTimeout(3000);
  await page.evaluate(() => {
    const d = window.__renderBench;
    d.frames = [];
    d.canvasCpu = d.chunks = d.paints = 0;
    d.on = true;
  });
  await page.waitForTimeout(5000);
  results.push(
    await page.evaluate((mode) => {
      const d = window.__renderBench;
      d.on = false;
      const values = d.frames.sort((a, b) => a - b);
      return {
        mode,
        frames: values.length,
        frameIntervalP50: values[Math.floor(values.length * 0.5)],
        frameIntervalP95: values[Math.floor(values.length * 0.95)],
        canvasApiCpuMsPerPaint: d.canvasCpu / d.paints,
        paints: d.paints,
        chunkBuilds: d.chunks,
        hitButtons: document.querySelectorAll(".tile-hit-layer button").length,
      };
    }, mode),
  );
}
console.log(
  JSON.stringify(
    {
      label: process.env.BENCH_LABEL || "unlabelled",
      browser: await browser.version(),
      platform: `${os.platform()} ${os.release()} ${os.arch()}`,
      cpu: os.cpus()[0]?.model,
      logicalCpus: os.cpus().length,
      viewport:
        "1280x720 DPR1; headless Chrome; no CPU throttling; 3s warmup/5s sample; Canvas API instrumentation enabled",
      results,
    },
    null,
    2,
  ),
);
await browser.close();
if(previewServer) await new Promise(resolve=>previewServer.httpServer.close(resolve));

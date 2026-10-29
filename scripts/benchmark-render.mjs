// Run against a production preview. Instrumentation is injected only in this browser.
import { chromium } from "@playwright/test";
import { createServer, preview } from "vite";
import os from "node:os";
const vite = await createServer({
  optimizeDeps: { noDiscovery: true, entries: [] },
  server: { middlewareMode: true },
  appType: "custom",
});
const { createRpg, validateRpgSave, calendarDate } = await vite.ssrLoadModule("/src/rpg/engine.ts");
const fixture = createRpg(Date.now(), 1234567);
let turningFixture;
if (process.env.BENCH_TURNING === "1") {
  const {tile} = await vite.ssrLoadModule("/src/rpg/world.ts");
  turningFixture = createRpg(Date.now(), 1234567);
  const origin = tile(100, 80), path = [];
  for (let loop = 0; loop < 100; loop++) {
    let point = {...origin};
    for (const [dx,dy] of [[1,0],[1,1],[0,1],[-1,1],[-1,0],[-1,-1],[0,-1],[1,-1],[1,0],[0,1],[-1,-1]]) {
      point = {...point,x:point.x+dx,y:point.y+dy}; path.push(point);
    }
  }
  Object.assign(turningFixture.player,{position:{...origin},previousPosition:{...origin},movement:null,path,action:null,runEnergy:10000});
  Object.assign(turningFixture.control,{active:{type:"move",position:{...origin}},source:"player",waiting:false,goal:null,queue:[],thinkingUntil:1e9});
  if (!validateRpgSave(turningFixture)) throw Error("Turning benchmark route must be a valid saved legal path");
}
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
    smallCanvases: 0,
    on: false,
  });
  const create = document.createElement.bind(document);
  document.createElement = function (...args) {
    const el = create(...args);
    if (args[0] === "canvas") {
      const context = el.getContext.bind(el);
      let observed = false;
      el.getContext = function (...a) {
        if (!observed && data.on) {
          if (el.width === 1024 && el.height === 512) data.chunks++;
          if (el.width > 0 && el.width <= 256 && el.height > 0 && el.height <= 256) data.smallCanvases++;
        }
        observed = true;
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
for (const mode of ["zoom-0.85", "zoom-0.15", "overview", ...(turningFixture ? ["turning-walk", "turning-run"] : [])]) {
  if (mode === "zoom-0.15")
    for (let i = 0; i < 8; i++)
      await page.getByRole("button", { name: "Zoom out", exact: true }).click();
  if (mode === "overview")
    await page
      .getByRole("button", { name: "World overview", exact: true })
      .click();
  let warmup = 3000;
  if (mode.startsWith("turning-")) {
    if (mode === "turning-walk") {
      await page.reload(); await page.getByTestId("rpg-world").waitFor();
    }
    turningFixture.savedAt = Date.now(); turningFixture.calendar = calendarDate(turningFixture.savedAt);
    turningFixture.control.running = mode === "turning-run";
    await page.getByRole("button", {name:"Open game menu"}).click();
    await page.locator("input[type=file]").setInputFiles({name:"turning.json",mimeType:"application/json",buffer:Buffer.from(JSON.stringify(turningFixture))});
    await page.getByRole("status").filter({hasText:"Chronicle restored"}).waitFor();
    await page.getByRole("button", {name:"Close panel"}).click();
    warmup = mode === "turning-walk" ? 20000 : 10000;
  }
  await page.waitForTimeout(warmup);
  await page.evaluate(() => {
    const d = window.__renderBench;
    d.frames = [];
    d.canvasCpu = d.chunks = d.paints = d.smallCanvases = 0;
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
        smallCanvasBuilds: d.smallCanvases,
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
        "1280x720 DPR1; headless Chrome; no CPU throttling; 3s static/20s walking/10s running warmup; 5s samples; Canvas API instrumentation enabled",
      results,
    },
    null,
    2,
  ),
);
await browser.close();
if(previewServer) await new Promise(resolve=>previewServer.httpServer.close(resolve));

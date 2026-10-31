// Matching production before/after route; viewport emulation is not a physical phone.
import { chromium } from '@playwright/test';
import { preview } from 'vite';
import { build } from 'esbuild';
import { mkdir, writeFile, readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import os from 'node:os';

const label = process.argv[2] || 'after';
if (!/^[a-z0-9-]+$/.test(label)) throw Error('Invalid report label');
const output = 'docs/performance/async-streaming';
await mkdir(output, { recursive: true });
const compiled = await build({ entryPoints: ['src/rpg/engine.ts'], bundle: true, platform: 'node', format: 'esm', write: false });
const { createRpg } = await import('data:text/javascript;base64,' + Buffer.from(compiled.outputFiles[0].text).toString('base64'));
const compiledWorld = await build({ entryPoints: ['src/rpg/world.ts'], bundle: true, platform: 'node', format: 'esm', write: false });
const { WORLD, interactionTiles } = await import('data:text/javascript;base64,' + Buffer.from(compiledWorld.outputFiles[0].text).toString('base64'));
const fixture = createRpg(Date.now(), 8128);
Object.assign(fixture.control, { autoplay: false, waiting: true, goal: null, active: null, source: null, queue: [], thought: null, thinkingUntil: 1e9 });
fixture.player.path = [];
const position = interactionTiles(WORLD.objects.find(object => object.kind === 'tree'))[0];
Object.assign(fixture.player, { position, previousPosition: { ...position }, movement: null, action: null });
const base = 'http://127.0.0.1:4176/Fable-Crown/';
const dist = process.env.BENCH_DIST || 'dist';
const identity = createHash('sha256').update(await readFile(`${dist}/index.html`)).digest('hex').slice(0,12);
const host = await preview({ base: '/Fable-Crown/', build: { outDir: dist }, preview: { host: '127.0.0.1', port: 4176, strictPort: true } });
const browser = await chromium.launch({ channel: 'chrome', headless: true });
try {
  const results = [];
  for (const viewport of [{ width: 1280, height: 800 }, { width: 390, height: 844 }]) {
    const page = await browser.newPage({ viewport, deviceScaleFactor: 1, serviceWorkers: 'block' });
    const errors = [], external = [];
    page.on('pageerror', e => errors.push(e.message));
    page.on('request', r => { if (new URL(r.url()).protocol.startsWith('http') && !r.url().startsWith(base)) external.push(r.url()); });
    await page.goto(base + '?renderer=3d');
    await page.waitForFunction(() => document.querySelector('[data-testid="rpg-world"]')?.dataset.status === 'ready');
    await page.getByRole('button', { name: 'Open game menu', exact: true }).click();
    await page.locator('input[type="file"]').setInputFiles({ name: 'forest.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(fixture)) });
    await page.getByRole('status').filter({ hasText: 'Chronicle restored' }).waitFor({ state: 'attached' });
    await page.getByRole('button', { name: 'Close panel', exact: true }).click();
    await page.locator('button[aria-label="Day lighting"]').dispatchEvent('click');
    await page.waitForTimeout(2500);
    for (let trial = 0; trial < 3; trial++) {
      const result = await page.evaluate(async () => {
        const root = document.querySelector('[data-testid="rpg-world"]'), canvas = root.querySelector('canvas');
        const intervals = [], counters = []; let previous;
        for (let frame = 0; frame < 360; frame++) {
          const now = await new Promise(requestAnimationFrame);
          if (previous !== undefined) intervals.push(now - previous);
          previous = now;
          if (frame % 30 === 0) {
            const zoomOut = Math.floor(frame / 90) % 2 === 0;
            canvas.dispatchEvent(new WheelEvent('wheel', { deltaY: zoomOut ? 500 : -500, bubbles: true, cancelable: true }));
            counters.push({ ...root.dataset });
          }
          if (frame === 120 || frame === 240) [...document.querySelectorAll('button')].find(b => b.getAttribute('aria-label') === 'World overview')?.click();
        }
        const sorted = [...intervals].sort((a,b) => a-b), gl = canvas.getContext('webgl2'), debug = gl.getExtension('WEBGL_debug_renderer_info');
        return { meanMs: intervals.reduce((a,b)=>a+b,0)/intervals.length, p95Ms: sorted[Math.floor(sorted.length*.95)], p99Ms: sorted[Math.floor(sorted.length*.99)], maxMs: sorted.at(-1), over33Ms: intervals.filter(n=>n>33.34).length, over50Ms: intervals.filter(n=>n>50).length, intervals, counters, final: { ...root.dataset }, gpu: debug ? gl.getParameter(debug.UNMASKED_RENDERER_WEBGL) : 'unavailable', glError: gl.getError() };
      });
      results.push({ viewport, trial, ...result });
      console.log(JSON.stringify({ label, viewport, trial, meanMs: result.meanMs, p95Ms: result.p95Ms, p99Ms: result.p99Ms, maxMs: result.maxMs, over50Ms: result.over50Ms }));
    }
    await page.screenshot({ path: `${output}/${label}-${viewport.width}.png` });
    if (errors.length || external.length) throw Error(JSON.stringify({ errors, external }));
    await page.close();
  }
  await writeFile(`${output}/${label}.json`, JSON.stringify({ label, identity, position, cpu: os.cpus()[0]?.model, results, scope: 'Same seed, forest camera, day lighting, default effects/DPR1; repeated zoom and overview transitions. NPCs active. Host Chrome, no CPU throttle, no physical-phone result. RAF includes whole game and refresh-rate limits.' }, null, 2));
} finally { await browser.close(); await new Promise(resolve => host.httpServer.close(resolve)); }

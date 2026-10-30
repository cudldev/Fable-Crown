// Real production WebGL comparison; run before/after with the same host and settings.
import { chromium } from '@playwright/test';
import { preview } from 'vite';
import { build } from 'esbuild';
import { mkdir, writeFile } from 'node:fs/promises';
import os from 'node:os';

const label = process.argv[2] || 'after';
if (!/^[a-z0-9-]+$/.test(label)) throw Error('Use a simple report label');
const output = 'docs/art-audit/voxel-lod-v1';
console.log(`Starting ${label} fixture`);
await mkdir(output, { recursive: true });
const compiled = await build({ entryPoints: ['src/rpg/engine.ts'], bundle: true, platform: 'node', format: 'esm', write: false });
const { createRpg } = await import('data:text/javascript;base64,' + Buffer.from(compiled.outputFiles[0].text).toString('base64'));
const fixture = createRpg(Date.now(), 8128);
Object.assign(fixture.control, { waiting: true, goal: null, active: null, source: null, queue: [], thought: null, thinkingUntil: 1_000_000_000 });
fixture.player.path = [];
console.log('Fixture ready');
const base = process.env.DEMO_URL || 'http://127.0.0.1:4176/';
const host = await preview({ base: new URL(base).pathname, preview: { host: '127.0.0.1', port: Number(new URL(base).port), strictPort: true } });
console.log('Preview ready; launching Chrome');
const browser = await chromium.launch({ channel: 'chrome', headless: true, timeout: 30000 });
try {
  const page = await browser.newPage({ viewport: { width: 1280, height: 800 }, deviceScaleFactor: 1, serviceWorkers: 'block' });
  const errors = [], external = [];
  page.on('pageerror', error => errors.push(error.message));
  page.on('request', request => { const url = new URL(request.url()); if (url.protocol.startsWith('http') && url.origin !== new URL(base).origin) external.push(url.href); });
  await page.goto(base + '?renderer=3d');
  const world = page.getByTestId('rpg-world');
  console.log('Page loaded');
  await world.locator('[data-testid="three-canvas"]').waitFor();
  await page.waitForFunction(() => document.querySelector('[data-testid="rpg-world"]')?.dataset.status === 'ready');
  await page.getByRole('button', { name: 'Open game menu', exact: true }).click();
  await page.locator('input[type="file"]').setInputFiles({ name: 'lod-benchmark.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(fixture)) });
  await page.getByRole('status').filter({ hasText: 'Chronicle restored' }).waitFor();
  await page.getByRole('button', { name: 'Close panel', exact: true }).click();
  await page.getByRole('button', { name: 'Follow Alden', exact: true }).click();
  // Another shared-workspace task adds foliage. Disable it to retain matching
  // environment settings with the pre-LOD build, which has no ground foliage.
  await page.getByRole('button', { name: 'Visual settings', exact: true }).click();
  const foliage = page.getByRole('checkbox', { name: 'Enable ground foliage', exact: true });
  if (await foliage.count()) await foliage.uncheck();
  await page.getByRole('button', { name: 'Done', exact: true }).click();
  const warm = () => page.evaluate(async () => { for (let i = 0; i < 120; i++) await new Promise(requestAnimationFrame); });
  const results = [];
  for (const view of ['close', 'matched-far', 'maximum', 'overview', 'phone']) {
    if (view === 'matched-far') for (let i = 0; i < 3; i++) await page.getByRole('button', { name: 'Zoom out', exact: true }).click();
    if (view === 'maximum') for (let i = 0; i < 14; i++) await page.getByRole('button', { name: 'Zoom out', exact: true }).click();
    if (view === 'overview') await page.getByRole('button', { name: 'World overview', exact: true }).click();
    if (view === 'phone') { await page.getByRole('button', { name: 'World overview', exact: true }).click(); await page.setViewportSize({ width: 390, height: 844 }); }
    await warm();
    const result = await page.evaluate(async view => {
      const root = document.querySelector('[data-testid="rpg-world"]');
      const startCounters = { ...root.dataset }, intervals = []; let previous;
      const start = performance.now();
      while (performance.now() - start < 4000) {
        const now = await new Promise(requestAnimationFrame);
        if (previous !== undefined) intervals.push(now - previous);
        previous = now;
      }
      const elapsedMs = intervals.reduce((sum, n) => sum + n, 0); intervals.sort((a, b) => a - b);
      const gl = document.querySelector('[data-testid="three-canvas"]').getContext('webgl2');
      const debug = gl.getExtension('WEBGL_debug_renderer_info');
      return { view, frames: intervals.length, elapsedMs, fps: intervals.length * 1000 / elapsedMs,
        p50Ms: intervals[Math.floor(intervals.length * .5)], p95Ms: intervals[Math.floor(intervals.length * .95)],
        startCounters, counters: { ...root.dataset }, viewport: [innerWidth, innerHeight],
        browser: navigator.userAgent, gpu: debug ? gl.getParameter(debug.UNMASKED_RENDERER_WEBGL) : 'unavailable', glError: gl.getError() };
    }, view);
    results.push(result);
    if (label !== 'before') await page.screenshot({ path: `${output}/${label}-${view}.png` });
    console.log(JSON.stringify({ label, view, fps: result.fps, p95: result.p95Ms, instances: result.counters.voxelInstances, lods: result.counters.voxelLods, triangles: result.counters.triangles }));
  }
  if (errors.length || external.length || results.some(result => result.glError)) throw Error(JSON.stringify({ errors, external }));
  await writeFile(`${output}/${label}.json`, JSON.stringify({ label, cpu: os.cpus()[0]?.model, platform: os.platform(), results, errors, external,
    scope: 'Whole-game Windows host browser, display-resolution rendering/default lighting and water reflections; ground foliage disabled. Alden waits; NPCs continue. Same seed/settings required for before/after; archived Pixelated runs are not directly comparable. Maximum views intentionally differ after zoom cap. Phone is viewport emulation, not physical hardware. Refresh/host variability limits FPS comparisons.' }, null, 2) + '\n');
} finally { await browser.close(); await new Promise(resolve => host.httpServer.close(resolve)); }

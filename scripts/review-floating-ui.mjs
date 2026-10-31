import { chromium } from '@playwright/test';
import { preview } from 'vite';
import { build } from 'esbuild';
import { mkdir, writeFile } from 'node:fs/promises';
import os from 'node:os';

const label = process.argv[2] || 'after';
if (!/^[a-z-]+$/.test(label)) throw Error('Use a simple report label');
const output = 'docs/performance/floating-ui';
await mkdir(output, { recursive: true });
const compiled = await build({ entryPoints: ['src/rpg/engine.ts'], bundle: true, platform: 'node', format: 'esm', write: false });
const { createRpg } = await import('data:text/javascript;base64,' + Buffer.from(compiled.outputFiles[0].text).toString('base64'));
const fixture = createRpg(Date.now(), 8128);
Object.assign(fixture.control, { autoplay: false, waiting: true, goal: null, active: null, source: null, queue: [], thought: null, thinkingUntil: 1e9 });
fixture.player.path = [];
const host = await preview({ base: '/Fable-Crown/', preview: { host: '127.0.0.1', port: 4187, strictPort: true } });
const browser = await chromium.launch({ channel: 'chrome' });
try {
  const page = await browser.newPage({ viewport: { width: 1280, height: 800 }, serviceWorkers: 'block' });
  const errors = []; page.on('pageerror', error => errors.push(error.message));
  await page.goto('http://127.0.0.1:4187/Fable-Crown/');
  await page.waitForFunction(() => document.querySelector('[data-testid="rpg-world"]')?.dataset.status === 'ready');
  await page.getByRole('button', { name: 'Open game menu', exact: true }).click();
  await page.locator('input[type="file"]').setInputFiles({ name: 'vial.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(fixture)) });
  await page.getByRole('status').filter({ hasText: 'Chronicle restored' }).waitFor();
  await page.getByRole('button', { name: 'Close panel', exact: true }).click();
  await page.getByRole('button', { name: 'Dismiss notification' }).click();
  await page.getByRole('button', { name: 'Dusk lighting', exact: true }).click();
  const results = [];
  for (const viewport of label === 'tint-cpu' ? [] : [{ width: 1280, height: 800 }, { width: 390, height: 844 }]) {
    await page.setViewportSize(viewport);
    await page.waitForFunction(() => document.querySelector('[data-testid="rpg-world"]')?.dataset.voxelQueued === '0');
    const result = await page.evaluate(async () => {
      for (let i = 0; i < 240; i++) await new Promise(requestAnimationFrame);
      const frames = []; let previous;
      for (let i = 0; i < 480; i++) { const now = await new Promise(requestAnimationFrame); if (previous) frames.push(now - previous); previous = now; }
      frames.sort((a, b) => a - b);
      const root = document.querySelector('[data-testid="rpg-world"]');
      return { meanMs: frames.reduce((a, b) => a + b) / frames.length, p95Ms: frames[Math.floor(frames.length * .95)], p99Ms: frames[Math.floor(frames.length * .99)],
        drawCalls: root.dataset.drawCalls, triangles: root.dataset.triangles, gpuMs: root.dataset.gpuMs, hitMs: root.dataset.cpuHitMs };
    });
    results.push({ ...viewport, ...result });
    await page.screenshot({ path: `${output}/${label}-${viewport.width}.png` });
  }
  let tintCpu;
  if (label !== 'before') {
    const probe = await build({ stdin: { contents: 'export { FloatingVials } from "./src/render/three/floating-vials"; export { Camera, DirectionalLight, HemisphereLight, PointLight, Vector3 } from "three";', resolveDir: process.cwd() }, bundle: true, format: 'iife', globalName: 'vialBench', write: false });
    await page.addScriptTag({ content: probe.outputFiles[0].text });
    tintCpu = await page.evaluate(() => {
      const { FloatingVials, Camera, DirectionalLight, HemisphereLight, PointLight, Vector3 } = window.vialBench;
      const container = document.createElement('div'); document.body.append(container);
      const camera = new Camera(), rig = { sun: new DirectionalLight(0xffe7be, 2), fill: new HemisphereLight(0xa8bdcc, 0, 1.2), slots: Array.from({ length: 4 }, () => new PointLight(0xff9a4c, 15, 6)) };
      const results = [];
      for (const count of [1, 8, 32]) {
        const vials = new FloatingVials(container), bars = Array.from({ length: count }, (_, index) => {
          const node = document.createElement('span'); node.className = 'world-health world-health-player'; container.append(node);
          return { node, point: new Vector3(index % 8, 0, Math.floor(index / 8)) };
        });
        let iteration = 0; const samples = [];
        for (let block = 0; block < 20; block++) {
          const start = performance.now();
          for (let step = 0; step < 100; step++) {
            rig.sun.intensity = .5 + iteration % 40 / 20;
            vials.beginFrame(iteration++ * 100, rig, camera);
            for (const bar of bars) vials.update(bar.node, bar.point, rig);
          }
          if (block >= 5) samples.push((performance.now() - start) / 100);
        }
        samples.sort((a, b) => a - b);
        results.push({ bars: count, meanUpdateMs: samples.reduce((a, b) => a + b) / samples.length, p95BlockMeanMs: samples[Math.floor(samples.length * .95)] });
        for (const bar of bars) bar.node.remove();
      }
      container.remove(); return { results, scope: 'CPU only: real DOM style writes, four lamps, changing sun, 2000 accelerated 10 Hz updates per bar count; warm blocks. Excludes deferred style/layout/paint; whole-game frame samples include those costs.' };
    });
  }
  await writeFile(`${output}/${label}.json`, JSON.stringify({ label, cpu: os.cpus()[0].model, scope: 'Warm real Chrome WebGL game, fixed dusk, waiting Alden, 480-frame samples; phone viewport on desktop hardware.', results, tintCpu, errors }, null, 2));
  console.log(JSON.stringify({ label, results, tintCpu, errors }));
} finally { await browser.close(); await new Promise(resolve => host.httpServer.close(resolve)); }

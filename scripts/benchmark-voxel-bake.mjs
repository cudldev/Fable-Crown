// Serial before/after/before startup checks. Keep builds/tests/other browsers stopped.
import { chromium } from '@playwright/test';
import { preview } from 'vite';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import os from 'node:os';

const before = process.env.BAKE_BEFORE_DIST || 'tmp/release-publication/dist', after = process.env.BAKE_AFTER_DIST || 'dist';
const output = process.env.BAKE_BENCH_OUTPUT || 'docs/performance/voxel-bake';
const trials = Number(process.env.BAKE_BENCH_TRIALS || 2), cpuRate = Number(process.env.BAKE_BENCH_CPU || 4);
if (!Number.isInteger(trials) || trials < 1 || trials > 5 || !Number.isFinite(cpuRate) || cpuRate < 1 || cpuRate > 20) throw Error('Invalid bake benchmark parameters');
await mkdir(output, { recursive: true });
const identity = async dist => createHash('sha256').update(await readFile(dist + '/index.html')).digest('hex').slice(0, 12);
const identities = { before: await identity(before), after: await identity(after) }, samples = [];
for (const [bracket, dist] of [['before-a', before], ['after', after], ['before-b', before]]) {
  const host = await preview({ configFile: false, base: '/Fable-Crown/', build: { outDir: dist }, preview: { host: '127.0.0.1', port: 4186, strictPort: true } });
  const browser = await chromium.launch({ channel: 'chrome', headless: true });
  try {
    for (let trial = 0; trial < trials; trial++) {
      const context = await browser.newContext({ serviceWorkers: 'block', viewport: { width: 390, height: 844 }, deviceScaleFactor: 1 });
      try {
        const page = await context.newPage(), errors = [], nativeRequests = [];
        page.on('pageerror', error => errors.push(error.message));
        page.on('console', message => { if (message.type() === 'error') errors.push(message.text()); });
        page.on('request', request => { if (/\.vox(?:\?|$)|\/tiles\.bin(?:\?|$)/.test(request.url())) nativeRequests.push(request.url()); });
        const cdp = await context.newCDPSession(page); await cdp.send('Emulation.setCPUThrottlingRate', { rate: cpuRate });
        await page.addInitScript(() => {
          const state = window.voxelBakeBenchmark = { jobs: [], workers: [] }, NativeWorker = window.Worker;
          window.Worker = class extends NativeWorker {
            constructor(url, options) {
              super(url, options); this.bakeJob = undefined; this.bakeUrl = String(url);
              this.bakeObserved = /voxel-(?:assets|bake)\.worker-/.test(this.bakeUrl);
              if (this.bakeObserved) {
                state.workers.push(this.bakeUrl);
                this.addEventListener('message', event => {
                  const job = this.bakeJob; if (!job) return; this.bakeJob = undefined;
                  job.end = performance.now(); job.ms = job.end - job.start; job.error = event.data?.error ?? null;
                });
              }
            }
            postMessage(...args) {
              if (this.bakeObserved) { this.bakeJob = { start: performance.now(), url: this.bakeUrl, bytes: args[0]?.buffer?.byteLength ?? 0 }; state.jobs.push(this.bakeJob); }
              return super.postMessage(...args);
            }
          };
        });
        await page.goto('http://127.0.0.1:4186/Fable-Crown/', { waitUntil: 'domcontentloaded' });
        await page.locator('[data-testid="rpg-world"][data-status="ready"]').waitFor({ timeout: 120000 });
        const result = await page.evaluate(() => {
          const jobs = window.voxelBakeBenchmark.jobs, canvas = document.querySelector('[data-testid="three-canvas"]'), gl = canvas.getContext('webgl2');
          return { readyMs: performance.now(), ...window.voxelBakeBenchmark, workerSumMs: jobs.reduce((sum, job) => sum + job.ms, 0),
            workerSpanMs: jobs.length ? jobs.at(-1).end - jobs[0].start : null, glError: gl.getError(),
            counters: { ...document.querySelector('[data-testid="rpg-world"]').dataset } };
        });
        if (errors.length || result.glError || result.counters.voxelTemplateBuilds !== '37' || !result.counters.voxelAssets?.includes('ore-depleted') || !result.jobs.length || result.jobs.some(job => job.error || !Number.isFinite(job.ms))) throw Error(JSON.stringify({ errors, result }));
        samples.push({ bracket, trial, identity: await identity(dist), nativeRequests, errors, ...result });
        console.log(JSON.stringify({ bracket, trial, readyMs: result.readyMs, workerSumMs: result.workerSumMs, workerSpanMs: result.workerSpanMs, jobs: result.jobs.length, nativeRequests: nativeRequests.length }));
      } finally { await context.close(); }
    }
  } finally { await browser.close(); await new Promise(resolve => host.httpServer.close(resolve)); }
}
if (await identity(before) !== identities.before || await identity(after) !== identities.after) throw Error('Benchmark artifacts changed during measurement');
await writeFile(output + '/startup.json', JSON.stringify({ identities, browser: 'Chrome/headless', cpu: os.cpus()[0]?.model, cpuRate,
  viewport: { width: 390, height: 844 }, dpr: 1, samples,
  notes: ['Serial before/after/before brackets; fresh browser contexts, service workers blocked; no network shaping.',
    'Worker message time includes startup, computation, validation and transfer, not a pure algorithm timer. Overall ready time includes terrain, shaders, GPU upload and GI.',
    'Host CPU throttling and a phone viewport are not a physical-phone test; this measures startup, not steady frame rate.'] }, null, 2) + '\n');

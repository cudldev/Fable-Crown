// Serial camera-motion measurements; do not run builds/tests/other browsers alongside.
import { chromium } from '@playwright/test';
import { preview } from 'vite';
import { build } from 'esbuild';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import os from 'node:os';

const label = process.argv[2] || 'after';
if (!/^[a-z0-9-]+$/.test(label)) throw Error('Invalid benchmark label');
const dist = process.env.BENCH_DIST || 'dist', output = process.env.BENCH_OUTPUT || 'docs/performance/camera-stutter';
const cpuRate = Number(process.env.BENCH_CPU_RATE || 4), trials = Number(process.env.BENCH_TRIALS || 2), frames = Number(process.env.BENCH_FRAMES || 180);
const port = Number(process.env.BENCH_PORT || 4188), base = `http://127.0.0.1:${port}/Fable-Crown/`;
if (!(cpuRate >= 1 && cpuRate <= 20 && Number.isInteger(trials) && trials >= 1 && trials <= 3 && Number.isInteger(frames) && frames >= 90 && frames <= 360)) throw Error('Invalid measurement settings');
await mkdir(output, { recursive: true });
const digest = bytes => createHash('sha256').update(bytes).digest('hex');
const identity = digest(await readFile(dist + '/index.html')).slice(0, 12), assets = JSON.parse(await readFile(dist + '/world-assets.json', 'utf8'));
const harnessIdentity = digest(await readFile(new URL(import.meta.url))).slice(0, 12);
async function module(file) {
  const bundled = await build({ entryPoints: [file], bundle: true, platform: 'node', format: 'esm', write: false });
  return import('data:text/javascript;base64,' + Buffer.from(bundled.outputFiles[0].text).toString('base64'));
}
const { WORLD, tile } = await module('src/rpg/world.ts'), { createRpg } = await module('src/rpg/engine.ts');
const trees = WORLD.objects.filter(object => object.kind === 'tree').map(object => ({ id: object.id, x: object.position.x, z: object.position.y }));
function position(x, z) {
  for (let radius = 0; radius < 8; radius++) for (let dz = -radius; dz <= radius; dz++) for (let dx = -radius; dx <= radius; dx++) {
    const px = x + dx, pz = z + dz, at = pz * WORLD.width + px;
    if (px > 2 && pz > 2 && px < WORLD.width - 3 && pz < WORLD.height - 3 && !WORLD.collision[at] && WORLD.terrain[at] !== 'water') return tile(px, pz);
  }
  throw Error('No legal route anchor');
}
const routes = [{ id: 'forest', position: position(42, 90) }, { id: 'open', position: position(222, 72) }];
function fixture(route) {
  const state = createRpg(Date.now(), 8128);
  Object.assign(state.control, { autoplay: false, waiting: true, goal: null, active: null, source: null, queue: [], thought: null, thinkingUntil: 1e9 });
  Object.assign(state.player, { position: route.position, previousPosition: { ...route.position }, path: [], action: null, movement: null });
  return state;
}
const host = await preview({ configFile: false, base: '/Fable-Crown/', build: { outDir: dist }, preview: { host: '127.0.0.1', port, strictPort: true } });
const browser = await chromium.launch({ channel: 'chrome', headless: true });
const results = [], diagnostics = [];
async function settle(page) {
  await page.locator('button[aria-label="Follow Alden"]').dispatchEvent('click');
  await page.waitForTimeout(750);
  // Restore/teleport starts with cold cosmetic chunks. Time camera motion only
  // after that initial window commits; older builds have no queued diagnostic.
  await page.waitForFunction(() => {
    const queued = document.querySelector('[data-testid="rpg-world"]')?.dataset.foliageQueued;
    return queued === undefined || queued === '0';
  }, null, { timeout: 60000 });
}
async function restore(page, route) {
  await page.getByRole('button', { name: 'Open game menu', exact: true }).click();
  await page.locator('input[type="file"]').setInputFiles({ name: 'camera-motion-fixture.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(fixture(route))) });
  await page.getByRole('status').filter({ hasText: 'Chronicle restored' }).waitFor();
  await page.getByRole('button', { name: 'Close panel', exact: true }).click();
  const notification = page.getByRole('button', { name: 'Dismiss notification' }); if (await notification.isVisible()) await notification.click();
  await page.locator('button[aria-label="Day lighting"]').dispatchEvent('click');
  await settle(page);
}
async function motion(page, route) {
  const start = await page.locator('[data-testid="three-canvas"]').evaluate(canvas => {
    const b = canvas.getBoundingClientRect();
    for (const [x, y] of [[.5, .43], [.48, .37], [.6, .45], [.4, .5]]) {
      const p = { x: b.x + b.width * x, y: b.y + b.height * y, width: b.width, height: b.height }, hit = document.elementFromPoint(p.x, p.y);
      if (hit === canvas || hit?.closest('[data-three-selection]')) return p;
    }
    throw Error('No exposed point for camera drag');
  });
  await page.mouse.move(start.x, start.y); await page.mouse.down();
  try {
    return await page.evaluate(async ({ start, frames, route, trees }) => {
      const root = document.querySelector('[data-testid="rpg-world"]'), canvas = root.querySelector('canvas'), samples = [];
      const treeIds = new Set(trees.map(tree => tree.id));
      const treeTargets = route.id === 'open' ? [...root.querySelectorAll('[data-three-selection]')].filter(element => {
        const selection = JSON.parse(element.dataset.threeSelection); return selection.kind === 'object' && treeIds.has(selection.id);
      }) : [];
      let previous, minTreeClearance = Infinity, visibleTreeTargets = 0;
      const links = window.cameraStutterLinks || 0;
      for (let frame = 0; frame < frames; frame++) {
        const at = await new Promise(requestAnimationFrame), d = root.dataset, optional = key => d[key] === undefined ? null : Number(d[key]);
        const x = Number(d.cameraX), z = Number(d.cameraY), horizonUpperBound = Math.max(24, Number(d.cameraSpan) * 1.5);
        if (frame % 15 === 0) for (const tree of trees) minTreeClearance = Math.min(minTreeClearance, Math.hypot(tree.x - x, tree.z - z) - horizonUpperBound - 5);
        if (route.id === 'open' && frame % 15 === 0) for (const element of treeTargets) if (!element.hidden) visibleTreeTargets++;
        samples.push({ frame, at, intervalMs: previous === undefined ? null : at - previous, x, z,
          nativeTrees: optional('voxelNativeTrees'), visibleObjects: optional('voxelVisibleObjects'),
          foliageUploads: optional('foliageUploads'), foliagePlants: optional('foliagePlants'), foliageVisible: optional('foliageVisible'),
          foliageQueued: optional('foliageQueued'), foliagePreparationMs: optional('foliagePreparationMs'), foliageMaxSliceMs: optional('foliageMaxSliceMs'),
          voxelUploads: optional('voxelUploads'), voxelPreparationMs: optional('voxelPreparationMs'), transitions: optional('voxelTransitions'),
          giVersion: optional('giVersion'), giApplied: optional('giApplied'), giState: d.giState,
          cpuUpdatesMs: optional('cpuUpdatesMs'), cpuVoxelsMs: optional('cpuVoxelsMs'), cpuGiMs: optional('cpuGiMs'), cpuHitsMs: optional('cpuHitsMs'), cpuRenderMs: optional('cpuRenderMs'),
          gpuMs: optional('gpuMs'), drawCalls: optional('drawCalls'), triangles: optional('triangles') });
        previous = at;
        const phase = frame / (frames - 1) * Math.PI * 2;
        canvas.dispatchEvent(new PointerEvent('pointermove', { bubbles: true, pointerId: 1, pointerType: 'mouse', buttons: 1,
          clientX: start.x + Math.sin(phase) * start.width * .46, clientY: start.y + Math.sin(phase * 2) * start.height * .32 }));
      }
      const intervals = samples.map(sample => sample.intervalMs).filter(value => value !== null).sort((a, b) => a - b);
      const boundaryCrossings = size => samples.reduce((sum, sample, i) => i ? sum + Number(Math.floor(sample.x / size) !== Math.floor(samples[i - 1].x / size) || Math.floor(sample.z / size) !== Math.floor(samples[i - 1].z / size)) : 0, 0);
      const gl = canvas.getContext('webgl2'), debug = gl.getExtension('WEBGL_debug_renderer_info');
      return { samples, meanMs: intervals.reduce((sum, value) => sum + value, 0) / intervals.length,
        p95Ms: intervals[Math.floor(intervals.length * .95)], p99Ms: intervals[Math.floor(intervals.length * .99)], maxMs: intervals.at(-1),
        over25Ms: intervals.filter(value => value > 25).length, over50Ms: intervals.filter(value => value > 50).length,
        crossings8m: boundaryCrossings(8), crossings16m: boundaryCrossings(16), minTreeClearance, visibleTreeTargets,
        linksDuringMotion: (window.cameraStutterLinks || 0) - links, glError: gl.getError(), gpu: debug ? gl.getParameter(debug.UNMASKED_RENDERER_WEBGL) : 'unavailable', final: { ...root.dataset } };
    }, { start, frames, route, trees });
  } finally { await page.mouse.up(); }
}
function timelineSummary(events) {
  const totals = new Map();
  for (const event of events) if (event.ph === 'X' && event.dur && ['Layout', 'UpdateLayoutTree', 'RecalculateStyles', 'MinorGC', 'MajorGC', 'V8.GCScavenger', 'V8.GCCompactor', 'FunctionCall', 'RunTask', 'Paint', 'CompositeLayers'].includes(event.name)) {
    const row = totals.get(event.name) || { count: 0, totalMs: 0, maxMs: 0 }; row.count++; row.totalMs += event.dur / 1000; row.maxMs = Math.max(row.maxMs, event.dur / 1000); totals.set(event.name, row);
  }
  return Object.fromEntries(totals);
}
function profileSummary(profile) {
  const nodes = new Map(profile.nodes.map(node => [node.id, node])), totals = new Map();
  profile.samples?.forEach((id, i) => {
    const frame = nodes.get(id)?.callFrame; if (!frame) return;
    const key = `${frame.functionName || '(anonymous)'}|${frame.url}:${frame.lineNumber + 1}:${frame.columnNumber + 1}`;
    const row = totals.get(key) || { function: frame.functionName, url: frame.url, line: frame.lineNumber + 1, column: frame.columnNumber + 1, selfMs: 0, samples: 0 };
    row.selfMs += (profile.timeDeltas?.[i] || 0) / 1000; row.samples++; totals.set(key, row);
  });
  return [...totals.values()].sort((a, b) => b.selfMs - a.selfMs).slice(0, 40);
}
async function diagnose(page, cdp, route, viewport) {
  await settle(page);
  await page.evaluate(() => {
    window.cameraStutterGL = [];
    for (const name of ['bufferData', 'bufferSubData', 'texImage3D', 'texSubImage3D']) {
      const original = WebGL2RenderingContext.prototype[name];
      WebGL2RenderingContext.prototype[name] = function (...args) {
        const began = performance.now(); try { return original.apply(this, args); }
        finally { const ms = performance.now() - began; if (ms >= .25) window.cameraStutterGL.push({ name, at: began, ms }); }
      };
    }
  });
  const events = [];
  const collect = chunk => events.push(...chunk.value); cdp.on('Tracing.dataCollected', collect);
  await cdp.send('Profiler.enable'); await cdp.send('Profiler.setSamplingInterval', { interval: 1000 }); await cdp.send('Profiler.start');
  await cdp.send('Tracing.start', { categories: 'devtools.timeline,v8,blink.user_timing,disabled-by-default-devtools.timeline', transferMode: 'ReportEvents' });
  let result, profile;
  try { result = await motion(page, route); }
  finally {
    profile = (await cdp.send('Profiler.stop')).profile;
    const ended = new Promise(resolve => cdp.once('Tracing.tracingComplete', resolve)); await cdp.send('Tracing.end'); await ended; cdp.off('Tracing.dataCollected', collect);
  }
  const glCalls = await page.evaluate(() => window.cameraStutterGL);
  const raw = `${output}/${label}-open-trace.json`, cpu = `${output}/${label}-open-cpu.json`;
  await writeFile(raw, JSON.stringify({ traceEvents: events })); await writeFile(cpu, JSON.stringify(profile));
  return { viewport, route: route.id, result, timeline: timelineSummary(events), topSelfCpu: profileSummary(profile), glCalls, trace: raw, profile: cpu,
    note: 'Traced diagnostic only; profiler/GL wrappers perturb timing. Do not compare its frame rates with untraced trials. Timeline totals can overlap.' };
}
const motionIdentity = digest(motion.toString().replace(/\r\n/g, '\n')).slice(0, 12);
const report = complete => ({ label, complete, dist, identity, assetVersion: assets.version, harnessIdentity, motionIdentity, cpu: os.cpus()[0]?.model, cpuRate, frames, trials, routes, results, diagnostics,
  metricSemantics: { raf: 'Actual observed RAF scheduling intervals; first interval excluded.', counters: 'Published renderer diagnostics repeat at native ~500ms cadence; read at RAF for correlation, not independent per-frame CPU/GPU measurements.', open: 'No tree targets visible plus conservative all-tree clearance beyond horizon+5m. No trees are removed.', trace: 'Separate diagnostic Profiler/Tracing run; its timing is excluded from untraced comparison.' },
  setup: 'Follow/fixture restore settles750ms, then waits for foliageQueued0 when that diagnostic exists. Absent on baseline, so it passes immediately. This gate is outside timed motion; motionIdentity identifies the unchanged RAF/input/sampling body.',
  scope: 'Actual production geometry/shaders/lighting and real held-pointer pan. Fixed zoom; routes cross8m/16m boundaries. CPU4x/phone viewport is host emulation, not physical-mobile performance. NPCs continue deterministic600ms ticks; no universal FPS/latency guarantee.' });
try {
  for (const viewport of [{ width: 1280, height: 800 }, { width: 390, height: 844 }]) {
    const context = await browser.newContext({ viewport, deviceScaleFactor: 1, serviceWorkers: 'block' }), page = await context.newPage(), errors = [], external = [];
    page.on('pageerror', error => errors.push(error.message)); page.on('console', message => { if (message.type() === 'error') errors.push(message.text()); });
    page.on('request', request => { const url = new URL(request.url()); if (url.protocol.startsWith('http') && url.origin !== new URL(base).origin) external.push(url.href); });
    await page.addInitScript(() => { window.cameraStutterLinks = 0; const original = WebGL2RenderingContext.prototype.linkProgram; WebGL2RenderingContext.prototype.linkProgram = function (...args) { window.cameraStutterLinks++; return original.apply(this, args); }; });
    const cdp = await context.newCDPSession(page); await cdp.send('Emulation.setCPUThrottlingRate', { rate: cpuRate });
    try {
      await page.goto(base + '?renderer=3d', { waitUntil: 'domcontentloaded' });
      await page.waitForFunction(() => document.querySelector('[data-testid="rpg-world"]')?.dataset.status === 'ready', null, { timeout: 120000 });
      await page.waitForFunction(() => {
        const data = document.querySelector('[data-testid="rpg-world"]')?.dataset;
        return data?.voxelRenderer === 'shared-static-meshes' && data.voxelTemplateBuilds === '37' && data.terrainSource === 'vox' && data.voxelAssets?.includes('ore-depleted');
      }, null, { timeout: 60000 });
      for (const route of routes) {
        await restore(page, route);
        for (let trial = 0; trial < trials; trial++) {
          await settle(page); const result = await motion(page, route);
          if (result.glError || result.linksDuringMotion || !result.crossings8m || !result.crossings16m || route.id === 'forest' && !result.samples.some(sample => sample.nativeTrees > 0) || route.id === 'open' && (result.minTreeClearance <= 0 || result.visibleTreeTargets)) throw Error(JSON.stringify({ route, viewport, result }));
          results.push({ viewport, route: route.id, trial, ...result }); await writeFile(`${output}/${label}.partial.json`, JSON.stringify(report(false), null, 2));
          console.log(JSON.stringify({ label, route: route.id, viewport, trial, meanMs: result.meanMs, p95Ms: result.p95Ms, p99Ms: result.p99Ms, maxMs: result.maxMs, over25Ms: result.over25Ms, over50Ms: result.over50Ms, crossings8m: result.crossings8m, crossings16m: result.crossings16m, minTreeClearance: result.minTreeClearance }));
        }
      }
      if (process.env.BENCH_TRACE !== '0' && viewport.width === 1280) {
        await restore(page, routes[1]); diagnostics.push(await diagnose(page, cdp, routes[1], viewport));
        await writeFile(`${output}/${label}.partial.json`, JSON.stringify(report(false), null, 2));
      }
      if (errors.length || external.length) throw Error(JSON.stringify({ errors, external }));
    } finally { await cdp.detach(); await context.close(); }
  }
  if (digest(await readFile(dist + '/index.html')).slice(0, 12) !== identity) throw Error('Artifact changed during measurement');
  await writeFile(`${output}/${label}.json`, JSON.stringify(report(true), null, 2));
} finally { await browser.close(); await new Promise(resolve => host.httpServer.close(resolve)); }

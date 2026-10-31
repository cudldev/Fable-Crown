// Production pan/refinement comparison. Run matching before/after/before brackets.
import { chromium } from '@playwright/test';
import { preview } from 'vite';
import { build } from 'esbuild';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import os from 'node:os';

const label = process.argv[2] || 'after';
if (!/^[a-z0-9-]+$/.test(label)) throw Error('Invalid report label');
const output = 'docs/performance/voxel-continuity';
const dist = process.env.BENCH_DIST || 'tmp/release-publication/dist';
const cpuRate = Number(process.env.BENCH_CPU_RATE || 4), trials = Number(process.env.BENCH_TRIALS || 3);
if (!(cpuRate >= 1 && cpuRate <= 20 && trials >= 1 && trials <= 5)) throw Error('Invalid benchmark parameters');
const port = Number(process.env.BENCH_PORT || 4181), base = `http://127.0.0.1:${port}/Fable-Crown/`;
await mkdir(output, { recursive: true });
async function module(path) {
  const compiled = await build({ entryPoints: [path], bundle: true, platform: 'node', format: 'esm', write: false });
  return import('data:text/javascript;base64,' + Buffer.from(compiled.outputFiles[0].text).toString('base64'));
}
const { createRpg } = await module('src/rpg/engine.ts');
const { WORLD, interactionTiles } = await module('src/rpg/world.ts');
const state = createRpg(Date.now(), 8128);
const tree = WORLD.objects.filter(o => o.kind === 'tree').sort((a,b) => Math.hypot(a.position.x-45,a.position.y-87)-Math.hypot(b.position.x-45,b.position.y-87))[0];
const position = interactionTiles(tree, WORLD)[0];
Object.assign(state.control, { autoplay: false, waiting: true, goal: null, active: null, source: null, queue: [], thought: null, thinkingUntil: 1e9 });
Object.assign(state.player, { position, previousPosition: { ...position }, path: [], action: null, movement: null });
const identity = createHash('sha256').update(await readFile(`${dist}/index.html`)).digest('hex').slice(0,12);
const host = await preview({ base: '/Fable-Crown/', build: { outDir: dist }, preview: { host: '127.0.0.1', port, strictPort: true } });
const browser = await chromium.launch({ channel: 'chrome', headless: true });

async function follow(page) { await page.locator('button[aria-label="Follow Alden"]').dispatchEvent('click'); }
async function route(page, frames = 360) {
  const start = await page.locator('[data-testid="three-canvas"]').evaluate(canvas => {
    const b = canvas.getBoundingClientRect();
    for (const [x,y] of [[.5,.43],[.45,.35],[.6,.45],[.5,.6]]) {
      const p = { x: b.x+b.width*x, y: b.y+b.height*y, width:b.width, height:b.height };
      const hit = document.elementFromPoint(p.x,p.y);
      if (hit === canvas || hit?.closest('[data-three-selection]')) return p;
    }
    throw Error('No exposed point for real camera drag');
  });
  await page.mouse.move(start.x,start.y); await page.mouse.down();
  try {
    return await page.evaluate(async ({ start, frames }) => {
      const root = document.querySelector('[data-testid="rpg-world"]'), canvas = root.querySelector('canvas');
      const samples = [], ui = []; let previous, uiAt;
      for (let frame = 0; frame < frames; frame++) {
        const at = await new Promise(requestAnimationFrame), d = root.dataset;
        const optional = key => d[key] === undefined ? null : Number(d[key]);
        samples.push({ frame, at, intervalMs: previous === undefined ? null : at-previous,
          x:Number(d.cameraX), z:Number(d.cameraY), zoom:Number(d.cameraZoom), instances:Number(d.voxelInstances), nativeTrees:Number(d.voxelNativeTrees),
          queued:Number(d.voxelQueued), stagedCells:Number(d.voxelStagedCells), residentCells:Number(d.voxelResidentCells), preparationMs:Number(d.voxelPreparationMs),
          cancelled:optional('voxelCancelled'), pendingAgeMs:optional('voxelPendingAgeMs'), transitions:optional('voxelTransitions'),
          closestTreeId:d.voxelClosestTreeId ?? null, closestTreeLod:optional('voxelClosestTreeLod'), closestTreeDesiredLod:optional('voxelClosestTreeDesiredLod') });
        previous = at;
        const phase = frame/(frames-1)*Math.PI*2;
        canvas.dispatchEvent(new PointerEvent('pointermove', { bubbles:true,pointerId:1,pointerType:'mouse',buttons:1,
          clientX:start.x+Math.sin(phase)*start.width*.3,clientY:start.y+Math.sin(phase*.5)*start.height*.1 }));
        if (frame === Math.floor(frames*.5) || frame === Math.floor(frames*.7)) canvas.dispatchEvent(new WheelEvent('wheel',{deltaY:frame<frames*.6?1400:-1400,bubbles:true,cancelable:true}));
        if (frame === 75) { uiAt=performance.now(); document.querySelector('button[aria-label="Open inventory"]')?.click(); }
        if (uiAt !== undefined) {
          const drawer = document.querySelector('.inventory-drawer');
          if (drawer && getComputedStyle(drawer).display !== 'none') { ui.push({action:'open-inventory',latencyMs:performance.now()-uiAt});uiAt=undefined; }
        }
        if (frame === 105) document.querySelector('button[aria-label="Close panel"]')?.click();
        root.dataset.continuityFrame=String(frame);
      }
      const intervals=samples.map(s=>s.intervalMs).filter(n=>n!==null).sort((a,b)=>a-b),gl=canvas.getContext('webgl2'),debug=gl.getExtension('WEBGL_debug_renderer_info');
      const mismatch=[], unfinished=[];let active;
      for(const s of samples){
        if(active&&(s.closestTreeId!==active.id||s.closestTreeDesiredLod!==active.target)){unfinished.push({...active,end:s.at,reason:'nearest-or-target-changed'});active=undefined;}
        if(s.closestTreeId&&s.closestTreeDesiredLod>=0&&s.closestTreeLod!==s.closestTreeDesiredLod){active??={id:s.closestTreeId,target:s.closestTreeDesiredLod,start:s.at};}
        else if(active){mismatch.push({...active,end:s.at,latencyMs:s.at-active.start});active=undefined;}
      }
      if(active)unfinished.push({...active,end:samples.at(-1).at,reason:'route-ended'});
      const watched=samples.filter(s=>s.closestTreeId&&s.closestTreeDesiredLod!==null&&s.closestTreeDesiredLod>=0&&s.closestTreeLod>=0);
      const matching=watched.filter(s=>s.closestTreeLod===s.closestTreeDesiredLod), native=watched.filter(s=>s.closestTreeDesiredLod===0);
      const duration=list=>list.reduce((sum,s)=>sum+(s.intervalMs??0),0), watchedMs=duration(watched), nativeMs=duration(native);
      const refinement={supported:watched.length>0,completed:mismatch,unfinished,watchedSamples:watched.length,
        matchedFraction:watched.length?matching.length/watched.length:null,matchedTimeFraction:watchedMs?duration(matching)/watchedMs:null,
        nativeMatchedTimeFraction:nativeMs?duration(native.filter(s=>s.closestTreeLod===0))/nativeMs:null,
        longestObservedMismatchMs:Math.max(0,...mismatch.map(s=>s.end-s.start),...unfinished.map(s=>s.end-s.start)),
        maxPendingAgeMs:Math.max(0,...samples.map(s=>s.pendingAgeMs??0)),cancelledDelta:samples.at(-1).cancelled===null?null:samples.at(-1).cancelled-samples[0].cancelled};
      return {samples,ui,refinement,
        meanMs:intervals.reduce((a,b)=>a+b,0)/intervals.length,p95Ms:intervals[Math.floor(intervals.length*.95)],p99Ms:intervals[Math.floor(intervals.length*.99)],maxMs:intervals.at(-1),
        over33Ms:intervals.filter(n=>n>33.34).length,over50Ms:intervals.filter(n=>n>50).length,glError:gl.getError(),gpu:debug?gl.getParameter(debug.UNMASKED_RENDERER_WEBGL):'unavailable',final:{...root.dataset}};
    }, {start,frames});
  } finally { await page.mouse.up(); }
}

try {
  const results=[],captures=[];let stopping=false;
  const report=complete=>({label,identity,dist,cpuRate,cpu:os.cpus()[0]?.model,position,results,captures,complete,
    scope:'Same forest fixture, continuous captured drag with zoom changes, repeated RAF trials per viewport. Chrome CPU throttling is host emulation, not physical-phone performance. Screenshots use separate route. Frame counters preserve their publication cadence; per-tree/cancellation/age/transition metrics are null on builds without those diagnostics. Matched fractions include actual observed time; unfinished mismatch segments are censored observations, not successful refinements. UI latency includes main-thread scheduling. No universal FPS/latency guarantee.'});
  const checkpoint=()=>writeFile(`${output}/${label}.partial.json`,JSON.stringify(report(false),null,2));
  const stopRequested=()=>readFile(`${output}/${label}.stop`).then(()=>true,()=>false);
  for(const viewport of [{width:1280,height:800},{width:390,height:844}]) {
    const page=await browser.newPage({viewport,deviceScaleFactor:1,serviceWorkers:'block'}),errors=[],external=[];
    page.on('pageerror',e=>errors.push(e.message));page.on('console',m=>{if(m.type()==='error')errors.push(m.text());});
    page.on('request',r=>{const u=new URL(r.url());if(u.protocol.startsWith('http')&&u.origin!==new URL(base).origin)external.push(u.href);});
    const cdp=await page.context().newCDPSession(page);await cdp.send('Emulation.setCPUThrottlingRate',{rate:cpuRate});
    await page.goto(base+'?renderer=3d',{waitUntil:'domcontentloaded'});
    await page.waitForFunction(()=>document.querySelector('[data-testid="rpg-world"]')?.dataset.status==='ready',null,{timeout:120000});
    await page.getByRole('button',{name:'Open game menu',exact:true}).click();
    await page.locator('input[type="file"]').setInputFiles({name:'continuity-forest.json',mimeType:'application/json',buffer:Buffer.from(JSON.stringify(state))});
    await page.getByRole('status').filter({hasText:'Chronicle restored'}).waitFor();
    await page.getByRole('button',{name:'Close panel',exact:true}).click();
    await page.locator('button[aria-label="Day lighting"]').dispatchEvent('click');await follow(page);
    await page.waitForTimeout(1500);
    for(let trial=0;trial<trials;trial++) {
      await follow(page);await page.waitForTimeout(750);
      const result=await route(page);results.push({viewport,trial,...result});
      await checkpoint();
      console.log(JSON.stringify({label,viewport,trial,meanMs:result.meanMs,p99Ms:result.p99Ms,over50Ms:result.over50Ms,
        matchedTimeFraction:result.refinement.matchedTimeFraction,nativeMatchedTimeFraction:result.refinement.nativeMatchedTimeFraction,
        maxPendingAgeMs:result.refinement.maxPendingAgeMs,cancelledDelta:result.refinement.cancelledDelta,
        longestObservedMismatchMs:result.refinement.longestObservedMismatchMs,completedRefinements:result.refinement.completed.length,ui:result.ui}));
      if(await stopRequested()){stopping=true;break;}
    }
    if(stopping){await cdp.detach();await page.close();break;}
    // Capture a separate identical route: screenshot readbacks do not enter timing trials.
    await follow(page);await page.waitForTimeout(750);
    await page.locator('[data-testid="rpg-world"]').evaluate(el=>{el.dataset.continuityFrame='-1';});
    const moving=route(page);
    for(const frame of [135,155,175,195,215,235,255,275,295,315]) {
      await page.waitForFunction(f=>Number(document.querySelector('[data-testid="rpg-world"]')?.dataset.continuityFrame)>=f,frame,{timeout:60000});
      const path=`${output}/${label}-${viewport.width}-frame-${frame}.png`;await page.screenshot({path});captures.push(path);
    }
    await moving;
    await follow(page);const started=Date.now();
    await page.waitForFunction(()=>{const d=document.querySelector('[data-testid="rpg-world"]')?.dataset;return d?.voxelQueued==='0'&&d.voxelStagedCells==='0';},null,{timeout:30000});
    captures.push({viewport,settleAfterFollowMs:Date.now()-started});
    if(errors.length||external.length)throw Error(JSON.stringify({errors,external}));
    await cdp.detach();await page.close();
  }
  await writeFile(`${output}/${label}.json`,JSON.stringify(report(!stopping),null,2));
} finally {await browser.close();await new Promise(resolve=>host.httpServer.close(resolve));}

// Controlled whole-game terrain comparison. Sequential contexts; no source/game edits.
import { chromium, expect } from '@playwright/test';
import { build } from 'esbuild';
import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile, access } from 'node:fs/promises';
import path from 'node:path';

const args=process.argv.slice(2),option=(name,fallback)=>args.find(value=>value.startsWith('--'+name+'='))?.slice(name.length+3)??fallback;
const label=option('label','before'),renderStyle=option('render-style','smooth'),dpr=Number(option('dpr','1'));
if(!/^[a-z0-9-]+$/.test(label)||renderStyle!=='smooth'||!Number.isFinite(dpr)||dpr<1||dpr>2)throw Error('Use a local label, smooth style and DPR1–2');
const root=path.resolve('.'),output=path.join('docs/art-audit/terrain-optimization-v1',label),base=process.env.DEMO_URL??'http://127.0.0.1:4174/Fable-Crown/';
await mkdir(output,{recursive:true});
try{await access(path.join(output,'report.json'));if(!args.includes('--overwrite'))throw Error('Preserve previous benchmark: choose a new --label or explicit --overwrite');}catch(error){if(error.code!=='ENOENT')throw error;}
const digest=bytes=>createHash('sha256').update(bytes).digest('hex');
const buildIdentity=async()=>({index:digest(await readFile('dist/index.html')),terrainManifest:digest(await readFile('dist/art3d/terrain/manifest.json'))});
const identity=await buildIdentity();
const fixtureModule=await build({stdin:{contents:"export {createRpg} from './src/rpg/engine';",resolveDir:root,sourcefile:'terrain-benchmark-fixture.ts'},bundle:true,platform:'node',format:'esm',write:false,logLevel:'error'});
const {createRpg}=await import('data:text/javascript;base64,'+Buffer.from(fixtureModule.outputFiles[0].contents).toString('base64'));
const seed=8128,viewport={width:1280,height:800};
function fixture(paused){
 const state=createRpg(Date.now(),seed);
 if(paused){Object.assign(state.control,{waiting:true,goal:null,active:null,source:null,queue:[],thought:null,thinkingUntil:1_000_000_000});state.player.path=[];state.player.movement=null;state.player.action=null;}
 return state;
}
async function importFixture(page,paused){
 await page.getByRole('button',{name:'Open game menu',exact:true}).click();
 await page.locator('input[type="file"]').setInputFiles({name:'terrain-benchmark.json',mimeType:'application/json',buffer:Buffer.from(JSON.stringify(fixture(paused)))});
 await expect(page.getByRole('status')).toContainText('Chronicle restored');await page.getByRole('button',{name:'Close panel',exact:true}).click();
}
async function saveSummary(page){
 await page.getByRole('button',{name:'Open game menu',exact:true}).click();await page.getByRole('button',{name:'Save on device',exact:true}).click();await expect(page.getByRole('status')).toContainText('Chronicle saved');
 const state=await page.evaluate(()=>new Promise((resolve,reject)=>{
  const request=indexedDB.open('fable-crown',1);request.onerror=()=>reject(request.error);request.onsuccess=()=>{const db=request.result,get=db.transaction('saves').objectStore('saves').get('v5');get.onsuccess=()=>{resolve(get.result);db.close();};get.onerror=()=>{reject(get.error);db.close();};};
 }));
 await page.getByRole('button',{name:'Close panel',exact:true}).click();
 return {tick:state.tick,waiting:state.control.waiting,active:state.control.active,goal:state.control.goal,playerPosition:state.player.position,playerAction:state.player.action?.kind??null,playerInventory:state.player.inventory,npcPositions:state.npcs.map(npc=>({id:npc.id,position:npc.position,action:npc.action?.kind??null}))};
}
async function warm(page,frames=120){await page.evaluate(async count=>{for(let i=0;i<count;i++)await new Promise(resolve=>requestAnimationFrame(resolve));},frames);}
async function lockCamera(page){
 await page.getByRole('button',{name:'Follow Alden',exact:true}).click();
 const world=page.getByTestId('rpg-world'),x=49,y=96;
 // Import changes the actor immediately, but debug camera metrics update every500ms.
 // Wait for follow to converge instead of locking a stale pre-import camera position.
 await expect(world).toHaveAttribute('data-camera-x',x.toFixed(2));await expect(world).toHaveAttribute('data-camera-y',y.toFixed(2));
 const canvas=page.getByTestId('three-canvas');await canvas.focus();await canvas.press('ArrowRight');
 await expect(world).toHaveAttribute('data-camera-x',(x+2).toFixed(2));await canvas.press('ArrowLeft');
 await expect(world).toHaveAttribute('data-camera-x',x.toFixed(2));await expect(world).toHaveAttribute('data-camera-y',y.toFixed(2));
}
async function settings(page){
 await page.getByRole('button',{name:'Visual settings',exact:true}).click();const panel=page.getByRole('dialog',{name:'Visual settings'});
 await panel.getByRole('button',{name:'Reset visual settings',exact:true}).click();
 await expect(page.getByTestId('rpg-world')).toHaveAttribute('data-render-style',renderStyle);
 await panel.getByRole('button',{name:'Done',exact:true}).click();
 await page.getByRole('button',{name:'Zoom in',exact:true}).click();await page.getByRole('button',{name:'Zoom in',exact:true}).click();
}
async function measure(page,{durationMs,minFrames=240}){
 return page.evaluate(async({durationMs,minFrames})=>{
  const root=document.querySelector('[data-renderer="3d"]'),intervals=[],counters=[];
  const first=await new Promise(resolve=>requestAnimationFrame(resolve));let last=first,nextCounter=first;
  while(intervals.length<minFrames||last-first<durationMs){const now=await new Promise(resolve=>requestAnimationFrame(resolve));intervals.push(now-last);last=now;if(now>=nextCounter){counters.push({elapsedMs:now-first,...root.dataset});nextCounter=now+500;}}
  const ordered=[...intervals].sort((a,b)=>a-b),elapsedMs=last-first,meanMs=elapsedMs/intervals.length;
  const gl=document.querySelector('[data-testid="three-canvas"]').getContext('webgl2'),extension=gl.getExtension('WEBGL_debug_renderer_info');
  const numbers=key=>counters.map(sample=>Number(sample[key])).filter(Number.isFinite),range=key=>{const list=numbers(key);return list.length?{min:Math.min(...list),max:Math.max(...list),mean:list.reduce((a,b)=>a+b,0)/list.length}:null;};
  return {frames:intervals.length,elapsedMs,meanFrameMs:meanMs,meanFps:1000/meanMs,p50Ms:ordered[Math.floor(ordered.length*.5)],p95Ms:ordered[Math.min(ordered.length-1,Math.floor(ordered.length*.95))],maxMs:ordered.at(-1),intervalsMs:intervals,counters,
   ranges:Object.fromEntries(['gpuMs','drawCalls','triangles','terrainBakes','terrainBakeMs','terrainTextureBytes','renderWidth','renderHeight','cameraX','cameraY','cpuUpdatesMs','cpuVoxelsMs','cpuGiMs','cpuRenderMs','cpuHitsMs'].map(key=>[key,range(key)])),
   finalCounters:{...root.dataset},browser:navigator.userAgent,gpu:extension?gl.getParameter(extension.UNMASKED_RENDERER_WEBGL):'unavailable',contextLost:gl.isContextLost(),glError:gl.getError()};
 },{durationMs,minFrames});
}
const order=[{id:'legacy-a',legacy:true},{id:'native',legacy:false},{id:'legacy-b',legacy:true}],trials=[];
const browser=await chromium.launch({channel:'chrome',headless:true});
try{
 for(const trial of order){
  const context=await browser.newContext({viewport,deviceScaleFactor:dpr,serviceWorkers:'block'}),page=await context.newPage(),errors=[],external=[],requests=[];
  try{
   page.on('pageerror',error=>errors.push(error.message));page.on('console',message=>{if(message.type()==='error')errors.push(message.text());});
   page.on('request',request=>{const u=new URL(request.url());if(u.protocol.startsWith('http')&&u.origin!==new URL(base).origin)external.push(u.href);if(u.pathname.includes('/art3d/terrain/'))requests.push(u.pathname);});
   const url=new URL(base);url.searchParams.set('renderer','3d');if(trial.legacy)url.searchParams.set('terrain','legacy');
   const startup=performance.now();await page.goto(url.href);const world=page.getByTestId('rpg-world');await expect(world).toHaveAttribute('data-status','ready',{timeout:60000});const readyMs=performance.now()-startup;
   const readyCounters=await world.evaluate(element=>({...element.dataset}));
   console.log(JSON.stringify({trial:trial.id,phase:'ready',readyMs,rig:readyCounters.characterRig,actorStyle:readyCounters.actorStyle,renderStyle:readyCounters.renderStyle,pixels:[readyCounters.renderWidth,readyCounters.renderHeight],source:readyCounters.terrainSource,bakeMs:readyCounters.terrainBakeMs}));
   await expect(world).toHaveAttribute('data-terrain-source',trial.legacy?/^(fallback|legacy)$/:/^vox$/);
   await settings(page);await importFixture(page,true);await lockCamera(page);await warm(page);
   const pausedBefore=await saveSummary(page);await warm(page,30);const paused=await measure(page,{durationMs:3000});const pausedAfter=await saveSummary(page);
   console.log(JSON.stringify({trial:trial.id,phase:'paused-complete',fps:paused.meanFps,p95:paused.p95Ms,rig:paused.finalCounters.characterRig,renderStyle:paused.finalCounters.renderStyle,pixels:[paused.finalCounters.renderWidth,paused.finalCounters.renderHeight]}));
   expect(pausedBefore.waiting).toBe(true);expect(pausedAfter.playerPosition).toEqual(pausedBefore.playerPosition);expect(pausedAfter.playerInventory).toEqual(pausedBefore.playerInventory);
   await page.screenshot({path:path.join(output,trial.id+'-dusk.png')});await page.getByRole('button',{name:'Day lighting',exact:true}).click();await warm(page,60);await page.screenshot({path:path.join(output,trial.id+'-day.png')});
   await page.getByRole('button',{name:'Dusk lighting',exact:true}).click();await importFixture(page,false);await warm(page);const activeBefore=await saveSummary(page);await warm(page,30);const active=await measure(page,{durationMs:15000});const activeAfter=await saveSummary(page);
   expect(active.finalCounters.visualSettings).toBe(paused.finalCounters.visualSettings);
   expect(active.finalCounters.renderWidth).toBe(paused.finalCounters.renderWidth);expect(active.finalCounters.renderHeight).toBe(paused.finalCounters.renderHeight);
   expect(active.frames).toBeGreaterThanOrEqual(240);expect(active.elapsedMs).toBeGreaterThanOrEqual(15000);expect(activeAfter.tick-activeBefore.tick).toBeGreaterThanOrEqual(20);expect(activeBefore.waiting).toBe(false);
   for(const sample of [paused,active]){expect(sample.contextLost).toBe(false);expect(sample.glError).toBe(0);expect(sample.ranges.cameraX.max-sample.ranges.cameraX.min).toBeLessThan(.01);expect(sample.ranges.cameraY.max-sample.ranges.cameraY.min).toBeLessThan(.01);}
   if(trials.length){expect(paused.finalCounters.visualSettings).toBe(trials[0].paused.finalCounters.visualSettings);expect(paused.finalCounters.renderWidth).toBe(trials[0].paused.finalCounters.renderWidth);expect(paused.finalCounters.renderHeight).toBe(trials[0].paused.finalCounters.renderHeight);}
   expect(errors).toEqual([]);expect(external).toEqual([]);
   const result={...trial,url:url.href,readyMs,pausedBefore,paused,pausedAfter,activeBefore,active,activeAfter,errors,externalRequests:external,terrainRequests:requests};trials.push(result);
   await writeFile(path.join(output,trial.id+'.json'),JSON.stringify(result,null,2)+'\n');
   console.log(JSON.stringify({trial:trial.id,paused:{fps:paused.meanFps,p95:paused.p95Ms,gpu:paused.ranges.gpuMs},active:{fps:active.meanFps,p95:active.p95Ms,gpu:active.ranges.gpuMs},bakeMs:active.finalCounters.terrainBakeMs,bytes:active.finalCounters.terrainTextureBytes,readyMs}));
  }finally{await context.close();}
 }
 expect(await buildIdentity()).toEqual(identity);
 const report={label,buildIdentity:identity,viewport,deviceScaleFactor:dpr,renderStyle,fixtureSeed:seed,order:order.map(trial=>trial.id),trials,
  scope:'Whole-game host-browser comparison, not isolated terrain GPU cost or physical-phone benchmark. Paused means Alden waits; NPCs/world continue. Active uses the real deterministic autonomous game with a fixed camera. Frames include real long intervals. No WebLLM,paidendpoint or remote runtime is required.',
  comparison:'Legacy A and legacy B bracket native to expose order/warmup/host variability. Compare matching render resolution/settings. Source/default character,day/dusk settings and desktop viewport are kept identical.'};
 await writeFile(path.join(output,'report.json'),JSON.stringify(report,null,2)+'\n');
 // A comparison board uses screenshots as-is, scaled uniformly only for layout.
 const ctx=await browser.newContext({viewport:{width:1640,height:650},serviceWorkers:'block'}),page=await ctx.newPage();
 try{
  await page.route('http://terrain-benchmark.test/**',async route=>{const name=new URL(route.request().url()).pathname.slice(1);if(!/^(legacy-a|native)-(day|dusk)\.png$/.test(name))return route.abort();return route.fulfill({body:await readFile(path.join(output,name)),contentType:'image/png'});});
  for(const light of ['day','dusk']){const html=`<!doctype html><html><head><style>body{margin:0;padding:16px;background:#e6e4dc;color:#30332a;font:16px system-ui}h1{font-size:20px;margin:0 0 12px}.pair{display:flex;gap:12px}section{width:800px}p{margin:6px 0;font-size:13px;overflow-wrap:anywhere}img{display:block;width:800px;height:500px}</style></head><body><h1>Actual game · ${label} · ${light} · identical display resolution and camera</h1><div class="pair"><section><strong>Legacy terrain</strong><p>${trials[0].url}</p><img src="http://terrain-benchmark.test/legacy-a-${light}.png"></section><section><strong>Native VOX terrain</strong><p>${trials[1].url}</p><img src="http://terrain-benchmark.test/native-${light}.png"></section></div></body></html>`;await page.setContent(html);await page.waitForFunction(()=>[...document.images].every(image=>image.complete&&image.naturalWidth>0));await page.screenshot({path:path.join(output,'comparison-'+light+'.png')});await writeFile(path.join(output,'comparison-'+light+'.html'),html);}
 }finally{await ctx.close();}
}catch(error){await writeFile(path.join(output,'error.json'),JSON.stringify({error:String(error),buildIdentity:identity,completedTrials:trials.map(trial=>trial.id)},null,2)+'\n');throw error;}
finally{await browser.close();}

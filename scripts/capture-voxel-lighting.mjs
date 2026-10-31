// Actual WebGL shader/worker validation in an isolated scene, no game/save mutation or server.
import { build } from 'esbuild';
import { chromium } from '@playwright/test';
import { mkdir,writeFile } from 'node:fs/promises';
const bundle=async entry=>Buffer.from((await build({entryPoints:[entry],bundle:true,write:false,format:'esm',target:'es2022',logLevel:'error'})).outputFiles[0].contents);
const [main,worker]=await Promise.all([bundle('tools/voxel-lighting-lab/scene.mjs'),bundle('src/render/three/voxel-gi.worker.ts')]);
const output='docs/art-audit/voxel-lighting-v1';await mkdir(output,{recursive:true});
const browser=await chromium.launch({channel:'chrome',headless:true});
try{
 const page=await browser.newPage({viewport:{width:900,height:600},serviceWorkers:'block'}),errors=[];
 page.on('pageerror',e=>errors.push(e.message));page.on('console',m=>{if(m.type()==='error')errors.push(m.text());});
 await page.route('**/*',route=>{const url=new URL(route.request().url());
  if(url.origin!=='http://voxel-lighting.test')return route.abort();
  if(url.pathname==='/main.js')return route.fulfill({body:main,contentType:'text/javascript'});
  if(url.pathname==='/voxel-gi.worker.ts')return route.fulfill({body:worker,contentType:'text/javascript'});
  return route.fulfill({contentType:'text/html',body:'<!doctype html><body style="margin:0"><script type="module" src="/main.js"></script></body>'});
 });
 await page.goto('http://voxel-lighting.test/',{waitUntil:'commit'});await page.waitForFunction(()=>window.lab?.state==='ready',undefined,{timeout:60000});
 const transport=await page.evaluate(()=>window.lab.stats);
 await page.evaluate(()=>window.lab.effects(false,false));await page.waitForTimeout(120);
 const off=await page.evaluate(()=>window.lab.read());await page.screenshot({path:output+'/lab-bounce-off.png'});
 await page.evaluate(()=>window.lab.effects(true,false));await page.waitForTimeout(120);
 const on=await page.evaluate(()=>window.lab.read());await page.screenshot({path:output+'/lab-bounce-on.png'});
 if(!(on[0]-off[0]>on[1]-off[1]+1))throw Error('Off-screen red emission did not produce a red-biased bounce: '+JSON.stringify({off,on}));
 const previous=await page.evaluate(()=>window.lab.stats.appliedVersion);await page.evaluate(()=>window.lab.setup('closed'));
 await page.waitForFunction(v=>window.lab.state==='ready'&&window.lab.stats.appliedVersion>v,previous,{timeout:60000});
 await page.evaluate(()=>window.lab.effects(false,false));await page.waitForTimeout(120);
 const closedOff=await page.evaluate(()=>window.lab.read());await page.screenshot({path:output+'/lab-room-off.png'});
 await page.evaluate(()=>window.lab.effects(true,true));await page.waitForTimeout(120);
 const closedOn=await page.evaluate(()=>window.lab.read());await page.screenshot({path:output+'/lab-room-on.png'});
 if(!(closedOn.reduce((a,b)=>a+b,0)<closedOff.reduce((a,b)=>a+b,0)*.6))throw Error('Closed-room occlusion did not suppress outside fill: '+JSON.stringify({closedOff,closedOn}));
 if(errors.length)throw Error(errors.join('\n'));
 await writeFile(output+'/lab-review.json',JSON.stringify({offscreenEmitter:true,off,on,closedOff,closedOn,transport,errors,verified:'Actual worker, visibility interpolation and game material shader rendered in WebGL; red source behind camera; camera inside sealed room.'},null,2)+'\n');
 console.log(JSON.stringify({off,on,closedOff,closedOn,errors}));
}finally{await browser.close();}

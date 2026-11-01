import {chromium} from '@playwright/test';
import {mkdir,writeFile} from 'node:fs/promises';
const browser=await chromium.launch({channel:'chrome',headless:true});
const context=await browser.newContext({viewport:{width:1280,height:720},deviceScaleFactor:1});
const page=await context.newPage(),errors=[];
page.on('pageerror',error=>errors.push(error.message));
try{
  await page.goto(process.env.DEMO_URL??'http://127.0.0.1:5398/Fable-Crown/');
  await page.locator('[data-testid="valley-app"][data-ready="true"]').waitFor({timeout:90000});
  const keyboard=[];
  for(let trial=0;trial<12;trial++){
    keyboard.push(await page.evaluate(async trial=>{
      const root=document.querySelector('[data-continuous-x]'),before=root.dataset.continuousX,code=trial%2?'KeyA':'KeyD',start=performance.now();
      window.dispatchEvent(new KeyboardEvent('keydown',{code,bubbles:true}));
      const elapsed=await new Promise(resolve=>{function poll(){if(root.dataset.continuousX!==before)resolve(performance.now()-start);else if(performance.now()-start>2000)resolve(null);else requestAnimationFrame(poll);}requestAnimationFrame(poll);});
      window.dispatchEvent(new KeyboardEvent('keyup',{code,bubbles:true}));return elapsed;
    },trial));await page.waitForTimeout(120);
  }
  const touch={},cdp=await context.newCDPSession(page);
  await cdp.send('Emulation.setTouchEmulationEnabled',{enabled:true});
  for(const size of [{width:390,height:844},{width:844,height:390}]){
    await page.setViewportSize(size);await page.waitForTimeout(500);const samples=[];
    const box=await page.getByRole('group',{name:'Movement joystick'}).boundingBox();
    for(let trial=0;trial<6;trial++){
      await page.evaluate(()=>{
        const stick=document.querySelector('[aria-label="Movement joystick"]'),root=document.querySelector('[data-continuous-x]');
        window.valleyProbe=new Promise(resolve=>stick.addEventListener('pointerdown',()=>{
          const before=root.dataset.continuousX,start=performance.now();
          function poll(){if(root.dataset.continuousX!==before)resolve(performance.now()-start);else if(performance.now()-start>2000)resolve(null);else requestAnimationFrame(poll);}requestAnimationFrame(poll);
        },{once:true,capture:true}));
      });
      await cdp.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{x:box.x+box.width/2+(trial%2?-35:35),y:box.y+box.height/2}]});
      samples.push(await page.evaluate(()=>window.valleyProbe));
      await cdp.send('Input.dispatchTouchEvent',{type:'touchCancel',touchPoints:[]});await page.waitForTimeout(120);
    }
    touch[`${size.width}x${size.height}`]=samples;
  }
  await page.waitForTimeout(2000);
  const metadata=await page.evaluate(()=>{
    const canvas=document.querySelector('canvas'),gl=canvas?.getContext('webgl2'),ext=gl?.getExtension('WEBGL_debug_renderer_info');
    return {userAgent:navigator.userAgent,hardwareConcurrency:navigator.hardwareConcurrency,gpu:ext?gl.getParameter(ext.UNMASKED_RENDERER_WEBGL):null,
      renderer:{...document.querySelector('[data-continuous-x]').dataset}};
  });
  const stats=samples=>{const sorted=samples.filter(n=>n!==null).sort((a,b)=>a-b);return{samplesMs:samples,p50Ms:sorted[Math.floor(sorted.length/2)],p95Ms:sorted[Math.ceil(sorted.length*.95)-1],timeouts:samples.filter(n=>n===null).length};};
  const result={date:new Date().toISOString(),url:page.url(),kind:'Event dispatch/pointerdown to first changed rendered DOM pose, before drawing; not screen-to-photon',
    physicalMobileDevice:false,keyboard:stats(keyboard),touch:Object.fromEntries(Object.entries(touch).map(([key,samples])=>[key,stats(samples)])),metadata,errors};
  await mkdir('docs/performance/valley',{recursive:true});await writeFile('docs/performance/valley/metrics.json',JSON.stringify(result,null,2)+'\n');
  console.log(JSON.stringify({keyboard:result.keyboard,touch:result.touch,errors}));
}finally{await context.close();await browser.close();}

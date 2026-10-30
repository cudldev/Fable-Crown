import { chromium, expect } from '@playwright/test';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
const base='https://cudldev.github.io/Fable-Crown/';
const expected=JSON.parse(await readFile('dist/world-assets.json','utf8'));
const browser=await chromium.launch({channel:'chrome',headless:true});
const context=await browser.newContext({viewport:{width:1280,height:800}});
const page=await context.newPage();const errors=[],external=[],failed=[],retired=[];
page.on('pageerror',e=>errors.push(e.message));
page.on('request',r=>{const u=new URL(r.url());if(u.protocol.startsWith('http')&&u.origin!==new URL(base).origin)external.push(u.href);if(/\/art\/|\/(ink|fitted)\/|alden(?:-ink|-fitted)?\.glb/.test(u.pathname))retired.push(u.href);});
page.on('response',r=>{if(r.status()>=400)failed.push({url:r.url(),status:r.status()});});
try{
const response=await context.request.get(base+'world-assets.json?release='+Date.now());expect(response.ok()).toBe(true);const installed=await response.json();expect(installed.files).toEqual(expected.files);
for(const path of ["art3d/voxel/manifest.json","art3d/terrain/manifest.json"]){const local=JSON.parse(await readFile("dist/"+path,"utf8"));const remote=await (await context.request.get(base+path+"?release="+Date.now())).json();expect(remote.version).toBe(local.version);}
await page.goto(base,{waitUntil:'domcontentloaded'});
const world=page.getByTestId('rpg-world');await expect(world).toHaveAttribute('data-status','ready',{timeout:60000});await expect(world).toHaveAttribute('data-actor-style','pixel-billboard');await expect(world).toHaveAttribute('data-character-style','pixel');await expect(world).toHaveAttribute('data-terrain-source','vox');await expect(world).toHaveAttribute('data-voxel-assets','tree');
await page.getByRole('button',{name:'Open game menu',exact:true}).click();await expect(page.getByRole('button',{name:/Use painterly|Use compatibility|Use 3D test renderer/})).toHaveCount(0);await page.getByRole('button',{name:'Save on device',exact:true}).click();await expect(page.getByRole('status')).toContainText('Chronicle saved');await page.getByRole('button',{name:'Close panel',exact:true}).click();
await mkdir('docs/screenshots',{recursive:true});await page.screenshot({path:'docs/screenshots/voxel-default-pages-desktop.png'});
await page.setViewportSize({width:390,height:844});await expect(world).toHaveAttribute('data-status','ready');expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);await page.screenshot({path:'docs/screenshots/voxel-default-pages-phone.png'});
await expect.poll(()=>page.evaluate(()=>Boolean(navigator.serviceWorker.controller)),{timeout:60000}).toBe(true);const scope=await page.evaluate(async()=>(await navigator.serviceWorker.ready).scope);expect(scope).toBe(base);
await context.setOffline(true);await page.reload({waitUntil:'domcontentloaded'});await expect(world).toHaveAttribute('data-status','ready',{timeout:60000});await expect(world).toHaveAttribute('data-terrain-source','vox');await expect(world).toHaveAttribute('data-actor-style','pixel-billboard');await context.setOffline(false);
expect(errors).toEqual([]);expect(external).toEqual([]);expect(failed).toEqual([]);expect(retired).toEqual([]);
const report={url:base,artVersion:installed.version,desktop:true,phoneViewport:true,offlineReload:true,serviceWorkerScope:scope,errors,external,failed,retiredRequests:retired,verifiedAt:new Date().toISOString()};await writeFile('docs/VOXEL_DEFAULT_PAGES_VERIFICATION.json',JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify(report));
}finally{await browser.close();}

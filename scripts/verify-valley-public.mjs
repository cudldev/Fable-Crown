import {chromium,expect} from '@playwright/test';
import {readFile,mkdir,writeFile} from 'node:fs/promises';
const url='https://cudldev.github.io/Fable-Crown/',before=JSON.parse(await readFile('tmp/public-valley-upgrade/before.json','utf8'));
const context=await chromium.launchPersistentContext('tmp/public-valley-upgrade/profile',{channel:'chrome',headless:true,viewport:{width:1280,height:720}});
try{
  const page=context.pages()[0]??await context.newPage(),errors=[],external=[];page.on('pageerror',e=>errors.push(e.message));
  page.on('request',request=>{const u=new URL(request.url());if(u.protocol.startsWith('http')&&u.origin!==new URL(url).origin)external.push(u.href);});
  const response=await context.request.get(url+'world-assets.json?verify='+Date.now());expect(response.ok()).toBe(true);const manifest=await response.json();
  await page.goto(url);await page.evaluate(async()=>{const registration=await navigator.serviceWorker.ready;await registration.update();});
  const expected=['fable-art-'+manifest.version,'fable-v3-'+manifest.version].sort();
  await expect.poll(()=>page.evaluate(async()=> (await caches.keys()).filter(key=>key.startsWith('fable-')).sort()),{timeout:90000}).toEqual(expected);
  await page.reload({waitUntil:'domcontentloaded'});const root=page.getByTestId('valley-app');await expect(root).toHaveAttribute('data-ready','true',{timeout:90000});await expect(root).toHaveAttribute('data-mode','world');
  const read=key=>page.evaluate(key=>new Promise((resolve,reject)=>{const open=indexedDB.open('fable-crown',1);open.onsuccess=()=>{const db=open.result,get=db.transaction('saves').objectStore('saves').get(key);get.onsuccess=()=>{resolve(get.result);db.close();};get.onerror=()=>reject(get.error);};open.onerror=()=>reject(open.error);}),key);
  await expect.poll(async()=>!!(await read('v6'))).toBe(true);const migrated=await read('v6');
  expect(await read('v5')).toEqual(before.old);
  for(const field of ['inventory','equipment','skills','health','ammo'])expect(migrated.chapter.player[field],field).toEqual(before.old.player[field]);
  expect(migrated.chapter.bank).toEqual(before.old.bank);expect(migrated.chapter.quests).toEqual(before.old.quests);
  await page.screenshot({path:'docs/screenshots/valley-public-desktop.png'});
  for(const viewport of [{width:390,height:844},{width:844,height:390}]){await page.setViewportSize(viewport);await expect(page.getByRole('button',{name:'Follow',exact:true})).toBeVisible();await page.screenshot({path:`docs/screenshots/valley-public-${viewport.width}.png`});}
  const scope=await page.evaluate(async()=> (await navigator.serviceWorker.ready).scope);expect(scope).toBe(url);
  await context.setOffline(true);await page.reload({waitUntil:'domcontentloaded'});await expect(root).toHaveAttribute('data-ready','true',{timeout:90000});await expect(root).toHaveAttribute('data-mode','world');
  const offline=await page.evaluate(async()=>{const m=await(await fetch(new URL('world-assets.json',location.href))).json();return await Promise.all(m.files.map(async file=>{const response=await fetch(new URL(file,location.href));return response.ok&&(await response.arrayBuffer()).byteLength>0;}));});expect(offline.every(Boolean)).toBe(true);
  expect((await read('v6')).chapter.quests).toEqual(before.old.quests);expect(errors).toEqual([]);expect(external).toEqual([]);
  await mkdir('docs/release',{recursive:true});await writeFile('docs/release/valley-public.json',JSON.stringify({url,date:new Date().toISOString(),version:manifest.version,scope,caches:expected,migratedV5:true,oldArchiveUnchanged:true,webglOffline:true,offlineAssets:offline.length,errors,external},null,2));
  console.log(JSON.stringify({verified:true,version:manifest.version,offlineAssets:offline.length,errors,external}));
}finally{await context.setOffline(false);await context.close();}

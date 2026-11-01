import {chromium,expect} from '@playwright/test';
import {readFile,mkdir,writeFile} from 'node:fs/promises';
const url='https://cudldev.github.io/Fable-Crown/';
const previous=await readFile('tmp/public-valley-upgrade/before.json','utf8').then(JSON.parse).catch(()=>({caches:[]}));
const context=await chromium.launchPersistentContext('tmp/public-valley-upgrade/profile',{channel:'chrome',headless:true,viewport:{width:1280,height:720}});
try{
  const page=context.pages()[0]??await context.newPage(),errors=[],external=[];
  page.on('pageerror',e=>errors.push(e.message));page.on('request',request=>{const u=new URL(request.url());if(u.protocol.startsWith('http')&&u.origin!==new URL(url).origin)external.push(u.href);});
  const read=key=>page.evaluate(key=>new Promise((resolve,reject)=>{const open=indexedDB.open('fable-crown',1);open.onsuccess=()=>{const db=open.result,get=db.transaction('saves').objectStore('saves').get(key);get.onsuccess=()=>{resolve(get.result);db.close();};get.onerror=()=>reject(get.error);};open.onerror=()=>reject(open.error);}),key);
  // Neutral document prevents the previous game from running during the update check.
  await page.goto(url+'manifest.webmanifest');const oldKeys=['v3','v4','v5','v6'];
  const old=await Promise.all(oldKeys.map(read));
  const response=await context.request.get(url+'world-assets.json?verify='+Date.now());expect(response.ok()).toBe(true);const manifest=await response.json();
  await page.evaluate(async()=>{await(await navigator.serviceWorker.ready).update();});
  const expected=['fable-art-'+manifest.version,'fable-v3-'+manifest.version].sort();
  await expect.poll(()=>page.evaluate(async()=> (await caches.keys()).filter(key=>key.startsWith('fable-')).sort()),{timeout:90000}).toEqual(expected);
  console.log('Installed target cache '+manifest.version);
  await page.goto(url,{waitUntil:'domcontentloaded'});const root=page.getByTestId('valley-app');
  await expect(root).toHaveAttribute('data-ready','true',{timeout:90000});await expect(root).toHaveAttribute('data-mode','world');
  await expect.poll(async()=>!!(await read('valley-v1'))).toBe(true);const fresh=await read('valley-v1');
  expect(fresh.version).toBe(7);expect(fresh.valley.paid).toBe(0);expect(fresh.chapter.bank).toEqual([]);expect(fresh.chapter.quests.forge.complete).toBe(false);
  expect(fresh.chapter.player.inventory.find(i=>i.itemId==='coins').quantity).toBe(25);
  const sameOld=async()=>{const now=await Promise.all(oldKeys.map(read));expect(JSON.stringify(now)===JSON.stringify(old),'earlier archive keys unchanged').toBe(true);};
  await sameOld();const start=Number(await root.getAttribute('data-player-x'));
  await page.keyboard.down('d');await page.waitForTimeout(250);await page.keyboard.up('d');await expect.poll(async()=>Number(await root.getAttribute('data-player-x'))).toBeGreaterThan(start+.1);
  if(!fresh.valley.home){
    await page.getByRole('button',{name:'Home',exact:true}).click();await page.getByRole('button',{name:'Place free tent',exact:true}).click();
    await page.getByLabel('Placement X').fill('54');await page.getByLabel('Placement Z').fill('155');await page.getByRole('button',{name:'Confirm',exact:true}).click();
    await expect(page.locator('.valley-message')).toContainText('Your tent is ready');
  }
  await expect.poll(async()=>JSON.parse(await page.locator('[data-voxel-object-counts]').getAttribute('data-voxel-object-counts'))['valley-tent']).toBe(1);
  await expect.poll(async()=>!!(await read('valley-v1')).valley.home).toBe(true);
  await page.screenshot({path:'docs/screenshots/valley-public-desktop.png'});
  for(const viewport of [{width:390,height:844},{width:844,height:390}]){await page.setViewportSize(viewport);await expect(page.getByRole('button',{name:'Follow',exact:true})).toBeVisible();await page.screenshot({path:`docs/screenshots/valley-public-${viewport.width}.png`});}
  const scope=await page.evaluate(async()=> (await navigator.serviceWorker.ready).scope);expect(scope).toBe(url);
  await context.setOffline(true);await page.reload({waitUntil:'domcontentloaded'});await expect(root).toHaveAttribute('data-ready','true',{timeout:90000});await expect(root).toHaveAttribute('data-mode','world');
  const offline=await page.evaluate(async()=>{const m=await(await fetch(new URL('world-assets.json',location.href))).json();return await Promise.all(m.files.map(async file=>{const response=await fetch(new URL(file,location.href));return response.ok&&(await response.arrayBuffer()).byteLength>0;}));});
  expect(offline.every(Boolean)).toBe(true);expect((await read('valley-v1')).valley.home).toMatchObject({x:54,z:155});await sameOld();expect(errors).toEqual([]);expect(external).toEqual([]);
  await mkdir('docs/release',{recursive:true});await writeFile('docs/release/valley-public.json',JSON.stringify({url,date:new Date().toISOString(),version:manifest.version,scope,previousCaches:previous.caches,caches:expected,freshFormat:7,oldArchivesUntouched:true,noMigration:true,continuousMovement:true,nativeTentPlaced:true,webglOffline:true,offlineAssets:offline.length,errors,external},null,2));
  console.log(JSON.stringify({verified:true,version:manifest.version,freshFormat:7,offlineAssets:offline.length,errors,external}));
}finally{await context.setOffline(false);await context.close();}

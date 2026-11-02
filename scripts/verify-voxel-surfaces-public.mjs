import {chromium,expect} from '@playwright/test';
import {mkdir,readFile,writeFile} from 'node:fs/promises';
const base='https://cudldev.github.io/Fable-Crown/',before=process.argv.includes('--before');
const profile='tmp/public-valley-upgrade/profile',baseline='tmp/voxel-public-baseline.json';
const context=await chromium.launchPersistentContext(profile,{channel:'chrome',headless:true,viewport:{width:1280,height:720}});
const page=context.pages()[0]??await context.newPage(),errors=[],external=[],ignoredProbeResources=[];
page.on('pageerror',e=>errors.push(e.message));
// A raw manifest probe has no icon link; exclude only its browser-generated root favicon request.
page.on('console',m=>{if(m.type()==='error'&&m.location().url==='https://cudldev.github.io/favicon.ico'&&page.url().endsWith('manifest.webmanifest')){ignoredProbeResources.push(m.location().url);return;}if(m.type()==='error'||/GL_INVALID|INVALID_OPERATION|shader.*error/i.test(m.text()))errors.push(m.text());});
page.on('request',r=>{const u=new URL(r.url());if(u.protocol.startsWith('http')&&u.origin!==new URL(base).origin)external.push(u.href);});
page.on('response',r=>{if(r.status()>=400)console.log('HTTP',r.status(),r.url());});
page.on('console',m=>{if(m.type()==='error')console.log('CONSOLE',m.text(),m.location());});
const read=()=>page.evaluate(()=>new Promise((resolve,reject)=>{const open=indexedDB.open('fable-crown',1);open.onerror=()=>reject(open.error);open.onsuccess=()=>{const db=open.result;if(!db.objectStoreNames.contains('saves')){db.close();resolve({});return;}const result={},store=db.transaction('saves').objectStore('saves'),cursor=store.openCursor();cursor.onerror=()=>reject(cursor.error);cursor.onsuccess=()=>{const c=cursor.result;if(c){result[c.key]=c.value;c.continue();}else{db.close();resolve(result);}};};}));
const progress=s=>({inventory:s.chapter.player.inventory,skills:s.chapter.player.skills,equipment:s.chapter.player.equipment,bank:s.chapter.bank,quests:s.chapter.quests,grave:s.chapter.grave,home:s.valley.home,paid:s.valley.paid,furniture:s.valley.furniture,plants:s.valley.plants,ground:s.valley.ground});
try{
 if(before){
  await page.goto(base,{waitUntil:'domcontentloaded'});
  await expect(page.getByTestId('valley-app')).toHaveAttribute('data-ready','true',{timeout:90000});
  await page.getByRole('button',{name:'Camera',exact:true}).click();
  await page.getByRole('button',{name:'Save on this device',exact:true}).click();
  await expect.poll(async()=>Boolean((await read())['valley-v1'])).toBe(true);
  await page.goto(base+'manifest.webmanifest');
  const state=await read(),cacheKeys=await page.evaluate(()=>caches.keys());
  const version=(await(await context.request.get(base+'world-assets.json?baseline='+Date.now())).json()).version;
  await writeFile(baseline,JSON.stringify({state,cacheKeys,version},null,2));
  console.log(JSON.stringify({baseline:true,version,cacheKeys,home:state['valley-v1'].valley.home,archiveKeys:Object.keys(state)}));
 }else{
  const old=JSON.parse(await readFile(baseline,'utf8'));
  await page.goto(base+'manifest.webmanifest');
  const response=await context.request.get(base+'world-assets.json?verify='+Date.now());expect(response.ok()).toBe(true);const manifest=await response.json();
  const publicHtml=await(await context.request.get(base+'?verify='+Date.now())).text(),localHtml=await readFile('dist/index.html','utf8');
  const entry=html=>html.match(/src="([^" ]*assets\/index-[^" ]+\.js)"/)?.[1];
  expect(entry(publicHtml)).toBeTruthy();expect(entry(publicHtml)).toBe(entry(localHtml));
  await page.evaluate(async()=>{await(await navigator.serviceWorker.ready).update();});
  const cachesExpected=['fable-art-'+manifest.version,'fable-v3-'+manifest.version].sort();
  await expect.poll(()=>page.evaluate(async()=>(await caches.keys()).filter(k=>k.startsWith('fable-')).sort()),{timeout:120000}).toEqual(cachesExpected);
  await page.goto(base,{waitUntil:'domcontentloaded'});
  const app=page.getByTestId('valley-app'),world=page.getByTestId('rpg-world');
  await expect(app).toHaveAttribute('data-ready','true',{timeout:90000});
  await expect(world).toHaveAttribute('data-status','ready',{timeout:90000});
  await expect(world).toHaveAttribute('data-voxel-surface-strength','0.2');
  await expect(world).toHaveAttribute('data-voxel-surface-variation','1');
  await expect(world).toHaveAttribute('data-voxel-surface-cell-scale','1');
  await page.getByRole('button',{name:'Camera',exact:true}).click();
  const menu=page.getByRole('dialog');
  await expect(menu.getByRole('slider',{name:'Voxel depth',exact:true})).toHaveValue('0.2');
  await expect(menu.getByRole('slider',{name:'Voxel variation',exact:true})).toHaveValue('1');
  await expect(menu.getByRole('slider',{name:'Voxel distance blend',exact:true})).toHaveCount(0);
  await menu.getByRole('button',{name:'Save on this device',exact:true}).click();
  await menu.getByRole('button',{name:'Close',exact:true}).click();
  const now=await read();expect(progress(now['valley-v1'])).toEqual(progress(old.state['valley-v1']));
  for(const key of Object.keys(old.state).filter(k=>!k.startsWith('valley-v1')))expect(now[key],key).toEqual(old.state[key]);
  await mkdir('docs/screenshots/voxel-surface-detail/public',{recursive:true});
  await page.screenshot({path:'docs/screenshots/voxel-surface-detail/public/cached-upgrade.png'});
  const scope=await page.evaluate(async()=>(await navigator.serviceWorker.ready).scope);expect(scope).toBe(base);
  const glError=await page.getByTestId('three-canvas').evaluate(canvas=>canvas.getContext('webgl2').getError());expect(glError).toBe(0);
  await context.setOffline(true);await page.reload({waitUntil:'domcontentloaded'});
  await expect(app).toHaveAttribute('data-ready','true',{timeout:90000});await expect(world).toHaveAttribute('data-status','ready',{timeout:90000});
  await expect(world).toHaveAttribute('data-voxel-surface-strength','0.2');
  const offline=await page.evaluate(async()=>{const m=await(await fetch(new URL('world-assets.json',location.href))).json();return await Promise.all(m.files.map(async f=>{const r=await fetch(new URL(f,location.href));return r.ok&&(await r.arrayBuffer()).byteLength>0;}));});
  expect(offline.every(Boolean)).toBe(true);expect(errors).toEqual([]);expect(external).toEqual([]);
  const report={url:base,verifiedAt:new Date().toISOString(),version:manifest.version,previousVersion:old.version,runtimeEntry:entry(publicHtml),runtimeMatchesLocal:true,scope,cacheKeys:cachesExpected,defaults:{depth:.2,variation:1},fineGrid:true,progressPreserved:true,archiveKeysPreserved:Object.keys(old.state).filter(k=>!k.startsWith('valley-v1')),webglOffline:true,offlineAssets:offline.length,glError,errors,external,ignoredProbeResources};
  await mkdir('docs/release',{recursive:true});await writeFile('docs/release/voxel-surfaces-public.json',JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify(report));
 }
}finally{await context.setOffline(false);await context.close();}

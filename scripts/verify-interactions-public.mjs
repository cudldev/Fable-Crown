import {chromium,expect} from '@playwright/test';
import {mkdir,writeFile} from 'node:fs/promises';
const url='https://cudldev.github.io/Fable-Crown/';
const browser=await chromium.launch({channel:'chrome',headless:true});
try{
  // A separate test context never imports a fixture over the preserved upgrade profile.
  const context=await browser.newContext({viewport:{width:390,height:844},hasTouch:true,isMobile:true});
  const page=await context.newPage(),errors=[],external=[];
  await page.addInitScript(()=>{const pad={buttons:Array.from({length:17},()=>({pressed:false,value:0,touched:false})),axes:[0,0,0,0]};window.publicTestPad=pad;Object.defineProperty(navigator,'getGamepads',{value:()=>[{...pad,index:0,connected:true,mapping:'standard',id:'Public verification pad',timestamp:performance.now()}]});});
  page.on('pageerror',e=>errors.push(e.message));page.on('request',r=>{const target=new URL(r.url());if(target.protocol.startsWith('http')&&target.origin!==new URL(url).origin)external.push(target.href);});
  const app=page.getByTestId('valley-app'),dialog=page.getByRole('dialog'),world=page.getByTestId('rpg-world');
  await page.goto(url);await expect(app).toHaveAttribute('data-ready','true',{timeout:90000});
  await expect(app).toHaveAttribute('data-input-mode','touch');await expect(page.locator('[data-action-controls]')).toBeVisible();
  await page.locator('.action-interact').tap();await expect(dialog).toHaveAttribute('data-menu-panel','interaction');
  await expect(page.locator('.valley-hud')).toBeHidden();await expect(page.getByTestId('fps-indicator')).toBeHidden();
  await expect(dialog.getByRole('button',{name:'Leave',exact:true})).toHaveCount(0);
  await expect(world).toHaveAttribute('data-interaction-camera','active',{timeout:10000});
  await mkdir('docs/screenshots/valley-interactions',{recursive:true});
  await page.screenshot({path:'docs/screenshots/valley-interactions/public-conversation.png'});
  await dialog.getByRole('button',{name:'Continue conversation',exact:true}).tap();await dialog.getByRole('button',{name:'Just saying hello.',exact:true}).tap();await dialog.getByRole('button',{name:'Continue conversation',exact:true}).tap();await expect(dialog).toHaveCount(0);
  await expect(world).toHaveAttribute('data-interaction-camera','none',{timeout:10000});
  await page.getByRole('button',{name:'Menu',exact:true}).tap();await dialog.getByRole('button',{name:'Settings',exact:true}).tap();await dialog.getByRole('button',{name:'Save on this device',exact:true}).tap();
  const fixture=await page.evaluate(()=>new Promise((resolve,reject)=>{const request=indexedDB.open('fable-crown',1);request.onerror=()=>reject(request.error);request.onsuccess=()=>{const db=request.result,get=db.transaction('saves').objectStore('saves').get('valley-v1');get.onsuccess=()=>{resolve(get.result);db.close();};get.onerror=()=>reject(get.error);};}));
  Object.assign(fixture.action.player,{x:69,z:140,swing:0,blocking:false,facingX:0,facingZ:-1});
  for(const key of ['position','previousPosition'])fixture.chapter.player[key]={...fixture.chapter.player[key],x:69,y:140};fixture.chapter.player.path=[];fixture.chapter.player.movement=null;fixture.chapter.player.action=null;
  fixture.chapter.player.inventory.push({itemId:'valley-plank',quantity:2});fixture.savedAt=Date.now();fixture.chapter.savedAt=fixture.savedAt;
  await page.getByLabel('Import valley archive').setInputFiles({name:'public-interaction-fixture.json',mimeType:'application/json',buffer:Buffer.from(JSON.stringify(fixture))});await expect(dialog).toContainText('Chapter restored');await dialog.getByRole('button',{name:'Close',exact:true}).tap();
  await page.locator('.action-interact').tap();await dialog.getByRole('button',{name:'Craft something',exact:true}).tap();
  await dialog.getByTestId('recipe-grid').locator('[data-recipe-id="valley-stool"]').tap();
  await expect(dialog.getByTestId('recipe-grid')).toBeVisible();await expect(dialog.getByTestId('recipe-detail')).toContainText('Handmade stool');
  await expect(dialog.getByTestId('recipe-grid').locator('[data-recipe-id="valley-stool"] img')).toBeVisible();
  const sizes=[];
  for(const viewport of [{width:390,height:844},{width:844,height:390},{width:1280,height:720}]){
    await page.setViewportSize(viewport);await expect(dialog.getByTestId('craft-primary')).toBeVisible();
    const ratio=await dialog.getByTestId('recipe-detail').evaluate(el=>{const r=el.getBoundingClientRect();return innerWidth>innerHeight?r.width/innerWidth:r.height/innerHeight;});expect(ratio).toBeGreaterThan(.28);expect(ratio).toBeLessThan(.4);sizes.push({...viewport,infoRatio:ratio});
    await page.screenshot({path:`docs/screenshots/valley-interactions/public-crafting-${viewport.width}.png`});
  }
  await dialog.getByTestId('craft-primary').click();await expect(dialog.getByTestId('craft-status')).toContainText('+1 Handmade stool',{timeout:10000});
  await expect(page.locator('.valley-hud')).toBeHidden();
  await dialog.getByRole('button',{name:'Back',exact:true}).click();await dialog.getByRole('button',{name:'Step away',exact:true}).click();
  await page.evaluate(()=>{window.publicTestPad.buttons[13]={pressed:true,touched:true,value:1};});
  await expect(app).toHaveAttribute('data-input-mode','controller');await expect(page.locator('[data-action-controls]')).toHaveCount(0);
  await page.evaluate(()=>{window.publicTestPad.buttons[13]={pressed:false,touched:false,value:0};});await page.touchscreen.tap(20,20);
  await expect(app).toHaveAttribute('data-input-mode','touch');await expect(page.locator('[data-action-controls]')).toBeVisible();
  const version=(await(await context.request.get(url+'world-assets.json?verify='+Date.now())).json()).version;
  expect(errors).toEqual([]);expect(external).toEqual([]);
  await mkdir('docs/release',{recursive:true});const report={url,date:new Date().toISOString(),version,conversation:true,terminalEnding:true,exclusiveHud:true,encounterCamera:true,fullScreenCombinedCrafting:true,nativePreview:true,realCraftCompletion:true,touchControllerHandover:true,viewports:sizes,errors,external};
  await writeFile('docs/release/interactions-public.json',JSON.stringify(report,null,2));console.log(JSON.stringify(report));
}finally{await browser.close();}

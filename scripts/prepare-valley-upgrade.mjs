import {chromium,expect} from '@playwright/test';
import {mkdir,writeFile} from 'node:fs/promises';
const url='https://cudldev.github.io/Fable-Crown/';
await mkdir('tmp/public-valley-upgrade',{recursive:true});
const context=await chromium.launchPersistentContext('tmp/public-valley-upgrade/profile',{channel:'chrome',headless:true,viewport:{width:1280,height:720}});
try{
  const page=context.pages()[0]??await context.newPage();await page.goto(url);
  await expect(page.getByTestId('rpg-world')).toHaveAttribute('data-status','ready',{timeout:90000});
  await expect.poll(()=>page.evaluate(()=>!!navigator.serviceWorker.controller)).toBe(true);
  await page.getByRole('button',{name:'Open game menu',exact:true}).click();
  await page.getByRole('button',{name:'Save on device',exact:true}).click();
  await expect(page.getByRole('status')).toContainText('Chronicle saved');
  const old=await page.evaluate(()=>new Promise((resolve,reject)=>{const open=indexedDB.open('fable-crown',1);open.onsuccess=()=>{const db=open.result,get=db.transaction('saves').objectStore('saves').get('v5');get.onsuccess=()=>{resolve(get.result);db.close();};get.onerror=()=>reject(get.error);};open.onerror=()=>reject(open.error);}));
  // Leave the application first, so its worker cannot race the fixture write.
  await page.goto(url+'manifest.webmanifest');
  Object.assign(old.control,{autoplay:false,waiting:true,active:null,queue:[],thought:null,goal:null,source:null,thinkingUntil:1e9});
  old.player.path=[];old.player.movement=null;old.player.action=null;old.savedAt=Date.now();
  Object.assign(old.quests.forge,{accepted:true,complete:true,stageId:'complete'});
  await page.evaluate(value=>new Promise((resolve,reject)=>{const open=indexedDB.open('fable-crown',1);open.onsuccess=()=>{const db=open.result,tx=db.transaction('saves','readwrite');tx.objectStore('saves').put(value,'v5');tx.oncomplete=()=>{resolve();db.close();};tx.onerror=()=>reject(tx.error);};open.onerror=()=>reject(open.error);}),old);
  const caches=await page.evaluate(()=>window.caches.keys());
  await writeFile('tmp/public-valley-upgrade/before.json',JSON.stringify({old,caches,date:new Date().toISOString()},null,2));
  console.log(JSON.stringify({prepared:true,caches,version:old.version}));
}finally{await context.close();}

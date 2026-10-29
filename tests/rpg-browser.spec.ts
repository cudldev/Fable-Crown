import {test,expect} from '@playwright/test';
import {createGame} from '../src/simulation';
test('tile chapter preserves the earlier archive and renders a selectable isometric world',async({page})=>{
 const errors:string[]=[];page.on('pageerror',e=>errors.push(e.message));
 await page.goto('./?chapter=3');await expect(page.getByTestId('rpg-world')).toBeVisible();
 await page.evaluate(value=>new Promise<void>((resolve,reject)=>{const r=indexedDB.open('fable-crown',1);r.onsuccess=()=>{const tx=r.result.transaction('saves','readwrite');tx.objectStore('saves').put(value,'v1');tx.oncomplete=()=>{r.result.close();resolve();};tx.onerror=()=>reject(tx.error);};}),createGame(Date.now()));
 await page.reload();await expect(page.getByTestId('rpg-world')).toBeVisible();
 await page.getByRole('button',{name:'Open game menu'}).click();await expect(page.getByRole('button',{name:'Export archived chapter'})).toBeVisible();
 await page.getByRole('button',{name:'Save on device'}).click();await expect(page.getByRole('status')).toContainText('Chronicle saved');
 const data=await page.evaluate(()=>new Promise<{old:number;fresh:number}>((resolve,reject)=>{const r=indexedDB.open('fable-crown',1);r.onsuccess=()=>{const store=r.result.transaction('saves').objectStore('saves'),a=store.get('v1'),b=store.get('v3');b.onsuccess=()=>{resolve({old:a.result.version,fresh:b.result.version});r.result.close();};b.onerror=()=>reject(b.error);};}));expect(data).toEqual({old:2,fresh:3});
 await page.getByRole('button',{name:'Close panel'}).click();await page.getByRole('button',{name:'Toggle tile grid'}).click();await expect(page.getByRole('button',{name:'Toggle tile grid'})).toHaveAttribute('aria-pressed','true');
 await page.getByRole('button',{name:'Open destinations'}).click();await page.getByRole('region',{name:'world panel'}).getByRole('button',{name:/Oakrest square/}).click();await expect(page.getByRole('region',{name:'Object actions'})).toBeVisible();await page.getByRole('button',{name:'Close actions'}).click();
 await page.screenshot({path:'docs/screenshots/rpg-stage1-desktop.png'});
 await page.setViewportSize({width:390,height:844});await expect(page.getByTestId('rpg-world')).toBeVisible();expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);await page.screenshot({path:'docs/screenshots/rpg-stage1-portrait.png'});
 expect(errors).toEqual([]);
});

import {chromium} from '@playwright/test';
import {readFile,mkdir,writeFile} from 'node:fs/promises';
import path from 'node:path';
const [asset='recipe-system-v1',a='oak-03',b='barrel-04']=process.argv.slice(2);
if(![asset,a,b].every(s=>/^[a-zA-Z0-9-]+$/.test(s)))throw Error('Invalid local comparison');
const root=path.resolve('.'),origin='http://voxel-study.test',output=path.join(root,'assets/explorations/voxel',asset,`comparison-${a}-${b}`);
await mkdir(output,{recursive:true});
const browser=await chromium.launch({channel:'chrome',headless:true});
try{
 const page=await browser.newPage({viewport:{width:1280,height:900},deviceScaleFactor:1,serviceWorkers:'block'}),errors=[],external=[];
 page.on('pageerror',e=>errors.push(e.message));page.on('request',r=>{if(new URL(r.url()).origin!==origin)external.push(r.url());});
 await page.route('**/*',async route=>{
  const url=new URL(route.request().url()),file=path.resolve(root,'.'+decodeURIComponent(url.pathname));
  if(url.origin!==origin||!file.startsWith(root+path.sep))return route.abort();
  try{await route.fulfill({status:200,body:await readFile(file),contentType:({'.html':'text/html','.js':'text/javascript','.json':'application/json','.glb':'model/gltf-binary'})[path.extname(file)]||'application/octet-stream'});}
  catch{await route.fulfill({status:404,body:'Missing local file'});}
 });
 await page.goto(`${origin}/tools/voxel-recipes/compare.html?asset=${asset}&jobs=${a},${b}`);
 await page.waitForFunction(()=>window.voxelCompare?.ready,{timeout:20000});
 const report=await page.evaluate(()=>({assets:window.voxelCompare.assets}));
 for(const view of ['iso','front']){
  await page.evaluate(v=>window.voxelCompare.view(v),view);await page.waitForTimeout(100);
  await page.screenshot({path:path.join(output,view+'.png')});
 }
 await page.evaluate(()=>{window.voxelCompare.format('glb');window.voxelCompare.view('iso');});await page.waitForTimeout(100);
 await page.screenshot({path:path.join(output,'glb.png')});
 if(errors.length||external.length)throw Error(JSON.stringify({errors,external}));
 await writeFile(path.join(output,'review.json'),JSON.stringify({...report,errors,externalRequests:external,sharedCamera:true,individuallyScaled:false},null,2)+'\n');
 console.log(JSON.stringify(report,null,2));
}finally{await browser.close();}

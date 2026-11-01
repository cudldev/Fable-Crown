import { expect, test, type Page } from "@playwright/test";
import { mkdir, writeFile } from "node:fs/promises";
import { createRpg } from "../src/rpg/engine";
import { WORLD, interactionTiles } from "../src/rpg/world";
import type { RpgState } from "../src/rpg/types";

const output="docs/performance/voxel-static";
const expected={tree:240,anvil:3,supplies:7,"ore-copper":12,"ore-tin":6,"ore-iron":6,"ore-coal":6};
async function restore(page:Page,state:RpgState) {
  await page.getByRole("button",{name:"Open game menu",exact:true}).click();
  await page.locator('input[type="file"]').setInputFiles({name:"static-mesh-forest.json",mimeType:"application/json",buffer:Buffer.from(JSON.stringify(state))});
  await expect(page.getByRole("status")).toContainText("Chronicle restored");await page.getByRole("button",{name:"Close panel",exact:true}).click();
}
async function settled(page:Page) {
  const world=page.getByTestId("rpg-world");
  await expect(world).toHaveAttribute("data-voxel-queued","0",{timeout:60000});
  await expect(world).toHaveAttribute("data-voxel-transitions","0",{timeout:60000});
  return page.evaluate(async()=>{
    await new Promise<void>(resolve=>requestAnimationFrame(()=>resolve()));
    const canvas=document.querySelector<HTMLCanvasElement>('[data-testid="three-canvas"]')!,gl=canvas.getContext("webgl2")!;
    return {counters:{...document.querySelector<HTMLElement>('[data-testid="rpg-world"]')!.dataset},glError:gl.getError()};
  });
}

test("the real game reuses baked meshes through camera changes, harvest, phone layouts and offline startup",async({page,context})=>{
  test.setTimeout(210000);await mkdir(output,{recursive:true});
  const errors:string[]=[],external:string[]=[],workers:string[]=[],nativeRequests:string[]=[];
  page.on("pageerror",error=>errors.push(error.message));page.on("console",message=>{if(message.type()==="error")errors.push(message.text());});
  page.on("worker",worker=>workers.push(worker.url()));
  page.on("request",request=>{const url=new URL(request.url());if(/\.vox$|\/tiles\.bin$/.test(url.pathname))nativeRequests.push(url.href);if(url.protocol.startsWith("http")&&page.url().startsWith("http")&&url.origin!==new URL(page.url()).origin)external.push(url.href);});
  await page.setViewportSize({width:1280,height:800});await page.goto("./?chapter=legacy&renderer=3d");
  const world=page.getByTestId("rpg-world"),canvas=page.getByTestId("three-canvas");
  await expect(world).toHaveAttribute("data-status","ready",{timeout:120000});
  await expect(world).toHaveAttribute("data-voxel-renderer","shared-static-meshes");
  await expect.poll(async()=>JSON.parse((await world.getAttribute("data-voxel-object-counts"))!)).toEqual(expected);
  const state=createRpg(Date.now(),8128),tree=WORLD.objects.filter(object=>object.kind==="tree").sort((a,b)=>Math.hypot(a.position.x-45,a.position.y-87)-Math.hypot(b.position.x-45,b.position.y-87))[0];
  const position=interactionTiles(tree,WORLD)[0];
  Object.assign(state.control,{autoplay:false,waiting:true,goal:null,active:null,source:null,queue:[],thought:null,thinkingUntil:1e9});
  Object.assign(state.player,{position,previousPosition:{...position},path:[],movement:null,action:null});
  await restore(page,state);
  await page.getByRole("button",{name:"Follow Alden",exact:true}).click();await page.getByRole("button",{name:"Day lighting",exact:true}).click();
  await expect(world).toHaveAttribute("data-camera-x",position.x.toFixed(2));await expect(world).toHaveAttribute("data-camera-y",position.y.toFixed(2));
  await expect.poll(async()=>Number(await world.getAttribute("data-voxel-native-trees")),{timeout:60000}).toBeGreaterThan(0);
  const initial=await settled(page),builds=Number(initial.counters.voxelTemplateBuilds),bytes=Number(initial.counters.voxelGeometryBytes);
  expect(builds).toBeGreaterThan(0);expect(bytes).toBeGreaterThan(0);
  expect(Number(initial.counters.voxelEquivalentCells)).toBeGreaterThan(Number(initial.counters.voxelInstances)*10);
  expect(Number(initial.counters.voxelShadowTriangles)).toBeGreaterThan(0);
  expect(Number(initial.counters.voxelShadowTriangles)).toBeLessThan(Number(initial.counters.voxelColorTriangles));
  await page.screenshot({path:`${output}/runtime-forest.png`});
  const views=[];
  for(const deltaY of [1400,-1400,1400,-1400]) {
    await canvas.dispatchEvent("wheel",{deltaY,bubbles:true});
    await expect(world).toHaveAttribute("data-camera-zoom",deltaY>0?"0.7500":"2.0000");
    const view=await settled(page);expect(Number(view.counters.voxelTemplateBuilds)).toBe(builds);expect(Number(view.counters.voxelGeometryBytes)).toBe(bytes);views.push(view);
  }
  await page.getByRole("button",{name:"World overview",exact:true}).click();
  await expect.poll(async()=>Number(await world.getAttribute("data-camera-span"))).toBeGreaterThan(100);
  const overview=await settled(page);expect(Number(overview.counters.voxelTemplateBuilds)).toBe(builds);
  expect(Number(overview.counters.voxelGeometryBytes)).toBe(bytes);await page.screenshot({path:`${output}/runtime-overview.png`});
  await page.getByRole("button",{name:"Follow Alden",exact:true}).click();
  await expect.poll(async()=>Number(await world.getAttribute("data-camera-span"))).toBeLessThan(40);await settled(page);

  const depleted=structuredClone(state);
  for(const resource of Object.values(depleted.resources)){resource.available=false;resource.respawnAt=1e9;}
  await restore(page,depleted);await expect.poll(async()=>Number(await world.getAttribute("data-gi-depleted")),{timeout:60000}).toBeGreaterThan(Number(initial.counters.giDepleted));
  // Queue/counter publication can still show the previous settled view immediately
  // after import. Observe the actual geometry change before sampling it.
  await expect.poll(async()=>Number(await world.getAttribute("data-voxel-equivalent-cells")),{timeout:60000}).toBeLessThan(Number(initial.counters.voxelEquivalentCells));
  const harvested=await settled(page);expect(Number(harvested.counters.voxelTemplateBuilds)).toBe(builds);
  expect(Number(harvested.counters.voxelEquivalentCells)).toBeLessThan(Number(initial.counters.voxelEquivalentCells));
  await page.screenshot({path:`${output}/runtime-harvested.png`});
  await restore(page,state);await expect.poll(async()=>Number(await world.getAttribute("data-gi-depleted")),{timeout:60000}).toBe(0);
  const restored=await settled(page);expect(Number(restored.counters.voxelTemplateBuilds)).toBe(builds);
  const phones=[];
  for(const viewport of [{width:390,height:844},{width:844,height:390}]) {
    await page.setViewportSize(viewport);const sample=await settled(page);phones.push({viewport,...sample});
    expect(Number(sample.counters.voxelTemplateBuilds)).toBe(builds);expect(Number(sample.counters.voxelGeometryBytes)).toBe(bytes);
    expect(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth+1)).toBe(false);
    await page.screenshot({path:`${output}/runtime-${viewport.width}.png`});
  }
  await page.getByRole("button",{name:"Open game menu",exact:true}).click();await page.getByRole("button",{name:"Save on device",exact:true}).click();
  await expect(page.getByRole("status")).toContainText("Chronicle saved");await page.getByRole("button",{name:"Close panel",exact:true}).click();
  const build=await page.evaluate(async()=>await(await fetch(new URL("world-assets.json",location.href))).json());
  await page.evaluate(async()=>{await navigator.serviceWorker.ready;});
  await expect.poll(()=>page.evaluate(()=>!!navigator.serviceWorker.controller),{timeout:60000}).toBe(true);
  const decoder=workers.find(url=>/voxel-bake\.worker-/.test(url));expect(decoder).toBeTruthy();
  expect(workers.some(url=>/voxel-assets\.worker-/.test(url))).toBe(false);
  expect(nativeRequests).toEqual([]);
  expect(build.files.some((file:string)=>/\.vox(?:\?|$)|tiles\.bin/.test(file))).toBe(false);
  expect(build.files.some((file:string)=>file.includes("voxel/meshes.bin?v="))).toBe(true);
  expect(build.files.some((file:string)=>file.includes("terrain/surface.bin?v="))).toBe(true);
  expect(await page.evaluate(async url=>!!await caches.match(url),decoder!)).toBe(true);
  await context.setOffline(true);await page.reload();
  await expect(world).toHaveAttribute("data-status","ready",{timeout:120000});
  await expect(world).toHaveAttribute("data-voxel-renderer","shared-static-meshes");
  await expect.poll(async()=>JSON.parse((await world.getAttribute("data-voxel-object-counts"))!)).toEqual(expected);
  const offline=await settled(page);
  expect(Number(offline.counters.voxelTemplateBuilds)).toBe(builds);
  for(const sample of [initial,...views,overview,harvested,restored,...phones,offline])expect(sample.glError).toBe(0);
  expect(errors).toEqual([]);expect(external).toEqual([]);expect(nativeRequests).toEqual([]);
  await writeFile(`${output}/runtime-review.json`,JSON.stringify({build:build.version,initial,views,overview,harvested,restored,phones,offline,workers,errors,external,nativeRequests,
    note:"Actual production static-mesh renderer/native bindings, stable geometry cache through zoom/overview/harvest, phone orientations and cached worker restart offline. Geometry/whole-object counters are distinct from voxel-equivalent LOD budgets. Functional GPU checks; no physical-phone or frame-rate guarantee."},null,2));
});

test("held camera drags preserve wheel zoom and rapid wheel events accumulate",async({page,context})=>{
  test.setTimeout(120000);await mkdir(output,{recursive:true});
  const cdp=await context.newCDPSession(page);await cdp.send("Emulation.setCPUThrottlingRate",{rate:4});
  await page.setViewportSize({width:1280,height:800});await page.goto("./?chapter=legacy&renderer=3d");
  const world=page.getByTestId("rpg-world"),canvas=page.getByTestId("three-canvas");
  await expect(world).toHaveAttribute("data-status","ready",{timeout:90000});
  await expect(world).toHaveAttribute("data-camera-zoom","2.0000");
  const start=await canvas.evaluate(element=>{
    const b=element.getBoundingClientRect();
    for(const [x,y] of [[.5,.43],[.45,.35],[.6,.45],[.5,.6]]){
      const point={x:b.x+b.width*x,y:b.y+b.height*y},hit=document.elementFromPoint(point.x,point.y);
      if(hit===element||hit?.closest("[data-three-selection]"))return point;
    }
    throw Error("No exposed point for mixed camera input");
  });
  await page.mouse.move(start.x,start.y);await page.mouse.down();
  let samples:{frame:number;zoom:number;x:number;y:number}[];
  try {
    samples=await page.evaluate(async start=>{
      const canvas=document.querySelector<HTMLCanvasElement>('[data-testid="three-canvas"]')!,world=document.querySelector<HTMLElement>('[data-testid="rpg-world"]')!,samples=[];
      for(let frame=0;frame<90;frame++){
        await new Promise(requestAnimationFrame);
        canvas.dispatchEvent(new PointerEvent("pointermove",{bubbles:true,pointerId:1,pointerType:"mouse",buttons:1,clientX:start.x+20+Math.sin(frame*.08)*25,clientY:start.y+Math.sin(frame*.05)*10}));
        if(frame===0)canvas.dispatchEvent(new WheelEvent("wheel",{bubbles:true,cancelable:true,deltaY:1400}));
        samples.push({frame,zoom:Number(world.dataset.cameraZoom),x:Number(world.dataset.cameraX),y:Number(world.dataset.cameraY)});
      }
      return samples;
    },start);
  } finally {await page.mouse.up();}
  await canvas.dispatchEvent("wheel",{deltaY:-1400,bubbles:true});
  await expect(world).toHaveAttribute("data-camera-zoom","2.0000");
  // All three events share one task, so each must multiply the queued current
  // camera rather than replace it with the same old snapshot.
  await canvas.evaluate(element=>{for(let i=0;i<3;i++)element.dispatchEvent(new WheelEvent("wheel",{bubbles:true,cancelable:true,deltaY:100}));});
  const accumulated=(2*Math.exp(-.0015*300)).toFixed(4);
  let burstZoom="";
  try {await expect(world).toHaveAttribute("data-camera-zoom",accumulated);}
  finally {
    burstZoom=(await world.getAttribute("data-camera-zoom"))!;
    await writeFile(`${output}/runtime-mixed-input.json`,JSON.stringify({samples,expectedBurstZoom:accumulated,burstZoom,note:"Held pan and wheel in one animation frame, continued drag, then three wheel events in one task. CPU4x host emulation; functional camera-state checks."},null,2));
    await cdp.detach();
  }
  const firstZoomed=samples.findIndex(sample=>sample.zoom===.75);
  expect(firstZoomed,"wheel change must reach the rendered camera during the held drag").toBeGreaterThanOrEqual(0);
  expect(samples.slice(firstZoomed).map(sample=>sample.zoom),"later pan events must preserve the new zoom").not.toContain(2);
  expect(new Set(samples.map(sample=>`${sample.x}:${sample.y}`)).size).toBeGreaterThan(2);
});

import {expect,test} from "@playwright/test";
import {createValleySave} from "../src/valley/save";
import {tile} from "../src/rpg/world";

// Local WebGL regression: moving neighbours must not clear the grass buffers.
test("grass and static props stay cached away from camp while neighbours move and camera windows stream",async({page})=>{
  const errors:string[]=[];page.on("pageerror",error=>errors.push(error.message));
  await page.setViewportSize({width:1280,height:720});await page.goto("./?chapter=valley");
  const app=page.getByTestId("valley-app"),world=page.getByTestId("rpg-world"),dialog=page.getByRole("dialog");
  await expect(app).toHaveAttribute("data-ready","true",{timeout:90000});
  const campUploads=Number(await world.getAttribute("data-foliage-uploads"));
  const save=createValleySave(Date.now()),x=40,z=168;
  Object.assign(save.action.player,{x,z,facingX:0,facingZ:1});
  Object.assign(save.chapter.player,{position:tile(x,z),previousPosition:tile(x,z),path:[],movement:null,action:null});
  await page.getByRole("button",{name:"Menu",exact:true}).click();await dialog.getByRole("button",{name:"Settings",exact:true}).click();
  await page.getByLabel("Import valley archive").setInputFiles({name:"grass-fixture.json",mimeType:"application/json",buffer:Buffer.from(JSON.stringify(save))});
  await expect(dialog).toContainText("Chapter restored");await dialog.getByRole("button",{name:"Close",exact:true}).click();
  await expect.poll(async()=>JSON.parse((await world.getAttribute("data-camera-pose"))!).target[0]).toBeCloseTo(x,2);
  await expect.poll(async()=>Number(await world.getAttribute("data-foliage-uploads"))).toBeGreaterThan(campUploads);
  await expect(world).toHaveAttribute("data-foliage-queued","0");
  await expect.poll(async()=>Number(await world.getAttribute("data-foliage-plants"))).toBeGreaterThan(100);
  const initialUploads=Number(await world.getAttribute("data-foliage-uploads"));
  const staticBuilds=await world.getAttribute("data-static-batch-builds"),terrainBakes=await world.getAttribute("data-terrain-bakes");
  expect(Number(staticBuilds)).toBeGreaterThan(0);
  const ambient=await world.getAttribute("data-ambient-npcs");
  const stationary=await page.evaluate(async()=>{
    const world=document.querySelector<HTMLElement>('[data-testid="rpg-world"]')!;
    const until=performance.now()+12600;let minimum=Infinity,queued=0;
    while(performance.now()<until){await new Promise(requestAnimationFrame);minimum=Math.min(minimum,Number(world.dataset.foliagePlants));queued+=Number(world.dataset.foliageQueued);}
    return {minimum,queued,uploads:Number(world.dataset.foliageUploads)};
  });
  expect(stationary.minimum).toBeGreaterThan(100);expect(stationary.queued).toBe(0);expect(stationary.uploads).toBe(initialUploads);
  expect(await world.getAttribute("data-ambient-npcs")).not.toBe(ambient);
  await expect(world).toHaveAttribute("data-static-batch-builds",staticBuilds!);await expect(world).toHaveAttribute("data-terrain-bakes",terrainBakes!);
  // Cross at least one eight-metre window boundary. Preparation retains the old cover.
  await page.keyboard.down("s");
  const streaming=await page.evaluate(async()=>{
    const world=document.querySelector<HTMLElement>('[data-testid="rpg-world"]')!,until=performance.now()+4500;let minimum=Infinity;
    while(performance.now()<until){await new Promise(requestAnimationFrame);minimum=Math.min(minimum,Number(world.dataset.foliagePlants));}
    return {minimum,uploads:Number(world.dataset.foliageUploads)};
  });
  await page.keyboard.up("s");expect(streaming.minimum).toBeGreaterThan(100);expect(streaming.uploads).toBeGreaterThan(initialUploads);
  expect(Number(await app.getAttribute("data-player-z"))).toBeGreaterThan(z+6);
  await page.screenshot({path:"docs/screenshots/valley-camera/grass-away-from-camp.png"});expect(errors).toEqual([]);
});

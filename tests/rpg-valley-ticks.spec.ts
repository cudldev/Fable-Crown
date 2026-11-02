import {expect,test,type Page} from "@playwright/test";
import {createValleySave} from "../src/valley/save";
import {tile} from "../src/rpg/world";

const app=(p:Page)=>p.getByTestId("valley-app"),world=(p:Page)=>p.getByTestId("rpg-world");
test("600ms gameplay commits retain smooth movement and mobile layout",async({page})=>{
  const errors:string[]=[];page.on("pageerror",e=>errors.push(e.message));
  await page.setViewportSize({width:1280,height:720});await page.goto("./?chapter=valley");
  await expect(app(page)).toHaveAttribute("data-ready","true",{timeout:90000});
  await expect(app(page)).toHaveAttribute("data-tick-ms","600");
  const save=createValleySave(Date.now(),2);Object.assign(save.action.player,{x:52,z:150});
  Object.assign(save.action,{frame:36,stepMs:600,swingStartedAt:36});
  Object.assign(save.chapter.player,{position:tile(52,150),previousPosition:tile(52,150)});
  await page.getByRole("button",{name:"Menu",exact:true}).click();
  await page.getByRole("dialog").getByRole("button",{name:"Settings",exact:true}).click();
  await page.getByLabel("Import valley archive").setInputFiles({name:"tick-fixture.json",mimeType:"application/json",buffer:Buffer.from(JSON.stringify(save))});
  await expect(page.getByRole("dialog")).toContainText("Chapter restored");
  await page.getByRole("dialog").getByRole("button",{name:"Close",exact:true}).click();
  await expect(world(page)).toHaveAttribute("data-character-clip","idle");
  await page.getByTestId("three-canvas").focus();await page.keyboard.down("d");
  const samples=await page.evaluate(()=>new Promise<{t:number;frame:number;x:number}[]>(resolve=>{
    const rows:{t:number;frame:number;x:number}[]=[],start=performance.now();
    const next=()=>{const element=document.querySelector<HTMLElement>('[data-testid="rpg-world"]')!;
      rows.push({t:performance.now()-start,frame:Number(element.dataset.actionFrame),x:Number(element.dataset.continuousX)});
      if(performance.now()-start<2000)requestAnimationFrame(next);else resolve(rows);};requestAnimationFrame(next);
  }));
  await page.keyboard.up("d");
  const changes=samples.filter((s,i)=>i>0&&s.frame!==samples[i-1].frame);
  expect(changes.length).toBeGreaterThanOrEqual(2);
  for(let i=1;i<changes.length;i++){
    expect(changes[i].frame-changes[i-1].frame).toBe(36);
    expect(changes[i].t-changes[i-1].t).toBeGreaterThan(400);
    expect(changes[i].t-changes[i-1].t).toBeLessThan(800);
  }
  expect(samples.some((s,i)=>i>0&&s.frame===samples[i-1].frame&&Math.abs(s.x-samples[i-1].x)>.002)).toBe(true);
  await expect(world(page)).toHaveAttribute("data-character-clip","idle");
  const stopped=await app(page).getAttribute("data-player-x");await page.waitForTimeout(750);
  await expect(app(page)).toHaveAttribute("data-player-x",stopped!);
  for(const [width,height]of [[390,844],[844,390]]){
    await page.setViewportSize({width,height});await expect(page.getByRole("button",{name:"Menu",exact:true})).toBeVisible();
    expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
  }
  await page.screenshot({path:"tmp/valley-tick-review/landscape.png"});expect(errors).toEqual([]);
});

import {expect,test,type Page} from "@playwright/test";
import {mkdir,writeFile} from "node:fs/promises";
import {createValleySave,validateValleySave} from "../src/valley/save";
import type {ValleySave} from "../src/valley/contracts";
import {createValleyWorld} from "../src/valley/world";
import {interactionTiles,tile} from "../src/rpg/world";
import {TRIPO_CLIPS} from "../src/render/three/tripo-motion";

const out="docs/art-audit/tripo-valley-test-v1";
const app=(p:Page)=>p.getByTestId("valley-app"),world=(p:Page)=>p.getByTestId("rpg-world"),dialog=(p:Page)=>p.getByRole("dialog");
test.use({viewport:{width:1280,height:720}});test.setTimeout(240000);
const fixture=(x=52,z=150)=>{const s=createValleySave(Date.now());Object.assign(s.action.player,{x,z});Object.assign(s.chapter.player,{position:tile(x,z),previousPosition:tile(x,z)});return s;};
async function restore(page:Page,save:ValleySave){
  expect(validateValleySave(structuredClone(save))).not.toBeNull();
  await page.getByRole("button",{name:"Menu",exact:true}).click();await dialog(page).getByRole("button",{name:"Settings",exact:true}).click();
  await page.getByLabel("Import valley archive").setInputFiles({name:"tripo-valley.json",mimeType:"application/json",buffer:Buffer.from(JSON.stringify(save))});
  await expect(dialog(page)).toContainText("Chapter restored");await dialog(page).getByRole("button",{name:"Close",exact:true}).click();
}
async function ready(page:Page){await page.goto("./?characters=tripo-test");await expect(app(page)).toHaveAttribute("data-ready","true",{timeout:90000});await expect(app(page)).toHaveAttribute("data-tick-ms","600");await expect(world(page)).toHaveAttribute("data-character-rig","tripo-skinned");await expect(world(page)).toHaveAttribute("data-actor-style","tripo-valley-test");}
test("current valley: textured character, 600ms movement/guard, all clip previews, menus, phones and offline",async({page,context})=>{
  await mkdir(out,{recursive:true});const errors:string[]=[],external:string[]=[];
  page.on("pageerror",e=>errors.push(e.message));page.on("console",m=>{if(m.type()==="error")errors.push(m.text());});
  page.on("request",r=>{const u=new URL(r.url());if(u.protocol.startsWith("http")&&page.url().startsWith("http")&&u.origin!==new URL(page.url()).origin)external.push(u.href);});
  await ready(page);await restore(page,fixture());await expect(app(page)).toHaveAttribute("data-controls","point");
  await expect(page.locator("[data-action-controls]")).toHaveCount(0);
  await page.locator(".tripo-test-controls summary").click();const select=page.getByRole("combobox",{name:"Character animation",exact:true});
  for(const clip of ["rest",...TRIPO_CLIPS]){await select.selectOption(clip);await expect(world(page)).toHaveAttribute("data-character-clip",clip);await page.waitForTimeout(160);if(["idle","walk","mine","block","rig-test"].includes(clip))await page.screenshot({path:`${out}/preview-${clip}.png`});}
  await expect(app(page)).toHaveAttribute("data-player-x","52.000");await expect(app(page)).toHaveAttribute("data-player-z","150.000");
  await select.selectOption("gameplay");await page.locator(".tripo-test-controls summary").click();
  await page.getByTestId("three-canvas").focus();const start=await app(page).getAttribute("data-player-x");
  await page.keyboard.down("d");await expect(world(page)).toHaveAttribute("data-character-clip","walk");await expect.poll(()=>app(page).getAttribute("data-player-x")).not.toBe(start);await page.keyboard.up("d");
  await expect(world(page)).toHaveAttribute("data-character-clip","idle");
  await page.keyboard.down("Space");await expect(app(page)).toHaveAttribute("data-blocking","true");await expect(world(page)).toHaveAttribute("data-character-clip","block");await page.screenshot({path:`${out}/actual-guard.png`});await page.keyboard.up("Space");
  await page.getByRole("button",{name:"Menu",exact:true}).click();await expect(page.locator(".tripo-test-controls")).toBeHidden();await page.keyboard.press("Escape");
  await page.mouse.click(640,490);await expect(app(page)).toHaveAttribute("data-pointer-kind","walk");await expect(world(page)).toHaveAttribute("data-character-clip","walk");await page.getByRole("button",{name:"Stop",exact:true}).click();
  for(const[name,width,height]of[["phone",390,844],["landscape",844,390]] as const){await page.setViewportSize({width,height});await page.locator(".tripo-test-controls summary").click();await select.selectOption("talk");await expect(world(page)).toHaveAttribute("data-character-clip","talk");await page.screenshot({path:`${out}/${name}.png`});await select.selectOption("gameplay");await page.locator(".tripo-test-controls summary").click();}
  await page.evaluate(async()=>{await navigator.serviceWorker.ready;});await page.reload();await expect(app(page)).toHaveAttribute("data-ready","true",{timeout:90000});
  await context.setOffline(true);await page.reload();await expect(app(page)).toHaveAttribute("data-ready","true",{timeout:90000});await expect(app(page)).toHaveAttribute("data-tick-ms","600");await expect(world(page)).toHaveAttribute("data-character-rig","tripo-skinned");
  await page.screenshot({path:`${out}/offline.png`});await context.setOffline(false);
  expect(errors).toEqual([]);expect(external).toEqual([]);await writeFile(`${out}/browser-check.json`,JSON.stringify({chapter:"valley",format:7,tickMs:600,clips:["rest",...TRIPO_CLIPS],continuousWalk:true,guard:true,pointWalk:true,menus:true,phoneOrientations:true,offline:true,errors,external,physicalPhoneBenchmark:false},null,2));
});
test("selected valley gathering drives the skinned tool stroke; conversation holds still work",async({page})=>{
  const errors:string[]=[];page.on("pageerror",e=>errors.push(e.message));await ready(page);
  const save=fixture(),map=createValleyWorld(save.valley,save.chapter),tree=map.objects.find(o=>o.id.startsWith("valley-tree-"))!;
  expect(tree).toBeDefined();const position=interactionTiles(tree).sort((a,b)=>b.x+b.y-a.x-a.y)[0]!;
  Object.assign(save.action.player,{x:position.x,z:position.y});Object.assign(save.chapter.player,{position:{...position},previousPosition:{...position}});
  await restore(page,save);await page.getByRole("button",{name:"Chop Valley timber tree",exact:true}).first().click({force:true});
  await expect(app(page)).toHaveAttribute("data-pointer-kind","gather");await expect(world(page)).toHaveAttribute("data-character-clip","cut",{timeout:12000});await expect(world(page)).toHaveAttribute("data-character-tool","axe");
  await page.screenshot({path:`${out}/actual-gathering.png`});
  await page.getByRole("button",{name:"Stop",exact:true}).click();await expect(app(page)).toHaveAttribute("data-pointer-kind","none");
  await restore(page,fixture(52,141));await page.getByRole("button",{name:"Talk to Rowan the builder",exact:true}).click({force:true});await expect(dialog(page)).toHaveAccessibleName("Conversation with Rowan",{timeout:15000});
  await expect(page.locator(".tripo-test-controls")).toBeHidden();await page.screenshot({path:`${out}/conversation.png`});await page.keyboard.press("Escape");expect(errors).toEqual([]);
});

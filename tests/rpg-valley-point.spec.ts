import {expect,test,type Page} from "@playwright/test";
import {createValleySave} from "../src/valley/save";
import {tile} from "../src/rpg/world";
import {COTTAGE_TICKS} from "../src/valley/contracts";
import type {AmbientNpcPose,ValleySave} from "../src/valley/contracts";

const app=(page:Page)=>page.getByTestId("valley-app"),world=(page:Page)=>page.getByTestId("rpg-world"),dialog=(page:Page)=>page.getByRole("dialog");
const errors=new WeakMap<Page,string[]>();
test.beforeEach(async({page})=>{const captured:string[]=[];errors.set(page,captured);page.on("pageerror",error=>captured.push(error.message));});
test.afterEach(async({page})=>{expect(errors.get(page)).toEqual([]);});
async function ready(page:Page){await page.goto("./?chapter=valley");await expect(app(page)).toHaveAttribute("data-ready","true",{timeout:90000});await expect(app(page)).toHaveAttribute("data-controls","point");await expect(page.locator("[data-action-controls]")).toHaveCount(0);}
async function restore(page:Page,save:ValleySave){
  await page.getByRole("button",{name:"Menu",exact:true}).click();await dialog(page).getByRole("button",{name:"Settings",exact:true}).click();
  await page.getByLabel("Import valley archive").setInputFiles({name:"pointer-fixture.json",mimeType:"application/json",buffer:Buffer.from(JSON.stringify(save))});
  await expect(dialog(page)).toContainText("Chapter restored");await dialog(page).getByRole("button",{name:"Close",exact:true}).click();
}
function fixture(x:number,z:number){const save=createValleySave(Date.now());Object.assign(save.action.player,{x,z});Object.assign(save.chapter.player,{position:tile(x,z),previousPosition:tile(x,z),path:[],movement:null,action:null});return save;}
const poses=async(page:Page)=>JSON.parse((await world(page).getAttribute("data-ambient-npcs"))??"[]") as AmbientNpcPose[];

test("ground mouse click walks, draws a route and stops without a free weapon swing",async({page})=>{
  await page.setViewportSize({width:1280,height:720});await ready(page);
  const start=await app(page).getAttribute("data-player-z");await page.mouse.click(640,490);
  await expect(app(page)).toHaveAttribute("data-pointer-kind","walk");await expect(world(page)).toHaveAttribute("data-preview-route-points",/[1-9]/);
  await expect.poll(()=>app(page).getAttribute("data-player-z")).not.toBe(start);
  await page.getByRole("button",{name:"Stop",exact:true}).click();await expect(app(page)).toHaveAttribute("data-pointer-kind","none");
  const stopped=await app(page).getAttribute("data-player-z");await page.waitForTimeout(250);await expect(app(page)).toHaveAttribute("data-player-z",stopped!);await expect(app(page)).toHaveAttribute("data-swing","0.000");
  await page.getByTestId("three-canvas").focus();await page.keyboard.down("Space");await expect(app(page)).toHaveAttribute("data-blocking","true");await page.keyboard.up("Space");await expect(app(page)).toHaveAttribute("data-blocking","false");
  await page.screenshot({path:"docs/screenshots/valley-point/desktop.png"});
});
test("a distant bench is approached before its focused crafting menu opens",async({page})=>{
  await page.setViewportSize({width:1280,height:720});await ready(page);await restore(page,fixture(64,143));
  await page.getByRole("button",{name:"Use Communal carpentry workbench",exact:true}).click();
  await expect(app(page)).toHaveAttribute("data-pointer-phase","walking");await expect(dialog(page)).toHaveCount(0);
  await expect(dialog(page)).toHaveAccessibleName("Communal carpentry workbench",{timeout:15000});
  await expect.poll(async()=>Math.hypot(Number(await app(page).getAttribute("data-player-x"))-69,Number(await app(page).getAttribute("data-player-z"))-139)).toBeLessThanOrEqual(3.01);
  await dialog(page).getByRole("button",{name:"Craft something",exact:true}).click();await expect(dialog(page).getByTestId("recipe-detail")).toBeVisible();
});
test("role routines move visitors, hold the selected conversation and resume after it ends",async({page})=>{
  await page.setViewportSize({width:1280,height:720});await ready(page);const save=fixture(52,141);
  Object.assign(save.valley,{home:{x:54,z:155,rotation:0,tentPacked:false},paid:100,cottageTicks:COTTAGE_TICKS,introduced:["builder","merchant","smith"]});await restore(page,save);
  await expect.poll(async()=>(await poses(page)).some(npc=>npc.id==="valley-visitor-builder"&&npc.moving),{timeout:25000}).toBe(true);
  await page.getByRole("button",{name:"Talk to Rowan the builder",exact:true}).click({force:true});
  await expect(dialog(page)).toHaveAccessibleName("Conversation with Rowan",{timeout:15000});
  await expect.poll(async()=>(await poses(page)).find(npc=>npc.id==="valley-visitor-builder")?.moving).toBe(false);
  const held=(await poses(page)).find(npc=>npc.id==="valley-visitor-builder")!;
  await expect.poll(async()=>(await poses(page)).some(npc=>npc.id!==held.id&&(npc.moving||npc.working)),{timeout:15000}).toBe(true);
  await page.waitForTimeout(1300);const still=(await poses(page)).find(npc=>npc.id===held.id)!;expect(still.x).toBe(held.x);expect(still.z).toBe(held.z);
  await page.screenshot({path:"docs/screenshots/valley-point/conversation-hold.png"});await page.keyboard.press("Escape");
  await expect.poll(async()=>(await poses(page)).some(npc=>npc.id===held.id&&(npc.moving||npc.working)),{timeout:15000}).toBe(true);
});
test.describe("touch point controls",()=>{
  test.use({hasTouch:true,isMobile:true,deviceScaleFactor:1,viewport:{width:390,height:844}});
  test("wilderness guard remains usable without a movement dock",async({page})=>{
    await ready(page);const save=fixture(94,159);for(const enemy of save.action.enemies)enemy.cooldown=120;await restore(page,save);await page.touchscreen.tap(20,20);
    const guard=page.getByRole("button",{name:"Hold guard",exact:true}),box=await guard.boundingBox();expect(box).not.toBeNull();const cdp=await page.context().newCDPSession(page);
    await cdp.send("Input.dispatchTouchEvent",{type:"touchStart",touchPoints:[{id:1,x:box!.x+box!.width/2,y:box!.y+box!.height/2}]});
    await expect(app(page)).toHaveAttribute("data-blocking","true");await cdp.send("Input.dispatchTouchEvent",{type:"touchEnd",touchPoints:[]});await expect(app(page)).toHaveAttribute("data-blocking","false");await expect(page.locator("[data-action-controls]")).toHaveCount(0);
  });
  test("long press offers actions without release walking; tap talks and ground tap walks",async({page})=>{
    await ready(page);const npc=page.getByRole("button",{name:"Talk to Rowan the builder",exact:true});const box=await npc.boundingBox();expect(box).not.toBeNull();
    const cdp=await page.context().newCDPSession(page),x=box!.x+box!.width/2,y=box!.y+box!.height/2;
    await cdp.send("Input.dispatchTouchEvent",{type:"touchStart",touchPoints:[{id:1,x,y}]});
    await expect(page.getByRole("menu",{name:"World actions"})).toBeVisible();await cdp.send("Input.dispatchTouchEvent",{type:"touchEnd",touchPoints:[]});
    await expect(dialog(page)).toHaveCount(0);await expect(app(page)).toHaveAttribute("data-pointer-kind","none");
    await page.getByRole("menuitem",{name:/Talk to Rowan/}).tap();await expect(dialog(page)).toHaveAccessibleName("Conversation with Rowan");await page.keyboard.press("Escape");
    await page.touchscreen.tap(260,510);await expect(app(page)).toHaveAttribute("data-pointer-kind","walk");await page.getByRole("button",{name:"Stop",exact:true}).tap();
    await page.setViewportSize({width:844,height:390});await expect(page.locator("[data-action-controls]")).toHaveCount(0);await page.screenshot({path:"docs/screenshots/valley-point/mobile-landscape.png"});
  });
});

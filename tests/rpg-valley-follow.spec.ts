import {expect,test,type Page} from "@playwright/test";
import {createValleySave} from "../src/valley/save";
import {tile} from "../src/rpg/world";

// Local WebGL checks; keep the release smoke suite unchanged.
const errors=new WeakMap<Page,string[]>();
test.beforeEach(async({page})=>{const messages:string[]=[];errors.set(page,messages);page.on("pageerror",error=>messages.push(error.message));});
test.afterEach(async({page})=>{expect(errors.get(page)).toEqual([]);});
const app=(page:Page)=>page.getByTestId("valley-app");
const world=(page:Page)=>page.getByTestId("rpg-world");
const dialog=(page:Page)=>page.getByRole("dialog");
async function ready(page:Page){await page.goto("./?chapter=valley");await expect(app(page)).toHaveAttribute("data-ready","true",{timeout:90000});await expect(app(page)).toHaveAttribute("data-mode","world");}
async function restore(page:Page,x:number,z:number){
  const save=createValleySave(Date.now());Object.assign(save.action.player,{x,z,facingX:0,facingZ:-1});
  Object.assign(save.chapter.player,{position:tile(x,z),previousPosition:tile(x,z),path:[],movement:null,action:null});
  await page.getByRole("button",{name:"Menu",exact:true}).click();await dialog(page).getByRole("button",{name:"Settings",exact:true}).click();
  await page.getByLabel("Import valley archive").setInputFiles({name:"follow-fixture.json",mimeType:"application/json",buffer:Buffer.from(JSON.stringify(save))});
  await expect(dialog(page)).toContainText("Chapter restored");await dialog(page).getByRole("button",{name:"Close",exact:true}).click();
}
test("camera follows with movement lead, settles, and cannot be parked by dragging",async({page})=>{
  await page.setViewportSize({width:1280,height:720});await ready(page);
  await expect(page.getByTestId("interaction-indicator")).toHaveAttribute("data-label",/Talk.*Rowan/);
  await expect(world(page)).toHaveAttribute("data-facing-indicator","world");
  await expect(page.getByTestId("facing-indicator")).toHaveCount(0);
  const originalFacing=await world(page).getAttribute("data-facing-yaw");
  await expect(page.getByRole("button",{name:"Follow",exact:true})).toHaveCount(0);
  const before=Number(await app(page).getAttribute("data-player-x"));
  await page.keyboard.down("d");
  try{await expect.poll(async()=>Number(await app(page).getAttribute("data-player-x"))).toBeGreaterThan(before+.6);
    await expect.poll(async()=>Number((await world(page).getAttribute("data-camera-lead"))!.split(",")[0])).toBeGreaterThan(.15);
  }finally{await page.keyboard.up("d");}
  await expect.poll(async()=>Math.hypot(...(await world(page).getAttribute("data-camera-lead"))!.split(",").map(Number))).toBeLessThan(.02);
  await expect.poll(async()=>world(page).getAttribute("data-facing-yaw")).not.toBe(originalFacing);
  const anchor=JSON.parse((await world(page).getAttribute("data-camera-pose"))!).target as number[];
  await page.mouse.move(650,360);await page.mouse.down({button:"middle"});await page.mouse.move(950,500,{steps:8});await page.mouse.up({button:"middle"});
  await expect(app(page)).toHaveAttribute("data-camera-follow","true");
  const after=JSON.parse((await world(page).getAttribute("data-camera-pose"))!).target as number[];
  expect(Math.hypot(after[0]-anchor[0],after[2]-anchor[2])).toBeLessThan(.03);
  expect(after[0]).toBeCloseTo(Number(await app(page).getAttribute("data-player-x")),1);
  expect(after[2]).toBeCloseTo(Number(await app(page).getAttribute("data-player-z")),1);
  await page.screenshot({path:"docs/screenshots/valley-controls/desktop-follow.png"});
});
test("mouse activates only in-range targets, with no extra swing",async({page})=>{
  await page.setViewportSize({width:1280,height:720});await ready(page);await restore(page,69,143);
  const bench=page.getByRole("button",{name:"Inspect Communal carpentry workbench",exact:true});
  await expect(bench).toBeVisible();await bench.click();await expect(dialog(page)).toHaveCount(0);
  await expect(app(page)).toHaveAttribute("data-player-x","69.000");
  await restore(page,69,140);
  await expect(page.getByTestId("interaction-indicator")).toHaveAttribute("data-label",/workbench/i);
  await bench.click();await expect(dialog(page)).toHaveAccessibleName(/workbench/i);
  await expect(world(page)).toHaveAttribute("data-facing-indicator","hidden");
  await page.keyboard.press("Escape");await expect(dialog(page)).toHaveCount(0);
  await expect(app(page)).toHaveAttribute("data-swing","0.000");
});
test.describe("touch uses joystick and nearby action",()=>{
  test.use({hasTouch:true,isMobile:true,viewport:{width:390,height:844},deviceScaleFactor:1});
  test("world taps and drags never open a remote action or park the camera",async({page})=>{
    await ready(page);
    const npc=page.getByRole("button",{name:"Inspect Rowan the builder",exact:true});
    await npc.tap();await expect(dialog(page)).toHaveCount(0);
    await expect(page.getByTestId("interaction-indicator")).toBeVisible();
    await page.screenshot({path:"docs/screenshots/valley-controls/mobile-aim.png"});
    await page.locator(".action-interact").tap();await expect(dialog(page)).toHaveAccessibleName("Conversation with Rowan");
    await expect(page.getByTestId("interaction-indicator")).toBeHidden();await page.keyboard.press("Escape");
    await page.touchscreen.tap(20,300);
    const cdp=await page.context().newCDPSession(page);
    await cdp.send("Input.dispatchTouchEvent",{type:"touchStart",touchPoints:[{id:1,x:200,y:350}]});
    await cdp.send("Input.dispatchTouchEvent",{type:"touchMove",touchPoints:[{id:1,x:290,y:430}]});
    await cdp.send("Input.dispatchTouchEvent",{type:"touchEnd",touchPoints:[]});
    await expect(app(page)).toHaveAttribute("data-camera-follow","true");await expect(dialog(page)).toHaveCount(0);
    await page.setViewportSize({width:844,height:390});await expect(world(page)).toHaveAttribute("data-facing-indicator","world");
    await page.screenshot({path:"docs/screenshots/valley-controls/landscape-aim.png"});
  });
});

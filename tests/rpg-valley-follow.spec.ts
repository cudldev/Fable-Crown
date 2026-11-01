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
test("camera follows with movement lead, detaches for dragging and reattaches with Follow Alden",async({page})=>{
  await page.setViewportSize({width:1280,height:720});await ready(page);
  await expect(page.getByTestId("interaction-indicator")).toHaveAttribute("data-label",/Talk.*Rowan/);
  await expect(world(page)).toHaveAttribute("data-facing-indicator","world");
  await expect(page.getByTestId("facing-indicator")).toHaveCount(0);
  const originalFacing=await world(page).getAttribute("data-facing-yaw");
  await expect(page.getByRole("button",{name:"Follow Alden",exact:true})).toHaveAttribute("aria-pressed","true");
  const before=Number(await app(page).getAttribute("data-player-x"));
  await page.keyboard.down("d");
  try{await expect.poll(async()=>Number(await app(page).getAttribute("data-player-x"))).toBeGreaterThan(before+.6);
    await expect.poll(async()=>Number((await world(page).getAttribute("data-camera-lead"))!.split(",")[0])).toBeGreaterThan(.15);
  }finally{await page.keyboard.up("d");}
  await expect.poll(async()=>Math.hypot(...(await world(page).getAttribute("data-camera-lead"))!.split(",").map(Number))).toBeLessThan(.02);
  await expect.poll(async()=>world(page).getAttribute("data-facing-yaw")).not.toBe(originalFacing);
  const anchor=JSON.parse((await world(page).getAttribute("data-camera-pose"))!).target as number[];
  await page.mouse.move(650,360);await page.mouse.down({button:"middle"});await page.mouse.move(950,500,{steps:8});await page.mouse.up({button:"middle"});
  await expect(app(page)).toHaveAttribute("data-camera-follow","false");
  await page.evaluate(async()=>{await new Promise(requestAnimationFrame);await new Promise(requestAnimationFrame);});
  const after=JSON.parse((await world(page).getAttribute("data-camera-pose"))!).target as number[];
  expect(Math.hypot(after[0]-anchor[0],after[2]-anchor[2])).toBeGreaterThan(1);
  await expect(app(page)).toHaveAttribute("data-pointer-kind","none");
  const detachedPlayer=Number(await app(page).getAttribute("data-player-x"));
  await page.keyboard.down("d");try{await expect.poll(async()=>Number(await app(page).getAttribute("data-player-x"))).toBeGreaterThan(detachedPlayer+.3);}finally{await page.keyboard.up("d");}
  const parked=JSON.parse((await world(page).getAttribute("data-camera-pose"))!).target as number[];
  expect(parked[0]).toBeCloseTo(after[0],3);expect(parked[2]).toBeCloseTo(after[2],3);
  await page.getByRole("button",{name:"Follow Alden",exact:true}).click();
  await expect(app(page)).toHaveAttribute("data-camera-follow","true");
  await expect.poll(async()=>{const target=JSON.parse((await world(page).getAttribute("data-camera-pose"))!).target as number[];return Math.hypot(target[0]-Number(await app(page).getAttribute("data-player-x")),target[2]-Number(await app(page).getAttribute("data-player-z")));}).toBeLessThan(.03);
  await page.mouse.move(620,360);await page.mouse.down();await page.mouse.move(760,420,{steps:5});await page.mouse.up();
  await expect(app(page)).toHaveAttribute("data-camera-follow","false");await expect(app(page)).toHaveAttribute("data-pointer-kind","none");
  await page.keyboard.press("f");await expect(app(page)).toHaveAttribute("data-camera-follow","true");
  await page.screenshot({path:"docs/screenshots/valley-camera/desktop-follow.png"});
});
test("mouse approaches a remote station and opens its focused action without an extra swing",async({page})=>{
  await page.setViewportSize({width:1280,height:720});await ready(page);await restore(page,69,143);
  await page.mouse.move(620,360);await page.mouse.down({button:"middle"});await page.mouse.move(680,390,{steps:4});await page.mouse.up({button:"middle"});
  await expect(app(page)).toHaveAttribute("data-camera-follow","false");
  await page.evaluate(async()=>{await new Promise(requestAnimationFrame);await new Promise(requestAnimationFrame);});
  const parked=JSON.parse((await world(page).getAttribute("data-camera-pose"))!).target as number[];
  const bench=page.getByRole("button",{name:"Use Communal carpentry workbench",exact:true});
  await expect(bench).toBeVisible();await bench.click();await expect(dialog(page)).toHaveAccessibleName(/workbench/i,{timeout:15000});
  expect(Number(await app(page).getAttribute("data-player-z"))).toBeLessThan(143);
  await expect(world(page)).toHaveAttribute("data-facing-indicator","hidden");
  await expect(page.getByRole("button",{name:"Follow Alden",exact:true})).toHaveCount(0);await page.keyboard.press("f");await expect(app(page)).toHaveAttribute("data-camera-follow","false");
  await page.keyboard.press("Escape");await expect(dialog(page)).toHaveCount(0);
  await expect(world(page)).toHaveAttribute("data-interaction-camera","none");
  const restored=JSON.parse((await world(page).getAttribute("data-camera-pose"))!).target as number[];
  expect(restored[0]).toBeCloseTo(parked[0],3);expect(restored[2]).toBeCloseTo(parked[2],3);await expect(app(page)).toHaveAttribute("data-camera-follow","false");
  await expect(app(page)).toHaveAttribute("data-swing","0.000");
});
test.describe("touch approaches targets and can detach the following camera",()=>{
  test.use({hasTouch:true,isMobile:true,viewport:{width:390,height:844},deviceScaleFactor:1});
  test("target taps open conversations; drags pan without walking and Follow reattaches",async({page})=>{
    await ready(page);
    const npc=page.getByRole("button",{name:"Talk to Rowan the builder",exact:true});
    await npc.tap();await expect(dialog(page)).toHaveAccessibleName("Conversation with Rowan",{timeout:15000});
    await page.screenshot({path:"docs/screenshots/valley-camera/mobile-conversation.png"});
    await expect(page.getByTestId("interaction-indicator")).toBeHidden();await page.keyboard.press("Escape");
    const beforeDrag=await app(page).getAttribute("data-player-x");
    const cdp=await page.context().newCDPSession(page);
    await cdp.send("Input.dispatchTouchEvent",{type:"touchStart",touchPoints:[{id:1,x:200,y:350}]});
    await cdp.send("Input.dispatchTouchEvent",{type:"touchMove",touchPoints:[{id:1,x:290,y:430}]});
    await cdp.send("Input.dispatchTouchEvent",{type:"touchEnd",touchPoints:[]});
    await expect(app(page)).toHaveAttribute("data-camera-follow","false");await expect(dialog(page)).toHaveCount(0);
    await page.waitForTimeout(250);await expect(app(page)).toHaveAttribute("data-player-x",beforeDrag!);
    await expect(page.locator("[data-action-controls]")).toHaveCount(0);
    await expect(app(page)).toHaveAttribute("data-pointer-kind","none");
    await page.getByRole("button",{name:"Follow Alden",exact:true}).tap();await expect(app(page)).toHaveAttribute("data-camera-follow","true");
    await page.setViewportSize({width:844,height:390});await expect(world(page)).toHaveAttribute("data-facing-indicator","world");
    await page.screenshot({path:"docs/screenshots/valley-camera/landscape-follow.png"});
  });
});

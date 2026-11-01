import {expect,test,type Page} from "@playwright/test";
import {createValleySave} from "../src/valley/save";
import {tile} from "../src/rpg/world";
import {COTTAGE_TICKS,FORGE_TICKS} from "../src/valley/contracts";
import {homeFootprints} from "../src/valley/world";

async function settings(page:Page){
  await page.getByRole("button",{name:"Menu",exact:true}).click();
  await page.getByRole("dialog").getByRole("button",{name:"Settings",exact:true}).click();
}

test("native valley structures, furnishings and terraces share the actor scale",async({page})=>{
  const errors:string[]=[];page.on("pageerror",e=>errors.push(e.message));
  await page.setViewportSize({width:1280,height:800});
  await page.goto("./?chapter=valley");
  const root=page.getByTestId("valley-app");await expect(root).toHaveAttribute("data-ready","true",{timeout:90000});
  const fixture=createValleySave(Date.now(),512);
  Object.assign(fixture.valley,{home:{x:54,z:155,rotation:0,tentPacked:false},paid:100,cottageTicks:COTTAGE_TICKS,
    forge:{logs:12,bars:2,ticks:FORGE_TICKS},introduced:["builder","merchant","smith"],flags:["talked-merchant","talked-smith","crafted-stool"],layoutRevision:5,
    furniture:[{id:"stool",itemId:"stool",x:56,z:163,rotation:0},{id:"table",itemId:"table",x:60,z:165,rotation:0},
      {id:"bed",itemId:"bed",x:59,z:157,rotation:0},{id:"shelf",itemId:"shelf",x:63,z:163,rotation:0},
      {id:"chest",itemId:"chest",x:65,z:163,rotation:0},{id:"planter",itemId:"planter",x:64,z:166,rotation:0}],
    plants:[{id:"flowers",x:63,z:166,kind:"flowers"},{id:"sapling",x:65,z:166,kind:"sapling"}],
    ground:{"57,165":{level:1,path:false},"57,166":{level:0,path:true,stairs:0},"58,165":{level:1,path:false}}});
  const restore=async(x:number,z:number)=>{
    fixture.action.player.x=x;fixture.action.player.z=z;fixture.chapter.player.position=tile(x,z);fixture.savedAt=Date.now();
    await settings(page);
    await page.getByLabel("Import valley archive").setInputFiles({name:"art-review.json",mimeType:"application/json",buffer:Buffer.from(JSON.stringify(fixture))});
    await expect(page.locator(".valley-panel-message")).toContainText("Chapter restored");await page.getByRole("dialog").getByRole("button",{name:"Close",exact:true}).click();
    await expect(page.getByTestId("valley-app")).toHaveAttribute("data-camera-follow","true");
    await expect(root).toHaveAttribute("data-player-x",x.toFixed(3));await page.waitForTimeout(2500);
  };
  await restore(59,162);await page.screenshot({path:"docs/screenshots/valley-home-exterior.png"});
  await restore(61,158);await expect(page.locator("[data-camera-cutaway-objects]")).toHaveAttribute("data-camera-cutaway-objects",/valley-home-cottage/);
  await page.screenshot({path:"docs/screenshots/valley-home-interior.png"});
  await restore(72,179);await page.screenshot({path:"docs/screenshots/valley-forge-interior.png"});
  await restore(59,164);
  await page.setViewportSize({width:390,height:844});await page.waitForTimeout(1000);await page.screenshot({path:"docs/screenshots/valley-home-portrait.png"});
  await page.setViewportSize({width:844,height:390});await page.waitForTimeout(1000);await page.screenshot({path:"docs/screenshots/valley-home-landscape.png"});
  expect(errors).toEqual([]);
});

test("rotated native home doors stay aligned with continuous walk-in collision",async({page})=>{
  await page.setViewportSize({width:1280,height:800});await page.goto("./?chapter=valley");
  const root=page.getByTestId("valley-app");await expect(root).toHaveAttribute("data-ready","true",{timeout:90000});
  for(const rotation of [0,1,2,3] as const){
    const fixture=createValleySave(Date.now(),512);
    Object.assign(fixture.valley,{home:{x:54,z:155,rotation,tentPacked:true},paid:100,cottageTicks:COTTAGE_TICKS,layoutRevision:1});
    const fp=homeFootprints(fixture.valley)!;
    fixture.action.player.x=fp.approach.x;fixture.action.player.z=fp.approach.z;fixture.chapter.player.position=tile(fp.approach.x,fp.approach.z);
    await settings(page);
    await page.getByLabel("Import valley archive").setInputFiles({name:"rotated-home.json",mimeType:"application/json",buffer:Buffer.from(JSON.stringify(fixture))});
    await expect(page.locator(".valley-panel-message")).toContainText("Chapter restored");await page.getByRole("dialog").getByRole("button",{name:"Close",exact:true}).click();
    await expect(root).toHaveAttribute("data-player-x",fp.approach.x.toFixed(3));
    const keys=[["w","d"],["d","s"],["s","a"],["a","w"]][rotation];
    for(const key of keys)await page.keyboard.down(key);await page.waitForTimeout(650);for(const key of keys)await page.keyboard.up(key);
    await page.waitForTimeout(500);
    const x=Number(await root.getAttribute("data-player-x")),z=Number(await root.getAttribute("data-player-z"));
    expect(x).toBeGreaterThanOrEqual(fp.cottage.x-.2);expect(x).toBeLessThan(fp.cottage.x+fp.cottage.width-.8);
    expect(z).toBeGreaterThanOrEqual(fp.cottage.z-.2);expect(z).toBeLessThan(fp.cottage.z+fp.cottage.height-.8);
    await page.screenshot({path:`docs/screenshots/valley-rotated-home-${rotation}.png`});
  }
});

test("authored shield and tool contact remain readable on clear ground",async({page})=>{
  await page.setViewportSize({width:1280,height:800});await page.goto("./?chapter=valley");
  const root=page.getByTestId("valley-app");await expect(root).toHaveAttribute("data-ready","true",{timeout:90000});
  const fixture=createValleySave(Date.now(),512);fixture.action.player.x=52;fixture.action.player.z=150;fixture.chapter.player.position=tile(52,150);
  await settings(page);
  await page.getByLabel("Import valley archive").setInputFiles({name:"pixel-pose-review.json",mimeType:"application/json",buffer:Buffer.from(JSON.stringify(fixture))});
  await expect(page.locator(".valley-panel-message")).toContainText("Chapter restored");await page.getByRole("dialog").getByRole("button",{name:"Close",exact:true}).click();
  await settings(page);
  for(let i=0;i<4;i++)await page.getByRole("button",{name:"Zoom in",exact:true}).click();
  await page.getByRole("dialog").getByRole("button",{name:"Close",exact:true}).click();
  for(const direction of ["left","right"]){
    if(direction==="right"){await page.keyboard.down("d");await page.waitForTimeout(120);await page.keyboard.up("d");}
    await page.mouse.move(1150,400);await page.mouse.down({button:"right"});await page.waitForTimeout(250);
    await expect(page.locator("[data-character-clip]")).toHaveAttribute("data-character-clip","block");
    await page.screenshot({path:`docs/screenshots/valley-clear-block-${direction}.png`});await page.mouse.up({button:"right"});
  }
  await page.mouse.move(1150,400);await page.mouse.down();
  await expect(page.locator("[data-character-clip]")).toHaveAttribute("data-character-clip","strike");await page.waitForTimeout(205);
  await page.screenshot({path:"docs/screenshots/valley-clear-strike.png"});await page.mouse.up();
});

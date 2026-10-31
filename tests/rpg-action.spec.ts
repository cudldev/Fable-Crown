import { expect,test } from "@playwright/test";

test("continuous worker movement renders without tile stepping and menus release input",async({page})=>{
  const errors:string[]=[];page.on("pageerror",error=>errors.push(error.message));
  await page.goto("./?actionPrototype=1");
  const root=page.getByTestId("action-prototype");
  await expect(root).toHaveAttribute("data-ready","true",{timeout:60000});
  const hitBackground=await page.locator("[data-three-selection]").first().evaluate(element=>getComputedStyle(element).backgroundColor);
  expect(hitBackground).toBe("rgba(0, 0, 0, 0)");
  const before=Number(await root.getAttribute("data-player-x"));
  const frame=Number(await root.getAttribute("data-action-frame"));
  await page.keyboard.down("d");await page.waitForTimeout(350);await page.keyboard.up("d");
  await expect.poll(async()=>Number(await root.getAttribute("data-player-x"))).toBeGreaterThan(before+.3);
  await page.waitForTimeout(160);
  const stopped=Number(await root.getAttribute("data-player-x"));
  expect(Math.abs(stopped-Math.round(stopped))).toBeGreaterThan(.001);
  await page.waitForTimeout(250);
  expect(Number(await root.getAttribute("data-player-x"))).toBeCloseTo(stopped,2);
  expect(Number(await root.getAttribute("data-action-frame"))-frame).toBeGreaterThan(25);
  await page.getByRole("button",{name:"Bag",exact:true}).click();
  await expect(page.getByRole("dialog")).toBeVisible();
  await page.keyboard.down("w");await page.waitForTimeout(150);await page.keyboard.up("w");
  await page.keyboard.press("Escape");await expect(page.getByRole("dialog")).toHaveCount(0);
  await page.waitForTimeout(150);
  expect(Number(await root.getAttribute("data-player-x"))).toBeCloseTo(stopped,2);
  await page.screenshot({path:"docs/screenshots/action-prototype-desktop.png"});
  expect(errors).toEqual([]);
});

test("virtual joystick releases on cancel and touch controls fit both orientations",async({page})=>{
  await page.setViewportSize({width:390,height:844});
  await page.goto("./?actionPrototype=1");
  const root=page.getByTestId("action-prototype");
  await expect(root).toHaveAttribute("data-ready","true",{timeout:60000});
  const stick=page.getByRole("group",{name:"Movement joystick"});
  const box=await stick.boundingBox();expect(box).not.toBeNull();
  const before=Number(await root.getAttribute("data-player-x"));
  const cdp=await page.context().newCDPSession(page);
  await cdp.send("Emulation.setTouchEmulationEnabled",{enabled:true});
  await cdp.send("Input.dispatchTouchEvent",{type:"touchStart",touchPoints:[{x:box!.x+box!.width/2+35,y:box!.y+box!.height/2}]});
  await page.waitForTimeout(250);
  await cdp.send("Input.dispatchTouchEvent",{type:"touchCancel",touchPoints:[]});
  await page.waitForTimeout(150);
  const stopped=await root.getAttribute("data-player-x");
  expect(Number(stopped)).toBeGreaterThan(before+.1);
  await page.waitForTimeout(200);expect(await root.getAttribute("data-player-x")).toBe(stopped);
  await page.screenshot({path:"docs/screenshots/action-prototype-portrait.png"});
  await page.setViewportSize({width:844,height:390});
  await expect(stick).toBeVisible();
  for(const button of await page.locator("[data-action-controls] button").all()) {
    const bounds=await button.boundingBox();if(bounds) {expect(bounds.width).toBeGreaterThanOrEqual(44);expect(bounds.height).toBeGreaterThanOrEqual(44);expect(bounds.y+bounds.height).toBeLessThanOrEqual(390);}
  }
  await page.screenshot({path:"docs/screenshots/action-prototype-landscape.png"});
});

test("wilderness attack provokes a telegraphed enemy and held block spends guard",async({page})=>{
  await page.goto("./?actionPrototype=1");
  const root=page.getByTestId("action-prototype");
  await expect(root).toHaveAttribute("data-ready","true",{timeout:60000});
  await page.getByRole("button",{name:"Tools",exact:true}).click();
  await page.getByRole("button",{name:"Combat practice",exact:true}).click();
  await expect(root).toHaveAttribute("data-tool","weapon");
  await page.getByRole("button",{name:"Tool / Attack",exact:true}).click();
  const block=page.getByRole("button",{name:"Block",exact:true});
  await block.hover();await page.mouse.down();
  await expect.poll(async()=>Number(await root.getAttribute("data-guard")),{timeout:5000}).toBeLessThan(100);
  await expect(root).toHaveAttribute("data-health","10");
  await page.screenshot({path:"docs/screenshots/action-prototype-block.png"});
  await page.mouse.up();
});

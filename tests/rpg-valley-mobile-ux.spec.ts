import { expect, test, type Locator, type Page } from "@playwright/test";
import { calendarDate } from "../src/rpg/engine";
import { addItems, itemCount } from "../src/rpg/inventory";
import { tile } from "../src/rpg/world";
import { COTTAGE_TICKS, type ValleySave } from "../src/valley/contracts";
import { VALLEY_RECIPES } from "../src/valley/content";
import { createValleySave, validateValleySave } from "../src/valley/save";
import { applyValleyCommand } from "../src/valley/settlement";

// These are local GPU checks. Release CI deliberately retains its two non-GPU cases.
test.use({ hasTouch: true, isMobile: true, deviceScaleFactor: 1 });
const app = (page: Page) => page.getByTestId("valley-app");
const dialog = (page: Page) => page.getByRole("dialog");
const feedback = (page: Page) => page.getByTestId("valley-feedback");
const errors = new WeakMap<Page, string[]>();
test.beforeEach(async ({ page }) => {
  const captured: string[] = []; errors.set(page, captured);
  page.on("pageerror", error => captured.push(error.message));
  await page.addInitScript(()=>{const pad={buttons:Array.from({length:17},()=>({pressed:false,touched:false,value:0})),axes:[0,0,0,0]};Object.assign(window,{mobileQaPad:pad});Object.defineProperty(navigator,"getGamepads",{value:()=>[{...pad,connected:true,index:0,id:"Mobile QA controller",mapping:"standard",timestamp:performance.now()}]});});
});
test.afterEach(async ({ page }) => { expect(errors.get(page)).toEqual([]); });
async function ready(page: Page) {
  await expect(app(page)).toHaveAttribute("data-ready", "true", { timeout: 90000 });
  await expect(app(page)).toHaveAttribute("data-mode", "world");
  expect(await page.evaluate(() => matchMedia("(pointer: coarse)").matches)).toBe(true);
}
async function menu(page: Page, section: "Settings" | "Journal" | "Build & manage" | "Backpack") {
  for (let i = 0; i < 8 && await dialog(page).isVisible(); i++) {
    const close = dialog(page).getByRole("button", { name: "Close", exact: true }), back = dialog(page).getByRole("button", { name: "Back", exact: true }), away = dialog(page).getByRole("button", { name: "Step away", exact: true });
    if (await close.isVisible()) await close.tap(); else if (await back.isVisible()) await back.tap(); else if (await away.isVisible()) await away.tap(); else await page.keyboard.press("Escape");
  }
  await page.getByRole("button", { name: "Menu", exact: true }).tap();
  await expect(dialog(page)).toHaveAttribute("data-menu-panel", "menu");
  await dialog(page).getByRole("button", { name: section, exact: true }).tap();
}
async function restore(page: Page, value: ValleySave) {
  expect(validateValleySave(value)).not.toBeNull();
  await menu(page, "Settings");
  await page.getByLabel("Import valley archive").setInputFiles({ name: "mobile-ux.json", mimeType: "application/json", buffer: Buffer.from(JSON.stringify(value)) });
  await expect(dialog(page)).toContainText("Chapter restored");
  await dialog(page).getByRole("button", { name: "Close", exact: true }).tap();
}
async function snapshot(page: Page): Promise<ValleySave> {
  await menu(page, "Settings");
  await dialog(page).getByRole("button", { name: "Save on this device", exact: true }).tap();
  await expect(dialog(page)).toContainText("Chapter saved on this device");
  return page.evaluate(() => new Promise<ValleySave>((resolve, reject) => {
    const request = indexedDB.open("fable-crown", 1);
    request.onerror = () => reject(request.error);
    request.onsuccess = () => {
      const db = request.result, get = db.transaction("saves").objectStore("saves").get("valley-v1");
      get.onsuccess = () => { resolve(get.result); db.close(); };
      get.onerror = () => { reject(get.error); db.close(); };
    };
  }));
}
function at(save: ValleySave, x: number, z: number, target = { x, z: z - 1 }) {
  const dx = target.x - x, dz = target.z - z, length = Math.hypot(dx, dz) || 1;
  Object.assign(save.action.player, { x, z, facingX: dx / length, facingZ: dz / length, health: save.action.player.maxHealth, swing: 0, blocking: false });
  Object.assign(save.chapter.player, { position: tile(x, z), previousPosition: tile(x, z), health: save.action.player.health, path: [], movement: null, action: null });
  const now = Date.now(); save.savedAt = now; save.chapter.savedAt = now; save.chapter.calendar = calendarDate(now);
}
async function bounds(locator: Locator) {
  const value = await locator.boundingBox(); expect(value).not.toBeNull(); return value!;
}
async function fullyInsideMenu(page: Page, target: Locator) {
  // Read geometry directly: locator actions would scroll the target into view and hide cutoff.
  const hit = await bounds(target);
  if (await dialog(page).getAttribute("data-menu-panel") === "craft") {
    const detail = await bounds(dialog(page).getByTestId("recipe-detail")), header = await bounds(dialog(page).locator(".crafting-header"));
    expect(hit.width).toBeGreaterThanOrEqual(44); expect(hit.height).toBeGreaterThanOrEqual(44);
    expect(hit.x).toBeGreaterThanOrEqual(detail.x); expect(hit.x + hit.width).toBeLessThanOrEqual(detail.x + detail.width + .5);
    expect(hit.y).toBeGreaterThanOrEqual(header.y + header.height); expect(hit.y + hit.height).toBeLessThanOrEqual(detail.y + detail.height + .5);
    return;
  }
  const visible = await dialog(page).locator(".valley-menu-body").evaluate(element => {
    const box = element.getBoundingClientRect();
    return { x: box.left + element.clientLeft, y: box.top + element.clientTop, width: element.clientWidth, height: element.clientHeight };
  });
  const header = await bounds(dialog(page).locator(".valley-menu-header"));
  const footer = await bounds(dialog(page).locator(".valley-menu-footer"));
  expect(hit.width).toBeGreaterThanOrEqual(44); expect(hit.height).toBeGreaterThanOrEqual(44);
  expect(hit.x).toBeGreaterThanOrEqual(visible.x - .5); expect(hit.x + hit.width).toBeLessThanOrEqual(visible.x + visible.width + .5);
  expect(hit.y).toBeGreaterThanOrEqual(Math.max(visible.y, header.y + header.height) - .5);
  expect(hit.y + hit.height).toBeLessThanOrEqual(Math.min(visible.y + visible.height, footer.y) + .5);
}
async function capture(page: Page, name: string) {
  const size = page.viewportSize()!;
  await page.screenshot({ path: `docs/screenshots/valley-mobile/${size.width > size.height ? "landscape" : "portrait"}-${name}.png` });
}

async function controllerButton(page:Page,index:number,held:boolean){await page.evaluate(({index,held})=>{const p=(window as unknown as {mobileQaPad:{buttons:{pressed:boolean;touched:boolean;value:number}[]}}).mobileQaPad;Object.assign(p.buttons[index],{pressed:held,touched:held,value:Number(held)});},{index,held});await page.evaluate(()=>new Promise<void>(resolve=>requestAnimationFrame(()=>requestAnimationFrame(()=>resolve()))));}
test("mobile controller gathering preserves exact rewards and reports empty attempts",async({page})=>{
 await page.setViewportSize({width:390,height:844});await page.goto("./?chapter=valley");await ready(page);const fixture=createValleySave(Date.now());at(fixture,25,140);fixture.chapter.seed=2;fixture.chapter.player.inventory=[{itemId:"bronze-axe",quantity:1}];const xp=fixture.chapter.player.skills.woodcutting;await restore(page,fixture);
 for(let i=0;i<2;i++){const prior=await feedback(page).getAttribute("data-feedback-id");await controllerButton(page,7,true);await expect.poll(()=>feedback(page).getAttribute("data-feedback-id")).not.toBe(prior);await expect(feedback(page)).toContainText("+1 Logs");await expect(feedback(page)).toContainText("+25 woodcutting XP");await expect(app(page)).toHaveAttribute("data-swing","0.000");await controllerButton(page,7,false);await page.waitForTimeout(60);}
 const gathered=await snapshot(page);expect(itemCount(gathered.chapter.player.inventory,"logs")).toBe(2);expect(gathered.chapter.player.skills.woodcutting).toBe(xp+500);
 const empty=createValleySave(Date.now());at(empty,52,150);await restore(page,empty);await controllerButton(page,7,true);await controllerButton(page,7,false);await expect(feedback(page)).toContainText("Nothing gathered this swing");const unchanged=await snapshot(page);expect(unchanged.chapter.player.inventory).toEqual(empty.chapter.player.inventory);expect(unchanged.chapter.player.skills).toEqual(empty.chapter.player.skills);
});

test("coarse portrait and landscape keep point menus reachable without a virtual dock",async({page})=>{
 await page.goto("./?chapter=valley");await ready(page);const fixture=createValleySave(Date.now());at(fixture,52,150);await restore(page,fixture);
 for(const size of [{width:320,height:568},{width:390,height:844},{width:667,height:375},{width:844,height:390}]){
  await page.setViewportSize(size);await expect(page.locator("[data-action-controls]")).toHaveCount(0);await expect(page.getByRole("group",{name:"Movement joystick"})).toHaveCount(0);
  for(const control of await page.locator(".valley-hud-actions button,.valley-camera button").all()){const box=await bounds(control);expect(box.width).toBeGreaterThanOrEqual(44);expect(box.height).toBeGreaterThanOrEqual(44);expect(box.x).toBeGreaterThanOrEqual(0);expect(box.y).toBeGreaterThanOrEqual(0);expect(box.x+box.width).toBeLessThanOrEqual(size.width+.5);expect(box.y+box.height).toBeLessThanOrEqual(size.height+.5);}
  await menu(page,"Settings");await expect(dialog(page)).toContainText("Click or tap ground");await dialog(page).getByRole("button",{name:"Close",exact:true}).tap();expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
 }
});

test("touch drag, pinch and long-press do not dispatch an accidental walk",async({page})=>{
 await page.setViewportSize({width:390,height:844});await page.goto("./?chapter=valley");await ready(page);const fixture=createValleySave(Date.now());at(fixture,52,150);await restore(page,fixture);
 const cdp=await page.context().newCDPSession(page),before=await app(page).getAttribute("data-player-x");
 await cdp.send("Input.dispatchTouchEvent",{type:"touchStart",touchPoints:[{id:1,x:195,y:350}]});await cdp.send("Input.dispatchTouchEvent",{type:"touchMove",touchPoints:[{id:1,x:280,y:430}]});await cdp.send("Input.dispatchTouchEvent",{type:"touchEnd",touchPoints:[]});
 await page.waitForTimeout(200);await expect(app(page)).toHaveAttribute("data-player-x",before!);await expect(app(page)).toHaveAttribute("data-pointer-kind","none");
 const zoom=Number(await app(page).getAttribute("data-camera-zoom"));
 await cdp.send("Input.dispatchTouchEvent",{type:"touchStart",touchPoints:[{id:1,x:140,y:350},{id:2,x:250,y:350}]});await cdp.send("Input.dispatchTouchEvent",{type:"touchMove",touchPoints:[{id:1,x:105,y:350},{id:2,x:285,y:350}]});await cdp.send("Input.dispatchTouchEvent",{type:"touchEnd",touchPoints:[]});
 await expect.poll(async()=>Number(await app(page).getAttribute("data-camera-zoom"))).toBeGreaterThan(zoom);await expect(app(page)).toHaveAttribute("data-pointer-kind","none");await expect(app(page)).toHaveAttribute("data-camera-follow","true");
 await cdp.send("Input.dispatchTouchEvent",{type:"touchStart",touchPoints:[{id:3,x:195,y:370}]});await expect(page.getByRole("menu",{name:"World actions"})).toBeVisible({timeout:3000});await cdp.send("Input.dispatchTouchEvent",{type:"touchEnd",touchPoints:[]});
 await expect(page.getByRole("menuitem",{name:"Walk here",exact:true})).toBeVisible();await page.keyboard.press("Escape");await expect(page.locator(".valley-world-menu")).toHaveCount(0);await page.waitForTimeout(200);await expect(app(page)).toHaveAttribute("data-pointer-kind","none");await expect(app(page)).toHaveAttribute("data-player-x",before!);
});

test("world stations filter services, finish real work while actors pause, and keep a suspended placement draft", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("./?chapter=valley"); await ready(page);
  const fixture = createValleySave(Date.now()); at(fixture, 69, 140, { x: 69, z: 139 });
  fixture.chapter.player.inventory = [{ itemId: "logs", quantity: 1 }, { itemId: "coins", quantity: 25 }];
  await restore(page, fixture);
  await menu(page, "Backpack");
  await expect(dialog(page).getByRole("heading", { name: "Backpack & equipment", exact: true })).toBeVisible();
  await expect(dialog(page).getByRole("heading", { name: "Connected storage", exact: true })).toHaveCount(0);
  await expect(dialog(page).getByRole("button", { name: /^Store / })).toHaveCount(0);
  await dialog(page).getByRole("button", { name: "Close", exact: true }).tap();
  await page.keyboard.press("e");
  await expect(dialog(page)).toHaveAttribute("data-menu-panel", "interaction");
  await dialog(page).getByRole("button", { name: "Craft something", exact: true }).tap();
  await expect(dialog(page)).toHaveAttribute("data-menu-panel", "craft");
  await expect(dialog(page)).toContainText("Communal carpentry workbench");
  for (const recipe of Object.values(VALLEY_RECIPES)) {
    await expect(dialog(page).getByTestId("recipe-grid").locator(`[data-recipe-id="${recipe.id}"]`)).toHaveCount(recipe.station === "workbench" ? 1 : 0);
  }
  await dialog(page).getByTestId("recipe-grid").locator('[data-recipe-id="valley-plank"]').tap();
  await expect(dialog(page).getByTestId("recipe-detail")).toHaveCount(1);
  await expect(dialog(page).getByTestId("recipe-detail")).toHaveAttribute("data-selected-recipe", "valley-plank");
  await capture(page, "station");
  await page.setViewportSize({ width: 844, height: 390 }); await capture(page, "station");
  await fullyInsideMenu(page, dialog(page).getByTestId("craft-primary"));
  await page.setViewportSize({ width: 390, height: 844 });
  await page.waitForTimeout(200); // Let the interface-open acknowledgement reach the observable HUD.
  const frame = await app(page).getAttribute("data-action-frame");
  const health = await page.locator('meter[aria-label="Player health"]').getAttribute("value");
  const planks = dialog(page).getByTestId("recipe-detail");
  await planks.getByTestId("craft-primary").tap();
  await expect(dialog(page).getByTestId("craft-queue")).toHaveCount(1);
  await expect(dialog(page).getByTestId("craft-queue")).toHaveCount(0, { timeout: 10000 });
  await expect(dialog(page).getByTestId("craft-status")).toContainText("+2 Sawn plank");
  await expect(planks).toContainText("+10 XP");
  await expect(feedback(page)).toContainText("+10 carpentry XP");
  await expect(app(page)).toHaveAttribute("data-action-frame", frame!);
  await expect(page.locator('meter[aria-label="Player health"]')).toHaveAttribute("value", health!);
  await dialog(page).getByRole("button", { name: "Back", exact: true }).tap();
  await expect(dialog(page)).toHaveAttribute("data-menu-panel", "interaction");
  await dialog(page).getByRole("button", { name: "Step away", exact: true }).tap();
  await page.keyboard.down("s");
  try { await expect.poll(async () => Number(await app(page).getAttribute("data-player-z"))).toBeGreaterThan(141.8); }
  finally { await page.keyboard.up("s"); }
  await page.keyboard.down("d");
  try { await expect.poll(async () => Number(await app(page).getAttribute("data-player-x"))).toBeGreaterThan(73.5); }
  finally { await page.keyboard.up("d"); }
  await page.getByRole("button",{name:"Trade at Travelling supply caravan",exact:true}).tap();
  await expect(dialog(page)).toHaveAttribute("data-menu-panel", "interaction");
  await dialog(page).getByRole("button", { name: "Browse supplies", exact: true }).tap();
  await expect(dialog(page)).toHaveAttribute("data-menu-panel", "trade");
  await expect(dialog(page)).toContainText("Travelling supply caravan");
  await dialog(page).getByRole("group", { name: "Goods", exact: true }).getByRole("button", { name: "Sawn plank", exact: true }).tap();
  const stock = dialog(page).getByTestId("trade-detail");
  await stock.getByRole("button", { name: "Sell 1 · 2 coins", exact: true }).tap();
  await expect(dialog(page).locator(".valley-menu-footer")).toContainText("+2 Coins");
  const crafted = await snapshot(page);
  expect(itemCount(crafted.chapter.player.inventory, "logs")).toBe(0);
  expect(itemCount(crafted.chapter.player.inventory, "valley-plank")).toBe(1);
  expect(itemCount(crafted.chapter.player.inventory, "coins")).toBe(27);
  expect(crafted.valley.carpentryXp).toBe(100);
  for (const station of [{ x: 78, z: 140, kind: "furnace" }, { x: 81, z: 140, kind: "range" }] as const) {
    const other = createValleySave(Date.now()); at(other, station.x, station.z, { x: station.x, z: 139 }); await restore(page, other);
    await page.keyboard.press("e");
    await expect(dialog(page)).toHaveAttribute("data-menu-panel", "interaction");
    await dialog(page).getByRole("button", { name: station.kind === "furnace" ? "Smelt something" : "Cook something", exact: true }).tap();
    await expect(dialog(page)).toHaveAttribute("data-menu-panel", "craft");
    for (const recipe of Object.values(VALLEY_RECIPES)) {
      await expect(dialog(page).getByTestId("recipe-grid").locator(`[data-recipe-id="${recipe.id}"]`)).toHaveCount(recipe.station === station.kind ? 1 : 0);
    }
    await expect(dialog(page).getByTestId("recipe-detail")).toHaveCount(1);
    await expect(dialog(page).getByTestId("recipe-detail")).toHaveAttribute("data-selected-recipe", Object.values(VALLEY_RECIPES).find(recipe => recipe.station === station.kind)!.id);
  }
  const furnishing = createValleySave(Date.now());
  expect(applyValleyCommand(furnishing, { type: "place-home", x: 54, z: 155, rotation: 0 }, Date.now()).ok).toBe(true);
  addItems(furnishing.chapter.player.inventory, "coins", 75);
  expect(applyValleyCommand(furnishing, { type: "pay", amount: 100 }, Date.now()).ok).toBe(true);
  furnishing.valley.cottageTicks = COTTAGE_TICKS; addItems(furnishing.chapter.player.inventory, "valley-stool", 1); at(furnishing, 52, 150);
  await restore(page, furnishing); await menu(page, "Build & manage");
  await dialog(page).getByRole("button", { name: "Place stool (1)", exact: true }).tap();
  await dialog(page).getByRole("button", { name: "Adjust position", exact: true }).tap();
  await page.getByLabel("Placement X").fill("58"); await page.getByLabel("Placement Z").fill("168");
  await dialog(page).getByRole("button", { name: "Rotate 0°", exact: true }).tap();
  await expect(dialog(page)).toContainText("Stand within six metres");
  await capture(page, "placement");
  await page.setViewportSize({ width: 844, height: 390 }); await capture(page, "placement");
  await page.setViewportSize({ width: 390, height: 844 });
  await dialog(page).getByRole("button", { name: "Walk closer", exact: true }).tap();
  await expect(dialog(page)).toHaveCount(0); await expect(page.locator("[data-action-controls]")).toHaveCount(0);
  await page.getByRole("button", { name: "Resume placement", exact: true }).tap();
  await expect(page.getByLabel("Placement X")).toHaveValue("58"); await expect(page.getByLabel("Placement Z")).toHaveValue("168");
  await expect(dialog(page).getByRole("button", { name: "Rotate 90°", exact: true })).toBeVisible();
  await dialog(page).getByRole("button", { name: "Cancel", exact: true }).tap();
  const kept = await snapshot(page);
  expect(itemCount(kept.chapter.player.inventory, "valley-stool")).toBe(1); expect(kept.valley.furniture).toEqual([]);
});

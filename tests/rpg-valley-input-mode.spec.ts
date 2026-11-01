import { expect, test, type Page } from "@playwright/test";

// Local browser input policy checks; release CI remains GPU independent.
type TestPad = { connected: boolean; axes: number[]; buttons: { pressed: boolean; touched: boolean; value: number }[] };
const app = (page: Page) => page.getByTestId("valley-app");
const dock = (page: Page) => page.locator("[data-action-controls]");
const dialog = (page: Page) => page.getByRole("dialog");
const errors = new WeakMap<Page, string[]>();
test.beforeEach(async ({ page }) => {
  const captured: string[] = []; errors.set(page, captured);
  page.on("pageerror", error => captured.push(error.message));
  await page.addInitScript(() => {
    const state = { connected: true, axes: [0, 0, 0, 0], buttons: Array.from({ length: 17 }, () => ({ pressed: false, touched: false, value: 0 })) };
    Object.assign(window, { valleyInputModePad: state });
    Object.defineProperty(navigator, "getGamepads", { value: () => state.connected ? [{ ...state, index: 0, id: "QA standard controller", mapping: "standard", timestamp: performance.now() }] : [] });
  });
});
test.afterEach(async ({ page }) => { expect(errors.get(page)).toEqual([]); });
async function sampled(page: Page) {
  await page.evaluate(() => new Promise<void>(resolve => requestAnimationFrame(() => requestAnimationFrame(() => resolve()))));
}
async function button(page: Page, index: number, held: boolean) {
  await page.evaluate(({ index, held }) => {
    const pad = (window as unknown as { valleyInputModePad: TestPad }).valleyInputModePad;
    Object.assign(pad.buttons[index], { pressed: held, touched: held, value: Number(held) });
  }, { index, held });
  await sampled(page);
}
async function press(page: Page, index: number) { await button(page, index, true); await button(page, index, false); }
async function axis(page: Page, index: number, value: number) {
  await page.evaluate(({ index, value }) => { (window as unknown as { valleyInputModePad: TestPad }).valleyInputModePad.axes[index] = value; }, { index, value });
  await sampled(page);
}
async function ready(page: Page) {
  await page.goto("./?chapter=valley");
  await expect(app(page)).toHaveAttribute("data-ready", "true", { timeout: 90000 });
  await expect(app(page)).toHaveAttribute("data-mode", "world");
}

test("desktop uses point navigation without a dock and retains keyboard/controller menus",async({page})=>{
 await page.setViewportSize({width:1280,height:720});await ready(page);
 await expect(dock(page)).toHaveCount(0);await expect(app(page)).toHaveAttribute("data-controls","point");
 const before=Number(await app(page).getAttribute("data-player-x"));
 await page.keyboard.down("d");try{await expect.poll(async()=>Number(await app(page).getAttribute("data-player-x"))).toBeGreaterThan(before+.1);}finally{await page.keyboard.up("d");}
 await page.getByRole("button",{name:"Talk to Rowan the builder",exact:true}).click();
 await expect(dialog(page)).toHaveAccessibleName("Conversation with Rowan",{timeout:15000});
 await page.keyboard.press("Escape");await expect(dialog(page)).toHaveCount(0);
 await press(page,9);await expect(dialog(page)).toHaveAttribute("data-menu-panel","menu");
 await expect(app(page)).toHaveAttribute("data-input-mode","controller");await press(page,1);await expect(dialog(page)).toHaveCount(0);
 await page.keyboard.press("w");await expect(app(page)).toHaveAttribute("data-input-mode","keyboard");await expect(dock(page)).toHaveCount(0);
});
test.describe("mobile point input and controller handover",()=>{
 test.use({hasTouch:true,isMobile:true,deviceScaleFactor:1,viewport:{width:390,height:844}});
 test("tap and controller modes remain dock-free across drift, rotation and disconnect",async({page})=>{
  await ready(page);await expect(app(page)).toHaveAttribute("data-input-mode","touch");await expect(dock(page)).toHaveCount(0);
  for(const drift of [.02,-.08,.05]){await axis(page,0,drift);await page.waitForTimeout(80);await expect(app(page)).toHaveAttribute("data-input-mode","touch");}
  await axis(page,0,0);await page.getByRole("button",{name:"Talk to Rowan the builder",exact:true}).tap();
  await expect(dialog(page)).toHaveAccessibleName("Conversation with Rowan",{timeout:15000});
  await press(page,0);await expect(dialog(page).getByRole("button",{name:"About my home…",exact:true})).toBeFocused();
  await press(page,13);await expect(dialog(page).getByRole("button",{name:"Need a hand with anything?",exact:true})).toBeFocused();
  await expect(app(page)).toHaveAttribute("data-input-mode","controller");await press(page,1);await expect(dialog(page)).toHaveCount(0);
  for(const size of [{width:844,height:390},{width:390,height:844}]){await page.setViewportSize(size);await expect(dock(page)).toHaveCount(0);expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);}
  await page.getByRole("button",{name:"Menu",exact:true}).tap();await expect(app(page)).toHaveAttribute("data-input-mode","touch");await expect(dock(page)).toHaveCount(0);
  await dialog(page).getByRole("button",{name:"Resume",exact:true}).tap();
  await press(page,9);await expect(app(page)).toHaveAttribute("data-input-mode","controller");await press(page,1);
  await page.evaluate(()=>{(window as unknown as {valleyInputModePad:TestPad}).valleyInputModePad.connected=false;window.dispatchEvent(new Event("gamepaddisconnected"));});
  await expect(app(page)).toHaveAttribute("data-input-mode","touch");await expect(dock(page)).toHaveCount(0);
 });
});

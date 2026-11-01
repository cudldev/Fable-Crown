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

test("fine-pointer desktop has no touch dock and supports real keyboard and world mouse actions", async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 720 }); await ready(page);
  expect(await page.evaluate(() => matchMedia("(pointer: fine)").matches)).toBe(true);
  await expect(app(page)).toHaveAttribute("data-input-mode", "keyboard");
  await expect(dock(page)).toHaveCount(0);
  await expect(page.getByRole("group", { name: "Movement joystick" })).toHaveCount(0);
  await page.mouse.click(1100, 450);
  await expect(page.locator("[data-character-clip]")).toHaveAttribute("data-character-clip", "strike");
  await expect(page.getByTestId("valley-feedback")).toContainText("Nothing gathered this swing");
  const before = Number(await app(page).getAttribute("data-player-x"));
  await page.keyboard.down("d");
  try { await expect.poll(async () => Number(await app(page).getAttribute("data-player-x"))).toBeGreaterThan(before + .1); }
  finally { await page.keyboard.up("d"); }
  await page.keyboard.press("e");
  await expect(dialog(page)).toHaveAccessibleName("Conversation with Rowan");
  await page.keyboard.press("Escape"); await expect(dialog(page)).toHaveCount(0);
  await expect(dock(page)).toHaveCount(0);
  await press(page, 9); await expect(dialog(page)).toHaveAttribute("data-menu-panel", "menu");
  await expect(app(page)).toHaveAttribute("data-input-mode", "controller");
  await press(page, 1); await expect(dialog(page)).toHaveCount(0);
  await expect(dock(page)).toHaveCount(0);
  await page.keyboard.press("w"); await expect(app(page)).toHaveAttribute("data-input-mode", "keyboard");
  await expect(dock(page)).toHaveCount(0);
  await page.screenshot({ path: test.info().outputPath("desktop-keyboard-no-touch-dock.png") });
});

test.describe("mobile touch and controller handover", () => {
  test.use({ hasTouch: true, isMobile: true, deviceScaleFactor: 1, viewport: { width: 390, height: 844 } });
  test("actual controller use hides the dock, releases virtual movement and restores touch only on touch or disconnect", async ({ page }) => {
    await ready(page);
    expect(await page.evaluate(() => matchMedia("(pointer: coarse)").matches)).toBe(true);
    await expect(app(page)).toHaveAttribute("data-input-mode", "touch");
    await expect(dock(page)).toBeVisible();
    await page.waitForTimeout(250); // An idle connected controller must not change the mode.
    await expect(app(page)).toHaveAttribute("data-input-mode", "touch");
    for (const drift of [.02, -.08, .05]) {
      await axis(page, 0, drift); await axis(page, 2, -drift);
      await page.waitForTimeout(80);
      await expect(app(page)).toHaveAttribute("data-input-mode", "touch");
      await expect(dock(page)).toBeVisible();
    }
    await axis(page, 0, 0); await axis(page, 2, 0);
    const cdp = await page.context().newCDPSession(page);
    const stick = await page.getByRole("group", { name: "Movement joystick" }).boundingBox(); expect(stick).not.toBeNull();
    const before = Number(await app(page).getAttribute("data-player-x"));
    await cdp.send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: [{ id: 1, x: stick!.x + stick!.width / 2 + 35, y: stick!.y + stick!.height / 2 }] });
    await expect.poll(async () => Number(await app(page).getAttribute("data-player-x"))).toBeGreaterThan(before + .1);
    await button(page, 13, true);
    await expect(app(page)).toHaveAttribute("data-input-mode", "controller");
    await expect(dock(page)).toHaveCount(0);
    await button(page, 13, false);
    await page.waitForTimeout(200);
    const stopped = await app(page).getAttribute("data-player-x");
    await page.waitForTimeout(250);
    await expect(app(page)).toHaveAttribute("data-player-x", stopped!);
    await cdp.send("Input.dispatchTouchEvent", { type: "touchCancel", touchPoints: [] });
    await page.setViewportSize({ width: 844, height: 390 });
    await expect(app(page)).toHaveAttribute("data-input-mode", "controller"); await expect(dock(page)).toHaveCount(0);
    await press(page, 0); await expect(dialog(page)).toHaveAccessibleName("Conversation with Rowan");
    await press(page, 0); await expect(dialog(page).getByRole("button", { name: "About my home…", exact: true })).toBeFocused();
    await press(page, 13); await expect(dialog(page).getByRole("button", { name: "Need a hand with anything?", exact: true })).toBeFocused();
    await press(page, 1); await expect(dialog(page)).toHaveCount(0);
    await expect(dock(page)).toHaveCount(0);
    await page.screenshot({ path: test.info().outputPath("mobile-controller-no-touch-dock-844x390.png") });
    await page.touchscreen.tap(20, 20);
    await expect(app(page)).toHaveAttribute("data-input-mode", "touch"); await expect(dock(page)).toBeVisible();
    await axis(page, 0, 1);
    await expect(app(page)).toHaveAttribute("data-input-mode", "controller"); await expect(dock(page)).toHaveCount(0);
    await page.touchscreen.tap(20, 20);
    await expect(app(page)).toHaveAttribute("data-input-mode", "touch"); await expect(dock(page)).toBeVisible();
    await page.waitForTimeout(120); // An unchanged held axis must not steal back the mode.
    await expect(app(page)).toHaveAttribute("data-input-mode", "touch"); await expect(dock(page)).toBeVisible();
    await axis(page, 0, 0);
    await press(page, 3);
    await expect(app(page)).toHaveAttribute("data-input-mode", "controller"); await expect(dock(page)).toHaveCount(0);
    await axis(page, 0, .04); await page.waitForTimeout(120);
    await expect(app(page)).toHaveAttribute("data-input-mode", "controller");
    await page.setViewportSize({ width: 390, height: 844 });
    await expect(app(page)).toHaveAttribute("data-input-mode", "controller");
    await page.evaluate(() => {
      (window as unknown as { valleyInputModePad: TestPad }).valleyInputModePad.connected = false;
      window.dispatchEvent(new Event("gamepaddisconnected"));
    });
    await expect(app(page)).toHaveAttribute("data-input-mode", "touch"); await expect(dock(page)).toBeVisible();
    await expect(page.locator(".action-stick-thumb")).toHaveAttribute("style", /translate\(0px, 0px\)/);
    await page.screenshot({ path: test.info().outputPath("mobile-touch-restored-after-controller.png") });
  });
});

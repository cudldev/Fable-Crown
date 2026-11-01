import { expect, test, type Page } from "@playwright/test";
import { createRpg } from "../src/rpg/engine";
import { addItems, itemCount } from "../src/rpg/inventory";
import { tile } from "../src/rpg/world";
import { COTTAGE_TICKS, FORGE_TICKS, type ValleySave } from "../src/valley/contracts";
import { createValleySave, validateValleySave } from "../src/valley/save";
import { applyValleyCommand } from "../src/valley/settlement";

const HOUR = 3_600_000;
const root = (page: Page) => page.getByTestId("valley-app");
const panel = (page: Page) => page.getByRole("dialog");
const status = (page: Page) => page.locator(".valley-message");
const browserErrors = new WeakMap<Page, string[]>();
test.beforeEach(async ({ page }) => {
  const errors: string[] = []; browserErrors.set(page, errors);
  page.on("pageerror", error => errors.push(error.message));
});
test.afterEach(async ({ page }) => { expect(browserErrors.get(page)).toEqual([]); });
async function ready(page: Page) {
  await expect(root(page)).toHaveAttribute("data-ready", "true", { timeout: 90000 });
  await expect(root(page)).toHaveAttribute("data-mode", "world");
}
async function open(page: Page, tab: string) {
  if (!await panel(page).isVisible()) await page.getByRole("button", { name: "More", exact: true }).click();
  await panel(page).getByRole("button", { name: tab, exact: true }).click();
}
async function tools(page: Page) {
  if (await panel(page).isVisible()) await panel(page).getByRole("button", { name: "Close", exact: true }).click();
  await page.getByRole("button", { name: "More", exact: true }).click();
}
async function restore(page: Page, value: unknown) {
  await tools(page);
  await page.getByLabel("Import valley archive").setInputFiles({ name: "valley-fixture.json", mimeType: "application/json", buffer: Buffer.from(JSON.stringify(value)) });
  await expect(status(page)).toContainText("Chapter restored", { timeout: 15000 });
  await panel(page).getByRole("button", { name: "Close", exact: true }).click();
  await expect(panel(page)).toHaveCount(0);
}
async function read(page: Page, key = "v6"): Promise<ValleySave> {
  return page.evaluate(key => new Promise<ValleySave>((resolve, reject) => {
    const request = indexedDB.open("fable-crown", 1);
    request.onsuccess = () => {
      const db = request.result, get = db.transaction("saves").objectStore("saves").get(key);
      get.onsuccess = () => { resolve(get.result); db.close(); }; get.onerror = () => reject(get.error);
    }; request.onerror = () => reject(request.error);
  }), key);
}
async function snapshot(page: Page) {
  await tools(page);
  await panel(page).getByRole("button", { name: "Save on this device", exact: true }).click();
  await expect(status(page)).toContainText("Chapter saved on this device");
  return read(page);
}
function home(now: number) {
  const save = createValleySave(now);
  expect(applyValleyCommand(save, { type: "place-home", x: 54, z: 155, rotation: 0 }, now).ok).toBe(true);
  addItems(save.chapter.player.inventory, "coins", 75);
  expect(applyValleyCommand(save, { type: "pay", amount: 100 }, now).ok).toBe(true);
  return save;
}
function position(save: ValleySave, x: number, z: number) {
  save.action.player.x = x; save.action.player.z = z;
  save.chapter.player.position = tile(x, z); save.chapter.player.previousPosition = tile(x, z);
}

test("valley UI places a free tent, pays the account in parts and advances guidance by progress", async ({ page }) => {
  const errors: string[] = []; page.on("pageerror", error => errors.push(error.message));
  await page.goto("./?chapter=valley"); await ready(page);
  const fixture = createValleySave(Date.now()); addItems(fixture.chapter.bank, "coins", 75, Infinity);
  await restore(page, fixture);
  await page.getByRole("button", { name: "Home", exact: true }).click();
  await panel(page).getByRole("button", { name: "Place free tent", exact: true }).click();
  await page.getByLabel("Placement X").fill("54"); await page.getByLabel("Placement Z").fill("155");
  await panel(page).getByRole("button", { name: "Confirm", exact: true }).click();
  await expect(status(page)).toContainText("Your tent is ready");
  await page.getByRole("button", { name: "Home", exact: true }).click();
  await page.getByLabel("Cottage payment").fill("25");
  await panel(page).getByRole("button", { name: "Pay 25 coins", exact: true }).click();
  await expect(panel(page)).toContainText("Cottage account: 25 / 100 coins.");
  await panel(page).getByRole("button", { name: "Pay remaining 75", exact: true }).click();
  await expect(status(page)).toContainText("90-minute cottage build");
  await expect(page.getByRole("progressbar", { name: "Cottage construction" })).toHaveAttribute("max", "9000");
  await open(page, "Journal");
  await expect(panel(page)).toContainText("While your cottage grows");
  await expect(panel(page)).toContainText("Chapter 2");
  const saved = await snapshot(page);
  expect(saved.valley.paid).toBe(100);
  expect(saved.valley.home).toEqual({ x: 54, z: 155, rotation: 0, tentPacked: false });
  expect(itemCount(saved.chapter.player.inventory, "coins") + itemCount(saved.chapter.bank, "coins")).toBe(0);
  expect(itemCount(saved.chapter.player.inventory, "valley-flower-seeds")).toBe(4);
  expect(errors).toEqual([]);
});

test("valley UI reserves a real craft batch and sells the finished planks at the nearby caravan", async ({ page }) => {
  await page.goto("./?chapter=valley"); await ready(page);
  const fixture = createValleySave(Date.now()); position(fixture, 71, 140); addItems(fixture.chapter.player.inventory, "logs", 2);
  await restore(page, fixture); await open(page, "Craft");
  await page.getByLabel("Quantity", { exact: true }).fill("2");
  const recipe = panel(page).locator("article").filter({ has: page.getByRole("heading", { name: "Saw two planks", exact: true }) });
  await recipe.getByRole("button", { name: "Make 2", exact: true }).click();
  await expect(status(page)).toContainText("Ingredients reserved");
  await expect(panel(page).locator(".valley-job")).toHaveCount(1);
  await expect(panel(page).locator(".valley-job")).toHaveCount(0, { timeout: 15000 });
  await open(page, "Trade");
  const planks = panel(page).locator(".valley-trade").filter({ hasText: "Sawn plank" });
  await expect(planks).toContainText("Have 4");
  await planks.getByRole("button", { name: "Sell 2", exact: true }).click();
  await expect(planks).toContainText("Have 2");
  const saved = await snapshot(page);
  expect(itemCount(saved.chapter.player.inventory, "logs")).toBe(0);
  expect(itemCount(saved.chapter.player.inventory, "valley-plank")).toBe(2);
  expect(itemCount(saved.chapter.player.inventory, "coins")).toBe(29);
  expect(saved.valley.carpentryXp).toBe(200);
  expect(saved.valley.workQueue).toEqual([]);
});

test("actual import reconciles offline cottage and optional forge, with progress-based chapter three", async ({ page }) => {
  await page.goto("./?chapter=valley"); await ready(page);
  const before = Date.now() - 6 * HOUR, cottage = home(before);
  await restore(page, cottage); await page.getByRole("button", { name: "Home", exact: true }).click();
  await expect(panel(page)).toContainText("Your cottage is ready.");
  await expect(page.getByRole("progressbar", { name: "Cottage construction" })).toHaveJSProperty("value", COTTAGE_TICKS);
  const forge = home(Date.now() - 2 * HOUR);
  forge.valley.cottageTicks = COTTAGE_TICKS; forge.valley.forge = { logs: 12, bars: 2, ticks: 0 };
  forge.valley.furniture = [{ id: "qa-stool", itemId: "stool", x: 58, z: 168, rotation: 0 }];
  forge.valley.flags.push("talked-merchant", "talked-smith");
  // Progress, rather than three calendar dates, unlocks the final onboarding chapter.
  forge.valley.startedAt = Date.now();
  expect(validateValleySave(forge)).not.toBeNull();
  await restore(page, forge); await open(page, "Projects");
  await expect(panel(page)).toContainText("The public forge is ready.");
  await expect(page.getByRole("progressbar", { name: "Public forge construction" })).toHaveJSProperty("value", FORGE_TICKS);
  await open(page, "Journal");
  await expect(panel(page)).toContainText("Chapter 3");
  await expect(panel(page)).toContainText("A home in the valley");
});

test("real IndexedDB migrates V5 without changing its archive and recovers a corrupt V6 from backup", async ({ page }) => {
  await page.goto("./?chapter=valley"); await ready(page);
  const legacy = createRpg(Date.now(), 42); addItems(legacy.bank, "logs", 12, Infinity);
  await page.evaluate(value => new Promise<void>((resolve, reject) => {
    const request = indexedDB.open("fable-crown", 1); request.onsuccess = () => {
      const db = request.result, tx = db.transaction("saves", "readwrite"), store = tx.objectStore("saves");
      store.put(value, "v5"); store.delete("v6"); store.delete("v6-backup");
      tx.oncomplete = () => { db.close(); resolve(); }; tx.onerror = () => reject(tx.error);
    };
  }), legacy);
  await page.reload(); await ready(page);
  const migrated = await snapshot(page);
  expect(itemCount(migrated.chapter.bank, "logs")).toBe(12);
  expect(await read(page, "v5")).toEqual(legacy);
  const backup = createValleySave(Date.now()); backup.valley.goal = "Checkpoint A";
  await restore(page, backup);
  const next = structuredClone(backup); next.valley.goal = "Checkpoint B";
  await restore(page, next);
  await expect.poll(async () => (await read(page, "v6-backup")).valley.goal).toBe("Checkpoint A");
  await page.evaluate(() => new Promise<void>((resolve, reject) => {
    const request = indexedDB.open("fable-crown", 1); request.onsuccess = () => {
      const db = request.result, tx = db.transaction("saves", "readwrite");
      tx.objectStore("saves").put({ version: 6, corrupt: true }, "v6");
      tx.oncomplete = () => { db.close(); resolve(); }; tx.onerror = () => reject(tx.error);
    };
  }));
  await page.reload(); await ready(page);
  await expect(page.getByRole("button", { name: "Open current goal" })).toHaveText("Checkpoint A");
  expect(await read(page, "v5")).toEqual(legacy);
  const recovered = await snapshot(page);
  expect(recovered.valley.goal).toBe("Checkpoint A");
  expect(validateValleySave(recovered)).not.toBeNull();
});

test("production valley keyboard, emulated controller and touch cancellation work in both mobile orientations", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.addInitScript(() => {
    const state = { axes: [0, 0, 0, 0], buttons: Array.from({ length: 17 }, () => ({ pressed: false, touched: false, value: 0 })) };
    Object.assign(window, { valleyTestPad: state });
    Object.defineProperty(navigator, "getGamepads", { value: () => [{ ...state, connected: true, index: 0, id: "QA standard controller", mapping: "standard", timestamp: performance.now() }] });
  });
  await page.goto("./?chapter=valley"); await ready(page);
  const before = Number(await root(page).getAttribute("data-player-x"));
  await page.keyboard.down("d"); await page.waitForTimeout(300); await page.keyboard.up("d");
  await expect.poll(async () => Number(await root(page).getAttribute("data-player-x"))).toBeGreaterThan(before + .1);
  await page.evaluate(() => { (window as unknown as { valleyTestPad: { axes: number[] } }).valleyTestPad.axes[0] = 1; });
  const padBefore = Number(await root(page).getAttribute("data-player-x"));
  await expect.poll(async () => Number(await root(page).getAttribute("data-player-x"))).toBeGreaterThan(padBefore + .1);
  await page.evaluate(() => { (window as unknown as { valleyTestPad: { axes: number[] } }).valleyTestPad.axes[0] = 0; });
  await page.waitForTimeout(250);
  const menuBefore = Number(await root(page).getAttribute("data-player-x"));
  await page.evaluate(() => {
    const pad = (window as unknown as { valleyTestPad: { buttons: { pressed: boolean; value: number }[] } }).valleyTestPad;
    pad.buttons[9].pressed = true; pad.buttons[9].value = 1;
  });
  await expect(panel(page).getByRole("heading", { name: "Backpack & storage" })).toBeVisible();
  // A physical button commonly spans multiple animation frames; one hold is one menu edge.
  await page.waitForTimeout(200);
  await expect(panel(page).getByRole("heading", { name: "Backpack & storage" })).toBeVisible();
  await page.evaluate(() => {
    const pad = (window as unknown as { valleyTestPad: { axes: number[]; buttons: { pressed: boolean; value: number }[] } }).valleyTestPad;
    pad.buttons[9].pressed = false; pad.buttons[9].value = 0; pad.axes[0] = 1;
  });
  await page.waitForTimeout(300);
  expect(Number(await root(page).getAttribute("data-player-x"))).toBeCloseTo(menuBefore, 2);
  await page.evaluate(() => {
    const pad = (window as unknown as { valleyTestPad: { axes: number[]; buttons: { pressed: boolean; value: number }[] } }).valleyTestPad;
    pad.axes[0] = 0; pad.buttons[1].pressed = true; pad.buttons[1].value = 1;
  });
  await expect(panel(page)).toHaveCount(0);
  await page.evaluate(() => {
    const pad = (window as unknown as { valleyTestPad: { buttons: { pressed: boolean; value: number }[] } }).valleyTestPad;
    pad.buttons[1].pressed = false; pad.buttons[1].value = 0;
  });
  const stick = page.getByRole("group", { name: "Movement joystick" }), box = await stick.boundingBox(); expect(box).not.toBeNull();
  const cdp = await page.context().newCDPSession(page);
  await cdp.send("Emulation.setTouchEmulationEnabled", { enabled: true });
  await cdp.send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: [{ x: box!.x + box!.width / 2 + 35, y: box!.y + box!.height / 2 }] });
  const touchBefore = Number(await root(page).getAttribute("data-player-x"));
  await expect.poll(async () => Number(await root(page).getAttribute("data-player-x"))).toBeGreaterThan(touchBefore + .1);
  await cdp.send("Input.dispatchTouchEvent", { type: "touchCancel", touchPoints: [] });
  await page.waitForTimeout(250);
  const stopped = Number(await root(page).getAttribute("data-player-x"));
  await page.waitForTimeout(300);
  expect(Number(await root(page).getAttribute("data-player-x"))).toBeCloseTo(stopped, 2);
  for (const size of [{ width: 390, height: 844 }, { width: 844, height: 390 }]) {
    await page.setViewportSize(size);
    await expect(page.getByRole("button", { name: "Follow", exact: true })).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    for (const control of await page.locator("[data-action-controls] button, .valley-camera button").all()) {
      const bounds = await control.boundingBox(); expect(bounds).not.toBeNull();
      expect(bounds!.width).toBeGreaterThanOrEqual(44); expect(bounds!.height).toBeGreaterThanOrEqual(44);
      expect(bounds!.x).toBeGreaterThanOrEqual(0); expect(bounds!.x + bounds!.width).toBeLessThanOrEqual(size.width);
      expect(bounds!.y + bounds!.height).toBeLessThanOrEqual(size.height);
    }
  }
});

test("invalid UI imports preserve the current valley and device save", async ({ page }) => {
  await page.goto("./?chapter=valley"); await ready(page);
  const fixture = home(Date.now()); fixture.valley.goal = "Preserve this home";
  await restore(page, fixture);
  const before = await snapshot(page);
  await page.getByLabel("Import valley archive").setInputFiles({ name: "broken.json", mimeType: "application/json", buffer: Buffer.from(JSON.stringify({ version: 6, chapter: {} })) });
  await expect(status(page)).toContainText("That chapter is invalid. Your current progress is safe.");
  await expect(page.getByRole("button", { name: "Open current goal" })).toHaveText("Preserve this home");
  const saved = await read(page);
  expect(saved.valley.home).toEqual(before.valley.home);
  expect(saved.valley.paid).toBe(before.valley.paid);
  expect(saved.chapter.player.inventory).toEqual(before.chapter.player.inventory);
  expect(saved.chapter.bank).toEqual(before.chapter.bank);
  await page.getByLabel("Import valley archive").setInputFiles({ name: "not-json.json", mimeType: "application/json", buffer: Buffer.from("{") });
  await expect(status(page)).toContainText("That file is not readable JSON.");
  await expect(page.getByRole("button", { name: "Open current goal" })).toHaveText("Preserve this home");
});

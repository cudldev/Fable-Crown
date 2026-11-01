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
const strike = (page: Page) => page.locator("[data-action-strike]");
const errors = new WeakMap<Page, string[]>();
test.beforeEach(async ({ page }) => {
  const captured: string[] = []; errors.set(page, captured);
  page.on("pageerror", error => captured.push(error.message));
});
test.afterEach(async ({ page }) => { expect(errors.get(page)).toEqual([]); });
async function ready(page: Page) {
  await expect(app(page)).toHaveAttribute("data-ready", "true", { timeout: 90000 });
  await expect(app(page)).toHaveAttribute("data-mode", "world");
  expect(await page.evaluate(() => matchMedia("(pointer: coarse)").matches)).toBe(true);
}
async function menu(page: Page, section: "Settings" | "Journal" | "Build & manage" | "Backpack") {
  if (await dialog(page).isVisible()) await dialog(page).getByRole("button", { name: "Close", exact: true }).tap();
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
function at(save: ValleySave, x: number, z: number) {
  Object.assign(save.action.player, { x, z, facingX: 0, facingZ: -1, health: save.action.player.maxHealth, swing: 0, blocking: false });
  Object.assign(save.chapter.player, { position: tile(x, z), previousPosition: tile(x, z), health: save.action.player.health, path: [], movement: null, action: null });
  const now = Date.now(); save.savedAt = now; save.chapter.savedAt = now; save.chapter.calendar = calendarDate(now);
}
async function bounds(locator: Locator) {
  const value = await locator.boundingBox(); expect(value).not.toBeNull(); return value!;
}
async function fullyInsideMenu(page: Page, target: Locator) {
  // Read geometry directly: locator actions would scroll the target into view and hide cutoff.
  const hit = await bounds(target);
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

test("coarse touch reports real repeated gathering, recovery and empty attempts without extra rewards", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("./?chapter=valley"); await ready(page);
  const fixture = createValleySave(Date.now()); at(fixture, 25, 140);
  fixture.chapter.player.inventory = [{ itemId: "bronze-axe", quantity: 1 }]; fixture.chapter.seed = 2;
  const xp = fixture.chapter.player.skills.woodcutting;
  await restore(page, fixture);
  await expect(strike(page)).toHaveAccessibleName("Chop");
  await expect(page.getByTestId("valley-context")).toHaveAttribute("data-target-ready", "true");
  await strike(page).tap();
  await expect(feedback(page)).toContainText(/\+1 Logs/);
  await expect(feedback(page)).toContainText("+25 woodcutting XP");
  await expect(feedback(page)).toBeVisible();
  await capture(page, "gather-feedback");
  const first = await feedback(page).getAttribute("data-feedback-id");
  await expect(strike(page)).toHaveAttribute("data-swinging", "false");
  await strike(page).tap();
  await expect.poll(() => feedback(page).getAttribute("data-feedback-id")).not.toBe(first);
  await expect(feedback(page)).toContainText(/\+1 Logs/);
  await expect(feedback(page)).toHaveAttribute("data-visible", "true");
  await expect(strike(page)).toHaveAttribute("data-swinging", "false");
  // Separate recovery feedback from the two rewards: a newer failed tap can legitimately
  // replace the previous reward toast. The seeded third attempt gives no material.
  await strike(page).tap(); await expect(strike(page)).toHaveAttribute("data-swinging", "true");
  await strike(page).tap(); await expect(feedback(page)).toContainText("Finishing this swing");
  await expect(strike(page)).toHaveAttribute("data-swinging", "false");
  const gathered = await snapshot(page);
  expect(itemCount(gathered.chapter.player.inventory, "logs")).toBe(2);
  expect(gathered.chapter.player.skills.woodcutting).toBe(xp + 500);
  await menu(page, "Journal");
  const history = dialog(page).getByRole("region", { name: "Recent activity" });
  await expect(history).toContainText("Finishing this swing");
  expect(await history.getByText("+1 Logs · +25 woodcutting XP", { exact: true }).count()).toBe(2);
  await dialog(page).getByRole("button", { name: "Back", exact: true }).tap(); await capture(page, "game-menu");
  const empty = createValleySave(Date.now()); at(empty, 52, 150);
  await restore(page, empty); await strike(page).tap();
  await expect(feedback(page)).toContainText("Nothing gathered this swing");
  await expect(feedback(page)).toContainText("Face a tree, rock or pond");
  await expect(strike(page)).toHaveAttribute("data-swinging", "false");
  const unchanged = await snapshot(page);
  expect(unchanged.chapter.player.inventory).toEqual(empty.chapter.player.inventory);
  expect(unchanged.chapter.player.skills).toEqual(empty.chapter.player.skills);
});

test("coarse portrait and landscape keep both handed layouts reachable and clear of other controls", async ({ page }) => {
  await page.goto("./?chapter=valley"); await ready(page);
  const fixture = createValleySave(Date.now()); at(fixture, 52, 150); await restore(page, fixture);
  for (const size of [{ width: 320, height: 568 }, { width: 390, height: 844 }, { width: 667, height: 375 }, { width: 844, height: 390 }]) {
    await page.setViewportSize(size);
    for (const hand of ["right", "left"] as const) {
      await menu(page, "Settings");
      await dialog(page).getByRole("button", { name: hand === "right" ? "Right-handed" : "Left-handed", exact: true }).tap();
      await dialog(page).getByRole("button", { name: "Lower controls", exact: true }).tap();
      await dialog(page).getByRole("button", { name: "Close", exact: true }).tap();
      await expect(page.locator("[data-action-controls]")).toHaveAttribute("data-hand", hand);
      await strike(page).tap();
      await expect(feedback(page)).toHaveAttribute("data-visible", "true");
      const controls = await page.locator(".action-stick, [data-action-controls] button, .valley-camera button").all();
      const rectangles = [];
      for (const control of controls) {
        const box = await bounds(control); rectangles.push(box);
        expect(box.width).toBeGreaterThanOrEqual(44); expect(box.height).toBeGreaterThanOrEqual(44);
        expect(box.x).toBeGreaterThanOrEqual(0); expect(box.y).toBeGreaterThanOrEqual(0);
        expect(box.x + box.width).toBeLessThanOrEqual(size.width + .5);
        expect(box.y + box.height).toBeLessThanOrEqual(size.height + .5);
      }
      for (let a = 0; a < rectangles.length; a++) for (let b = a + 1; b < rectangles.length; b++) {
        const one = rectangles[a], two = rectangles[b];
        const overlap = Math.min(one.x + one.width, two.x + two.width) - Math.max(one.x, two.x) > .5 && Math.min(one.y + one.height, two.y + two.height) - Math.max(one.y, two.y) > .5;
        expect(overlap, `${size.width}×${size.height} ${hand}: touch controls ${a}/${b} overlap`).toBe(false);
      }
      for (const text of [page.getByTestId("valley-context"), feedback(page)]) {
        const box = await bounds(text);
        expect(box.x).toBeGreaterThanOrEqual(0); expect(box.y).toBeGreaterThanOrEqual(0);
        expect(box.x + box.width).toBeLessThanOrEqual(size.width + .5); expect(box.y + box.height).toBeLessThanOrEqual(size.height + .5);
        for (const control of rectangles) {
          expect(Math.min(box.x + box.width, control.x + control.width) - Math.max(box.x, control.x) > .5 && Math.min(box.y + box.height, control.y + control.height) - Math.max(box.y, control.y) > .5,
            `${size.width}×${size.height} ${hand}: action feedback covers a control`).toBe(false);
        }
      }
      if (hand === "right" && (size.width === 390 || size.width === 844)) await capture(page, "hud-feedback");
      const primary = await bounds(strike(page)), block = await bounds(page.locator(".action-block"));
      expect(hand === "right" ? primary.x > block.x : primary.x < block.x).toBe(true);
      const lower = primary.y;
      await menu(page, "Settings"); await dialog(page).getByRole("button", { name: "Raise controls", exact: true }).tap();
      await dialog(page).getByRole("button", { name: "Close", exact: true }).tap();
      await expect(page.locator("[data-action-controls]")).toHaveAttribute("data-raised", "true");
      expect((await bounds(strike(page))).y).toBeLessThan(lower - 10);
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    }
  }
});

test("world stations filter services, finish real work while actors pause, and keep a suspended placement draft", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("./?chapter=valley"); await ready(page);
  const fixture = createValleySave(Date.now()); at(fixture, 69, 140);
  fixture.chapter.player.inventory = [{ itemId: "logs", quantity: 1 }, { itemId: "coins", quantity: 25 }];
  await restore(page, fixture);
  await menu(page, "Backpack");
  await expect(dialog(page).getByRole("heading", { name: "Backpack & equipment", exact: true })).toBeVisible();
  await expect(dialog(page).getByRole("heading", { name: "Connected storage", exact: true })).toHaveCount(0);
  await expect(dialog(page).getByRole("button", { name: /^Store / })).toHaveCount(0);
  await dialog(page).getByRole("button", { name: "Close", exact: true }).tap();
  await page.locator(".action-interact").tap();
  await expect(dialog(page)).toHaveAttribute("data-menu-panel", "craft");
  await expect(dialog(page)).toContainText("Communal carpentry workbench");
  for (const recipe of Object.values(VALLEY_RECIPES)) {
    await expect(dialog(page).getByRole("group", { name: "Recipes", exact: true }).getByRole("button", { name: recipe.name, exact: true })).toHaveCount(recipe.station === "workbench" ? 1 : 0);
  }
  await dialog(page).getByRole("group", { name: "Recipes", exact: true }).getByRole("button", { name: "Saw two planks", exact: true }).tap();
  await expect(dialog(page).getByTestId("recipe-detail")).toHaveCount(1);
  await expect(dialog(page).getByTestId("recipe-detail")).toHaveAttribute("data-recipe-id", "valley-plank");
  await capture(page, "station");
  await page.setViewportSize({ width: 844, height: 390 }); await capture(page, "station");
  await fullyInsideMenu(page, dialog(page).getByTestId("recipe-detail").getByRole("button", { name: "Make one", exact: true }));
  await page.setViewportSize({ width: 390, height: 844 });
  await page.waitForTimeout(200); // Let the interface-open acknowledgement reach the observable HUD.
  const frame = await app(page).getAttribute("data-action-frame");
  const health = await page.locator('meter[aria-label="Player health"]').getAttribute("value");
  const planks = dialog(page).getByTestId("recipe-detail");
  await planks.getByRole("button", { name: "Make one", exact: true }).tap();
  await expect(dialog(page).locator(".valley-job")).toHaveCount(1);
  await expect(dialog(page).locator(".valley-job")).toHaveCount(0, { timeout: 10000 });
  await expect(dialog(page).locator(".valley-menu-footer")).toContainText("Crafting complete");
  await expect(dialog(page).locator(".valley-menu-footer")).toContainText("+2 Sawn plank");
  await expect(dialog(page).locator(".valley-menu-footer")).toContainText("+10 carpentry XP");
  await expect(dialog(page).locator(".valley-menu-footer")).toContainText("Ready in your backpack.");
  await expect(app(page)).toHaveAttribute("data-action-frame", frame!);
  await expect(page.locator('meter[aria-label="Player health"]')).toHaveAttribute("value", health!);
  await dialog(page).getByRole("button", { name: "Back", exact: true }).tap();
  await expect(dialog(page)).toHaveCount(0); // Direct object menus return to the world.
  await page.keyboard.down("s");
  try { await expect.poll(async () => Number(await app(page).getAttribute("data-player-z"))).toBeGreaterThan(141.8); }
  finally { await page.keyboard.up("s"); }
  await page.keyboard.down("d");
  try { await expect.poll(async () => Number(await app(page).getAttribute("data-player-x"))).toBeGreaterThan(73.5); }
  finally { await page.keyboard.up("d"); }
  await page.locator(".action-interact").tap();
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
    const other = createValleySave(Date.now()); at(other, station.x, station.z); await restore(page, other);
    await page.locator(".action-interact").tap();
    await expect(dialog(page)).toHaveAttribute("data-menu-panel", "craft");
    for (const recipe of Object.values(VALLEY_RECIPES)) {
      await expect(dialog(page).getByRole("group", { name: "Recipes", exact: true }).getByRole("button", { name: recipe.name, exact: true })).toHaveCount(recipe.station === station.kind ? 1 : 0);
    }
    await expect(dialog(page).getByTestId("recipe-detail")).toHaveCount(1);
    await expect(dialog(page).getByTestId("recipe-detail")).toHaveAttribute("data-recipe-id", Object.values(VALLEY_RECIPES).find(recipe => recipe.station === station.kind)!.id);
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
  await expect(dialog(page)).toHaveCount(0); await expect(strike(page)).toBeVisible();
  await page.getByRole("button", { name: "Resume placement", exact: true }).tap();
  await expect(page.getByLabel("Placement X")).toHaveValue("58"); await expect(page.getByLabel("Placement Z")).toHaveValue("168");
  await expect(dialog(page).getByRole("button", { name: "Rotate 90°", exact: true })).toBeVisible();
  await dialog(page).getByRole("button", { name: "Cancel", exact: true }).tap();
  const kept = await snapshot(page);
  expect(itemCount(kept.chapter.player.inventory, "valley-stool")).toBe(1); expect(kept.valley.furniture).toEqual([]);
});

test("independent move and strike touches release on cancellation, orientation and menu entry", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("./?chapter=valley"); await ready(page);
  const fixture = createValleySave(Date.now()); at(fixture, 52, 150); await restore(page, fixture);
  const cdp = await page.context().newCDPSession(page);
  const stick = page.getByRole("group", { name: "Movement joystick" });
  const start = async () => {
    const move = await bounds(stick), action = await bounds(strike(page));
    await cdp.send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: [{ id: 1, x: move.x + move.width / 2 + 35, y: move.y + move.height / 2 }, { id: 2, x: action.x + action.width / 2, y: action.y + action.height / 2 }] });
  };
  const before = Number(await app(page).getAttribute("data-player-x"));
  await start(); await expect(strike(page)).toHaveAttribute("data-held", "true");
  await expect.poll(async () => Number(await app(page).getAttribute("data-player-x"))).toBeGreaterThan(before + .1);
  await cdp.send("Input.dispatchTouchEvent", { type: "touchCancel", touchPoints: [] });
  await expect(strike(page)).toHaveAttribute("data-held", "false");
  await page.waitForTimeout(200);
  const stopped = Number(await app(page).getAttribute("data-player-x"));
  await page.waitForTimeout(250);
  expect(Number(await app(page).getAttribute("data-player-x"))).toBeCloseTo(stopped, 2);
  const move = await bounds(stick), mode = page.locator("[data-action-mode]"), modeBox = await bounds(mode);
  const movePoint = { id: 1, x: move.x + move.width / 2 + 35, y: move.y + move.height / 2 };
  const modePoint = { id: 2, x: modeBox.x + modeBox.width / 2, y: modeBox.y + modeBox.height / 2 };
  const previousMode = await mode.getAttribute("data-mode");
  await cdp.send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: [movePoint] });
  await expect.poll(async () => Number(await app(page).getAttribute("data-player-x"))).toBeGreaterThan(stopped + .1);
  await cdp.send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: [movePoint, modePoint] });
  // This Chrome contact stream ends the supplied contact; joystick id1 remains held.
  await cdp.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [modePoint] });
  await expect(mode).toHaveAttribute("data-mode", previousMode === "tool" ? "weapon" : "tool");
  await page.waitForTimeout(200); // Exclude an old 100ms HUD snapshot when measuring continued motion.
  const afterMode = Number(await app(page).getAttribute("data-player-x"));
  await expect.poll(async () => Number(await app(page).getAttribute("data-player-x")), { message: "The held joystick must keep moving after the other thumb switches mode" }).toBeGreaterThan(afterMode + .1);
  await expect(stick.locator(".action-stick-thumb")).not.toHaveAttribute("style", /translate\(0px, 0px\)/);
  await cdp.send("Input.dispatchTouchEvent", { type: "touchCancel", touchPoints: [] });
  await mode.tap(); // A primary touch also toggles once, without a synthesized-click bounce.
  await expect(mode).toHaveAttribute("data-mode", previousMode!); await page.waitForTimeout(200);
  await expect(mode).toHaveAttribute("data-mode", previousMode!);
  await cdp.send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: [modePoint] });
  await cdp.send("Input.dispatchTouchEvent", { type: "touchCancel", touchPoints: [] });
  await expect(mode).toHaveAttribute("data-mode", previousMode!);
  const outside = { ...modePoint, x: modeBox.x - 15 };
  await cdp.send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: [modePoint] });
  await cdp.send("Input.dispatchTouchEvent", { type: "touchMove", touchPoints: [outside] });
  await cdp.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [outside] });
  await page.waitForTimeout(200);
  await expect(mode).toHaveAttribute("data-mode", previousMode!);
  await start(); await expect(strike(page)).toHaveAttribute("data-held", "true");
  await page.setViewportSize({ width: 844, height: 390 });
  await expect(strike(page)).toHaveAttribute("data-held", "false");
  await expect(stick.locator(".action-stick-thumb")).toHaveAttribute("style", /translate\(0px, 0px\)/);
  await cdp.send("Input.dispatchTouchEvent", { type: "touchCancel", touchPoints: [] });
  await page.getByRole("button", { name: "Menu", exact: true }).tap();
  await expect(dialog(page)).toHaveAttribute("data-menu-panel", "menu");
  await capture(page, "game-menu");
  await page.setViewportSize({ width: 667, height: 375 });
  await fullyInsideMenu(page, dialog(page).getByRole("button", { name: "Resume", exact: true }));
  await fullyInsideMenu(page, dialog(page).getByRole("button", { name: "Settings", exact: true }));
  await capture(page, "small-game-menu");
  for (const worldOnly of ["Crafting", "Trade", "Visitors", "Orders", "Public projects"]) {
    await expect(dialog(page).getByRole("button", { name: worldOnly, exact: true })).toHaveCount(0);
  }
  await dialog(page).getByRole("button", { name: "Settings", exact: true }).tap();
  await dialog(page).getByRole("button", { name: "Back", exact: true }).tap();
  await expect(dialog(page)).toHaveAttribute("data-menu-panel", "menu");
  await dialog(page).getByRole("button", { name: "Resume", exact: true }).tap();
  await expect(strike(page)).toHaveAttribute("data-held", "false");
  const resumed = Number(await app(page).getAttribute("data-player-x"));
  await page.waitForTimeout(250);
  expect(Number(await app(page).getAttribute("data-player-x"))).toBeCloseTo(resumed, 2);
  const workbench = createValleySave(Date.now()); at(workbench, 69, 140); await restore(page, workbench);
  const walking = await bounds(stick), interact = await bounds(page.locator(".action-interact"));
  const walkingPoint = { id: 1, x: walking.x + walking.width / 2 + 35, y: walking.y + walking.height / 2 };
  const interactPoint = { id: 2, x: interact.x + interact.width / 2, y: interact.y + interact.height / 2 };
  await cdp.send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: [walkingPoint] });
  await expect.poll(async () => Number(await app(page).getAttribute("data-player-x"))).toBeGreaterThan(69.1);
  await cdp.send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: [walkingPoint, interactPoint] });
  await cdp.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [interactPoint] });
  await expect(dialog(page)).toHaveAttribute("data-menu-panel", "craft");
  await expect(dialog(page)).toContainText("Communal carpentry workbench");
  await page.waitForTimeout(200);
  const inMenu = Number(await app(page).getAttribute("data-player-x"));
  await page.waitForTimeout(250);
  expect(Number(await app(page).getAttribute("data-player-x"))).toBeCloseTo(inMenu, 2);
  await cdp.send("Input.dispatchTouchEvent", { type: "touchCancel", touchPoints: [] });
  await dialog(page).getByRole("button", { name: "Back", exact: true }).tap();
  await page.waitForTimeout(250);
  expect(Number(await app(page).getAttribute("data-player-x"))).toBeCloseTo(inMenu, 2);
});

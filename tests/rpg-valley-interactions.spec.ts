import { expect, test, type Locator, type Page } from "@playwright/test";
import { itemCount } from "../src/rpg/inventory";
import { tile } from "../src/rpg/world";
import { COTTAGE_TICKS, type ValleySave } from "../src/valley/contracts";
import { createValleySave, validateValleySave } from "../src/valley/save";
import { applyValleyCommand } from "../src/valley/settlement";

// Real WebGL and input checks belong in local visual QA, never release CI.
test.use({ hasTouch: true, deviceScaleFactor: 1 });
const root = (page: Page) => page.getByTestId("valley-app");
const panel = (page: Page) => page.getByRole("dialog");
const camera = (page: Page) => page.locator("[data-interaction-camera]");
const errors = new WeakMap<Page, string[]>();
test.beforeEach(async ({ page }) => {
  const captured: string[] = []; errors.set(page, captured);
  page.on("pageerror", error => captured.push(error.message));
  await page.addInitScript(() => {
    const state = { axes: [0, 0, 0, 0], buttons: Array.from({ length: 17 }, () => ({ pressed: false, touched: false, value: 0 })) };
    Object.assign(window, { interactionTestPad: state });
    Object.defineProperty(navigator, "getGamepads", { value: () => [{ ...state, connected: true, index: 0, id: "QA standard pad", mapping: "standard", timestamp: performance.now() }] });
  });
});
test.afterEach(async ({ page }) => { expect(errors.get(page)).toEqual([]); });
async function press(page: Page, index: number) {
  for (const held of [true, false]) {
    await page.evaluate(({ index, held }) => {
      const pad = (window as unknown as { interactionTestPad: { buttons: { pressed: boolean; touched: boolean; value: number }[] } }).interactionTestPad;
      Object.assign(pad.buttons[index], { pressed: held, touched: held, value: Number(held) });
    }, { index, held });
    await page.evaluate(() => new Promise<void>(resolve => requestAnimationFrame(() => requestAnimationFrame(() => resolve()))));
  }
}
async function ready(page: Page) {
  await page.goto("./?chapter=valley");
  await expect(root(page)).toHaveAttribute("data-ready", "true", { timeout: 90000 });
  await expect(root(page)).toHaveAttribute("data-mode", "world");
}
function fixtureAt(x: number, z: number) {
  const save = createValleySave(Date.now());
  Object.assign(save.action.player, { x, z, facingX: 0, facingZ: -1 });
  Object.assign(save.chapter.player, { position: tile(x, z), previousPosition: tile(x, z), path: [], movement: null, action: null });
  return save;
}
async function settings(page: Page) {
  for (let i = 0; i < 8 && await panel(page).isVisible(); i++) await page.keyboard.press("Escape");
  await page.getByRole("button", { name: "Menu", exact: true }).tap();
  await panel(page).getByRole("button", { name: "Settings", exact: true }).tap();
}
async function restore(page: Page, save: ValleySave) {
  expect(validateValleySave(save)).not.toBeNull();
  await settings(page);
  await page.getByLabel("Import valley archive").setInputFiles({ name: "interaction-fixture.json", mimeType: "application/json", buffer: Buffer.from(JSON.stringify(save)) });
  await expect(panel(page)).toContainText("Chapter restored");
  await panel(page).getByRole("button", { name: "Close", exact: true }).tap();
}
async function snapshot(page: Page): Promise<ValleySave> {
  await settings(page);
  await panel(page).getByRole("button", { name: "Save on this device", exact: true }).click();
  await expect(panel(page)).toContainText("Chapter saved on this device");
  return page.evaluate(() => new Promise<ValleySave>((resolve, reject) => {
    const request = indexedDB.open("fable-crown", 1);
    request.onerror = () => reject(request.error);
    request.onsuccess = () => {
      const db = request.result, get = db.transaction("saves").objectStore("saves").get("valley-v1");
      get.onsuccess = () => { resolve(get.result); db.close(); }; get.onerror = () => { reject(get.error); db.close(); };
    };
  }));
}
async function interact(page: Page) {
  await page.keyboard.press("e");
  await expect(panel(page)).toHaveAttribute("data-menu-panel", "interaction");
  await expect(root(page)).toHaveAttribute("data-ui-state", "interaction");
  await expect(page.locator(".valley-play-ui")).toBeHidden();
  await expect(page.locator("[data-action-controls]")).toHaveCount(0);
  await expect(page.locator(".three-performance")).toBeHidden();
  await expect(page.locator(".three-hit-layer")).toHaveCSS("display", "none");
  await expect(page.getByRole("button", { name: "Inspect Alden", exact: true })).toHaveCount(0);
}
async function framed(page: Page) {
  await expect(camera(page)).toHaveAttribute("data-interaction-camera", "active");
  const area = JSON.parse((await camera(page).getAttribute("data-interaction-safe-area"))!) as { left: number; right: number; top: number; bottom: number };
  for (const attribute of ["data-interaction-player", "data-interaction-target"]) {
    const [x, y] = (await camera(page).getAttribute(attribute))!.split(",").map(Number);
    expect(x).toBeGreaterThan(area.left); expect(x).toBeLessThan(area.right);
    expect(y).toBeGreaterThan(area.top); expect(y).toBeLessThan(area.bottom);
  }
}
async function geometry(page: Page, target: Locator) {
  const box = await target.boundingBox(); expect(box).not.toBeNull();
  const size = page.viewportSize()!;
  expect(box!.width).toBeGreaterThanOrEqual(44); expect(box!.height).toBeGreaterThanOrEqual(44);
  expect(box!.x).toBeGreaterThanOrEqual(0); expect(box!.y).toBeGreaterThanOrEqual(0);
  expect(box!.x + box!.width).toBeLessThanOrEqual(size.width + .5);
  expect(box!.y + box!.height).toBeLessThanOrEqual(size.height + .5);
  expect(await target.evaluate(element => {
    const rect = element.getBoundingClientRect(), hit = document.elementFromPoint(rect.x + rect.width / 2, rect.y + rect.height / 2);
    return element === hit || element.contains(hit);
  })).toBe(true);
}

test("conversation turns frame both people, trap focus, suspend the exact child and restore the rendered camera", async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 720 }); await ready(page);
  await restore(page, fixtureAt(51, 142));
  await expect(camera(page)).toHaveAttribute("data-interaction-camera", "none");
  await expect(camera(page)).toHaveAttribute("data-camera-lead","0.0000,0.0000");
  const pose = await camera(page).getAttribute("data-camera-pose"), zoom = await root(page).getAttribute("data-camera-zoom"), follow = await root(page).getAttribute("data-camera-follow");
  await press(page, 0); await expect(panel(page)).toHaveAttribute("data-interaction-kind", "conversation");
  await framed(page);
  await expect(page.locator(".three-hit-layer")).toHaveCSS("display", "none");
  await expect(page.getByRole("button", { name: "Inspect Alden", exact: true })).toHaveCount(0);
  await expect(panel(page).getByRole("button", { name: /^(Back|Leave|Step away)$/ })).toHaveCount(0);
  await expect(panel(page).getByRole("button", { name: "About my home…", exact: true })).toHaveCount(0);
  await page.waitForTimeout(800); await expect(panel(page)).toContainText("Welcome, Alden!");
  await page.screenshot({ path: test.info().outputPath("rowan-greeting-1280x720.png") });
  await page.setViewportSize({ width: 390, height: 844 }); await framed(page);
  await page.screenshot({ path: test.info().outputPath("rowan-greeting-390x844.png") });
  await press(page, 0); // A advances the unread greeting exactly once.
  await expect(panel(page).getByRole("button", { name: "About my home…", exact: true })).toBeFocused();
  await framed(page); await page.screenshot({ path: test.info().outputPath("rowan-replies-390x844.png") });
  await page.setViewportSize({ width: 1280, height: 720 }); await framed(page);
  await page.screenshot({ path: test.info().outputPath("rowan-replies-1280x720.png") });
  await press(page, 13); await expect(panel(page).getByRole("button", { name: "Need a hand with anything?", exact: true })).toBeFocused();
  await press(page, 0); await expect(panel(page).getByRole("button", { name: "Show me your orders.", exact: true })).toBeFocused();
  await press(page, 0); await expect(panel(page)).toHaveAttribute("data-menu-panel", "projects");
  await press(page, 9); await expect(panel(page)).toHaveAttribute("data-menu-panel", "menu");
  for (let i = 0; i < 8 && !await panel(page).getByRole("button", { name: "Resume", exact: true }).evaluate(element => element === document.activeElement); i++) await press(page, 13);
  await expect(panel(page).getByRole("button", { name: "Resume", exact: true })).toBeFocused();
  await press(page, 0); await expect(panel(page)).toHaveAttribute("data-menu-panel", "projects");
  await press(page, 1); await expect(panel(page)).toHaveAttribute("data-menu-panel", "interaction");
  await expect(panel(page).getByRole("button", { name: "Show me your orders.", exact: true })).toBeVisible();
  await page.keyboard.press("Shift+Tab");
  expect(await page.evaluate(() => Boolean(document.activeElement?.closest('[role="dialog"]')))).toBe(true);
  await panel(page).getByRole("button", { name: "I’ll see what I can do.", exact: true }).tap();
  await expect(panel(page)).toContainText("Enjoy the valley, Alden!");
  await panel(page).getByRole("button", { name: "Continue conversation", exact: true }).tap();
  await expect(panel(page)).toHaveCount(0);
  await expect(camera(page)).toHaveAttribute("data-interaction-camera", "none");
  await expect(camera(page)).toHaveAttribute("data-camera-pose", pose!);
  await expect(root(page)).toHaveAttribute("data-camera-zoom", zoom!); await expect(root(page)).toHaveAttribute("data-camera-follow", follow!);
  await expect(page.locator(".valley-play-ui")).toBeVisible();
});

test("same-frame parcel and payment activations cannot duplicate worker transactions", async ({ page }) => {
  await ready(page);
  const save = fixtureAt(51, 142);
  expect(applyValleyCommand(save, { type: "place-home", x: 54, z: 155, rotation: 0 }, Date.now()).ok).toBe(true);
  await restore(page, save); await interact(page);
  await panel(page).getByRole("button", { name: "Continue conversation", exact: true }).tap();
  await panel(page).getByRole("button", { name: "Need a hand with anything?", exact: true }).tap();
  await panel(page).getByRole("button", { name: "Could you spare a few logs?", exact: true }).evaluate(button => { (button as HTMLButtonElement).click(); (button as HTMLButtonElement).click(); });
  await expect(panel(page)).toContainText("four logs to get you started");
  const response = await panel(page).locator(".valley-speech p").textContent();
  await press(page, 9); await expect(panel(page)).toHaveAttribute("data-menu-panel", "menu");
  await press(page, 9); await expect(panel(page)).toHaveAttribute("data-menu-panel", "interaction");
  await expect(panel(page).locator(".valley-speech p")).toHaveText(response!);
  await panel(page).getByRole("button", { name: "Continue conversation", exact: true }).tap();
  await interact(page); await panel(page).getByRole("button", { name: "Continue conversation", exact: true }).tap();
  await panel(page).getByRole("button", { name: "About my home…", exact: true }).tap();
  await panel(page).getByRole("button", { name: "Continue conversation", exact: true }).tap();
  await panel(page).getByRole("button", { name: "I’d like to make a payment.", exact: true }).tap();
  await page.getByLabel("Cottage payment").fill("10");
  await panel(page).getByRole("button", { name: "Pay 10 coins", exact: true }).evaluate(button => { (button as HTMLButtonElement).click(); (button as HTMLButtonElement).click(); });
  await expect(panel(page)).toContainText("Cottage account: 10 / 100 coins");
  await panel(page).getByRole("button", { name: "Back", exact: true }).tap();
  await expect(panel(page).getByRole("button", { name: "I’d like to make a payment.", exact: true })).toBeVisible();
  const actual = await snapshot(page);
  expect(actual.valley.paid).toBe(10); expect(itemCount(actual.chapter.player.inventory, "coins")).toBe(15);
  expect(itemCount(actual.chapter.player.inventory, "logs") + itemCount(actual.chapter.bank, "logs")).toBe(4);
  expect(actual.valley.dailyHelp).toHaveLength(1);
});

test("caravan and its physical chest have separate services and visiting NPC children return to their conversation", async ({ page }) => {
  await ready(page);
  await restore(page, fixtureAt(74, 141)); await interact(page);
  await expect(panel(page).getByRole("button", { name: "Browse supplies", exact: true })).toBeVisible();
  await expect(panel(page).getByRole("button", { name: "Supply orders", exact: true })).toBeVisible();
  await expect(panel(page).getByRole("button", { name: "Open storage", exact: true })).toHaveCount(0);
  await restore(page, fixtureAt(76, 141)); await interact(page);
  await expect(panel(page)).toContainText("chest");
  await expect(panel(page).getByRole("button", { name: "Browse supplies", exact: true })).toHaveCount(0);
  await panel(page).getByRole("button", { name: "Open storage", exact: true }).tap();
  await expect(panel(page).getByRole("heading", { name: "Connected storage", exact: true })).toBeVisible();
  await panel(page).getByRole("button", { name: "Back", exact: true }).tap();
  await expect(panel(page)).toHaveAttribute("data-menu-panel", "interaction");
  for (const visitor of [{ x: 75, z: 143, name: "Pella", reply: "May I see what you brought?", child: "trade" }, { x: 76, z: 179, name: "Garrick", reply: "Need any supplies?", child: "projects" }]) {
    const save = fixtureAt(visitor.x, visitor.z);
    Object.assign(save.valley, { home: { x: 54, z: 155, rotation: 0, tentPacked: false }, paid: 100, cottageTicks: COTTAGE_TICKS });
    await restore(page, save); await interact(page);
    await expect(panel(page)).toHaveAccessibleName(`Conversation with ${visitor.name}`);
    await panel(page).getByRole("button", { name: "Continue conversation", exact: true }).tap();
    await panel(page).getByRole("button", { name: visitor.reply, exact: true }).tap();
    await expect(panel(page)).toHaveAttribute("data-menu-panel", visitor.child);
    await panel(page).getByRole("button", { name: "Back", exact: true }).tap();
    await expect(panel(page)).toHaveAccessibleName(`Conversation with ${visitor.name}`);
    await expect(panel(page).getByRole("button", { name: visitor.reply, exact: true })).toBeVisible();
    await expect(panel(page).getByRole("button", { name: /^(Leave|Back|Step away)$/ })).toHaveCount(0);
  }
});

test("combined crafting keeps real images, proportions and reachable actions across all required viewports", async ({ page }) => {
  await ready(page);
  const save = fixtureAt(69, 140); save.chapter.player.inventory.push({ itemId: "logs", quantity: 2 });
  await restore(page, save); await interact(page);
  await panel(page).getByRole("button", { name: "Craft something", exact: true }).tap();
  const grid = panel(page).getByTestId("recipe-grid"), detail = panel(page).getByTestId("recipe-detail");
  const stool = grid.locator('[data-recipe-id="valley-stool"]');
  await stool.focus(); await expect(detail).toHaveAttribute("data-selected-recipe", "valley-stool");
  await expect(stool.locator("img")).toHaveAttribute("src", /^data:image\/png;base64,/);
  expect(await stool.locator("img").evaluate((img: HTMLImageElement) => img.complete && img.naturalWidth === 192)).toBe(true);
  for (const size of [{ width: 320, height: 568 }, { width: 390, height: 844 }, { width: 667, height: 375 }, { width: 844, height: 390 }, { width: 1280, height: 720 }]) {
    await page.setViewportSize(size);
    await expect(detail).toHaveAttribute("data-selected-recipe", "valley-stool");
    for (const target of [panel(page).getByTestId("craft-primary"), panel(page).getByRole("button", { name: "Increase craft quantity", exact: true }), panel(page).getByRole("button", { name: "Decrease craft quantity", exact: true })]) await geometry(page, target);
    const box = (await detail.boundingBox())!, fraction = size.width > size.height ? box.width / size.width : box.height / size.height;
    expect(fraction).toBeGreaterThan(.30); expect(fraction).toBeLessThan(.40);
    const cards = await grid.locator("[data-recipe-id]").evaluateAll(elements => elements.map(element => {
      const card = element.getBoundingClientRect();
      return { height: card.height, contained: [...element.children].every(child => {
        const content = child.getBoundingClientRect();
        return content.left >= card.left - .5 && content.right <= card.right + .5 && content.top >= card.top - .5 && content.bottom <= card.bottom + .5;
      }) };
    }));
    for (const card of cards) { expect(card.contained, `${size.width}×${size.height}: recipe content must remain inside its card`).toBe(true); expect(card.height).toBeLessThanOrEqual(200); }
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await expect(page.locator(".valley-play-ui")).toBeHidden();
    await page.screenshot({ path: test.info().outputPath(`craft-${size.width}x${size.height}.png`) });
  }
  await panel(page).getByRole("button", { name: "Back", exact: true }).tap();
  await expect(panel(page)).toHaveAttribute("data-menu-panel", "interaction"); await framed(page);
  for (const size of [{ width: 320, height: 568 }, { width: 390, height: 844 }, { width: 667, height: 375 }, { width: 844, height: 390 }, { width: 1280, height: 720 }]) {
    await page.setViewportSize(size); await framed(page);
    await geometry(page, panel(page).getByRole("button", { name: "Craft something", exact: true }));
    await page.screenshot({ path: test.info().outputPath(`prompt-${size.width}x${size.height}.png`) });
  }
});

test("peaceful gathering enters a real craft, pauses actors and requires release of held movement after menus", async ({ page }) => {
  await ready(page);
  const save = fixtureAt(25, 140); save.chapter.seed = 2; save.chapter.player.inventory = [{ itemId: "bronze-axe", quantity: 1 }];
  await restore(page, save); await press(page, 7);
  await expect(page.getByTestId("valley-feedback")).toContainText("+1 Logs");
  const gathered = await snapshot(page); expect(itemCount(gathered.chapter.player.inventory, "logs")).toBe(1);
  Object.assign(gathered.action.player, { x: 69, z: 140 });
  gathered.chapter.player.position = tile(69, 140); gathered.chapter.player.previousPosition = tile(69, 140);
  await restore(page, gathered); await interact(page);
  await panel(page).getByRole("button", { name: "Craft something", exact: true }).tap();
  await panel(page).getByTestId("recipe-grid").locator('[data-recipe-id="valley-plank"]').tap();
  await expect(panel(page).locator('[data-material-item="logs"]')).toContainText("1 needed");
  await expect(panel(page).locator('[data-material-item="logs"]')).toContainText("1 in bag");
  await page.waitForTimeout(250);
  const frame = await root(page).getAttribute("data-action-frame");
  await panel(page).getByTestId("craft-primary").tap();
  await expect(panel(page).getByTestId("craft-queue")).toHaveCount(1);
  await expect(panel(page).getByTestId("craft-queue")).toHaveCount(0, { timeout: 10000 });
  await expect(panel(page).getByTestId("craft-status")).toContainText("+2 Sawn plank");
  await expect(panel(page).getByTestId("craft-status")).toContainText(/Missing|Requires|Need/i);
  await expect(root(page)).toHaveAttribute("data-action-frame", frame!);
  await expect(panel(page).getByTestId("recipe-detail")).toHaveAttribute("data-selected-recipe", "valley-plank");
  const crafted = await snapshot(page); expect(itemCount(crafted.chapter.player.inventory, "valley-plank")).toBe(2);
  expect(itemCount(crafted.chapter.player.inventory, "logs")).toBe(0);
  await panel(page).getByRole("button", { name: "Close", exact: true }).tap();
  const before = Number(await root(page).getAttribute("data-player-z"));
  await page.keyboard.down("s");
  try {
    await expect.poll(async () => Number(await root(page).getAttribute("data-player-z"))).toBeGreaterThan(before + .1);
    await press(page, 9); await expect(panel(page)).toHaveAttribute("data-menu-panel", "menu");
    await page.waitForTimeout(200);
    const stopped = await root(page).getAttribute("data-player-z");
    await page.keyboard.down("s"); // Real keyboard auto-repeat while the key remains held.
    await press(page, 9); await expect(panel(page)).toHaveCount(0);
    await page.keyboard.down("s"); await page.waitForTimeout(250);
    await expect(root(page)).toHaveAttribute("data-player-z", stopped!);
  } finally { await page.keyboard.up("s"); }
  const released = Number(await root(page).getAttribute("data-player-z"));
  await page.keyboard.down("s");
  try { await expect.poll(async () => Number(await root(page).getAttribute("data-player-z"))).toBeGreaterThan(released + .1); }
  finally { await page.keyboard.up("s"); }
});

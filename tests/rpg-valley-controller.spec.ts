import { expect, test, type Page } from "@playwright/test";
import { mkdir, writeFile } from "node:fs/promises";
import { calendarDate } from "../src/rpg/engine";
import { addItems } from "../src/rpg/inventory";
import { tile } from "../src/rpg/world";
import { COTTAGE_TICKS, type ValleySave } from "../src/valley/contracts";
import { FUTURE_GRANTS, VALLEY_DIRECTIONS } from "../src/valley/onboarding";
import { createValleySave, validateValleySave } from "../src/valley/save";
import { applyValleyCommand } from "../src/valley/settlement";

type TestPad = { axes: number[]; buttons: { pressed: boolean; touched: boolean; value: number }[] };
type MenuElement = "button" | "summary" | "link";
const root = (page: Page) => page.getByTestId("valley-app");
const dialog = (page: Page) => page.getByRole("dialog");
const pageErrors = new WeakMap<Page, string[]>();
test.beforeEach(async ({ page }) => {
  const errors: string[] = []; pageErrors.set(page, errors);
  page.on("pageerror", error => errors.push(error.message));
  await page.addInitScript(() => {
    const state = { axes: [0, 0, 0, 0], buttons: Array.from({ length: 17 }, () => ({ pressed: false, touched: false, value: 0 })) };
    Object.assign(window, { valleyControllerTestPad: state });
    Object.defineProperty(navigator, "getGamepads", { value: () => [{ ...state, connected: true, index: 0, id: "QA standard pad", mapping: "standard", timestamp: performance.now() }] });
  });
});
test.afterEach(async ({ page }) => { expect(pageErrors.get(page)).toEqual([]); });
async function button(page: Page, index: number, held: boolean) {
  await page.evaluate(({ index, held }) => {
    const pad = (window as unknown as { valleyControllerTestPad: TestPad }).valleyControllerTestPad;
    Object.assign(pad.buttons[index], { pressed: held, touched: held, value: Number(held) });
  }, { index, held });
}
async function press(page: Page, index: number) {
  const sampled = () => page.evaluate(() => new Promise<void>(resolve => requestAnimationFrame(() => requestAnimationFrame(() => resolve()))));
  await button(page, index, true); await sampled();
  await button(page, index, false); await sampled();
}
async function focusMenu(page: Page, name: string, kind: MenuElement = "button") {
  const target = kind === "summary" ? dialog(page).locator("summary").filter({ hasText: name }) : dialog(page).getByRole(kind, { name, exact: true });
  await expect(target).toBeVisible();
  const trace: unknown[] = [];
  for (let steps = 0; steps < 90; steps++) {
    if (await target.evaluate(element => element === document.activeElement)) return target;
    trace.push(await page.evaluate(() => ({ focus: document.hasFocus(), active: document.activeElement?.textContent, tag: document.activeElement?.tagName })));
    await press(page, 13);
  }
  console.log(`D-pad trace for ${name}`, JSON.stringify(trace.filter((value, index) => !index || JSON.stringify(value) !== JSON.stringify(trace[index - 1]))));
  throw Error(`D-pad did not reach ${name}`);
}
async function select(page: Page, name: string, kind: MenuElement = "button") {
  await focusMenu(page, name, kind); await press(page, 0);
}
async function ready(page: Page) {
  await expect(root(page)).toHaveAttribute("data-ready", "true", { timeout: 60000 });
  await expect(root(page)).toHaveAttribute("data-mode", "world");
}
async function restore(page: Page, save: ValleySave) {
  expect(validateValleySave(save)).not.toBeNull();
  for (let i = 0; i < 8 && await dialog(page).isVisible(); i++) await page.keyboard.press("Escape");
  await page.getByRole("button", { name: "Menu", exact: true }).click();
  await dialog(page).getByRole("button", { name: "Settings", exact: true }).click();
  await page.getByLabel("Import valley archive").setInputFiles({ name: "controller-fixture.json", mimeType: "application/json", buffer: Buffer.from(JSON.stringify(save)) });
  await expect(page.locator(".valley-message")).toContainText("Chapter restored");
  await dialog(page).getByRole("button", { name: "Close", exact: true }).click();
  await expect(dialog(page)).toHaveCount(0);
}
async function saved(page: Page): Promise<ValleySave> {
  // Observation goes through the actual UI/worker persistence boundary; gameplay uses only pad inputs.
  for (let i = 0; i < 8 && await dialog(page).isVisible(); i++) await page.keyboard.press("Escape");
  await page.getByRole("button", { name: "Menu", exact: true }).click();
  await dialog(page).getByRole("button", { name: "Settings", exact: true }).click();
  await dialog(page).getByRole("button", { name: "Save on this device", exact: true }).click();
  await expect(page.locator(".valley-message")).toContainText("Chapter saved on this device");
  return page.evaluate(() => new Promise<ValleySave>((resolve, reject) => {
    const request = indexedDB.open("fable-crown", 1);
    request.onerror = () => reject(request.error);
    request.onsuccess = () => {
      const db = request.result, get = db.transaction("saves").objectStore("saves").get("valley-v1");
      get.onsuccess = () => { resolve(get.result); db.close(); }; get.onerror = () => { reject(get.error); db.close(); };
    };
  }));
}
function at(save: ValleySave, x: number, z: number, target = { x, z: z - 1 }) {
  const dx = target.x - x, dz = target.z - z, length = Math.hypot(dx, dz) || 1;
  Object.assign(save.action.player, { x, z, facingX: dx / length, facingZ: dz / length, health: save.action.player.maxHealth, swing: 0, blocking: false });
  Object.assign(save.chapter.player, { position: tile(x, z), previousPosition: tile(x, z), health: save.action.player.health, path: [], movement: null, action: null });
  const now = Date.now(); save.savedAt = now; save.chapter.savedAt = now; save.chapter.calendar = calendarDate(now);
}

async function capturePlayback(page: Page) {
  await page.setViewportSize({ width: 1280, height: 800 });
  const fixture = createValleySave(Date.now()); at(fixture, 52, 150);
  await restore(page, fixture);
  await page.getByRole("button", { name: "Menu", exact: true }).click();
  await dialog(page).getByRole("button", { name: "Settings", exact: true }).click();
  for (let i = 0; i < 4; i++) await page.getByRole("button", { name: "Zoom in", exact: true }).click();
  await dialog(page).getByRole("button", { name: "Close", exact: true }).click();
  const scene = page.locator("[data-character-clip]");
  const directory = "docs/screenshots/valley-playback"; await mkdir(directory, { recursive: true });
  const samples: unknown[] = [];
  const capture = async (phase: string, count: number, spacing = 90) => {
    for (let i = 0; i < count; i++) {
      const metadata = await scene.evaluate(element => ({ at: performance.now(), clip: element.getAttribute("data-character-clip"), actionFrame: element.getAttribute("data-action-frame"), x: element.getAttribute("data-continuous-x"), z: element.getAttribute("data-continuous-z") }));
      const file = `${directory}/${phase}-${i}.png`;
      await page.screenshot({ path: file, clip: { x: 384, y: 210, width: 512, height: 384 } });
      samples.push({ phase, file, ...metadata });
      if (i < count - 1) await page.waitForTimeout(spacing);
    }
  };
  await expect(scene).toHaveAttribute("data-character-clip", "idle"); await capture("idle", 2);
  await page.evaluate(() => { (window as unknown as { valleyControllerTestPad: TestPad }).valleyControllerTestPad.axes[0] = 1; });
  await expect(scene).toHaveAttribute("data-character-clip", "walk"); await capture("locomotion", 3);
  await page.evaluate(() => { (window as unknown as { valleyControllerTestPad: TestPad }).valleyControllerTestPad.axes[0] = 0; });
  await expect(scene).toHaveAttribute("data-character-clip", "idle");
  await button(page, 7, true); await expect(scene).toHaveAttribute("data-character-clip", "strike");
  await capture("strike", 5, 65); await button(page, 7, false);
  await expect(scene).toHaveAttribute("data-character-clip", "idle");
  await button(page, 6, true); await expect(scene).toHaveAttribute("data-character-clip", "block");
  await capture("block", 3); await button(page, 6, false);
  await expect(scene).toHaveAttribute("data-character-clip", "idle"); await capture("settled", 2);
  await writeFile(`${directory}/samples.json`, JSON.stringify({ source: "Actual production WebGL playback; cropped screenshots are unedited", viewport: { width: 1280, height: 800 }, motion: "3m/s continuous locomotion uses renderer clip walk; no separate sprint state", samples }, null, 2));
}

test("standard controller selects weapon once per Y hold, attacks, blocks and reaches settings camera/tool controls", async ({ page }) => {
  await page.goto("./?chapter=valley"); await ready(page);
  await expect(root(page)).toHaveAttribute("data-tool-mode", "tool");
  const encounter = createValleySave(Date.now(), 42); at(encounter, 94, 159);
  for (const enemy of encounter.action.enemies) { enemy.cooldown = 3600; enemy.windup = 0; }
  const target = encounter.action.enemies.find(enemy => enemy.id === "rock-mite-0")!;
  target.aggressive = false;
  await restore(page, encounter);
  await button(page, 3, true);
  await expect(root(page)).toHaveAttribute("data-tool-mode", "weapon");
  await page.waitForTimeout(350);
  await expect(root(page)).toHaveAttribute("data-tool-mode", "weapon");
  await button(page, 3, false); await page.waitForTimeout(100);
  await press(page, 3);
  await expect(root(page)).toHaveAttribute("data-tool-mode", "tool");
  await press(page, 3);
  await expect(root(page)).toHaveAttribute("data-tool-mode", "weapon");
  await button(page, 7, true); await page.waitForTimeout(900); await button(page, 7, false);
  const attacked = await saved(page);
  expect(attacked.action.enemies.find(enemy => enemy.id === target.id)!.health).toBe(target.health - 3);

  const guard = structuredClone(attacked); at(guard, 94, 159);
  Object.assign(guard.action.player, { guard: 100, guardBroken: 0, guardDelay: 0 });
  Object.assign(guard.action.enemies.find(enemy => enemy.id === target.id)!, { aggressive: true, cooldown: 120, windup: 0 });
  await restore(page, guard);
  await button(page, 6, true);
  await expect.poll(async () => Number(await root(page).getAttribute("data-guard")), { timeout: 8000 }).toBeLessThan(100);
  await expect(page.getByRole("meter", { name: "Player health" })).toHaveJSProperty("value", guard.action.player.health);
  await button(page, 6, false);

  const safe = createValleySave(Date.now()); await restore(page, safe);
  await page.evaluate(() => { (window as unknown as { valleyControllerTestPad: TestPad }).valleyControllerTestPad.axes[2] = 1; });
  await expect(root(page)).toHaveAttribute("data-camera-follow", "true");
  await page.evaluate(() => { (window as unknown as { valleyControllerTestPad: TestPad }).valleyControllerTestPad.axes[2] = 0; });
  await press(page, 9);
  await expect(dialog(page).getByRole("heading", { name: "Game menu" })).toBeVisible();
  await select(page, "Settings");
  await press(page, 1);
  await expect(dialog(page)).toHaveAttribute("data-menu-panel", "menu");
  await select(page, "Settings");
  await page.keyboard.press("Escape");
  await expect(dialog(page)).toHaveAttribute("data-menu-panel", "menu");
  await select(page, "Settings");
  const zoom = Number(await root(page).getAttribute("data-camera-zoom"));
  await select(page, "Zoom out");
  const smaller = Number(await root(page).getAttribute("data-camera-zoom")); expect(smaller).toBeLessThan(zoom);
  await select(page, "Zoom in");
  expect(Number(await root(page).getAttribute("data-camera-zoom"))).toBeGreaterThan(smaller);
  await select(page, "Start a new valley", "summary");
  await expect(dialog(page).locator("details")).toHaveAttribute("open", "");
  await expect(dialog(page).getByRole("checkbox", { name: "I have kept any archive I need" })).not.toBeChecked();
  await expect(dialog(page).getByRole("button", { name: "Confirm new valley", exact: true })).toBeDisabled();
  await select(page, "Start a new valley", "summary");
  await expect(dialog(page).locator("details")).not.toHaveAttribute("open", "");
  await focusMenu(page, "Earlier journey", "link");
  await page.keyboard.press("Tab");
  await expect(dialog(page).getByRole("button", { name: "Back", exact: true })).toBeFocused();
  await page.keyboard.press("Shift+Tab");
  await expect(dialog(page).getByRole("link", { name: "Earlier journey", exact: true })).toBeFocused();
  await button(page, 3, true); await page.waitForTimeout(200);
  await expect(dialog(page).getByRole("button", { name: "Use weapon", exact: true })).toHaveAttribute("aria-pressed", "true");
  await select(page, "Use tool");
  await expect(dialog(page).getByRole("button", { name: "Use tool", exact: true })).toHaveAttribute("aria-pressed", "true");
  await press(page, 9);
  await expect(root(page)).toHaveAttribute("data-camera-follow", "true");
  await page.waitForTimeout(250);
  await expect(root(page)).toHaveAttribute("data-tool-mode", "tool");
  await button(page, 3, false); await press(page, 1);
  await expect(dialog(page)).toHaveCount(0);
  const workbench = createValleySave(Date.now()); at(workbench, 69, 140, { x: 69, z: 139 });
  await restore(page, workbench);
  await expect(page.getByTestId("interaction-indicator")).toHaveAttribute("data-label", /Open · Communal carpentry workbench/);
  await press(page, 0); // Real world Interact, then D-pad/A edit the station quantity.
  await expect(dialog(page)).toHaveAttribute("data-menu-panel", "interaction");
  await select(page, "Craft something");
  await expect(dialog(page)).toHaveAttribute("data-menu-panel", "craft");
  await select(page, "Increase craft quantity");
  await expect(dialog(page).getByLabel("Craft quantity", { exact: true })).toHaveValue("2");
  await select(page, "Decrease craft quantity");
  await expect(dialog(page).getByLabel("Craft quantity", { exact: true })).toHaveValue("1");
  await press(page, 1); await expect(dialog(page)).toHaveAttribute("data-menu-panel", "interaction");
  await select(page, "Step away"); await expect(dialog(page)).toHaveCount(0);
  await capturePlayback(page);
});

test("controller can pin all five day-three directions and inspect later housing/land without buying another home", async ({ page }) => {
  await page.goto("./?chapter=valley"); await ready(page);
  const fixture = createValleySave(Date.now());
  expect(applyValleyCommand(fixture, { type: "place-home", x: 54, z: 155, rotation: 0 }, Date.now()).ok).toBe(true);
  addItems(fixture.chapter.player.inventory, "coins", 75);
  expect(applyValleyCommand(fixture, { type: "pay", amount: 100 }, Date.now()).ok).toBe(true);
  fixture.valley.cottageTicks = COTTAGE_TICKS;
  fixture.valley.furniture.push({ id: "qa-direction-stool", itemId: "stool", x: 58, z: 168, rotation: 0 });
  fixture.valley.flags.push("talked-merchant", "talked-smith");
  await restore(page, fixture);
  await expect(page.locator(".valley-message")).toContainText("Visiting today: Rowan, Pella, Garrick");
  await press(page, 9); await select(page, "Journal");
  await expect(dialog(page)).toContainText("Chapter 3");
  await expect(dialog(page).locator("[data-direction]")).toHaveCount(5);
  for (const direction of VALLEY_DIRECTIONS) {
    await select(page, direction.label);
    await expect(dialog(page).getByRole("button", { name: direction.label, exact: true })).toHaveAttribute("aria-pressed", "true");
    await expect(page.locator('[aria-label="Open current goal"]')).toHaveText(direction.goal);
  }
  await select(page, "Back");
  await expect(dialog(page)).toHaveAttribute("data-menu-panel", "menu");
  await select(page, "Build & manage");
  await select(page, "Future royal grants", "summary");
  await expect(dialog(page).locator(".valley-grant")).toHaveCount(3);
  for (const grant of FUTURE_GRANTS) {
    const card = dialog(page).locator(".valley-grant").filter({ has: page.getByRole("heading", { name: grant.title, exact: true }) });
    await expect(card).toContainText(grant.benefit); await expect(card).toContainText("Later");
    await expect(card.getByRole("button")).toHaveCount(0);
  }
  const current = await saved(page);
  expect(current.valley.home).toEqual(fixture.valley.home);
  expect(current.valley.paid).toBe(100);
  expect(current.valley.goal).toBe(VALLEY_DIRECTIONS.at(-1)!.goal);
});

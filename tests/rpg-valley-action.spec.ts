import { expect, test, type Page } from "@playwright/test";
import { readFile, writeFile } from "node:fs/promises";
import { rpgActionWorld } from "../src/action/rpg-adapter";
import { calendarDate } from "../src/rpg/engine";
import { addItems, inventorySlots, itemCount } from "../src/rpg/inventory";
import { tile } from "../src/rpg/world";
import type { ValleySave } from "../src/valley/contracts";
import { createValleySave, validateValleySave } from "../src/valley/save";
import { applyValleyCommand } from "../src/valley/settlement";
import { createValleyWorld, homeFootprints } from "../src/valley/world";

const root = (page: Page) => page.getByTestId("valley-app");
const panel = (page: Page) => page.getByRole("dialog");
const status = (page: Page) => page.locator(".valley-message");
const errors = new WeakMap<Page, string[]>();
test.beforeEach(async ({ page }) => {
  const messages: string[] = []; errors.set(page, messages);
  page.on("pageerror", error => messages.push(error.message));
});
test.afterEach(async ({ page }) => { expect(errors.get(page)).toEqual([]); });
async function ready(page: Page) {
  await expect(root(page)).toHaveAttribute("data-ready", "true", { timeout: 60000 });
  await expect(root(page)).toHaveAttribute("data-mode", "world");
}
async function tools(page: Page) {
  if (await page.getByRole("button", { name: "Save on this device", exact: true }).isVisible()) return;
  if (await panel(page).isVisible()) await panel(page).getByRole("button", { name: "Close", exact: true }).click();
  await page.getByRole("button", { name: "Menu", exact: true }).click();
  await panel(page).getByRole("button", { name: "Settings", exact: true }).click();
}
async function restore(page: Page, save: ValleySave) {
  expect(validateValleySave(save)).not.toBeNull();
  await tools(page);
  await page.getByLabel("Import valley archive").setInputFiles({ name: "action-fixture.json", mimeType: "application/json", buffer: Buffer.from(JSON.stringify(save)) });
  await expect(status(page)).toContainText("Chapter restored");
  await panel(page).getByRole("button", { name: "Close", exact: true }).click();
  await expect(panel(page)).toHaveCount(0);
}
async function snapshot(page: Page): Promise<ValleySave> {
  await tools(page);
  await page.getByRole("button", { name: "Save on this device", exact: true }).click();
  try { await expect(status(page)).toContainText("Chapter saved on this device"); }
  catch (error) {
    const downloading = page.waitForEvent("download");
    await page.getByRole("button", { name: "Export valley", exact: true }).click();
    const download = await downloading, data = await readFile((await download.path())!, "utf8");
    const artifact = test.info().outputPath("unsavable-live-valley.json");
    await writeFile(artifact, data);
    await test.info().attach("unsavable-live-valley", { path: artifact, contentType: "application/json" });
    const live = JSON.parse(data) as ValleySave;
    console.log("Unsavable valley", JSON.stringify({ action: live.chapter.player.action, valid: Boolean(validateValleySave(live)), tick: live.chapter.tick, effects: live.chapter.effects }));
    throw error;
  }
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
function place(save: ValleySave, x: number, z: number, health = save.action.player.maxHealth) {
  Object.assign(save.action.player, { x, z, health, swing: 0, blocking: false, moveRemainderX: 0, moveRemainderZ: 0 });
  Object.assign(save.chapter.player, { position: tile(x, z), previousPosition: tile(x, z), health, path: [], movement: null, action: null });
  const now = Date.now(); save.savedAt = now; save.chapter.savedAt = now; save.chapter.calendar = calendarDate(now);
}
function armEncounter(save: ValleySave, x = 94, z = 159) {
  place(save, x, z, 1);
  for (const actor of save.action.enemies) { actor.cooldown = 3600; actor.windup = 0; }
  // An already-provoked encounter with a bounded countdown; the player never attacks.
  const enemy = save.action.enemies.find(actor => actor.id === "rock-mite-0")!;
  Object.assign(enemy, { x: 94, z: 158, homeX: 94, homeZ: 158, aggressive: true, cooldown: 120, windup: 0 });
  const chapterEnemy = save.chapter.enemies.find(actor => actor.id === enemy.id)!;
  Object.assign(chapterEnemy, { position: tile(94, 158), home: tile(94, 158), health: enemy.health, cooldown: 0 });
  expect(rpgActionWorld(save.chapter, createValleyWorld(save.valley, save.chapter)).canOccupy(x, z, enemy.x, enemy.z)).toBe(true);
}

test("actual wilderness defeat returns to the placed tent and conserves repeated graves through partial recovery and reload", async ({ page }) => {
  await page.goto("./?chapter=valley"); await ready(page);
  const fixture = createValleySave(Date.now(), 42);
  expect(applyValleyCommand(fixture, { type: "place-home", x: 54, z: 155, rotation: 0 }, Date.now()).ok).toBe(true);
  addItems(fixture.chapter.player.inventory, "coins", 75);
  expect(applyValleyCommand(fixture, { type: "pay", amount: 100 }, Date.now()).ok).toBe(true);
  fixture.chapter.player.inventory = [{ itemId: "logs", quantity: 3 }, { itemId: "coins", quantity: 17 }, { itemId: "cooked-shrimp", quantity: 2 }];
  armEncounter(fixture);
  const gear = structuredClone(fixture.chapter.player.equipment), skills = structuredClone(fixture.chapter.player.skills);
  const firstBackpack = structuredClone(fixture.chapter.player.inventory), home = homeFootprints(fixture.valley)!.tentApproach;
  expect(Object.keys(gear).length).toBeGreaterThan(0);
  await restore(page, fixture);
  await expect(status(page)).toContainText("Returned home", { timeout: 10000 });
  const first = await snapshot(page);
  expect([first.action.player.x, first.action.player.z]).toEqual([home.x, home.z]);
  expect(first.chapter.player.inventory).toEqual([]);
  expect(first.chapter.grave?.position).toEqual(tile(94, 159));
  expect(first.chapter.grave?.items).toEqual(firstBackpack);
  expect(first.chapter.player.equipment).toEqual(gear);
  expect(first.chapter.player.skills).toEqual(skills);
  expect(first.valley.paid).toBe(100);

  const repeat = structuredClone(first);
  repeat.chapter.player.inventory = [{ itemId: "logs", quantity: 2 }, { itemId: "copper-ore", quantity: 1 }];
  armEncounter(repeat, 95, 158);
  await restore(page, repeat);
  await expect(status(page)).toContainText("Returned home", { timeout: 10000 });
  const merged = await snapshot(page);
  expect([merged.action.player.x, merged.action.player.z]).toEqual([home.x, home.z]);
  expect(merged.chapter.player.inventory).toEqual([]);
  expect(merged.chapter.grave?.position).toEqual(tile(95, 158));
  expect(merged.chapter.grave?.items).toEqual([
    { itemId: "logs", quantity: 5 }, { itemId: "coins", quantity: 17 },
    { itemId: "cooked-shrimp", quantity: 2 }, { itemId: "copper-ore", quantity: 1 },
  ]);
  expect(merged.chapter.player.equipment).toEqual(gear);
  expect(merged.chapter.player.skills).toEqual(skills);
  expect(merged.valley.paid).toBe(100);
  expect(merged.chapter.drops).toEqual([]);

  const recovery = structuredClone(merged);
  place(recovery, 95, 158);
  recovery.chapter.player.inventory = [{ itemId: "logs", quantity: 27 }];
  for (const enemy of recovery.action.enemies) { enemy.cooldown = 3600; enemy.windup = 0; }
  expect(inventorySlots(recovery.chapter.player.inventory)).toBe(27);
  await restore(page, recovery);
  await page.locator(".action-interact").click();
  await expect(status(page)).toContainText("Recovered what fits. Remaining belongings are safe.");
  const partial = await snapshot(page);
  expect(partial.chapter.player.inventory).toEqual([{ itemId: "logs", quantity: 28 }]);
  expect(partial.chapter.grave?.items).toEqual([
    { itemId: "logs", quantity: 4 }, { itemId: "coins", quantity: 17 },
    { itemId: "cooked-shrimp", quantity: 2 }, { itemId: "copper-ore", quantity: 1 },
  ]);
  await page.reload(); await ready(page);
  const reloaded = await snapshot(page);
  expect(reloaded.chapter.grave).toEqual(partial.chapter.grave);
  expect(reloaded.chapter.player.inventory).toEqual(partial.chapter.player.inventory);
  expect(reloaded.chapter.player.equipment).toEqual(gear);
  expect(reloaded.chapter.player.skills).toEqual(skills);
  expect(reloaded.valley.paid).toBe(100);
  expect(validateValleySave(reloaded)).not.toBeNull();
});

test("real tree gathering consumes one tool swing per press rather than repeating while held", async ({ page }) => {
  await page.goto("./?chapter=valley"); await ready(page);
  const fixture = createValleySave(Date.now(), 2);
  place(fixture, 25, 140);
  Object.assign(fixture.action.player, { facingX: 0, facingZ: -1 });
  fixture.chapter.player.inventory = [{ itemId: "bronze-axe", quantity: 1 }];
  fixture.chapter.seed = 2; // The first two actual resource attempts succeed without depleting the node.
  const xp = fixture.chapter.player.skills.woodcutting;
  await restore(page, fixture);
  await page.locator(".action-block").hover();
  await page.mouse.down(); await page.waitForTimeout(200);
  await page.screenshot({ path: "docs/screenshots/valley-block.png" });
  await page.mouse.up();
  await page.locator("[data-action-strike]").hover();
  await page.mouse.down(); await page.waitForTimeout(250);
  await page.screenshot({ path: "docs/screenshots/valley-strike.png" });
  await page.waitForTimeout(1050); await page.mouse.up();
  const first = await snapshot(page);
  expect(itemCount(first.chapter.player.inventory, "logs")).toBe(1);
  expect(first.chapter.player.skills.woodcutting).toBe(xp + 250);
  await panel(page).getByRole("button", { name: "Close", exact: true }).click();
  await page.locator("[data-action-strike]").hover();
  await page.mouse.down(); await page.waitForTimeout(900); await page.mouse.up();
  const second = await snapshot(page);
  expect(itemCount(second.chapter.player.inventory, "logs")).toBe(2);
  expect(second.chapter.player.skills.woodcutting).toBe(xp + 500);
  expect(second.chapter.resources["valley-tree-1"].available).toBe(true);
  await page.reload(); await ready(page);
  const reloaded = await snapshot(page);
  expect(itemCount(reloaded.chapter.player.inventory, "logs")).toBe(2);
  expect(reloaded.chapter.player.skills.woodcutting).toBe(xp + 500);
  expect(reloaded.chapter.effects.some(effect => effect.kind === "action-result" && effect.targetId === "valley-tree-1")).toBe(true);
});

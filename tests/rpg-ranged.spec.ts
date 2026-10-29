import { readFileSync } from "node:fs";
import { test, expect, type Page } from "@playwright/test";
import { calendarDate, createRpg } from "../src/rpg/engine";
import { ITEMS } from "../src/rpg/content";
import type { RpgState } from "../src/rpg/types";

const originalV3 = JSON.parse(
  readFileSync(
    new URL("./fixtures/rpg-v3-original.json", import.meta.url),
    "utf8",
  ),
);

async function importState(page: Page, state: unknown) {
  if (!(await page.getByRole("button", { name: "Save on device" }).isVisible()))
    await page.getByRole("button", { name: "Open game menu" }).click();
  await page.locator('input[type="file"]').setInputFiles({
    name: "fixture.json",
    mimeType: "application/json",
    buffer: Buffer.from(JSON.stringify(state)),
  });
}

async function storedState(page: Page): Promise<RpgState> {
  if (!(await page.getByRole("button", { name: "Save on device" }).isVisible()))
    await page.getByRole("button", { name: "Open game menu" }).click();
  await page.getByRole("button", { name: "Save on device" }).click();
  await expect(page.getByRole("status")).toContainText("Chronicle saved");
  const value = await page.evaluate(
    () =>
      new Promise((resolve, reject) => {
        const request = indexedDB.open("fable-crown", 1);
        request.onsuccess = () => {
          const db = request.result;
          const get = db.transaction("saves").objectStore("saves").get("v5");
          get.onsuccess = () => {
            resolve(get.result);
            db.close();
          };
          get.onerror = () => reject(get.error);
        };
        request.onerror = () => reject(request.error);
      }),
  );
  await page.getByRole("button", { name: "Close panel" }).click();
  return value as RpgState;
}

function waitingFixture() {
  const state = createRpg(Date.now(), 8128);
  state.control.waiting = true;
  state.control.goal = null;
  state.control.active = null;
  state.control.queue = [];
  state.control.thinkingUntil = 1_000_000_000;
  state.player.path = [];
  return state;
}

async function mobileFit(page: Page) {
  for (const viewport of [
    { width: 390, height: 844 },
    { width: 844, height: 390 },
  ]) {
    await page.setViewportSize(viewport);
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
  }
}

test("equip a bow and ammunition, choose ranged styles, hit at seven tiles, and consume food", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1280, height: 720 });
  await page.goto("./?chapter=3");
  await expect(page.getByTestId("rpg-world")).toBeVisible();
  const state = waitingFixture();
  const enemy = state.enemies.find((entry) => entry.id === "boar-0")!;
  state.player.position = { ...enemy.position, x: enemy.position.x - 7 };
  state.player.previousPosition = { ...state.player.position };
  state.player.skills.ranged = 0;
  state.player.health = 7;
  state.player.inventory.push(
    { itemId: "shortbow", quantity: 1 },
    { itemId: "bronze-arrow", quantity: 50 },
  );
  await importState(page, state);

  await page.getByRole("button", { name: "Open inventory" }).click();
  await page.getByRole("button", { name: "Cooked shrimp, 1" }).first().click();
  await page.getByRole("button", { name: "Eat" }).click();
  await expect
    .poll(async () => (await storedState(page)).player.health)
    .toBeGreaterThan(7);

  await page.getByRole("button", { name: "Open inventory" }).click();
  await page.getByRole("button", { name: "Mosswood shortbow, 1" }).click();
  await page.getByRole("button", { name: "Equip", exact: true }).click();
  await expect
    .poll(async () => (await storedState(page)).player.equipment.weapon)
    .toBe("shortbow");
  await page.getByRole("button", { name: "Open inventory" }).click();
  await page
    .getByRole("button", { name: `${ITEMS["bronze-arrow"].name}, 50` })
    .click();
  await page.getByRole("button", { name: "Equip arrows" }).click();
  await expect(page.getByLabel("Equipped ammunition")).toContainText(
    `Arrows: ${ITEMS["bronze-arrow"].name} ×50`,
  );
  const style = page.getByLabel("Combat style");
  await expect(style.locator("option")).toHaveText([
    "Accurate · Ranged XP",
    "Rapid · faster shots",
    "Longrange · Ranged & Defence XP",
  ]);
  await style.selectOption("accurate");
  await expect
    .poll(async () => (await storedState(page)).control.style)
    .toBe("accurate");
  await page.getByRole("button", { name: "Open inventory" }).click();
  await style.selectOption("rapid");
  await expect
    .poll(async () => (await storedState(page)).control.style)
    .toBe("rapid");
  await page.getByRole("button", { name: "Open inventory" }).click();
  await style.selectOption("longrange");
  await expect
    .poll(async () => (await storedState(page)).control.style)
    .toBe("longrange");

  const prepared = await storedState(page);
  expect(prepared.player.equipment.weapon).toBe("shortbow");
  expect(prepared.player.ammo).toEqual({
    itemId: "bronze-arrow",
    quantity: 50,
  });
  // Inventory commands resume autonomous play. Establish the range fixture after
  // the real equipment transactions so their duration cannot move the starting tile.
  const rangedEnemy = prepared.enemies.find((entry) => entry.id === enemy.id)!;
  prepared.player.position = {
    ...rangedEnemy.position,
    x: rangedEnemy.position.x - 7,
  };
  prepared.player.previousPosition = { ...prepared.player.position };
  prepared.player.path = [];
  prepared.player.movement = null;
  prepared.player.action = null;
  prepared.control.waiting = true;
  prepared.control.active = null;
  prepared.control.source = null;
  prepared.control.goal = null;
  prepared.control.thinkingUntil = 1_000_000_000;
  await importState(page, prepared);
  await expect(page.getByRole("status")).toContainText("Chronicle restored");
  await page.getByRole("button", { name: "Close panel" }).click();
  expect(
    Math.max(
      Math.abs(prepared.player.position.x - enemy.position.x),
      Math.abs(prepared.player.position.y - enemy.position.y),
    ),
  ).toBe(7);
  await page.getByRole("button", { name: /Inspect Moss boar/ }).click();
  await page
    .getByRole("region", { name: "Enemy actions" })
    .getByRole("button", { name: "Attack now" })
    .click();
  await expect
    .poll(async () => (await storedState(page)).player.skills.ranged, {
      timeout: 20000,
    })
    .toBeGreaterThan(0);
  const fought = await storedState(page);
  expect(fought.player.ammo?.quantity).toBeLessThan(50);
  expect(fought.player.skills.defence).toBeGreaterThan(0);
  expect(fought.rewards?.some((event) => (event.xp.ranged ?? 0) > 0)).toBe(
    true,
  );
  expect(
    fought.player.inventory.find((item) => item.itemId === "cooked-shrimp")
      ?.quantity,
  ).toBe(5);
  await page.screenshot({ path: "docs/screenshots/journey-ranged.png" });
  await mobileFit(page);
});

test("two-handed bow equip is rejected atomically when the shield cannot fit in a full pack", async ({
  page,
}) => {
  await page.goto("./?chapter=3");
  await expect(page.getByTestId("rpg-world")).toBeVisible();
  const state = waitingFixture();
  state.player.inventory = [
    { itemId: "logs", quantity: 26 },
    { itemId: "shortbow", quantity: 1 },
    { itemId: "hammer", quantity: 1 },
  ];
  state.player.equipment = {
    weapon: "bronze-sword",
    shield: "bronze-shield",
    cape: "prince-cape",
  };
  await importState(page, state);
  await page.getByRole("button", { name: "Open inventory" }).click();
  await expect(page.getByLabel("Backpack capacity")).toContainText("28 / 28");
  await page.getByRole("button", { name: "Mosswood shortbow, 1" }).click();
  await page.getByRole("button", { name: "Equip", exact: true }).click();
  const after = await storedState(page);
  expect(after.player.equipment).toEqual(state.player.equipment);
  expect(after.player.inventory).toEqual(state.player.inventory);
  await mobileFit(page);
});

test("original V3 saves migrate to V5, remain playable, and preserve the V3 record", async ({
  page,
}) => {
  await page.goto("./?chapter=3");
  await expect(page.getByTestId("rpg-world")).toBeVisible();
  const legacy = structuredClone(originalV3) as Record<string, any>;
  legacy.savedAt = Date.now();
  legacy.calendar = calendarDate(legacy.savedAt);
  legacy.control.waiting = true;
  legacy.control.goal = null;
  legacy.control.active = null;
  legacy.control.queue = [];
  legacy.control.steps = [];
  legacy.control.thinkingUntil = 1_000_000_000;
  legacy.player.health = 2;
  legacy.quests.forge.accepted = true;
  legacy.quests.forge.complete = true;
  const legacyCoins = legacy.player.inventory.find(
    (item: { itemId: string }) => item.itemId === "coins",
  )?.quantity;

  await page.evaluate(async (oldSave) => {
    const db = await new Promise<IDBDatabase>((resolve, reject) => {
      const request = indexedDB.open("fable-crown", 1);
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction("saves", "readwrite");
      tx.objectStore("saves").delete("v5");
      tx.objectStore("saves").put(oldSave, "v3");
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
    db.close();
  }, legacy);
  await page.reload();
  await expect(page.getByTestId("rpg-world")).toBeVisible();
  const migrated = await storedState(page);
  expect(migrated.version).toBe(5);
  expect(migrated.player.skills.ranged).toBe(0);
  expect(migrated.player.ammo).toBeNull();
  expect(migrated.quests.forge.complete).toBe(true);
  expect(
    migrated.player.inventory.find((item) => item.itemId === "coins")?.quantity,
  ).toBe(legacyCoins);

  await page.getByRole("button", { name: "Open inventory" }).click();
  await page.getByRole("button", { name: "Cooked shrimp, 1" }).first().click();
  await page.getByRole("button", { name: "Eat" }).click();
  await expect
    .poll(async () => (await storedState(page)).player.health, {
      timeout: 10000,
    })
    .toBeGreaterThan(2);
  await page.reload();
  await expect(page.getByTestId("rpg-world")).toBeVisible();
  const afterReload = await storedState(page);
  expect(afterReload.version).toBe(5);
  expect(afterReload.quests.forge.complete).toBe(true);
  expect(
    afterReload.player.inventory.find((item) => item.itemId === "coins")
      ?.quantity,
  ).toBe(legacyCoins);
  expect(afterReload.rewards).toHaveLength(legacy.rewards?.length ?? 0);
  const records = await page.evaluate(
    (): Promise<{ old: unknown; current: unknown }> =>
      new Promise((resolve, reject) => {
        const request = indexedDB.open("fable-crown", 1);
        request.onsuccess = () => {
          const db = request.result;
          const tx = db.transaction("saves");
          const oldRequest = tx.objectStore("saves").get("v3");
          const newRequest = tx.objectStore("saves").get("v5");
          tx.oncomplete = () => {
            resolve({ old: oldRequest.result, current: newRequest.result });
            db.close();
          };
          tx.onerror = () => reject(tx.error);
        };
        request.onerror = () => reject(request.error);
      }),
  );
  expect(records.old).toEqual(legacy);
  expect(records.current).toMatchObject({ version: 5 });
  await mobileFit(page);
});

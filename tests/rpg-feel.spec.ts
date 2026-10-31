import { readFileSync } from "node:fs";
import { test, expect, type Page } from "@playwright/test";
import { calendarDate, createRpg } from "../src/rpg/engine";
import { ITEMS } from "../src/rpg/content";
import { findPath } from "../src/rpg/world";
import { PerspectiveCamera, Vector3 } from "three";
import type { RpgState } from "../src/rpg/types";

const originalV4 = JSON.parse(
  readFileSync(
    new URL("./fixtures/rpg-v4-original.json", import.meta.url),
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

async function saveState(page: Page, keepOpen = false): Promise<RpgState> {
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
  if (!keepOpen) await page.getByRole("button", { name: "Close panel" }).click();
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

test("manual map movement is acknowledged and reaches its tile across mobile layouts", async ({
  page,
}) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.setViewportSize({ width: 1280, height: 720 });
  await page.goto("./?chapter=3");
  await expect(page.getByTestId("rpg-world")).toBeVisible();
  const state = waitingFixture();
  state.player.position = { worldId: "frontier", x: 100, y: 80, plane: 0 };
  state.player.previousPosition = { ...state.player.position };
  const candidates = [
    { ...state.player.position, x: 101, y: 80 },
    { ...state.player.position, x: 100, y: 81 },
    { ...state.player.position, x: 101, y: 81 },
    { ...state.player.position, x: 99, y: 80 },
  ];
  const target = candidates.find(
    (candidate) => findPath(state.player.position, candidate)?.length === 1,
  );
  expect(target).toBeDefined();
  await importState(page, state);
  await expect(page.getByRole("status")).toContainText("Chronicle restored");
  await page.getByRole("button", { name: "Close panel" }).click();

  const world = page.getByTestId("rpg-world");
  await expect(world).toHaveAttribute("data-status", "ready");
  await expect(world).toHaveAttribute("data-camera-x", "100.00");
  await expect(world).toHaveAttribute("data-camera-y", "80.00");
  const bounds = await world.boundingBox();
  expect(bounds).not.toBeNull();
  const camera = new PerspectiveCamera(20, bounds!.width / bounds!.height, .1, 650);
  const distance = (24 / .85) / (2 * Math.tan(Math.PI / 18));
  camera.position.set(100, .4, 80).addScaledVector(new Vector3(32, 37, 45).normalize(), distance);
  camera.lookAt(100, .4, 80);
  camera.updateMatrixWorld();
  const destination = new Vector3(target!.x, 0, target!.y).project(camera);
  const point = {
    x: (destination.x + 1) * bounds!.width / 2,
    y: (1 - destination.y) * bounds!.height / 2,
  };
  await page.mouse.click(bounds!.x + point.x, bounds!.y + point.y);
  await expect(page.getByLabel("Command acknowledgement")).toContainText(
    "Accepted",
  );
  await expect
    .poll(async () => (await saveState(page, true)).player.position, {
      timeout: 10000,
    })
    .toEqual(target);
  await page.getByRole("button", { name: "Close panel" }).click();

  await page.screenshot({ path: "docs/screenshots/feel-desktop.png" });
  await page.setViewportSize({ width: 390, height: 844 });
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  await page.screenshot({ path: "docs/screenshots/feel-portrait.png" });
  await page.setViewportSize({ width: 844, height: 390 });
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  await page.screenshot({ path: "docs/screenshots/feel-landscape.png" });
  expect(errors).toEqual([]);
});

test("rapid bow and arrow equip conserves all gear without waiting between commands", async ({
  page,
}) => {
  await page.goto("./?chapter=3");
  await expect(page.getByTestId("rpg-world")).toBeVisible();
  const state = waitingFixture();
  state.player.inventory.push(
    { itemId: "shortbow", quantity: 1 },
    { itemId: "bronze-arrow", quantity: 50 },
  );
  const count = (s: RpgState, id: string) =>
    s.player.inventory.find((item) => item.itemId === id)?.quantity ?? 0;
  const itemIds = new Set([
    ...state.player.inventory.map((item) => item.itemId),
    ...Object.values(state.player.equipment),
    "bronze-arrow",
  ]);
  const totals = Object.fromEntries(
    [...itemIds].map((id) => [
      id,
      count(state, id) +
        Object.values(state.player.equipment).filter(
          (equipped) => equipped === id,
        ).length +
        (state.player.ammo?.itemId === id ? state.player.ammo.quantity : 0),
    ]),
  );
  await importState(page, state);
  await page.getByRole("button", { name: "Open inventory" }).click();
  await page.getByRole("button", { name: "Mosswood shortbow, 1" }).click();
  await page.getByRole("button", { name: "Equip", exact: true }).click();
  await page
    .getByRole("button", { name: `${ITEMS["bronze-arrow"].name}, 50` })
    .click();
  await page.getByRole("button", { name: "Equip arrows" }).click();

  await expect
    .poll(async () => {
      const saved = await saveState(page, true);
      return { weapon: saved.player.equipment.weapon, ammo: saved.player.ammo };
    })
    .toEqual({
      weapon: "shortbow",
      ammo: { itemId: "bronze-arrow", quantity: 50 },
    });
  const after = await saveState(page);
  expect(after.player.equipment.weapon).toBe("shortbow");
  expect(after.player.equipment.shield).toBeUndefined();
  expect(
    after.player.inventory.find((item) => item.itemId === "bronze-sword")
      ?.quantity,
  ).toBe(1);
  expect(
    after.player.inventory.find((item) => item.itemId === "bronze-shield")
      ?.quantity,
  ).toBe(1);
  expect(after.player.ammo).toEqual({ itemId: "bronze-arrow", quantity: 50 });
  for (const [id, quantity] of Object.entries(totals)) {
    const actual =
      count(after, id) +
      Object.values(after.player.equipment).filter(
        (equipped) => equipped === id,
      ).length +
      (after.player.ammo?.itemId === id ? after.player.ammo.quantity : 0);
    expect(actual, id).toBe(quantity);
  }
  await mobileFit(page);
});

test("real V4 chapter migrates to V5 while its source row and archive remain intact", async ({
  page,
}) => {
  await page.goto("./?chapter=3");
  await expect(page.getByTestId("rpg-world")).toBeVisible();
  // Navigate away so the running worker cannot overwrite the seeded migration input.
  await page.goto("./world-assets.json");
  await expect(page.locator("body")).toContainText("files");
  await page.waitForTimeout(100);
  const source = structuredClone(originalV4) as Record<string, any>;
  source.savedAt = Date.now();
  source.calendar = calendarDate(source.savedAt);
  source.control.waiting = true;
  source.control.goal = null;
  source.control.active = null;
  source.control.queue = [];
  source.control.steps = [];
  source.control.thinkingUntil = 1_000_000_000;
  await page.evaluate(async (oldSave) => {
    const db = await new Promise<IDBDatabase>((resolve, reject) => {
      const request = indexedDB.open("fable-crown", 1);
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction("saves", "readwrite");
      tx.objectStore("saves").delete("v5");
      tx.objectStore("saves").put(oldSave, "v4");
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
    db.close();
  }, source);
  await page.goto("./?chapter=3");
  await expect(page.getByTestId("rpg-world")).toBeVisible();
  const migrated = (await page.evaluate(
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
  )) as RpgState;
  expect(migrated.version).toBe(5);
  expect(migrated.player.skills.ranged).toBe(0);
  expect(migrated.player.ammo).toBeNull();
  expect(migrated.effects).toEqual([]);
  expect(migrated.effectSequence).toBe(0);
  expect(migrated.messages).toEqual([]);
  expect(migrated.messageSequence).toBe(0);

  await page.getByRole("button", { name: "Open thoughts" }).click();
  await page.getByRole("button", { name: "Wait here" }).click();
  await expect(page.getByLabel("Command acknowledgement")).toContainText(
    "Accepted",
  );
  await saveState(page);
  const stored = (await page.evaluate(
    () =>
      new Promise((resolve, reject) => {
        const request = indexedDB.open("fable-crown", 1);
        request.onsuccess = () => {
          const db = request.result;
          const tx = db.transaction("saves");
          const oldRequest = tx.objectStore("saves").get("v4");
          const currentRequest = tx.objectStore("saves").get("v5");
          tx.oncomplete = () => {
            resolve({ old: oldRequest.result, current: currentRequest.result });
            db.close();
          };
          tx.onerror = () => reject(tx.error);
        };
        request.onerror = () => reject(request.error);
      }),
  )) as { old: unknown; current: unknown };
  expect(stored.old).toEqual(source);
  expect(stored.current).toMatchObject({ version: 5 });

  await page.getByRole("button", { name: "Open game menu" }).click();
  await expect(
    page.getByRole("button", { name: "Export archived chapter" }),
  ).toBeVisible();
  await page.reload();
  await expect(page.getByTestId("rpg-world")).toBeVisible();
  await expect
    .poll(async () => {
      const v5 = await page.evaluate(
        () =>
          new Promise((resolve, reject) => {
            const request = indexedDB.open("fable-crown", 1);
            request.onsuccess = () => {
              const db = request.result;
              const get = db
                .transaction("saves")
                .objectStore("saves")
                .get("v5");
              get.onsuccess = () => {
                resolve(get.result?.version);
                db.close();
              };
              get.onerror = () => reject(get.error);
            };
            request.onerror = () => reject(request.error);
          }),
      );
      return v5;
    })
    .toBe(5);
  await page.getByRole("button", { name: "Open game menu" }).click();
  await expect(
    page.getByRole("button", { name: "Export archived chapter" }),
  ).toBeVisible();
});

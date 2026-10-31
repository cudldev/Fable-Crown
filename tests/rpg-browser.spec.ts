import { test, expect, type Page } from "@playwright/test";
import { createGame } from "../src/simulation";
import { createRpg } from "../src/rpg/engine";
import { interactionTiles, objectById } from "../src/rpg/world";
import type { RpgState } from "../src/rpg/types";
async function restore(page: Page, state: RpgState) {
  await page.getByRole("button", { name: "Open game menu" }).click();
  await page.locator("input[type=file]").setInputFiles({
    name: "rpg.json",
    mimeType: "application/json",
    buffer: Buffer.from(JSON.stringify(state)),
  });
  await expect(page.getByRole("status")).toContainText("Chronicle restored");
  await page.getByRole("button", { name: "Close panel" }).click();
}
async function snapshot(page: Page): Promise<RpgState> {
  await page.getByRole("button", { name: "Open game menu" }).click();
  await page.getByRole("button", { name: "Save on device" }).click();
  await expect(page.getByRole("status")).toContainText("Chronicle saved");
  return page.evaluate(
    () =>
      new Promise((resolve, reject) => {
        const r = indexedDB.open("fable-crown", 1);
        r.onsuccess = () => {
          const get = r.result
            .transaction("saves")
            .objectStore("saves")
            .get("v5");
          get.onsuccess = () => {
            resolve(get.result);
            r.result.close();
          };
          get.onerror = () => reject(get.error);
        };
      }),
  );
}
test("tile chapter preserves the earlier archive and renders a selectable isometric world", async ({
  page,
}) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto("./");
  await expect(page.getByTestId("rpg-world")).toBeVisible();
  await page.evaluate(
    (value) =>
      new Promise<void>((resolve, reject) => {
        const r = indexedDB.open("fable-crown", 1);
        r.onsuccess = () => {
          const tx = r.result.transaction("saves", "readwrite");
          tx.objectStore("saves").put(value, "v1");
          tx.oncomplete = () => {
            r.result.close();
            resolve();
          };
          tx.onerror = () => reject(tx.error);
        };
      }),
    createGame(Date.now()),
  );
  await page.reload();
  await expect(page.getByTestId("rpg-world")).toBeVisible();
  await page.getByRole("button", { name: "Open game menu" }).click();
  await expect(
    page.getByRole("button", { name: "Export archived chapter" }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Save on device" }).click();
  await expect(page.getByRole("status")).toContainText("Chronicle saved");
  const data = await page.evaluate(
    () =>
      new Promise<{ old: number; fresh: number }>((resolve, reject) => {
        const r = indexedDB.open("fable-crown", 1);
        r.onsuccess = () => {
          const store = r.result.transaction("saves").objectStore("saves"),
            a = store.get("v1"),
            b = store.get("v5");
          b.onsuccess = () => {
            resolve({ old: a.result.version, fresh: b.result.version });
            r.result.close();
          };
          b.onerror = () => reject(b.error);
        };
      }),
  );
  expect(data).toEqual({ old: 2, fresh: 5 });
  await page.getByRole("button", { name: "Close panel" }).click();
  await page.getByRole("button", { name: "Toggle tile grid" }).click();
  await expect(
    page.getByRole("button", { name: "Toggle tile grid" }),
  ).toHaveAttribute("aria-pressed", "true");
  await page.getByRole("button", { name: "Open destinations" }).click();
  await page
    .getByRole("region", { name: "world panel" })
    .getByRole("button", { name: /Oakrest square/ })
    .click();
  await expect(
    page.getByRole("region", { name: "Object actions" }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Close actions" }).click();
  await page.getByRole("button", { name: "Toggle tile grid" }).click();
  await expect(page.locator(".doing-now")).not.toContainText("Considering", {
    timeout: 10000,
  });
  if (
    await page.getByRole("button", { name: "Dismiss notification" }).isVisible()
  )
    await page.getByRole("button", { name: "Dismiss notification" }).click();
  await page.screenshot({ path: "docs/screenshots/rpg-desktop.png" });
  await page.setViewportSize({ width: 390, height: 844 });
  await expect(page.getByTestId("rpg-world")).toBeVisible();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  await page.screenshot({ path: "docs/screenshots/rpg-portrait.png" });
  expect(errors).toEqual([]);
});
test("skills, a real bronze recipe and the 28-slot bag work through the UI", async ({
  page,
}) => {
  await page.goto("./");
  await expect(page.getByTestId("rpg-world")).toBeVisible();
  const s = createRpg(Date.now());
  s.control.waiting = true;
  s.control.goal = null;
  s.player.position = {
    ...interactionTiles(objectById("oakrest-furnace")!)[0]!,
  };
  s.player.previousPosition = { ...s.player.position };
  s.player.inventory.push(
    { itemId: "copper-ore", quantity: 6 },
    { itemId: "tin-ore", quantity: 6 },
  );
  await restore(page, s);
  await page.getByRole("button", { name: "Inspect Oakrest furnace" }).click({ button: "right" });
  await page.getByRole("menuitem", { name: "More options", exact: true }).click();
  await page.getByRole("button", { name: "Craft here" }).click();
  await page.getByLabel("Craft quantity").selectOption("1");
  await page
    .locator(".rpg-shop-list article")
    .filter({ hasText: "Smelt bronze bar" })
    .getByRole("button", { name: "Make 1" })
    .click();
  await page.getByRole("button", { name: "Open inventory" }).click();
  await expect(
    page.getByRole("button", { name: /Bronze bar, 1/i }),
  ).toBeVisible();
  await expect(
    page
      .getByRole("group", { name: "Backpack" })
      .or(page.locator(".rpg-backpack")),
  ).toBeVisible();
  expect(await page.locator(".rpg-backpack button").count()).toBe(28);
  const saved = await snapshot(page);
  expect(saved.player.skills.smithing).toBeGreaterThanOrEqual(62);
  expect(
    saved.player.inventory.find((i) => i.itemId === "copper-ore")?.quantity,
  ).toBe(5);
  expect(
    saved.player.inventory.find((i) => i.itemId === "tin-ore")?.quantity,
  ).toBe(5);
  await page.getByRole("button", { name: "Close panel" }).click();
  await page.getByRole("button", { name: "Open skills" }).click();
  await expect(
    page.getByRole("region", { name: "skills panel" }),
  ).toContainText("Mining");
  await expect(
    page.getByRole("region", { name: "skills panel" }),
  ).toContainText("Next:");
});
test("a shop ambition buys the real usable steel tool rather than granting it", async ({
  page,
}) => {
  await page.goto("./");
  await expect(page.getByTestId("rpg-world")).toBeVisible();
  const s = createRpg(Date.now());
  s.control.waiting = true;
  s.control.goal = null;
  s.player.skills.mining = 5120;
  s.player.inventory.find((i) => i.itemId === "coins")!.quantity = 600;
  s.player.position = { ...interactionTiles(objectById("oakrest-shop")!)[0]! };
  s.player.previousPosition = { ...s.player.position };
  await restore(page, s);
  await page.getByRole("button", { name: "Inspect Oakrest supplies" }).click({ button: "right" });
  await page.getByRole("menuitem", { name: "More options", exact: true }).click();
  await page.getByRole("button", { name: "Browse supplies" }).click();
  await page
    .locator(".rpg-shop-list article")
    .filter({ has: page.getByText("steel pickaxe", { exact: true }) })
    .getByRole("button", { name: "Aim for this" })
    .click();
  await page.getByRole("button", { name: "Open inventory" }).click();
  await expect(
    page.getByRole("button", { name: /steel pickaxe, 1/i }),
  ).toBeVisible();
  const saved = await snapshot(page);
  expect(
    saved.player.inventory.find((i) => i.itemId === "coins")?.quantity,
  ).toBe(100);
  expect(
    saved.shops.find((shop) => shop.id === "oakrest-shop")?.stock[
      "steel-pickaxe"
    ],
  ).toBe(2);
});

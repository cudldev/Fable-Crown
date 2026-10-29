import { test, expect, type Page } from "@playwright/test";
import { createRpg } from "../src/rpg/engine";
import { XP_THRESHOLDS } from "../src/rpg/skills";
import { interactionTiles, WORLD } from "../src/rpg/world";
import type { RpgState } from "../src/rpg/types";

async function importState(page: Page, state: unknown) {
  if (!(await page.getByRole("button", { name: "Save on device" }).isVisible()))
    await page.getByRole("button", { name: "Open game menu" }).click();
  await page.locator('input[type="file"]').setInputFiles({
    name: "fixture.json",
    mimeType: "application/json",
    buffer: Buffer.from(JSON.stringify(state)),
  });
}

async function savedState(page: Page): Promise<RpgState> {
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
          const get = db.transaction("saves").objectStore("saves").get("v3");
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
  state.player.path = [];
  return state;
}

test("clicked copper node offers and persists the matching training ambition", async ({
  page,
}) => {
  await page.goto("./?chapter=3");
  await expect(page.getByTestId("rpg-world")).toBeVisible();
  const state = waitingFixture();
  state.player.skills.mining = XP_THRESHOLDS[1] - 100;
  const node = WORLD.objects.find((object) => object.resourceId === "copper")!;
  state.player.position = { ...interactionTiles(node)[0]! };
  state.player.previousPosition = { ...state.player.position };
  await importState(page, state);
  await expect(page.getByRole("status")).toContainText("Chronicle restored");
  await page
    .getByRole("button", { name: `Inspect ${node.name}` })
    .first()
    .click();
  const actions = page.getByRole("region", { name: "Object actions" });
  await actions.getByLabel("Quantity").selectOption("1");
  await expect(
    actions.getByRole("button", { name: "Gather 1 Copper ore" }),
  ).toBeVisible();
  await actions.getByRole("button", { name: "Train Mining to 2" }).click();
  await expect
    .poll(async () => (await savedState(page)).control.goal)
    .toMatchObject({
      kind: "skill",
      skill: "mining",
      level: 2,
      targetId: node.id,
    });
});

test("mining shows progress then announces one copper and the level-up reward", async ({
  page,
}) => {
  await page.goto("./?chapter=3");
  await expect(page.getByTestId("rpg-world")).toBeVisible();
  const state = waitingFixture();
  state.player.skills.mining = XP_THRESHOLDS[1] - 100;
  const node = WORLD.objects.find((object) => object.resourceId === "copper")!;
  state.player.position = { ...interactionTiles(node)[0]! };
  state.player.previousPosition = { ...state.player.position };
  await importState(page, state);
  await page
    .getByRole("button", { name: `Inspect ${node.name}` })
    .first()
    .click();
  const actions = page.getByRole("region", { name: "Object actions" });
  await actions.getByLabel("Quantity").selectOption("1");
  await actions.getByRole("button", { name: "Gather 1 Copper ore" }).click();
  const progress = page.getByRole("progressbar", {
    name: "Mining action progress",
  });
  await expect(progress).toBeAttached();
  const firstProgress = Number(await progress.getAttribute("aria-valuenow"));
  await expect
    .poll(async () => Number(await progress.getAttribute("aria-valuenow")), {
      timeout: 10000,
    })
    .toBeGreaterThan(firstProgress);
  await page.screenshot({ path: "docs/screenshots/interaction-cycle.png" });
  await expect
    .poll(async () => (await savedState(page)).player.skills.mining, {
      timeout: 15000,
    })
    .toBe(XP_THRESHOLDS[1] + 75);
  const announcer = page.locator('[aria-live="polite"][aria-atomic="true"]');
  await expect(announcer).toContainText("+1 Copper ore");
  await expect(announcer).toContainText("+17.5 Mining XP");
  await expect(announcer).toContainText("Mining level 2");
  const xp = page.getByLabel("Recent skill experience");
  await expect(xp).toContainText("Mining 2");
  await expect(xp).toContainText("+17.5 XP");
  await page.getByRole("button", { name: "Open inventory" }).click();
  await expect(
    page.getByRole("button", { name: /Copper ore, 1/ }),
  ).toBeVisible();
  await page.screenshot({ path: "docs/screenshots/interaction-feedback.png" });
});

test("ore inventory uses one slot per ore and imported reward history does not replay", async ({
  page,
}) => {
  await page.goto("./?chapter=3");
  await expect(page.getByTestId("rpg-world")).toBeVisible();
  const state = waitingFixture();
  state.tick = 1;
  state.player.inventory.push(
    { itemId: "iron-ore", quantity: 3 },
    { itemId: "tin-ore", quantity: 2 },
  );
  state.rewards = [
    {
      id: "reward-1",
      tick: 1,
      items: [{ itemId: "copper-ore", quantity: 1 }],
      xp: { mining: 175 },
    },
  ];
  await importState(page, state);
  await expect(page.getByRole("status")).toContainText("Chronicle restored");
  await expect(
    page.locator('[aria-live="polite"][aria-atomic="true"]'),
  ).toBeEmpty();
  await page.getByRole("button", { name: "Open inventory" }).click();
  await expect(page.getByRole("button", { name: "Iron ore, 1" })).toHaveCount(
    3,
  );
  await expect(page.getByRole("button", { name: "Tin ore, 1" })).toHaveCount(2);
  await expect(page.getByLabel("Backpack capacity")).toContainText("16 / 28");
  await page.getByRole("button", { name: "Iron ore, 1" }).first().click();
  await expect(page.locator(".rpg-item-inspect")).toContainText(
    "stack limit 1",
  );
  await page.reload();
  await expect(page.getByTestId("rpg-world")).toBeVisible();
  await expect(
    page.locator('[aria-live="polite"][aria-atomic="true"]'),
  ).toBeEmpty();
});

test("feedback and contextual goal controls fit portrait and landscape mobile viewports", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("./?chapter=3");
  await expect(page.getByTestId("rpg-world")).toBeVisible();
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
    for (const name of [
      "Toggle running",
      "Open inventory",
      "Open thoughts",
      "Zoom in",
      "Zoom out",
    ]) {
      const box = await page.getByRole("button", { name }).boundingBox();
      expect(box?.width, name).toBeGreaterThanOrEqual(44);
      expect(box?.height, name).toBeGreaterThanOrEqual(44);
      expect(box!.x, `${name} remains on screen`).toBeGreaterThanOrEqual(0);
      expect(box!.x + box!.width).toBeLessThanOrEqual(viewport.width);
    }
  }
  expect(
    await page
      .getByRole("button", { name: "Toggle running" })
      .evaluate((el) => parseFloat(getComputedStyle(el).fontSize)),
  ).toBeLessThanOrEqual(12);
});

test("Walk recovers energy and Run consumes it while the movement choice persists", async ({
  page,
}) => {
  await page.goto("./");
  await expect(page.getByTestId("rpg-world")).toBeVisible();
  const s = waitingFixture();
  s.player.runEnergy = 5000;
  await importState(page, s);
  await expect(page.getByRole("status")).toContainText("Chronicle restored");
  await page.getByRole("button", { name: "Toggle running" }).click();
  await expect(
    page.getByRole("button", { name: "Toggle running" }),
  ).toHaveAttribute("aria-pressed", "false");
  await page.getByRole("button", { name: "Open destinations" }).click();
  await page
    .getByRole("region", { name: "world panel" })
    .getByRole("button", { name: /Oakrest quarry/ })
    .click();
  await page.getByRole("button", { name: "Do now" }).click();
  await expect
    .poll(async () => (await savedState(page)).player.runEnergy)
    .toBeGreaterThan(5000);
  const walking = await savedState(page);
  expect(walking.control.running).toBe(false);
  await page.getByRole("button", { name: "Toggle running" }).click();
  await expect
    .poll(async () => (await savedState(page)).player.runEnergy)
    .toBeLessThan(walking.player.runEnergy);
  await page.reload();
  await expect(page.getByTestId("rpg-world")).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Toggle running" }),
  ).toHaveAttribute("aria-pressed", "true");
});

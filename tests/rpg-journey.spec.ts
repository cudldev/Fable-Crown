import { test, expect, type Page } from "@playwright/test";
import { createRpg } from "../src/rpg/engine";
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

async function snapshot(page: Page, keepOpen = false): Promise<RpgState> {
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
  state.player.path = [];
  return state;
}

test("minimap shows frontier markers and previews travel until confirmed", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1280, height: 720 });
  await page.goto("./?chapter=3");
  await expect(page.getByTestId("rpg-world")).toBeVisible();
  const state = waitingFixture();
  await importState(page, state);
  const map = page.getByRole("complementary", { name: "Frontier minimap" });
  await expect(map).toBeVisible();
  await map.getByRole("button", { name: "Expand map" }).click();
  const svg = map.getByRole("button", { name: /Preview a map destination/ });
  await expect(svg.locator("title", { hasText: "Alden" })).toHaveCount(1);
  await expect(svg.locator("title").filter({hasText:/^Oakrest$/})).toHaveCount(1);
  await expect(
    svg.locator("title").filter({ hasText: /bank/i }).first(),
  ).toHaveCount(1);
  await expect(
    map.getByText(/Alden · ◆ services · ! quests · ▲ danger/),
  ).toBeVisible();

  const before = await snapshot(page);
  const svgBox = await svg.boundingBox();
  expect(svgBox).not.toBeNull();
  const target = {
    x: before.player.position.x + 3,
    y: before.player.position.y,
  };
  await svg.click({
    position: {
      x: ((target.x+0.5) / 256) * svgBox!.width,
      y: ((target.y+0.5) / 192) * svgBox!.height,
    },
  });
  const preview = page.getByRole("region", { name: "Travel preview" });
  await expect(preview).toContainText(`Tile ${target.x}, ${target.y}`);
  const stillBeforeTravel = await snapshot(page);
  expect(stillBeforeTravel.player.position).toEqual(before.player.position);
  await page.screenshot({ path: "docs/screenshots/journey-desktop.png" });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.screenshot({ path: "docs/screenshots/journey-portrait.png" });
  await preview.getByRole("button", { name: "Travel here" }).click();
  await expect
    .poll(async () => (await snapshot(page, true)).player.position.x, {
      timeout: 12000,
    })
    .toBe(target.x);
  await page.getByRole("button", { name: "Close panel" }).click();
  await map.getByRole("button", { name: "Shrink map" }).click();
});

test("using the bronze pickaxe on copper starts the matching gathering goal and examine updates", async ({
  page,
}) => {
  await page.goto("./?chapter=3");
  await expect(page.getByTestId("rpg-world")).toBeVisible();
  const state = waitingFixture();
  const node = WORLD.objects.find((object) => object.resourceId === "copper")!;
  state.player.position = { ...interactionTiles(node)[0]! };
  state.player.previousPosition = { ...state.player.position };
  await importState(page, state);
  await page.getByRole("button", { name: "Open inventory" }).click();
  await page.getByRole("button", { name: "Bronze pickaxe, 1" }).click();
  await page.getByRole("button", { name: "Use on a place" }).click();
  await page
    .getByRole("button", { name: `Inspect ${node.name}` })
    .first()
    .click();
  const actions = page.getByRole("region", { name: "Object actions" });
  await actions.getByRole("button", { name: "Examine" }).click();
  await expect(actions).toContainText("Ready to harvest");
  await actions
    .getByRole("button", { name: "Use bronze pickaxe · gather here" })
    .click();
  await expect
    .poll(async () => (await snapshot(page, true)).control.goal)
    .toMatchObject({
      kind: "gather",
      resourceId: "copper",
      targetId: node.id,
    });
  const unavailable = waitingFixture();
  unavailable.resources[node.id] = {
    objectId: node.id,
    available: false,
    respawnAt: unavailable.tick + 20,
  };
  unavailable.player.position = { ...interactionTiles(node)[0]! };
  unavailable.player.previousPosition = { ...unavailable.player.position };
  await importState(page, unavailable);
  await page
    .getByRole("button", { name: `Inspect ${node.name}` })
    .first()
    .click();
  await page.getByRole("button", { name: "Examine" }).click();
  await expect(
    page.getByRole("region", { name: "Object actions" }),
  ).toContainText("Recovering");
});

test("sound settings persist and missing AudioContext leaves gameplay available", async ({
  page,
}) => {
  await page.goto("./?chapter=3");
  await expect(page.getByTestId("rpg-world")).toBeVisible();
  await page.getByRole("button", { name: "Open game menu" }).click();
  await page
    .getByRole("slider", { name: "Sound volume" })
    .evaluate((element) => {
      const input = element as HTMLInputElement;
      Object.getOwnPropertyDescriptor(
        HTMLInputElement.prototype,
        "value",
      )!.set!.call(input, "35");
      input.dispatchEvent(new Event("input", { bubbles: true }));
      input.dispatchEvent(new Event("change", { bubbles: true }));
    });
  await page.getByRole("button", { name: "Mute sound" }).click();
  await page.reload();
  await expect(page.getByTestId("rpg-world")).toBeVisible();
  await page.getByRole("button", { name: "Open game menu" }).click();
  await expect(
    page.getByRole("button", { name: "Enable sound" }),
  ).toHaveAttribute("aria-pressed", "false");
  await expect(page.getByRole("slider", { name: "Sound volume" })).toHaveValue(
    "35",
  );

  const context = page.context();
  await page.close();
  const fallback = await context.newPage();
  const errors: string[] = [];
  fallback.on("pageerror", (error) => errors.push(error.message));
  await fallback.addInitScript(() => {
    Object.defineProperty(window, "AudioContext", {
      configurable: true,
      value: undefined,
    });
  });
  await fallback.goto("./?chapter=3");
  await expect(fallback.getByTestId("rpg-world")).toBeVisible();
  await fallback.getByRole("button", { name: "Open game menu" }).click();
  await expect(
    fallback.getByText("Audio is unavailable; gameplay continues."),
  ).toBeVisible();
  const before = (await snapshot(fallback)).tick;
  await expect
    .poll(async () => (await snapshot(fallback, true)).tick, { timeout: 5000 })
    .toBeGreaterThan(before);
  expect(errors).toEqual([]);
  await fallback.close();
});

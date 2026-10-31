import { test, expect, type Page } from "@playwright/test";
import { createRpg } from "../src/rpg/engine";
import { FERRIES, interactionTiles, objectById } from "../src/rpg/world";
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
  state.control.thinkingUntil = 1e9;
  state.player.path = [];
  return state;
}

async function checkResponsive(page: Page) {
  for (const viewport of [
    { width: 1280, height: 720 },
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

test("inspecting Ren’s charcoal ledger advances the accepted forge to supplies", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1280, height: 720 });
  await page.goto("./?chapter=3");
  await expect(page.getByTestId("rpg-world")).toBeVisible();
  const state = waitingFixture();
  const ledger = objectById("forge-charcoal")!;
  state.quests.forge = {
    accepted: true,
    complete: false,
    kills: 0,
    stageId: "ledger",
    counters: {},
    choices: {},
  };
  state.player.position = { ...interactionTiles(ledger)[0]! };
  state.player.previousPosition = { ...state.player.position };
  await importState(page, state);
  await page.getByRole("button", { name: `Inspect ${ledger.name}` }).click();
  await page
    .getByRole("region", { name: "Object actions" })
    .getByRole("button", { name: "Do now" })
    .click();
  await expect
    .poll(async () => (await snapshot(page, true)).quests.forge.stageId, {
      timeout: 12000,
    })
    .toBe("supplies");

  await page.getByRole("button", { name: "Open chronicle" }).click();
  const forge = page
    .locator(".rpg-quest")
    .filter({ hasText: "An Honest Forge" });
  await expect(forge).toContainText(
    "Next: Gather six logs from the western woods, or retrieve banked timber.",
  );
  await expect(forge).not.toContainText(/delivered\s*0/i);
  await checkResponsive(page);
});

test("River Letters dialogue records the chosen scouting branch", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1280, height: 720 });
  await page.goto("./?chapter=3");
  await expect(page.getByTestId("rpg-world")).toBeVisible();
  const state = waitingFixture();
  const giver = objectById("quest-letters")!;
  state.quests.letters = {
    accepted: true,
    complete: false,
    kills: 0,
    stageId: "route",
    counters: {},
    choices: {},
  };
  state.player.position = { ...interactionTiles(giver)[0]! };
  state.player.previousPosition = { ...state.player.position };
  await importState(page, state);
  await page.getByRole("button", { name: `Inspect ${giver.name}` }).click();
  await page
    .getByRole("region", { name: "Object actions" })
    .getByRole("button", { name: "Talk" })
    .click();
  const conversation = page.getByRole("region", { name: "Quest conversation" });
  await expect(conversation).toContainText(
    "bring supper for the ferry workers, or scout the courier route",
  );
  await conversation
    .getByRole("button", { name: "Scout three river markers" })
    .click();
  await expect
    .poll(async () => (await snapshot(page, true)).quests.letters, { timeout: 10000 })
    .toMatchObject({
      accepted: true,
      stageId: "scout-reed",
      choices: { route: "scout" },
    });
  await checkResponsive(page);
});

test("ferry passage stays locked until River Letters is complete, then charges five coins", async ({
  page,
}) => {
  // Observe committed worker snapshots: autonomy can move on before a slow save/UI
  // round trip samples the brief arrival tile. The journey itself must still occur.
  await page.addInitScript(() => {
    const GameWorker = window.Worker;
    window.Worker = class extends GameWorker {
      constructor(...args: ConstructorParameters<typeof Worker>) {
        super(...args);
        this.addEventListener("message", event => {
          const state = event.data?.state as RpgState | undefined;
          if (!state?.player) return;
          const samples = JSON.parse(sessionStorage.getItem("ferry-test-snapshots") || "[]");
          samples.push({ position: state.player.position, coins: state.player.inventory.find(item => item.itemId === "coins")?.quantity });
          sessionStorage.setItem("ferry-test-snapshots", JSON.stringify(samples.slice(-64)));
        });
      }
    };
  });
  await page.setViewportSize({ width: 1280, height: 720 });
  await page.goto("./?chapter=3");
  await expect(page.getByTestId("rpg-world")).toBeVisible();
  const ferry = objectById("ferry-west")!;
  const locked = waitingFixture();
  locked.player.position = { ...interactionTiles(ferry)[0]! };
  locked.player.previousPosition = { ...locked.player.position };
  const lockedCoins = locked.player.inventory.find(
    (item) => item.itemId === "coins",
  );
  if (lockedCoins) lockedCoins.quantity = 10;
  else locked.player.inventory.push({ itemId: "coins", quantity: 10 });
  await importState(page, locked);
  await page.getByRole("button", { name: `Inspect ${ferry.name}` }).click();
  const actions = page.getByRole("region", { name: "Object actions" });
  await actions.getByRole("button", { name: "Examine" }).click();
  await expect(actions).toContainText(
    "Complete River Letters to restore this ferry",
  );
  await actions.getByRole("button", { name: "Do now" }).click();
  await expect(page.getByRole("status")).toContainText(
    "Complete River Letters",
  );
  const denied = await snapshot(page);
  expect(denied.player.position).toEqual(locked.player.position);
  expect(
    denied.player.inventory.find((item) => item.itemId === "coins")?.quantity,
  ).toBe(10);

  const unlocked = waitingFixture();
  unlocked.quests.letters = {
    accepted: true,
    complete: true,
    kills: 0,
    stageId: "complete",
    counters: {},
    choices: { route: "scout" },
  };
  unlocked.player.position = { ...interactionTiles(ferry)[0]! };
  unlocked.player.previousPosition = { ...unlocked.player.position };
  const coins = unlocked.player.inventory.find(
    (item) => item.itemId === "coins",
  );
  if (coins) coins.quantity = 10;
  else unlocked.player.inventory.push({ itemId: "coins", quantity: 10 });
  await importState(page, unlocked);
  await page.getByRole("button", { name: `Inspect ${ferry.name}` }).click();
  await page
    .getByRole("region", { name: "Object actions" })
    .getByRole("button", { name: "Do now" })
    .click();
  await expect
    .poll(
      () => page.evaluate(() => JSON.parse(sessionStorage.getItem("ferry-test-snapshots") || "[]")),
      { timeout: 12000 },
    )
    .toContainEqual({
      position: FERRIES["ferry-west"].destination,
      coins: 5,
    });
  await checkResponsive(page);
});

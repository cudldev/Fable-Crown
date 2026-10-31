import { test, expect, type Page } from "@playwright/test";
import { appendGameMessage } from "../src/rpg/events";
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
  await expect(page.getByRole("status")).toContainText("Chronicle restored");
  await page.getByRole("button", { name: "Close panel" }).click();
}

async function readSaved(page: Page): Promise<RpgState> {
  return (await page.evaluate(
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

test("important message history merges repeats, filters, and survives reload", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1280, height: 720 });
  await page.goto("./?chapter=3");
  await expect(page.getByTestId("rpg-world")).toBeVisible();
  const state = waitingFixture();
  state.tick = 10;
  appendGameMessage(
    state,
    "event",
    "discovery-copper",
    "Discovered Copper vein.",
  );
  state.tick++;
  appendGameMessage(
    state,
    "event",
    "discovery-copper",
    "Discovered Copper vein.",
  );
  state.tick++;
  appendGameMessage(
    state,
    "dialogue",
    "talk-actor-1",
    "Mira: The road is quiet today.",
  );
  state.player.skills.mining = 175;
  state.player.inventory.push({ itemId: "copper-ore", quantity: 1 });
  state.rewards = [
    {
      id: `reward-${state.tick}`,
      tick: state.tick,
      items: [{ itemId: "copper-ore", quantity: 1 }],
      xp: { mining: 175 },
    },
  ];
  await importState(page, state);

  const panel = page.getByRole("complementary", { name: "Important messages" });
  await expect(
    panel.getByRole("button", { name: "Open messages" }),
  ).toBeVisible();
  await panel.getByRole("button", { name: "Open messages" }).click();
  const history = page.getByRole("log", { name: "Message history" });
  await expect(history).toContainText("Discovered Copper vein.");
  await expect(history.getByLabel("2 occurrences")).toBeAttached();
  await expect(history).toContainText("Mira: The road is quiet today.");
  await expect(history).not.toContainText("+1 Copper ore");
  await expect(history).not.toContainText("Mining XP");

  await page.getByRole("tab", { name: "Events" }).click();
  await expect(history).toContainText("Discovered Copper vein.");
  await expect(history).not.toContainText("Mira: The road is quiet today.");
  await page.getByRole("tab", { name: "Dialogue" }).click();
  await expect(history).toContainText("Mira: The road is quiet today.");
  await expect(history).not.toContainText("Discovered Copper vein.");
  await page.getByRole("tab", { name: "All" }).click();
  await page.screenshot({ path: "docs/screenshots/messages-desktop.png" });
  await expect(
    panel.getByRole("button", { name: "Collapse messages" }),
  ).toBeVisible();
  await page.reload();
  await expect(page.getByTestId("rpg-world")).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Open messages" }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Open messages" }).click();
  await expect(
    page.getByRole("log", { name: "Message history" }),
  ).toContainText("Mira: The road is quiet today.");
  const persisted = await readSaved(page);
  expect(persisted.messages).toHaveLength(2);
  expect(persisted.messages[0]?.count).toBe(2);
});

test("talking to a nearby villager adds one dialogue entry to the message log", async ({
  page,
}) => {
  await page.goto("./?chapter=3");
  await expect(page.getByTestId("rpg-world")).toBeVisible();
  const state = waitingFixture();
  const npc = state.npcs[0]!;
  npc.position = { ...npc.position, x: 100, y: 80 };
  npc.previousPosition = { ...npc.position };
  state.player.position = { ...npc.position, x: 99 };
  state.player.previousPosition = { ...state.player.position };
  state.player.path = [];
  npc.path = [];
  npc.movement = null;
  npc.bank = [{ itemId: "logs", quantity: 64 }];
  await importState(page, state);

  await page.getByRole("button", { name: `Inspect ${npc.name}` }).click({ button: "right" });
  await page.getByRole("menuitem", { name: "More options", exact: true }).click();
  const details = page.getByRole("region", { name: "Character details" });
  await expect(details).toContainText(npc.name);
  await details.getByRole("button", { name: "Talk" }).click();
  await page.getByRole("button", { name: "Open messages" }).click();
  const history = page.getByRole("log", { name: "Message history" });
  await expect
    .poll(async () => (await readSaved(page)).messages.length, {
      timeout: 12000,
    })
    .toBe(1);
  await expect(history).toContainText(`${npc.name}:`);
  const result = await readSaved(page);
  expect(result.messages).toHaveLength(1);
  expect(result.messages[0]?.category).toBe("dialogue");
  expect(result.messages[0]?.key).toBe(`talk-actor-${npc.id}`);
});

test("mining reward stays in world feedback while an expanded message log remains responsive on mobile", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("./?chapter=3");
  await expect(page.getByTestId("rpg-world")).toBeVisible();
  const state = waitingFixture();
  state.tick = 1;
  state.player.skills.mining = 175;
  const node = WORLD.objects.find((object) => object.resourceId === "copper")!;
  state.player.position = { ...interactionTiles(node)[0]! };
  state.player.previousPosition = { ...state.player.position };
  await importState(page, state);
  await page.getByRole("button", { name: "Open messages" }).click();
  const panel = page.getByRole("complementary", { name: "Important messages" });
  const history = page.getByRole("log", { name: "Message history" });
  await expect(history).not.toContainText("+1 Copper ore");
  await expect(history).not.toContainText("+17.5 Mining XP");
  await page.getByRole("button", { name: "Collapse messages" }).click();
  await page
    .getByRole("button", { name: `Inspect ${node.name}` })
    .first()
    .click({ button: "right" });
  await page.getByRole("menuitem", { name: "More options", exact: true }).click();
  const actions = page.getByRole("region", { name: "Object actions" });
  await actions.getByLabel("Quantity").selectOption("1");
  await actions.getByRole("button", { name: "Gather 1 Copper ore" }).click();
  await page.getByRole("button", { name: "Open messages" }).click();
  await expect
    .poll(async () => (await readSaved(page)).player.skills.mining, {
      timeout: 15000,
    })
    .toBeGreaterThan(175);
  await expect(history).not.toContainText("+1 Copper ore");
  await expect(history).not.toContainText("+17.5 Mining XP");
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  const box = await panel.boundingBox();
  expect(box).not.toBeNull();
  expect(box!.x).toBeGreaterThanOrEqual(0);
  expect(box!.x + box!.width).toBeLessThanOrEqual(390);
  await page.screenshot({ path: "docs/screenshots/messages-portrait.png" });
  await page.setViewportSize({ width: 844, height: 390 });
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  await page.screenshot({ path: "docs/screenshots/messages-landscape.png" });
});

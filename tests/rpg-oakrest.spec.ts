import { test, expect, type Page } from "@playwright/test";
import { createRpg } from "../src/rpg/engine";
import { interactionTiles, isWalkable, WORLD } from "../src/rpg/world";
import type { RpgState, TilePosition, WorldObject } from "../src/rpg/types";

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
  state.control.thought = null;
  state.control.thinkingUntil = 1_000_000_000;
  state.player.path = [];
  return state;
}

function outsideApproachTile(object: WorldObject): TilePosition {
  const tile = interactionTiles(object).find(
    (position) =>
      isWalkable(position, WORLD) &&
      (position.x < object.position.x ||
        position.x >= object.position.x + object.width ||
        position.y < object.position.y ||
        position.y >= object.position.y + object.height),
  );
  if (!tile) throw new Error(`No legal approach tile for ${object.name}`);
  return tile;
}

test("fresh thoughts offer three real Oakrest ambitions and persist the hunt choice", async ({
  page,
}) => {
  await page.goto("./?chapter=3");
  await expect(page.getByTestId("rpg-world")).toBeVisible();
  await page.getByRole("button", { name: "Open thoughts" }).click();
  const thoughts = page.getByRole("region", { name: "thoughts panel" });
  const choices = [
    "Choose thought: Help Ren light the forge",
    "Choose thought: Prepare for a woodland hunt",
    "Choose thought: Earn a better pickaxe",
  ];
  for (const label of choices)
    await expect(thoughts.getByRole("button", { name: label })).toBeVisible();

  await thoughts
    .getByRole("button", {
      name: "Choose thought: Prepare for a woodland hunt",
    })
    .click();
  await expect
    .poll(async () => (await readSaved(page)).control.goal, { timeout: 12000 })
    .toMatchObject({ kind: "skill", skill: "attack", level: 5 });
  const saved = await readSaved(page);
  expect(saved.control.goal?.title).toBe("Prepare for a woodland hunt");

  await page.reload();
  await expect(page.getByTestId("rpg-world")).toBeVisible();
  await expect
    .poll(async () => (await readSaved(page)).control.goal, { timeout: 12000 })
    .toMatchObject({ kind: "skill", skill: "attack", level: 5 });
  await expect(
    page.getByRole("button", { name: "Inspect current ambition" }),
  ).toContainText("Prepare for a woodland hunt");
});

test("Oakrest gate can be closed and reopened from its legal outside tile", async ({
  page,
}) => {
  await page.goto("./?chapter=3");
  await expect(page.getByTestId("rpg-world")).toBeVisible();
  const state = waitingFixture();
  const gate = WORLD.objects.find((object) => object.kind === "gate");
  expect(gate).toBeDefined();
  state.gates[gate!.id] = true;
  const approach = outsideApproachTile(gate!);
  state.player.position = { ...approach };
  state.player.previousPosition = { ...approach };
  await importState(page, state);

  await page.getByRole("button", { name: `Inspect ${gate!.name}` }).click({ button: "right" });
  await page.getByRole("menuitem", { name: "More options", exact: true }).click();
  await page
    .getByRole("region", { name: "Object actions" })
    .getByRole("button", { name: "Close gate" })
    .click();
  await expect
    .poll(async () => (await readSaved(page)).gates[gate!.id], {
      timeout: 12000,
    })
    .toBe(false);
  await page.reload();
  await expect(page.getByTestId("rpg-world")).toBeVisible();
  await expect
    .poll(async () => (await readSaved(page)).gates[gate!.id])
    .toBe(false);

  await page.getByRole("button", { name: `Inspect ${gate!.name}` }).click({ button: "right" });
  await page.getByRole("menuitem", { name: "More options", exact: true }).click();
  await page
    .getByRole("region", { name: "Object actions" })
    .getByRole("button", { name: "Open gate" })
    .click();
  await expect
    .poll(async () => (await readSaved(page)).gates[gate!.id], {
      timeout: 12000,
    })
    .toBe(true);
});

test("Oakrest sign text enters important history and the panel stays clear of the footer", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1280, height: 720 });
  await page.goto("./?chapter=3");
  await expect(page.getByTestId("rpg-world")).toBeVisible();
  const state = waitingFixture();
  const sign = WORLD.objects.find((object) => object.kind === "sign");
  expect(sign).toBeDefined();
  expect(sign!.description).toBeTruthy();
  const approach = outsideApproachTile(sign!);
  state.player.position = { ...approach };
  state.player.previousPosition = { ...approach };
  await importState(page, state);

  await page.getByRole("button", { name: `Inspect ${sign!.name}` }).click({ button: "right" });
  await page.getByRole("menuitem", { name: "More options", exact: true }).click();
  await page
    .getByRole("region", { name: "Object actions" })
    .getByRole("button", { name: "Read sign" })
    .click();
  await expect
    .poll(
      async () =>
        (await readSaved(page)).messages.some((message) =>
          message.text.includes(sign!.description!),
        ),
      { timeout: 12000 },
    )
    .toBe(true);
  const saved = await readSaved(page);
  expect(
    saved.messages.find((message) => message.text.includes(sign!.description!))
      ?.count,
  ).toBe(1);
  await page.getByRole("button", { name: "Open messages" }).click();
  await expect(
    page.getByRole("log", { name: "Message history" }),
  ).toContainText(sign!.description!);
  await page.getByRole("button", { name: "Collapse messages" }).click();

  for (const [viewport, screenshot] of [
    [{ width: 1280, height: 720 }, "docs/screenshots/oakrest-sign-desktop.png"],
    [{ width: 390, height: 844 }, "docs/screenshots/oakrest-sign-portrait.png"],
    [
      { width: 844, height: 390 },
      "docs/screenshots/oakrest-sign-landscape.png",
    ],
  ] as const) {
    await page.setViewportSize(viewport);
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
    const panel = await page.locator(".rpg-messages").boundingBox();
    const footer = await page.locator(".intention-dock").boundingBox();
    expect(panel).not.toBeNull();
    expect(footer).not.toBeNull();
    expect(panel!.y + panel!.height).toBeLessThanOrEqual(footer!.y);
    await page.screenshot({ path: screenshot });
  }
});

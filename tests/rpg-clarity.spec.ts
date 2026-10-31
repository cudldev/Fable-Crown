import { uiTimeout } from "./ui-timeout";
import { test, expect, type Page } from "@playwright/test";
import {
  applyRpgCommand,
  createRpg,
  stepRpg,
  validateRpgSave,
} from "../src/rpg/engine";
import { inventorySlots } from "../src/rpg/inventory";
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
  state.control.source = null;
  state.control.queue = [];
  state.control.thought = null;
  state.control.thinkingUntil = 1_000_000_000;
  state.player.path = [];
  return state;
}

test("full backpack explains the bank detour and Pause holds Alden while the world advances", async ({
  page,
}) => {
  await page.goto("./?chapter=3");
  await expect(page.getByTestId("rpg-world")).toBeVisible();
  const state = waitingFixture();
  const copper = WORLD.objects.find(
    (object) =>
      object.resourceId === "copper" && state.resources[object.id]?.available,
  )!;
  const approach = interactionTiles(copper)[0]!;
  state.player.position = { ...approach };
  state.player.previousPosition = { ...approach };
  state.player.inventory.push({ itemId: "copper-ore", quantity: 17 });
  expect(inventorySlots(state.player.inventory)).toBe(28);
  state.quests.forge.accepted = true;
  state.quests.forge.stageId = "bronze";
  state.control.goal = {
    id: "quest-forge",
    kind: "quest",
    questId: "forge",
    title: "An Honest Forge",
  };
  state.control.steps = ["Gather copper and tin for bronze bars"];
  state.control.thought = null;
  const accepted = applyRpgCommand(state, {
    type: "gather",
    objectId: copper.id,
    quantity: 3,
  });
  expect(accepted.ok).toBe(true);
  stepRpg(state, 1);
  expect(state.control.active).toMatchObject({
    type: "gather",
    objectId: copper.id,
  });
  expect(state.control.source).toBe("player");
  expect(validateRpgSave(state)).not.toBeNull();
  await importState(page, state);

  const readout = page.getByRole("region", { name: "Alden's current plan" });
  await expect(readout.locator(".plan-now")).toContainText(
    /bank|copper|gather/i,
  );
  await expect(readout.locator(".plan-why")).toContainText(/full|bag|space/i);
  await expect(readout.locator(".plan-next")).toContainText(
    /gather|return|copper/i,
  );
  await page.screenshot({ path: "docs/screenshots/clarity-world-desktop.png" });

  const activeBeforeFocus = (await readSaved(page)).control.active;
  await readout
    .getByRole("button", { name: "Show Alden's destination" })
    .click();
  await expect
    .poll(async () => (await readSaved(page)).control.active)
    .toMatchObject({ type: "gather", objectId: copper.id });
  expect(activeBeforeFocus).toMatchObject({
    type: "gather",
    objectId: copper.id,
  });

  await readout.getByRole("button", { name: "Pause Alden" }).click();
  await expect(page.getByLabel("Command acknowledgement")).toContainText(
    "Accepted",
  );
  await expect
    .poll(async () => (await readSaved(page)).control.waiting)
    .toBe(true);
  const paused = await readSaved(page);
  expect(paused.control.waiting).toBe(true);
  await expect
    .poll(
      async () => {
        const next = await readSaved(page);
        return (
          next.tick > paused.tick &&
          next.player.position.x === paused.player.position.x &&
          next.player.position.y === paused.player.position.y
        );
      },
      { timeout: uiTimeout(15000) },
    )
    .toBe(true);
  await expect
    .poll(
      async () => {
        const next = await readSaved(page);
        return next.npcs.some((npc, index) => {
          const before = paused.npcs[index]!;
          return (
            npc.position.x !== before.position.x ||
            npc.position.y !== before.position.y
          );
        });
      },
      { timeout: uiTimeout(20000) },
    )
    .toBe(true);

  const held = await readSaved(page);
  await readout.getByRole("button", { name: "Resume Alden" }).click();
  await expect
    .poll(
      async () => {
        const next = await readSaved(page);
        return (
          !next.control.waiting &&
          (next.player.position.x !== held.player.position.x ||
            next.player.position.y !== held.player.position.y)
        );
      },
      { timeout: uiTimeout(20000) },
    )
    .toBe(true);
});

test("forge explanation and actual plan history remain readable across desktop and phone layouts", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1280, height: 720 });
  await page.goto("./?chapter=3");
  await expect(page.getByTestId("rpg-world")).toBeVisible();
  await page.getByRole("button", { name: "Open thoughts" }).click();
  let panel = page.getByRole("region", { name: "thoughts panel" });
  const explanation = panel.getByRole("region", {
    name: "Current intention explained",
  });
  await expect(explanation.locator("p").nth(0)).toContainText("Now:");
  await expect(explanation.locator("p").nth(0)).toContainText(/forge|Ren/i);
  await expect(explanation.locator("p").nth(1)).toContainText("Why:");
  await expect(explanation.locator("p").nth(2)).toContainText("Next:");
  await expect(explanation.locator("p").nth(2)).toContainText(
    /ledger|suppl|timber|forge/i,
  );
  await page.screenshot({ path: "docs/screenshots/clarity-forge-desktop.png" });

  const before = await readSaved(page);
  const decisionsBefore = before.control.decisions?.length ?? 0;
  await panel
    .getByRole("button", {
      name: /Choose thought: Prepare for a woodland hunt/,
    })
    .click();
  await expect
    .poll(async () => (await readSaved(page)).control.decisions?.length ?? 0, {
      timeout: uiTimeout(15000),
    })
    .toBeGreaterThan(decisionsBefore);
  await page.getByRole("button", { name: "Open thoughts" }).click();
  panel = page.getByRole("region", { name: "thoughts panel" });
  const history = panel.locator(
    '.rpg-decision-history[aria-label="Recent plan changes"]',
  );
  await expect(history).toBeVisible();
  await history.getByText("Recent plan changes").click();
  await expect(history).toContainText(/woodland hunt/i);

  for (const [viewport, screenshot] of [
    [{ width: 390, height: 844 }, "docs/screenshots/clarity-portrait.png"],
    [{ width: 844, height: 390 }, "docs/screenshots/clarity-landscape.png"],
  ] as const) {
    await page.setViewportSize(viewport);
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
    const readout = await page.locator(".intention-readout").boundingBox();
    const footer = await page.locator(".intention-dock").boundingBox();
    const camera = await page.locator(".camera-controls").boundingBox();
    expect(readout).not.toBeNull();
    expect(footer).not.toBeNull();
    expect(camera).not.toBeNull();
    expect(readout!.x).toBeGreaterThanOrEqual(0);
    expect(readout!.x + readout!.width).toBeLessThanOrEqual(viewport.width);
    expect(readout!.y + readout!.height).toBeLessThanOrEqual(footer!.y);
    expect(camera!.x).toBeGreaterThanOrEqual(0);
    expect(camera!.x + camera!.width).toBeLessThanOrEqual(viewport.width);
    await page.screenshot({ path: screenshot });
  }

  await page.reload();
  await expect(page.getByTestId("rpg-world")).toBeVisible();
  const reloaded = await readSaved(page);
  expect(reloaded.control.decisions?.length ?? 0).toBeGreaterThan(
    decisionsBefore,
  );
  await page.getByRole("button", { name: "Open thoughts" }).click();
  const reloadedHistory = page
    .getByRole("region", { name: "thoughts panel" })
    .locator('.rpg-decision-history[aria-label="Recent plan changes"]');
  await reloadedHistory.getByText("Recent plan changes").click();
  await expect(reloadedHistory).toContainText(/woodland hunt/i);
});

test("personality preview applies without changing progress, and Alden's explicit choice is explained and saved", async ({
  page,
}) => {
  await page.goto("./?chapter=3");
  await expect(page.getByTestId("rpg-world")).toBeVisible();
  const state = waitingFixture();
  state.quests.forge.accepted = true;
  state.quests.forge.stageId = "ledger";
  state.control.goal = {
    id: "quest-forge",
    kind: "quest",
    questId: "forge",
    title: "An Honest Forge",
  };
  state.control.goalSource = "player";
  state.control.steps = ["Read Ren’s ledger"];
  state.control.thought = null;
  await importState(page, state);

  const initial = await readSaved(page);
  const goalBefore = structuredClone(initial.control.goal);
  const skillsBefore = structuredClone(initial.player.skills);
  const inventoryBefore = structuredClone(initial.player.inventory);
  await page.getByRole("button", { name: "Open thoughts" }).click();
  const thoughts = page.getByRole("region", { name: "thoughts panel" });
  await thoughts
    .getByRole("button", { name: "Personality & priorities" })
    .click();
  const personality = page.getByRole("region", { name: "personality panel" });

  for (const trait of [
    "Curiosity",
    "Craftsmanship",
    "Helpfulness",
    "Adventurousness",
    "Caution",
  ])
    await expect(personality.getByLabel(trait)).toBeVisible();
  await personality
    .getByRole("button", { name: "Personality preset: Explorer" })
    .click();
  const caution = personality.getByLabel("Caution");
  await caution.focus();
  await caution.press("End");
  await caution.press("ArrowLeft");
  await caution.press("ArrowLeft");
  await expect(caution).toHaveValue("90");

  const compared = personality.getByRole("list", { name: "Compared goals" });
  const rows = compared.locator(":scope > li[data-goal-id]");
  await expect(rows).toHaveCount(4);
  const previewId = await rows.first().getAttribute("data-goal-id");
  expect(previewId).toBeTruthy();
  await personality.getByRole("button", { name: "Apply personality" }).click();
  await expect
    .poll(async () => {
      const saved = await readSaved(page);
      return {
        profile: saved.control.profile,
        goal: saved.control.goal,
      };
    })
    .toMatchObject({
      profile: { curiosity: 100, caution: 90 },
      goal: goalBefore,
    });
  const applied = await readSaved(page);
  expect(applied.control.goalSource).toBe("player");
  expect(applied.player.skills).toEqual(skillsBefore);
  expect(applied.player.inventory).toEqual(inventoryBefore);
  await personality
    .getByRole("heading", { name: "Personality & priorities" })
    .scrollIntoViewIfNeeded();
  await page.screenshot({ path: "docs/screenshots/personality-desktop.png" });
  const appliedPreviewId = await rows.first().getAttribute("data-goal-id");
  expect(appliedPreviewId).toBe(previewId);

  await personality
    .getByRole("button", { name: "Let Alden choose a new ambition" })
    .click();
  await expect
    .poll(
      async () => {
        const saved = await readSaved(page);
        return {
          goalId: saved.control.goal?.id,
          goalSource: saved.control.goalSource,
          chosenId: saved.control.deliberation?.chosenId,
        };
      },
      { timeout: uiTimeout(15000) },
    )
    .toEqual({
      goalId: previewId,
      goalSource: "autonomous",
      chosenId: previewId,
    });
  const chosen = await readSaved(page);
  expect(chosen.player.skills).toEqual(skillsBefore);
  expect(chosen.player.inventory).toEqual(inventoryBefore);

  const thoughtsAfterChoice = page.getByRole("region", {
    name: "thoughts panel",
  });
  const why = thoughtsAfterChoice.getByRole("group", {
    name: "Last goal comparison",
  });
  await expect(why).toBeVisible();
  await why.getByText("Why this ambition?").click();
  const goalName = chosen.control.goal!.title;
  await expect(why).toContainText(goalName);
  await expect(why).toContainText("Considered:");

  await page.reload();
  await expect(page.getByTestId("rpg-world")).toBeVisible();
  await expect
    .poll(async () => {
      const saved = await readSaved(page);
      return {
        profile: saved.control.profile,
        goalId: saved.control.goal?.id,
        chosenId: saved.control.deliberation?.chosenId,
      };
    })
    .toMatchObject({
      profile: { curiosity: 100, caution: 90 },
      goalId: previewId,
      chosenId: previewId,
    });
  const reloaded = await readSaved(page);
  expect(reloaded.player.skills).toEqual(skillsBefore);
  expect(reloaded.player.inventory).toEqual(inventoryBefore);
  expect(reloaded.control.goalSource).toBe("autonomous");
  await page.getByRole("button", { name: "Open thoughts" }).click();
  await page
    .getByRole("region", { name: "thoughts panel" })
    .getByRole("button", { name: "Personality & priorities" })
    .click();
  await page.setViewportSize({ width: 390, height: 844 });
  await page
    .getByRole("heading", { name: "Personality & priorities" })
    .scrollIntoViewIfNeeded();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  await page.screenshot({ path: "docs/screenshots/personality-portrait.png" });
});

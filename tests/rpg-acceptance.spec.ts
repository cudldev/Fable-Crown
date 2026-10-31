import { uiTimeout } from "./ui-timeout";
import { arrivalTick, trackPlayerPositions } from "./worker-positions";
import { test, expect, type Page } from "@playwright/test";
import { writeFile } from "node:fs/promises";
import { createRpg } from "../src/rpg/engine";
import { canStep, interactionTiles, objectById } from "../src/rpg/world";
import type { RpgState } from "../src/rpg/types";

// Keep a bounded trace for hosted-only save observation failures.
test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    let workerNumber = 0;
    const record = (entry: Record<string, unknown>) => {
      const entries = JSON.parse(sessionStorage.getItem("save-observation-trace") || "[]");
      entries.push({ at: performance.now(), ...entry });
      sessionStorage.setItem("save-observation-trace", JSON.stringify(entries.slice(-160)));
    };
    const BrowserWorker = window.Worker;
    window.Worker = class extends BrowserWorker {
      private traceId: number;
      constructor(...args: ConstructorParameters<typeof Worker>) {
        super(...args); this.traceId = ++workerNumber;
        record({ event: "worker", worker: this.traceId, url: String(args[0]) });
        this.addEventListener("message", event => {
          const data = event.data, state = data?.state as RpgState | undefined;
          if (!state?.player) return;
          // Acceptance lasts only a few ticks before an already supplied delivery.
          // Retain that actual worker state even if a software GPU blocks the driver.
          if (sessionStorage.getItem("watch-forge-acceptance") === "true" &&
              state.quests.forge?.accepted && !state.quests.forge.complete) {
            sessionStorage.setItem("first-forge-acceptance", JSON.stringify({
              tick: state.tick, inventory: state.player.inventory,
            }));
            sessionStorage.removeItem("watch-forge-acceptance");
          }
          record({ event: "message", worker: this.traceId, message: data.message,
            tick: state.tick, savedAt: state.savedAt, storageOkay: data.storageOkay, hp: state.player.health,
            attack: state.player.skills.attack, position: state.player.position,
            active: state.control.active, waiting: state.control.waiting, receipt: data.receipt });
        });
      }
      postMessage(message: unknown, transferOrOptions?: Transferable[] | StructuredSerializeOptions) {
        const data = message as { type?: string; command?: unknown; requestId?: string; value?: RpgState };
        record({ event: "post", worker: this.traceId, type: data.type, command: data.command, requestId: data.requestId,
          imported: data.type === "import" ? { tick: data.value?.tick, hp: data.value?.player?.health, attack: data.value?.player?.skills?.attack } : undefined });
        if (Array.isArray(transferOrOptions)) super.postMessage(message, transferOrOptions);
        else super.postMessage(message, transferOrOptions);
      }
    };
  });
});
test.afterEach(async ({ page }, info) => {
  if (info.status === info.expectedStatus) return;
  const trace = await page.evaluate(() => sessionStorage.getItem("save-observation-trace")).catch(() => null);
  const path = info.outputPath("save-observation-trace.json");
  await writeFile(path, trace || "null");
  await info.attach("save-observation-trace", { path, contentType: "application/json" });
});

async function importState(page: Page, state: unknown) {
  if (!(await page.getByRole("button", { name: "Save on device" }).isVisible()))
    await page.getByRole("button", { name: "Open game menu" }).click();
  await page.locator('input[type="file"]').setInputFiles({
    name: "fixture.json",
    mimeType: "application/json",
    buffer: Buffer.from(JSON.stringify(state)),
  });
}

async function snapshot(page: Page): Promise<RpgState> {
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
  await page.evaluate(saved => {
    const entries = JSON.parse(sessionStorage.getItem("save-observation-trace") || "[]");
    entries.push({ event: "snapshot", at: performance.now(), tick: saved.tick, hp: saved.player.health,
      attack: saved.player.skills.attack, savedAt: saved.savedAt, position: saved.player.position });
    sessionStorage.setItem("save-observation-trace", JSON.stringify(entries.slice(-160)));
  }, value as RpgState);
  // Keep the save menu open while polling; closing it submits an unrelated GPU frame.
  return value as RpgState;
}

function fixture() {
  const state = createRpg(Date.now(), 8128);
  state.control.waiting = true;
  state.control.goal = null;
  state.control.active = null;
  state.control.queue = [];
  state.player.path = [];
  return state;
}

// Temporarily skipped at the user's request (2026-10-31): investigate hosted saved-row observations before re-enabling.
test.skip("combat style selection and cooked food healing are authoritative", async ({
  page,
}) => {
  await page.goto("./?chapter=3");
  await expect(page.getByTestId("rpg-world")).toBeVisible();
  const state = fixture();
  state.player.health = 2;
  state.player.inventory.find(
    (item) => item.itemId === "cooked-shrimp",
  )!.quantity = 1;
  await importState(page, state);
  await expect(page.getByRole("status")).toContainText("Chronicle restored");

  await page.getByRole("button", { name: "Open inventory" }).click();
  await page.getByLabel("Combat style").selectOption("defence");
  await page.getByRole("button", { name: /Cooked shrimp, 1/ }).click();
  await page.getByRole("button", { name: "Eat" }).click();
  await expect
    .poll(async () => (await snapshot(page)).player.health, { timeout: uiTimeout(15000) })
    .toBeGreaterThanOrEqual(5);
  const saved = await snapshot(page);
  expect(saved.control.style).toBe("defence");
  expect(saved.player.health).toBeGreaterThanOrEqual(5);
  expect(
    saved.player.inventory.find((item) => item.itemId === "cooked-shrimp"),
  ).toBeUndefined();
});

test("enemy inspection, combat XP and loot, plus recoverable grave UI", async ({
  page,
}) => {
  await page.goto("./?chapter=3");
  await expect(page.getByTestId("rpg-world")).toBeVisible();
  const state = fixture();
  const enemy = state.enemies.find((entry) => entry.id === "boar-0")!;
  const adjacent = [
    { ...enemy.position, x: enemy.position.x - 1 },
    { ...enemy.position, x: enemy.position.x + 1 },
    { ...enemy.position, y: enemy.position.y - 1 },
    { ...enemy.position, y: enemy.position.y + 1 },
  ].find((position) => canStep(position, enemy.position));
  expect(adjacent).toBeDefined();
  state.player.position = { ...adjacent! };
  state.player.previousPosition = { ...adjacent! };
  enemy.health = 1;
  await importState(page, state);
  await page.getByRole("button", { name: "Inspect Moss boar, 1 health", exact: true }).click({ button: "right" });
  await page.getByRole("menuitem", { name: "More options", exact: true }).click();
  await expect(
    page.getByRole("region", { name: "Enemy actions" }),
  ).toContainText("Health 1/");
  await page.getByRole("button", { name: "Attack now" }).click();
  await expect
    .poll(async () => (await snapshot(page)).player.skills.attack, {
      timeout: uiTimeout(20000),
    })
    .toBeGreaterThan(0);
  const fought = await snapshot(page);
  // Alden may already have picked up the loot before this persisted snapshot.
  expect(
    [
      ...fought.player.inventory,
      ...fought.bank,
      ...fought.drops.flatMap((drop) => drop.items),
    ].some((item) => item.itemId === "raw-boar" && item.quantity > 0),
  ).toBe(true);

  const recoverable = fixture();
  recoverable.grave = {
    position: { ...recoverable.player.position },
    items: [{ itemId: "logs", quantity: 2 }],
    attempts: 0,
    retryAt: 0,
  };
  await importState(page, recoverable);
  await page
    .getByRole("button", { name: "Inspect your backpack grave" })
    .click({ button: "right" });
  await page.getByRole("menuitem", { name: "More options", exact: true }).click();
  await expect(
    page.getByRole("region", { name: "Recovery actions" }),
  ).toContainText("Logs ×2");
  await page.getByRole("button", { name: "Recover backpack" }).click();
  await expect.poll(async () => (await snapshot(page)).grave).toBeNull();
});

test("quest ambition persists and real carried supplies complete a delivery", async ({
  page,
}) => {
  await page.goto("./?chapter=3");
  await expect(page.getByTestId("rpg-world")).toBeVisible();
  // Freeze the real worker only while checking durable ambition storage.
  await page.evaluate(() => window.dispatchEvent(new Event("pagehide")));
  const state = fixture();
  const giver = objectById("quest-forge")!;
  state.player.position = { ...interactionTiles(giver)[0]! };
  state.player.previousPosition = { ...state.player.position };
  // Keep this first ambition unfinished while the persisted goal is observed.
  // The separate delivery fixture below carries the complete supplies.
  await importState(page, state);
  await page.getByRole("button", { name: /Inspect Master smith Ren/ }).click({ button: "right" });
  await page.getByRole("menuitem", { name: "More options", exact: true }).click();
  await page.getByRole("button", { name: "Make this my ambition" }).click();
  await expect
    .poll(async () => (await snapshot(page)).control.goal?.questId)
    .toBe("forge");

  const delivery = fixture();
  delivery.player.position = { ...interactionTiles(giver)[0]! };
  delivery.player.previousPosition = { ...delivery.player.position };
  delivery.player.inventory.push(
    { itemId: "logs", quantity: 6 },
    { itemId: "bronze-bar", quantity: 6 },
  );
  const dismiss = page.getByRole("button", { name: "Dismiss notification" });
  if (await dismiss.isVisible()) await dismiss.click();
  await importState(page, delivery);
  await expect(page.getByRole("status")).toContainText("Chronicle restored");
  // The delivery phase must advance normally, including its real material use.
  await page.evaluate(() => document.dispatchEvent(new Event("visibilitychange")));
  await page.getByRole("button", { name: "Inspect Master smith Ren" }).click({ button: "right" });
  await page.getByRole("menuitem", { name: "More options", exact: true }).click();
  await page.evaluate(() => {
    sessionStorage.removeItem("first-forge-acceptance");
    sessionStorage.setItem("watch-forge-acceptance", "true");
  });
  await page.getByRole("button", { name: "Do now" }).click();
  await expect
    .poll(async () => (await snapshot(page)).quests.forge?.accepted)
    .toBe(true);
  await expect.poll(() => page.evaluate(() =>
    sessionStorage.getItem("first-forge-acceptance"))).not.toBeNull();
  const accepted = await page.evaluate(() => JSON.parse(
    sessionStorage.getItem("first-forge-acceptance")!,
  )) as { tick: number; inventory: RpgState["player"]["inventory"] };
  expect(
    accepted.inventory.find((item) => item.itemId === "logs")?.quantity,
  ).toBe(6);
  expect(
    accepted.inventory.find((item) => item.itemId === "bronze-bar")
      ?.quantity,
  ).toBe(6);

  await expect
    .poll(async () => (await snapshot(page)).quests.forge?.complete, {
      timeout: uiTimeout(30000),
    })
    .toBe(true);
  const done = await snapshot(page);
  expect(
    done.player.inventory.find((item) => item.itemId === "logs"),
  ).toBeUndefined();
  expect(
    done.player.inventory.find((item) => item.itemId === "bronze-bar"),
  ).toBeUndefined();
  await page.getByRole("button", { name: "Open chronicle" }).click();
  const completed = page
    .locator(".rpg-quest")
    .filter({ has: page.getByRole("heading", { name: "An Honest Forge" }) });
  await expect(completed).toContainText("6 Logs delivered");
  await expect(completed).toContainText("6 Bronze bar delivered");
  await expect(completed).not.toContainText("0/6");
});

test("invalid import preserves the current chapter", async ({ page }) => {
  await page.goto("./?chapter=3");
  await expect(page.getByTestId("rpg-world")).toBeVisible();
  // Compare the rejected import against one stable saved chapter.
  await page.evaluate(() => window.dispatchEvent(new Event("pagehide")));
  const before = await snapshot(page);
  await importState(page, { version: 3, player: { health: -999 } });
  await expect(page.getByRole("status")).toContainText("invalid");
  const after = await snapshot(page);
  expect(after.player.health).toBe(before.player.health);
  expect(after.player.inventory).toEqual(before.player.inventory);
});

test("world assets install to cache and shell reloads offline", async ({
  page,
  context,
}) => {
  await page.goto("./?chapter=3");
  await expect(page.getByTestId("rpg-world")).toBeVisible();
  await expect
    .poll(
      () => page.evaluate(() => Boolean(navigator.serviceWorker?.controller)),
      { timeout: uiTimeout(15000) },
    )
    .toBe(true);
  await page.getByRole("button", { name: "Open game menu" }).click();
  await page.getByRole("button", { name: /Save world offline/ }).click();
  await expect(
    page.getByRole("button", { name: "World saved offline" }),
  ).toBeVisible({ timeout: uiTimeout(60000) });
  const cached = await page.evaluate(async () => {
    const keys = await caches.keys();
    const names = keys.filter((key) => key.startsWith("fable-art-"));
    const requests = await Promise.all(
      names.map(async (name) => (await caches.open(name)).keys()),
    );
    return { names, count: requests.flat().length };
  });
  expect(cached.names.length).toBeGreaterThan(0);
  expect(cached.count).toBeGreaterThan(10);
  await context.setOffline(true);
  await page.reload();
  await expect(page.getByTestId("rpg-world")).toBeVisible({ timeout: uiTimeout(15000) });
  const decoded = await page.evaluate(async () => {
    const base = new URL("./", location.href);
    const manifest = await (
      await fetch(new URL("world-assets.json", base))
    ).json();
    return Promise.all(
      manifest.files.map(async (path: string) => {
        const response = await fetch(new URL(path, base));
        return response.ok && (await response.arrayBuffer()).byteLength > 0;
      }),
    );
  });
  expect(decoded.every(Boolean)).toBe(true);
  await context.setOffline(false);
});

test("portrait and landscape fit, controls stay touch sized, and no remote runtime or page errors", async ({
  page,
}) => {
  const errors: string[] = [];
  const external: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("./?chapter=3");
  await expect(page.getByTestId("rpg-world")).toBeVisible();
  external.push(
    ...(await page.evaluate(() =>
      performance
        .getEntriesByType("resource")
        .map((entry) => entry.name)
        .filter((url) => new URL(url).origin !== location.origin),
    )),
  );
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
      "Open destinations",
      "World tools",
      "Open game menu",
    ]) {
      const box = await page.getByRole("button", { name }).boundingBox();
      expect(box?.width, `${name} width`).toBeGreaterThanOrEqual(44);
      expect(box?.height, `${name} height`).toBeGreaterThanOrEqual(44);
    }
    await page.getByRole("button", { name: "World tools", exact: true }).click();
    for (const name of ["World overview", "Zoom in", "Zoom out"]) {
      const box = await page.getByRole("button", { name, exact: true }).boundingBox();
      expect(box?.width).toBeGreaterThanOrEqual(44);
      expect(box?.height).toBeGreaterThanOrEqual(44);
    }
    await page.getByRole("button", { name: "World tools", exact: true }).click();
  }
  expect(external).toEqual([]);
  expect(errors).toEqual([]);
  await expect(page.locator(".doing-now")).not.toContainText("Considering", {
    timeout: uiTimeout(10000),
  });
  if (
    await page.getByRole("button", { name: "Dismiss notification" }).isVisible()
  )
    await page.getByRole("button", { name: "Dismiss notification" }).click();
  await page.screenshot({ path: "docs/screenshots/rpg-landscape.png" });
});

test("pending intentions can be reordered, held and resumed through thought controls", async ({
  page,
}) => {
  await trackPlayerPositions(page);
  await page.goto("./");
  await expect(page.getByTestId("rpg-world")).toBeVisible();
  const s = fixture();
  s.control.queue = [
    {
      type: "move",
      position: { ...s.player.position, x: s.player.position.x + 3 },
    },
    {
      type: "move",
      position: { ...s.player.position, y: s.player.position.y + 3 },
    },
  ];
  await importState(page, s);
  await expect(page.getByRole("status")).toContainText("Chronicle restored");
  await page.getByRole("button", { name: "Open thoughts" }).click();
  await page.getByRole("button", { name: "Move order 2 earlier" }).click();
  const reordered = await snapshot(page);
  expect(reordered.control.queue[0]).toEqual(s.control.queue[1]);
  expect(reordered.control.waiting).toBe(true);
  await page.getByRole("button", { name: "Open thoughts" }).click();
  await page.getByRole("button", { name: "Remove order 2" }).click();
  await expect(
    page.getByRole("region", { name: "thoughts panel" }),
  ).toContainText("Next orders · 1/8");
  await page.getByRole("button", { name: "Let Alden decide" }).click();
  const destination = { ...s.player.position, y: s.player.position.y + 3 };
  await expect.poll(() => arrivalTick(page, destination)).not.toBeNull();
  expect((await snapshot(page)).tick).toBeGreaterThanOrEqual((await arrivalTick(page, destination))!);
});

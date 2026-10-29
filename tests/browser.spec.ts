import { test, expect, type Page } from "@playwright/test";
import type { GameState } from "../src/types";

async function snapshot(page: Page): Promise<GameState> {
  return page.evaluate(
    () =>
      new Promise((resolve, reject) => {
        const request = indexedDB.open("fable-crown", 1);
        request.onsuccess = () => {
          const db = request.result;
          const get = db.transaction("saves").objectStore("saves").get("v1");
          get.onsuccess = () => {
            resolve(get.result);
            db.close();
          };
          get.onerror = () => reject(get.error);
        };
        request.onerror = () => reject(request.error);
      }),
  );
}

async function saveNow(page: Page): Promise<void> {
  await page.getByRole("button", { name: "Open game menu" }).click();
  await page.getByRole("button", { name: "Save on device" }).click();
  await expect(page.getByRole("status")).toContainText(
    "Chronicle saved on this device.",
  );
}

test("expanded frontier loads, orders can be queued, and views fit desktop and mobile", async ({
  page,
}) => {
  const errors: string[] = [];
  const external: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  page.on("request", (r) => {
    if (
      !new URL(r.url()).hostname.match(
        /^(127\.0\.0\.1|localhost|cudldev\.github\.io)$/,
      )
    )
      external.push(r.url());
  });
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.goto("./");
  await expect(page.getByTestId("world")).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Inspect Alden, prince", exact: false }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Open world destinations" }),
  ).toBeVisible();
  const brokenImages = await page
    .locator(".fc-landscape image")
    .evaluateAll(async (images) => {
      const urls = images
        .map((image) => (image as SVGImageElement).href.baseVal)
        .filter((url) => url.includes("/art/"));
      return (
        await Promise.all(
          urls.map(async (url) => {
            const image = new Image();
            image.src = url;
            try {
              await image.decode();
              return null;
            } catch {
              return url;
            }
          }),
        )
      ).filter((url): url is string => url !== null);
    });
  expect(brokenImages).toEqual([]);

  await page.getByRole("button", { name: "Open world destinations" }).click();
  await expect(page.getByRole("region", { name: "world panel" })).toBeVisible();
  await page
    .getByRole("region", { name: "world panel" })
    .getByRole("button", { name: /Oakrest woodland/ })
    .click();
  await expect(
    page.getByRole("region", { name: "Place actions" }),
  ).toBeVisible();
  await expect(page.getByLabel("Quantity")).toBeVisible();
  await page.getByLabel("Quantity").selectOption("20");
  await page.getByRole("button", { name: "Do now" }).click();
  await expect(page.getByRole("status")).toContainText(
    "Following: Gather 20 timber",
  );

  await page.getByRole("button", { name: "Inspect Oakrest mine" }).click();
  await expect(page.getByLabel("Resource")).toBeVisible();
  await page.getByLabel("Resource").selectOption("iron");
  await page.getByLabel("Quantity").selectOption("2");
  await page.getByRole("button", { name: "Add next" }).click();
  await page.getByRole("button", { name: "Open intentions" }).click();
  await expect(page.getByRole("region", { name: "queue panel" })).toContainText(
    "Gather 2 iron",
  );
  await expect(page.getByRole("region", { name: "queue panel" })).toContainText(
    "Gather 20 timber",
  );
  await expect(
    page.getByRole("button", { name: "Let Alden decide" }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Wait here" }).click();
  await expect(page.getByRole("status")).toContainText(
    "Waiting here until you resume intentions.",
  );
  await page.getByRole("button", { name: "Let Alden decide" }).click();
  await page.getByRole("button", { name: "Open intentions" }).click();

  await expect(
    page.getByRole("button", {
      name: /Inspect Mira, woodcutter, Gathering timber/,
    }),
  ).toBeVisible({ timeout: 20000 });
  await page.getByRole("button", { name: "World overview" }).click();
  await expect(page.locator(".fc-overview-caption")).toBeVisible();
  await page.screenshot({
    path: "docs/screenshots/world-overview.png",
    fullPage: true,
  });
  await page.getByRole("button", { name: "World overview" }).click();
  await page.getByRole("button", { name: "Follow Alden" }).click();
  await page.screenshot({
    path: "docs/screenshots/world-desktop.png",
    fullPage: true,
  });
  await saveNow(page);
  expect((await snapshot(page)).people).toHaveLength(24);
  await page.getByRole("button", { name: "Close panel" }).click();

  for (const viewport of [
    { width: 390, height: 844 },
    { width: 844, height: 390 },
  ]) {
    await page.setViewportSize(viewport);
    await expect(page.getByTestId("world")).toBeVisible();
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
    const undersized = await page
      .locator(
        ".world-header button, .camera-controls button, .dock-buttons button",
      )
      .evaluateAll(
        (nodes) =>
          nodes.filter((node) => {
            const r = node.getBoundingClientRect();
            return r.width < 44 || r.height < 44;
          }).length,
      );
    expect(undersized).toBe(0);
    const name =
      viewport.width < viewport.height
        ? "world-portrait.png"
        : "world-landscape.png";
    await page.screenshot({ path: `docs/screenshots/${name}`, fullPage: true });
  }
  expect(errors).toEqual([]);
  expect(external).toEqual([]);
});

test("Briarford travel persists and completes through bounded offline progress", async ({
  page,
}) => {
  await page.goto("./");
  await expect(page.getByTestId("world")).toBeVisible();
  await page.getByRole("button", { name: "Open world destinations" }).click();
  await page.getByRole("button", { name: /Briarford green/ }).click();
  await page.getByRole("button", { name: "Do now" }).click();
  await expect(page.getByRole("status")).toContainText(
    "Following: Travel to Briarford green",
  );
  await saveNow(page);
  const before = await snapshot(page);
  expect(before.control.active?.targetId).toBe("briarford");
  expect(before.people).toHaveLength(24);
  const hero = before.people[0]!;
  const path = hero.path.length ? hero.path : [{ x: 3900, y: 1000 }];
  let previous = { x: hero.x, y: hero.y };
  const distance = path.reduce((total, point) => {
    const segment = Math.hypot(point.x - previous.x, point.y - previous.y);
    previous = point;
    return total + segment;
  }, 0);
  const travelTicks = Math.ceil(distance / 36) + 3;
  before.savedAt = Date.now() - travelTicks * 4 * 600;
  await page.locator("input[type=file]").setInputFiles({
    name: "chronicle.json",
    mimeType: "application/json",
    buffer: Buffer.from(JSON.stringify(before)),
  });
  await expect(page.getByRole("status")).toContainText("Chronicle restored.");
  const after = await snapshot(page);
  expect(after.tick - before.tick).toBeGreaterThanOrEqual(travelTicks);
  expect(after.tick - before.tick).toBeLessThanOrEqual(travelTicks + 2);
  expect(after.control.active).toBeNull();
  expect(
    Math.hypot(after.people[0]!.x - 3900, after.people[0]!.y - 1000),
  ).toBeLessThan(0.01);
  for (const resource of ["timber", "stone", "iron"] as const) {
    const stored = Object.values(after.stores).reduce(
      (sum, store) => sum + store[resource],
      0,
    );
    const carried = after.people.reduce(
      (sum, person) =>
        sum + (person.carry?.resource === resource ? person.carry.amount : 0),
      0,
    );
    expect(stored + carried + after.spent[resource]).toBe(
      after.gathered[resource],
    );
  }
});

test("visited world reloads offline and invalid chronicle import preserves the save", async ({
  page,
  context,
}) => {
  await page.goto("./");
  await expect(page.getByTestId("world")).toBeVisible();
  await saveNow(page);
  const before = await snapshot(page);
  await page.locator("input[type=file]").setInputFiles({
    name: "broken.json",
    mimeType: "application/json",
    buffer: Buffer.from('{"version":1}'),
  });
  await expect(page.getByRole("status")).toContainText(
    "That chronicle is invalid. Your current village is safe.",
  );
  expect((await snapshot(page)).tick).toBeGreaterThanOrEqual(before.tick);

  await page.evaluate(() =>
    navigator.serviceWorker.ready.then(() => undefined),
  );
  await page.reload();
  await expect(page.getByTestId("world")).toBeVisible();
  await expect
    .poll(() =>
      page.evaluate(() => Boolean(navigator.serviceWorker.controller)),
    )
    .toBe(true);
  const cachedRegions = () =>
    page.evaluate(async () => {
      const names = await caches.keys(),
        name = names.find((n) => n.startsWith("fable-art-"))!;
      return (await (await caches.open(name)).keys()).filter((r) =>
        /region-\d\.webp/.test(r.url),
      ).length;
    });
  expect(await cachedRegions()).toBeLessThan(9);
  await page.getByRole("button", { name: "Open game menu" }).click();
  await expect(
    page.getByRole("button", { name: /Download world for offline play/ }),
  ).toContainText("MB");
  await page
    .getByRole("button", { name: /Download world for offline play/ })
    .click();
  await expect(
    page.getByRole("button", { name: "World saved offline" }),
  ).toBeVisible();
  expect(await cachedRegions()).toBe(9);
  await context.setOffline(true);
  await page.reload();
  await expect(page.getByTestId("world")).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Open world destinations" }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Open world destinations" }).click();
  await page
    .getByRole("region", { name: "world panel" })
    .getByRole("button", { name: /Stonehaven square/ })
    .click();
  const landscape = await page
    .locator(".fc-landscape image")
    .evaluateAll(async (images) =>
      Promise.all(
        images
          .filter((e) => e.getAttribute("href")?.includes("region-"))
          .map(async (e) => {
            const image = new Image();
            image.src = e.getAttribute("href")!;
            try {
              await image.decode();
              return true;
            } catch {
              return false;
            }
          }),
      ),
    );
  expect(landscape.length).toBeGreaterThan(0);
  expect(landscape.every(Boolean)).toBe(true);
  await context.setOffline(false);
});

test("drag explores without ordering; ground tap orders and store actions deposit carried supplies", async ({
  page,
}) => {
  await page.goto("./");
  await expect(page.getByTestId("world")).toBeVisible();
  await page.getByRole("button", { name: "Open intentions" }).click();
  await page.getByRole("button", { name: "Wait here" }).click();
  await page.getByRole("button", { name: "Close panel" }).click();
  await page.mouse.move(200, 500);
  await page.mouse.down();
  await page.mouse.move(350, 500, { steps: 12 });
  await page.mouse.up();
  await saveNow(page);
  expect((await snapshot(page)).control.waiting).toBe(true);
  expect((await snapshot(page)).control.active).toBeNull();
  await page.getByRole("button", { name: "Close panel" }).click();
  await page.mouse.click(200, 500);
  await expect(page.getByRole("status")).toContainText(
    "Following: Travel to selected ground",
  );
  await saveNow(page);
  const saved = await snapshot(page);
  expect(saved.control.active?.kind).toBe("move");
  const hero = saved.people[0]!;
  Object.assign(hero, {
    x: 1465,
    y: 2270,
    fromX: 1465,
    fromY: 2270,
    targetX: 1465,
    targetY: 2270,
    path: [],
    action: "Waiting for supplies",
    remaining: 1,
    duration: 1,
    carry: { resource: "timber", amount: 2 },
  });
  delete hero.taskResource;
  // Preserve conservation while replacing the carried inventory for this UI fixture.
  for (const r of ["timber", "stone", "iron"] as const)
    saved.gathered[r] =
      Object.values(saved.stores).reduce((n, v) => n + v[r], 0) +
      saved.spent[r] +
      saved.people.reduce(
        (n, p) => n + (p.carry?.resource === r ? p.carry.amount : 0),
        0,
      );
  saved.control.active = null;
  saved.control.queue = [];
  saved.control.waiting = true;
  saved.savedAt = Date.now();
  await page.locator("input[type=file]").setInputFiles({
    name: "carrying.json",
    mimeType: "application/json",
    buffer: Buffer.from(JSON.stringify(saved)),
  });
  await expect(page.getByRole("status")).toContainText("Chronicle restored.");
  await page.getByRole("button", { name: "Open world destinations" }).click();
  await page
    .getByRole("region", { name: "world panel" })
    .getByRole("button", { name: /Oakrest storehouse/ })
    .click();
  await page.getByRole("button", { name: "Do now" }).click();
  await expect(page.getByRole("status")).toContainText(
    "Following: Deposit 2 timber",
  );
  await page.locator(".hero-status").click();
  await expect(
    page.getByRole("region", { name: "Character details" }),
  ).toContainText("Empty hands");
  await saveNow(page);
  expect((await snapshot(page)).people[0]!.carry).toBeNull();
});

test("thought choice and autonomous work open the painted blacksmith workshop", async ({
  page,
}) => {
  await page.goto("./");
  await expect(page.getByTestId("world")).toBeVisible();
  await page.getByRole("button", { name: /Alden has a thought/ }).click();
  await page.getByRole("button", { name: /Trade for supplies/ }).click();
  await saveNow(page);
  const saved = await snapshot(page);
  expect(saved.strategy).toBe("trade");
  expect(saved.coins).toBe(16);
  saved.savedAt = Date.now() - 3600000;
  await page
    .locator("input[type=file]")
    .setInputFiles({
      name: "away.json",
      mimeType: "application/json",
      buffer: Buffer.from(JSON.stringify(saved)),
    });
  await expect(page.getByRole("status")).toContainText("Chronicle restored.");
  const completed = await snapshot(page);
  expect(completed.workshop.complete).toBe(true);
  expect(completed.workshop.forged).toBeGreaterThan(0);
  expect(completed.people.some((p) => p.role === "smith")).toBe(true);
  await page.getByRole("button", { name: "Open world destinations" }).click();
  await page
    .getByRole("region", { name: "world panel" })
    .getByRole("button", { name: /Blacksmith workshop/ })
    .click();
  await expect(
    page.getByRole("region", { name: "Place actions" }),
  ).toContainText("Forge 10 tools");
  await expect(
    page.locator('.fc-landscape image[href$="/art/workshop.webp"]'),
  ).toBeVisible();
  await page.getByRole("button", { name: "Close place actions" }).click();
  await page.getByRole("button", { name: "Dismiss notification" }).click();
  await page.screenshot({
    path: "docs/screenshots/world-workshop-complete.png",
    fullPage: true,
  });
});

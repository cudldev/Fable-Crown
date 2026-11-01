import { test, expect, type Page } from "@playwright/test";
import { createRpg } from "../src/rpg/engine";
import { addItems, itemCount } from "../src/rpg/inventory";
import type { ValleySave } from "../src/valley/contracts";
import { createValleySave } from "../src/valley/save";

// Graphics are covered on the local GPU and against the actual public URL.
// These cases exercise the real worker, React controls, IndexedDB and PWA.
test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    const getContext = HTMLCanvasElement.prototype.getContext;
    HTMLCanvasElement.prototype.getContext = function (this: HTMLCanvasElement, ...args: Parameters<typeof getContext>) {
      if (String(args[0]).startsWith("webgl")) return null;
      return getContext.apply(this, args);
    } as typeof getContext;
    Object.defineProperty(navigator, "gpu", { configurable: true, value: undefined });
  });
});

async function menu(page: Page) {
  if (await page.getByRole("button", { name: "Save on this device", exact: true }).isVisible()) return;
  const dialog = page.getByRole("dialog");
  if (await dialog.isVisible()) await dialog.getByRole("button", { name: "Close", exact: true }).click();
  await page.getByRole("button", { name: "More", exact: true }).click();
}
async function ready(page: Page) {
  await expect(page.getByTestId("valley-app")).toHaveAttribute("data-ready", "true");
  await expect(page.getByTestId("valley-app")).toHaveAttribute("data-mode", "dashboard");
}
async function read(page: Page, key = "valley-v1") {
  return page.evaluate(key => new Promise<ValleySave>((resolve, reject) => {
    const open = indexedDB.open("fable-crown", 1);
    open.onerror = () => reject(open.error);
    open.onsuccess = () => {
      const db = open.result, get = db.transaction("saves").objectStore("saves").get(key);
      get.onsuccess = () => { resolve(get.result); db.close(); };
      get.onerror = () => { reject(get.error); db.close(); };
    };
  }), key);
}
async function snapshot(page: Page): Promise<ValleySave> {
  await menu(page);
  await page.getByRole("button", { name: "Save on this device", exact: true }).click();
  await expect(page.locator(".valley-message")).toContainText("Chapter saved on this device");
  return read(page);
}
async function restore(page: Page, state: unknown) {
  await menu(page);
  await page.locator('input[type="file"]').setInputFiles({
    name: "release-fixture.json", mimeType: "application/json", buffer: Buffer.from(JSON.stringify(state)),
  });
}

test("real valley worker, local guidance and durable saves work without graphics or WebGPU", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", error => errors.push(error.message));
  await page.goto("./");
  await ready(page);
  const legacy = createRpg(Date.now(), 8128);
  addItems(legacy.bank, "logs", 12, Infinity);
  Object.assign(legacy.quests.forge, { accepted: true, complete: true, stageId: "complete" });
  const beta = { ...createValleySave(Date.now(), 1111), version: 6 };
  beta.chapter.bank = [{ itemId: "coins", quantity: 999 }];
  await page.evaluate(value => new Promise<void>((resolve, reject) => {
    const open = indexedDB.open("fable-crown", 1);
    open.onerror = () => reject(open.error);
    open.onsuccess = () => {
      const db = open.result, tx = db.transaction("saves", "readwrite"), store = tx.objectStore("saves");
      store.put(value.legacy, "v5"); store.put(value.beta, "v6");
      store.delete("valley-v1"); store.delete("valley-v1-backup");
      tx.oncomplete = () => { db.close(); resolve(); }; tx.onerror = () => reject(tx.error);
    };
  }), { legacy, beta });
  await page.reload(); await ready(page);
  const first = await snapshot(page);
  expect(first.version).toBe(7);
  expect(itemCount(first.chapter.player.inventory, "coins")).toBe(25);
  expect(first.chapter.bank).toEqual([]);
  expect(first.chapter.quests.forge.complete).toBe(false);
  expect(first.valley.home).toBeNull(); expect(first.valley.paid).toBe(0);
  expect(await read(page, "v5")).toEqual(legacy);
  expect(await read(page, "v6")).toEqual(beta);
  await expect.poll(async () => (await snapshot(page)).chapter.tick).toBeGreaterThan(first.chapter.tick);
  await page.getByRole("dialog").getByRole("button", { name: "Journal", exact: true }).click();
  await expect(page.getByRole("dialog")).toContainText("Your own quiet valley");
  await page.getByRole("button", { name: "Pin next suggested goal", exact: true }).click();
  const chosen = await snapshot(page);
  expect(chosen.valley.goal).toBe("Choose a clear place for your free tent");
  await restore(page, legacy);
  await expect(page.locator(".valley-message")).toContainText("invalid");
  expect((await snapshot(page)).valley.goal).toBe(chosen.valley.goal);
  await restore(page, { version: 7, chapter: { player: { health: -999 } } });
  await expect(page.locator(".valley-message")).toContainText("invalid");
  const preserved = await snapshot(page);
  expect(preserved.chapter.player).toEqual(chosen.chapter.player);
  expect(preserved.valley.goal).toEqual(chosen.valley.goal);
  await page.getByRole("dialog").getByRole("button", { name: "Close", exact: true }).click();
  for (const viewport of [{ width: 390, height: 844 }, { width: 844, height: 390 }]) {
    await page.setViewportSize(viewport);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    const control = await page.getByRole("button", { name: "More", exact: true }).boundingBox();
    expect(control!.width).toBeGreaterThanOrEqual(44);
    expect(control!.height).toBeGreaterThanOrEqual(44);
  }
  expect(errors).toEqual([]);
});

test("the installed PWA preserves the chapter and all required assets offline without external services", async ({ page, context }, info) => {
  const errors: string[] = [], external: string[] = [];
  const origin = new URL(info.project.use.baseURL!).origin;
  page.on("pageerror", error => errors.push(error.message));
  page.on("request", request => {
    const url = new URL(request.url());
    if (url.protocol.startsWith("http") && url.origin !== origin) external.push(url.href);
  });
  await page.goto("./");
  await ready(page);
  const fixture = createValleySave(Date.now(), 8128);
  fixture.valley.goal = "Keep this offline valley";
  addItems(fixture.chapter.bank, "logs", 12, Infinity);
  await restore(page, fixture);
  await expect(page.locator(".valley-message")).toContainText("Chapter restored");
  const before = await snapshot(page);
  expect(before.version).toBe(7);
  await expect.poll(() => page.evaluate(() => Boolean(navigator.serviceWorker.controller))).toBe(true);
  expect(await page.evaluate(async () => (await navigator.serviceWorker.ready).scope))
    .toBe(new URL("./", page.url()).href);
  await context.setOffline(true);
  try {
    await page.reload({ waitUntil: "domcontentloaded" });
    await ready(page);
    const after = await snapshot(page);
    expect(after.version).toBe(7);
    for (const field of ["position", "skills", "inventory", "equipment", "ammo", "health"] as const)
      expect(after.chapter.player[field], field).toEqual(before.chapter.player[field]);
    expect(after.chapter.bank).toEqual(before.chapter.bank);
    expect(after.chapter.quests).toEqual(before.chapter.quests);
    expect(after.chapter.control.autoplay).toBe(false);
    expect(after.valley.goal).toBe("Keep this offline valley");
    const assets = await page.evaluate(async () => {
      const manifest = await (await fetch(new URL("world-assets.json", location.href))).json();
      return Promise.all(manifest.files.map(async (file: string) => {
        const response = await fetch(new URL(file, location.href));
        return response.ok && (await response.arrayBuffer()).byteLength > 0;
      }));
    });
    expect(assets.length).toBeGreaterThan(10);
    expect(assets.every(Boolean)).toBe(true);
  } finally { await context.setOffline(false); }
  expect(errors).toEqual([]);
  expect(external).toEqual([]);
});

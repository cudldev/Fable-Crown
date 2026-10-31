import { test, expect, type Page } from "@playwright/test";
import { createRpg } from "../src/rpg/engine";
import type { RpgState } from "../src/rpg/types";

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
  if (!(await page.getByRole("button", { name: "Save on device", exact: true }).isVisible()))
    await page.getByRole("button", { name: "Open game menu", exact: true }).click();
}
async function snapshot(page: Page): Promise<RpgState> {
  await menu(page);
  await page.getByRole("button", { name: "Save on device", exact: true }).click();
  await expect(page.getByRole("status")).toContainText("Chronicle saved");
  return page.evaluate(() => new Promise<RpgState>((resolve, reject) => {
    const open = indexedDB.open("fable-crown", 1);
    open.onerror = () => reject(open.error);
    open.onsuccess = () => {
      const db = open.result, get = db.transaction("saves").objectStore("saves").get("v5");
      get.onsuccess = () => { resolve(get.result); db.close(); };
      get.onerror = () => { reject(get.error); db.close(); };
    };
  }));
}
async function restore(page: Page, state: unknown) {
  await menu(page);
  await page.locator('input[type="file"]').setInputFiles({
    name: "release-fixture.json", mimeType: "application/json", buffer: Buffer.from(JSON.stringify(state)),
  });
}

test("real worker, local thoughts and durable saves work without graphics or WebGPU", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", error => errors.push(error.message));
  await page.goto("./");
  await expect(page.getByTestId("rpg-world")).toHaveAttribute("data-status", "unavailable");
  const first = await snapshot(page);
  await expect.poll(async () => (await snapshot(page)).tick).toBeGreaterThan(first.tick);
  await page.evaluate(() => window.dispatchEvent(new Event("pagehide")));
  await page.getByRole("button", { name: "Open thoughts", exact: true }).click();
  await expect(page.locator(".plan-choice")).toHaveCount(3);
  await page.locator(".plan-choice").filter({ hasText: "Prepare for a woodland hunt" }).click();
  const chosen = await snapshot(page);
  expect(chosen.control.goal).toMatchObject({ kind: "skill", skill: "attack", level: 5 });
  await restore(page, { version: 3, player: { health: -999 } });
  await expect(page.getByRole("status")).toContainText("invalid");
  const preserved = await snapshot(page);
  expect(preserved.player).toEqual(chosen.player);
  expect(preserved.control.goal).toEqual(chosen.control.goal);
  await page.getByRole("button", { name: "Close panel", exact: true }).click();
  for (const viewport of [{ width: 390, height: 844 }, { width: 844, height: 390 }]) {
    await page.setViewportSize(viewport);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    const control = await page.getByRole("button", { name: "Open game menu", exact: true }).boundingBox();
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
  await expect(page.getByTestId("rpg-world")).toHaveAttribute("data-status", "unavailable");
  const fixture = createRpg(Date.now(), 8128);
  Object.assign(fixture.control, { autoplay: false, waiting: true, goal: null, active: null,
    source: null, queue: [], thought: null, thinkingUntil: 1e9 });
  fixture.player.path = []; fixture.player.action = null; fixture.player.movement = null;
  await restore(page, fixture);
  await expect(page.getByRole("status")).toContainText("Chronicle restored");
  const before = await snapshot(page);
  await expect.poll(() => page.evaluate(() => Boolean(navigator.serviceWorker.controller))).toBe(true);
  expect(await page.evaluate(async () => (await navigator.serviceWorker.ready).scope))
    .toBe(new URL("./", page.url()).href);
  await context.setOffline(true);
  try {
    await page.reload({ waitUntil: "domcontentloaded" });
    await expect(page.getByTestId("rpg-world")).toHaveAttribute("data-status", "unavailable");
    const after = await snapshot(page);
    for (const field of ["position", "skills", "inventory", "equipment", "ammo", "health"] as const)
      expect(after.player[field], field).toEqual(before.player[field]);
    expect(after.bank).toEqual(before.bank);
    expect(after.quests).toEqual(before.quests);
    expect(after.control.autoplay).toBe(false);
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

import { test, expect, type Page } from "@playwright/test";
import { createRpg } from "../src/rpg/engine";
import { createGame } from "../src/simulation";
import { interactionTiles, objectById } from "../src/rpg/world";
import type { RpgState } from "../src/rpg/types";

test.use({ actionTimeout: 20000 });

async function ready(page: Page) {
  const world = page.getByTestId("rpg-world");
  await expect(world).toHaveAttribute("data-renderer", "3d");
  await expect(world).toHaveAttribute("data-status", "ready", { timeout: 30000 });
  await expect(page.getByTestId("three-canvas")).toBeVisible();
  await expect(world).toHaveAttribute("data-active-lights", /^\d+$/);
  await expect(world).toHaveAttribute("data-shadow-lights", /^\d+$/);
  return world;
}

async function menu(page: Page) {
  if (!(await page.getByRole("button", { name: "Save on device" }).isVisible()))
    await page.getByRole("button", { name: "Open game menu" }).click();
}

async function closePanel(page: Page) {
  const close = page.getByRole("button", { name: "Close panel" });
  if (await close.isVisible()) await close.click();
}

async function restore(page: Page, state: RpgState) {
  await menu(page);
  await page.locator('input[type="file"]').setInputFiles({
    name: "three-fixture.json", mimeType: "application/json",
    buffer: Buffer.from(JSON.stringify(state)),
  });
  await expect(page.getByRole("status")).toContainText("Chronicle restored");
  await closePanel(page);
}

async function saved(page: Page): Promise<RpgState> {
  await menu(page);
  await page.getByRole("button", { name: "Save on device" }).click();
  await expect(page.getByRole("status")).toContainText("Chronicle saved");
  const result = await page.evaluate(() => new Promise<RpgState>((resolve, reject) => {
    const request = indexedDB.open("fable-crown", 1);
    request.onerror = () => reject(request.error);
    request.onsuccess = () => {
      const db = request.result;
      const get = db.transaction("saves").objectStore("saves").get("v5");
      get.onsuccess = () => { resolve(get.result); db.close(); };
      get.onerror = () => { reject(get.error); db.close(); };
    };
  }));
  await closePanel(page);
  return result;
}

function waitingFixture() {
  const state = createRpg(Date.now(), 8128);
  Object.assign(state.control, {
    waiting: true, goal: null, active: null, source: null,
    queue: [], thought: null, thinkingUntil: 1_000_000_000,
  });
  state.player.path = [];
  return state;
}

test("voxel is the default, draws with WebGL and preserves the chapter with legacy URLs", async ({ page }) => {
  const errors: string[] = [], obsoleteAssets: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  page.on("request", request => { if (/\/(ink|fitted)\/|alden(?:-ink|-fitted)?\.glb/.test(request.url())) obsoleteAssets.push(request.url()); });
  await page.goto("./");
  await ready(page);
  const fixture = waitingFixture();
  await restore(page, fixture);
  const archive = createGame(Date.now());
  await page.evaluate((value) => new Promise<void>((resolve, reject) => {
    const request = indexedDB.open("fable-crown", 1);
    request.onerror = () => reject(request.error);
    request.onsuccess = () => {
      const db = request.result;
      const transaction = db.transaction("saves", "readwrite");
      transaction.objectStore("saves").put(value, "v1");
      transaction.oncomplete = () => { db.close(); resolve(); };
      transaction.onerror = () => { db.close(); reject(transaction.error); };
    };
  }), archive);
  await menu(page);
  await expect(page.getByRole("button", { name: /Use painterly|Use 3D test renderer/ })).toHaveCount(0);
  await closePanel(page);
  const world = await ready(page);
  await expect.poll(async () => Number(await world.getAttribute("data-draw-calls"))).toBeGreaterThan(0);
  await expect.poll(async () => Number(await world.getAttribute("data-triangles"))).toBeGreaterThan(0);
  const context = await page.getByTestId("three-canvas").evaluate((canvas) => {
    const gl = (canvas as HTMLCanvasElement).getContext("webgl2");
    return gl ? { lost: gl.isContextLost(), version: gl.getParameter(gl.VERSION) as string } : null;
  });
  expect(context?.lost).toBe(false);
  expect(context?.version).toContain("WebGL 2");
  await expect(page.getByTestId("rpg-world").getByRole("button", { name: "Inspect Alden", exact: true })).toBeVisible();
  await page.getByTestId("rpg-world").getByRole("button", { name: "Inspect Alden", exact: true }).click();
  await expect(page.getByRole("region", { name: "Character details" })).toBeVisible();
  const before = await saved(page);
  await page.goto("./?renderer=painterly&character=fitted&terrain=legacy");
  await ready(page);
  await expect(world).toHaveAttribute("data-character-style", "pixel");
  await expect(world).toHaveAttribute("data-character-rig", "billboard");
  await expect(world).toHaveAttribute("data-terrain-source", "vox");
  await page.goto("./?renderer=3d&character=ink");
  await ready(page);
  await expect(world).toHaveAttribute("data-character-style", "pixel");
  const after = await saved(page);
  expect(after.player.inventory).toEqual(before.player.inventory);
  expect(after.player.skills).toEqual(before.player.skills);
  expect(after.player.position).toEqual(before.player.position);
  expect(after.version).toBe(5);
  const archived = await page.evaluate(() => new Promise<unknown>((resolve, reject) => {
    const request = indexedDB.open("fable-crown", 1);
    request.onerror = () => reject(request.error);
    request.onsuccess = () => {
      const db = request.result;
      const get = db.transaction("saves").objectStore("saves").get("v1");
      get.onsuccess = () => { resolve(get.result); db.close(); };
      get.onerror = () => { reject(get.error); db.close(); };
    };
  }));
  expect(archived).toEqual(archive);
  expect(obsoleteAssets).toEqual([]);
  expect(errors).toEqual([]);
});

test("real smelting works in 3D and lighting controls do not grant items or XP", async ({ page }) => {
  await page.goto("./?renderer=3d");
  const world = await ready(page);
  const state = waitingFixture();
  state.player.position = { ...interactionTiles(objectById("oakrest-furnace")!)[0]! };
  state.player.previousPosition = { ...state.player.position };
  state.player.inventory.push({ itemId: "copper-ore", quantity: 6 }, { itemId: "tin-ore", quantity: 6 });
  await restore(page, state);
  await page.getByRole("button", { name: "Inspect Oakrest furnace", exact: true }).click({ button: "right" });
  await page.getByRole("menuitem", { name: "More options", exact: true }).click();
  await page.getByRole("button", { name: "Craft here" }).click();
  await page.getByLabel("Craft quantity").selectOption("1");
  await page.locator(".rpg-shop-list article").filter({ hasText: "Smelt bronze bar" })
    .getByRole("button", { name: "Make 1", exact: true }).click();
  await page.getByRole("button", { name: "Open inventory" }).click();
  await expect(page.getByRole("button", { name: /Bronze bar, 1/i })).toBeVisible({ timeout: 20000 });
  await closePanel(page);
  const pause = page.getByRole("button", { name: "Pause Alden", exact: true });
  if (await pause.isVisible()) await pause.click();
  const before = await saved(page);
  expect(before.player.skills.smithing).toBeGreaterThan(state.player.skills.smithing);
  expect(before.player.inventory.find((item) => item.itemId === "copper-ore")?.quantity).toBe(5);
  expect(before.player.inventory.find((item) => item.itemId === "tin-ore")?.quantity).toBe(5);
  const images: Buffer[] = [];
  for (const preset of ["Day", "Dusk", "Night"]) {
    const button = page.getByRole("button", { name: `${preset} lighting`, exact: true });
    await button.click();
    await expect(button).toHaveAttribute("aria-pressed", "true");
    await expect.poll(async () => Number(await world.getAttribute("data-active-lights"))).toBeLessThanOrEqual(4);
    await expect.poll(async () => Number(await world.getAttribute("data-shadow-lights"))).toBeLessThanOrEqual(1);
    images.push(await page.getByTestId("three-canvas").screenshot());
    await page.screenshot({ path: `docs/screenshots/three-${preset.toLowerCase()}.png` });
  }
  expect(images[0].equals(images[1])).toBe(false);
  expect(images[1].equals(images[2])).toBe(false);
  const shadows = page.getByRole("button", { name: "Sun shadows", exact: true });
  await shadows.click();
  await expect(shadows).toHaveAttribute("aria-pressed", "false");
  await expect.poll(async () => Number(await world.getAttribute("data-shadow-lights"))).toBe(0);
  const after = await saved(page);
  expect(after.player.inventory).toEqual(before.player.inventory);
  expect(after.player.skills).toEqual(before.player.skills);
  expect(after.player.position).toEqual(before.player.position);
  expect(after.control.waiting).toBe(true);
});

test("3D camera and touch controls fit portrait and landscape without external runtime requests", async ({ page }) => {
  const errors: string[] = [], external: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  page.on("request", (request) => {
    const url = request.url();
    if (/^https?:/.test(url) && page.url().startsWith("http") && new URL(url).origin !== new URL(page.url()).origin)
      external.push(url);
  });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("./?renderer=3d");
  await ready(page);
  await restore(page, waitingFixture());
  for (const viewport of [{ width: 390, height: 844 }, { width: 844, height: 390 }]) {
    await page.setViewportSize(viewport);
    await expect(page.getByTestId("three-canvas")).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    for (const name of ["Open destinations", "Open game menu", "Zoom in", "Zoom out", "Follow Alden", "Dusk lighting"]) {
      const button = page.getByRole("button", { name, exact: true });
      await expect(button).toBeVisible();
      const box = await button.boundingBox();
      expect(box?.width, `${name} width`).toBeGreaterThanOrEqual(44);
      expect(box?.height, `${name} height`).toBeGreaterThanOrEqual(44);
    }
    const before = await page.getByTestId("rpg-world").getByRole("button", { name: "Inspect Alden", exact: true }).boundingBox();
    await page.getByRole("button", { name: "Zoom in", exact: true }).click();
    await page.getByRole("button", { name: "Zoom out", exact: true }).click();
    const canvas = page.getByTestId("three-canvas");
    const box = await canvas.boundingBox();
    expect(box).not.toBeNull();
    const x = box!.x + box!.width * .48, y = box!.y + box!.height * .47;
    await page.mouse.move(x, y);
    await page.mouse.down();
    await page.mouse.move(x + 55, y + 35, { steps: 8 });
    await page.mouse.up();
    await expect.poll(async () => {
      const after = await page.getByTestId("rpg-world").getByRole("button", { name: "Inspect Alden", exact: true }).boundingBox();
      return !!before && !!after && Math.hypot(after.x - before.x, after.y - before.y) > 10;
    }).toBe(true);
    await page.getByRole("button", { name: "Follow Alden", exact: true }).click();
    await page.screenshot({ path: `docs/screenshots/three-${viewport.width === 390 ? "portrait" : "landscape"}.png` });
  }
  expect(external).toEqual([]);
  expect(errors).toEqual([]);
});

for (const mode of ["perspective", "orthographic"] as const) {
  test(`${mode} camera drag stays anchored when multiple pointer events arrive between frames`, async ({ page }) => {
    await page.goto("./");
    await ready(page);
    await restore(page, waitingFixture());
    await page.getByRole("button", { name: `${mode === "perspective" ? "Perspective" : "Orthographic"} camera`, exact: true }).click();
    for (const viewport of [{ width: 1280, height: 720 }, { width: 390, height: 844 }, { width: 844, height: 390 }]) {
      await page.setViewportSize(viewport);
      const canvas = page.getByTestId("rpg-world").locator("canvas");
      const start = await canvas.evaluate(element => {
        const box = element.getBoundingClientRect();
        // Landscape preview controls can cover the old fixed35%/45% drag point.
        // Exercise a real exposed world point rather than dragging a toolbar.
        for (const [x, y] of [[.35, .45], [.35, .62], [.6, .6], [.45, .25], [.55, .52], [.25, .35]]) {
          const point = { x: box.x + box.width * x, y: box.y + box.height * y };
          const hit = document.elementFromPoint(point.x, point.y);
          if (hit === element || hit?.closest("[data-three-selection]")) return point;
        }
        throw Error("No exposed world point for camera drag regression.");
      });
      const traces = [];
      for (const burst of [false, true]) {
        await page.getByRole("button", { name: "Follow Alden", exact: true }).click();
        await page.evaluate(async () => { for (let i = 0; i < 2; i++) await new Promise(resolve => requestAnimationFrame(resolve)); });
        await page.mouse.move(start.x, start.y);
        await page.mouse.down();
        const trace = await page.evaluate(async ({ start, burst }) => {
          const canvas = document.querySelector<HTMLCanvasElement>('[data-testid="rpg-world"] canvas')!;
          const actor = document.querySelector<HTMLElement>('[data-testid="rpg-world"] [aria-label="Inspect Alden"]')!;
          const frame = () => new Promise<void>(resolve => requestAnimationFrame(() => resolve()));
          const position = () => ({ x: parseFloat(actor.style.left), y: parseFloat(actor.style.top) });
          await frame(); await frame();
          const before = position();
          const samples = [];
          // Several events between frames, then reverse. A final small delta
          // must not overwrite earlier movement that has not rendered yet.
          for (const offset of [12, 24, 36, 48, 36, 24, 12, 0]) {
            const direction = samples.length < 4 ? 1 : -1;
            for (const x of burst ? [offset - direction * 4, offset - direction, offset] : [offset]) {
              canvas.dispatchEvent(new PointerEvent("pointermove", {
                bubbles: true, pointerId: 1, pointerType: "mouse", buttons: 1,
                clientX: start.x + x, clientY: start.y + x / 2,
              }));
            }
            await new Promise(resolve => setTimeout(resolve, 50));
            await frame(); await frame();
            samples.push({ x: position().x - before.x, y: position().y - before.y });
          }
          await frame(); await frame();
          return { samples, settled: { x: position().x - before.x, y: position().y - before.y } };
        }, { start, burst });
        await page.mouse.up();
        expect(Math.hypot(trace.settled.x, trace.settled.y)).toBeLessThan(1);
        traces.push(trace.samples);
      }
      // Perspective parallax depends on the marker's height/depth. Compare the
      // same gesture with one versus three events per frame in the actual view.
      expect(Math.abs(traces[0][3].x)).toBeGreaterThan(30);
      for (let i = 0; i < traces[0].length; i++) {
        const expected = traces[0][i], actual = traces[1][i];
        expect(Math.abs(actual.x - expected.x), JSON.stringify({ viewport, expected, actual })).toBeLessThan(1);
        expect(Math.abs(actual.y - expected.y), JSON.stringify({ viewport, expected, actual })).toBeLessThan(1);
      }
    }
  });
}

test("default voxel world reloads offline with the same saved chapter", async ({ page, context }) => {
  await page.goto("./");
  await ready(page);
  await restore(page, waitingFixture());
  const before = await saved(page);
  await expect.poll(() => page.evaluate(() => Boolean(navigator.serviceWorker?.controller)), { timeout: 30000 }).toBe(true);
  await menu(page);
  await page.getByRole("button", { name: /Save world offline/ }).click();
  await expect(page.getByRole("button", { name: "World saved offline" })).toBeVisible({ timeout: 60000 });
  await closePanel(page);
  await context.setOffline(true);
  try {
    await page.reload();
    await ready(page);
    expect(new URL(page.url()).searchParams.has("renderer")).toBe(false);
    const after = await saved(page);
    expect(after.player.inventory).toEqual(before.player.inventory);
    expect(after.player.skills).toEqual(before.player.skills);
    expect(after.player.position).toEqual(before.player.position);
  } finally {
    await context.setOffline(false);
  }
});

test("unavailable WebGL keeps menus usable and retries the voxel world", async ({ page }) => {
  await page.addInitScript(() => {
    const getContext = HTMLCanvasElement.prototype.getContext;
    HTMLCanvasElement.prototype.getContext = function (this: HTMLCanvasElement, ...args: Parameters<typeof getContext>) {
      if (String(args[0]).startsWith("webgl") && localStorage.getItem("test-webgl-enabled") !== "yes") return null;
      return getContext.apply(this, args);
    } as typeof getContext;
  });
  await page.goto("./?renderer=3d");
  await expect(page.getByTestId("rpg-world")).toHaveAttribute("data-status", "unavailable");
  await expect(page.getByRole("button", { name: "Retry voxel renderer", exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: /painterly/i })).toHaveCount(0);
  await page.getByRole("button", { name: "Open inventory" }).click();
  await expect(page.locator(".rpg-backpack button")).toHaveCount(28);
  await closePanel(page);
  await page.evaluate(() => localStorage.setItem("test-webgl-enabled", "yes"));
  await page.getByRole("button", { name: "Retry voxel renderer", exact: true }).click();
  await ready(page);
});

test("all Blender assets load and switching camera projection preserves the saved character", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", error => errors.push(error.message));
  await page.goto("./?renderer=3d");
  const world = await ready(page);
  await expect(world).toHaveAttribute("data-assets", "blender");
  const ids = (await world.getAttribute("data-production-assets"))!.split(",").sort();
  expect(ids).toEqual(["anvil", "bank", "crate", "forge", "lantern", "tree"]);
  await restore(page, waitingFixture());
  const before = await saved(page);
  for (const mode of ["orthographic", "perspective"] as const) {
    const button = page.getByRole("button", { name: `${mode === "perspective" ? "Perspective" : "Orthographic"} camera`, exact: true });
    await button.click();
    await expect(button).toHaveAttribute("aria-pressed", "true");
    await expect(world).toHaveAttribute("data-camera-mode", mode);
    await expect.poll(async () => Number(await world.getAttribute("data-draw-calls"))).toBeGreaterThan(0);
    await page.getByRole("button", { name: "Zoom in", exact: true }).click();
    await page.getByRole("button", { name: "Zoom out", exact: true }).click();
  }
  const after = await saved(page);
  expect(after.player.position).toEqual(before.player.position);
  expect(after.player.skills).toEqual(before.player.skills);
  expect(after.player.inventory).toEqual(before.player.inventory);
  expect(after.control.waiting).toBe(true);
  expect(errors).toEqual([]);
});

test("art workbench is isolated from gameplay and cached models reload offline", async ({ page, context }) => {
  const errors: string[] = [], workers: string[] = [], external: string[] = [];
  page.on("pageerror", error => errors.push(error.message));
  await page.goto("./");
  await expect(page.getByTestId("rpg-world")).toBeVisible();
  await restore(page, waitingFixture());
  await saved(page);
  page.on("request", request => {
    if (/^https?:/.test(request.url()) && new URL(request.url()).origin !== new URL(page.url()).origin) external.push(request.url());
  });
  await page.goto("./?assetReview=1");
  const review = page.getByTestId("asset-review");
  await expect(review).toHaveAttribute("data-status", "ready", { timeout: 30000 });
  await expect(review).toHaveAttribute("data-assets", "blender");
  expect((await review.getAttribute("data-production-assets"))!.split(",").sort())
    .toEqual(["anvil", "bank", "crate", "forge", "lantern", "tree"]);
  expect(page.workers()).toHaveLength(0);
  page.on("worker", worker => workers.push(worker.url()));
  const readChronicle = () => page.evaluate(() => new Promise<string>((resolve, reject) => {
    const request = indexedDB.open("fable-crown", 1);
    request.onerror = () => reject(request.error);
    request.onsuccess = () => {
      const db = request.result, get = db.transaction("saves").objectStore("saves").get("v5");
      get.onsuccess = () => { resolve(JSON.stringify(get.result)); db.close(); };
      get.onerror = () => { reject(get.error); db.close(); };
    };
  }));
  const before = await readChronicle();
  for (const id of ["bank", "forge", "tree", "alden", "anvil", "crate", "lantern", "village"]) {
    await page.getByLabel("Preview model").selectOption(id);
    await expect(page.getByLabel("Preview model")).toHaveValue(id);
    await page.getByRole("button", { name: "Rotate preview right", exact: true }).click();
  }
  await page.getByLabel("Preview model").selectOption("alden");
  await expect(review).toHaveAttribute("data-character-style", "pixel");
  await expect(review).toHaveAttribute("data-character-rig", "billboard");
  await expect(page.getByRole("button", { name: "Walk animation preview", exact: true })).toHaveCount(0);
  await expect(page.getByLabel("Character animation")).toHaveCount(0);
  await page.getByRole("button", { name: "Rotate preview left", exact: true }).click();
  for (const name of ["Day lighting", "Night lighting", "Orthographic camera", "Perspective camera"]) {
    const button = page.getByRole("button", { name, exact: true });
    await button.click(); await expect(button).toHaveAttribute("aria-pressed", "true");
  }
  await page.getByLabel("Preview model").selectOption("bank");
  const roofs = page.getByRole("button", { name: "Show roofs", exact: true });
  await roofs.click(); await expect(roofs).toHaveAttribute("aria-pressed", "false");
  await roofs.click(); await expect(roofs).toHaveAttribute("aria-pressed", "true");
  await page.setViewportSize({ width: 390, height: 844 });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.getByLabel("Preview model").selectOption("alden");
  await page.screenshot({ path: "docs/screenshots/three-assets-phone.png" });
  expect(await readChronicle()).toBe(before);
  await expect.poll(() => page.evaluate(() => Boolean(navigator.serviceWorker?.controller)), { timeout: 30000 }).toBe(true);
  await context.setOffline(true);
  try {
    await page.reload();
    await expect(review).toHaveAttribute("data-status", "ready", { timeout: 30000 });
    await expect(review).toHaveAttribute("data-assets", "blender");
    await page.getByLabel("Preview model").selectOption("alden");
    expect(await readChronicle()).toBe(before);
  } finally { await context.setOffline(false); }
  expect(workers).toEqual([]);
  expect(external).toEqual([]);
  expect(errors).toEqual([]);
});

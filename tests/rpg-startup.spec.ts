import { expect, test, type Page } from "@playwright/test";
import { mkdir } from "node:fs/promises";

type StartupSample = { stage: string | null; status: string | null; loading: boolean; hud: boolean; preparing: boolean };
type StartupAudit = { samples: StartupSample[]; commands: string[] };
const readyTimeout = 90_000;
const hudSelector = '.intention-dock,.rpg-messages,.world-header,.intention-readout,.game-hud';

test("startup warms the shader variants used by the first world overview", async ({ page }) => {
  await page.addInitScript(() => {
    const state = { links: 0 };
    (window as Window & { shaderWarmup?: typeof state }).shaderWarmup = state;
    const original = WebGL2RenderingContext.prototype.linkProgram;
    WebGL2RenderingContext.prototype.linkProgram = function (program: WebGLProgram) { state.links++; return original.call(this, program); };
  });
  await page.setViewportSize({ width: 1280, height: 800 });
  await page.goto("./");
  const world = await ready(page);
  expect(Number(await world.getAttribute("data-startup-programs"))).toBeGreaterThan(0);
  const before = await page.evaluate(() => (window as Window & { shaderWarmup?: { links: number } }).shaderWarmup!.links);
  await page.getByRole("button", { name: "World overview", exact: true }).click();
  await expect.poll(async () => Number(await world.getAttribute("data-camera-span"))).toBeGreaterThan(100);
  await page.evaluate(async () => { for (let frame = 0; frame < 60; frame++) await new Promise(requestAnimationFrame); });
  const after = await page.evaluate(() => (window as Window & { shaderWarmup?: { links: number } }).shaderWarmup!.links);
  expect(after - before, "first overview must reuse the programs prepared behind the loading screen").toBe(0);
});

async function auditStartup(page: Page) {
  await page.addInitScript(({ hudSelector }) => {
    const audit: StartupAudit = { samples: [], commands: [] };
    (window as Window & { startupAudit?: StartupAudit }).startupAudit = audit;
    const originalPost = Worker.prototype.postMessage;
    Worker.prototype.postMessage = function (this: Worker, message: unknown, ...args: unknown[]) {
      const value = message as { type?: string; command?: { type?: string } } | undefined;
      if (value?.type === "command") audit.commands.push(value.command?.type ?? "unknown");
      return Reflect.apply(originalPost, this, [message, ...args]);
    } as typeof originalPost;
    let previous = "";
    const sample = () => {
      const startup = document.querySelector<HTMLElement>('[data-testid="startup-screen"]');
      const world = document.querySelector<HTMLElement>('[data-testid="rpg-world"]');
      const current: StartupSample = {
        stage: startup?.dataset.stage ?? null, status: world?.dataset.status ?? null,
        loading: !!startup?.checkVisibility(),
        hud: [...document.querySelectorAll<HTMLElement>(hudSelector)].some(element => element.checkVisibility()),
        preparing: document.querySelector<HTMLElement>("main")?.dataset.preparing === "true",
      };
      const signature = JSON.stringify(current);
      if (signature !== previous) { audit.samples.push(current); previous = signature; }
    };
    new MutationObserver(sample).observe(document, { subtree: true, childList: true, attributes: true,
      attributeFilter: ["data-stage", "data-status", "data-preparing", "hidden", "inert", "aria-hidden"] });
    sample();
  }, { hudSelector });
}

async function hiddenHUD(page: Page) {
  for (const name of ["Open game menu", "Open inventory", "Open thoughts", "Open messages"])
    await expect(page.getByRole("button", { name, exact: true })).toBeHidden();
  await expect(page.locator(".intention-dock")).toBeHidden();
  await expect(page.locator(".rpg-messages")).toBeHidden();
  await expect(page.locator("main")).toHaveAttribute("data-preparing", "true");
  await expect(page.locator(".game-world")).toHaveAttribute("inert", "");
  await expect(page.locator(".game-world")).toHaveAttribute("aria-hidden", "true");
}

async function ready(page: Page) {
  const world = page.getByTestId("rpg-world");
  await expect(world).toHaveAttribute("data-status", "ready", { timeout: readyTimeout });
  await expect(page.getByTestId("startup-screen")).toBeHidden();
  await expect(page.getByRole("button", { name: "Open game menu", exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "Open inventory", exact: true })).toBeVisible();
  await expect(page.locator("main")).toHaveAttribute("data-preparing", "false");
  return world;
}

async function noEarlyHUD(page: Page) {
  const audit = await page.evaluate(() => (window as Window & { startupAudit?: StartupAudit }).startupAudit!);
  expect(audit.samples.some(sample => sample.loading)).toBe(true);
  expect(audit.samples.filter(sample => sample.hud && sample.status !== "ready" && sample.status !== "unavailable"),
    "HUD must never become visible before renderer readiness or an explicit unavailable fallback").toEqual([]);
  expect(audit.samples.filter(sample => sample.loading && sample.hud), "preparation and HUD must not flash together").toEqual([]);
  return audit;
}

test.describe("protected game preparation", () => {
  test.use({ serviceWorkers: "block" });

  test("the initial HTML explains preparation before the application bundle arrives", async ({ page }) => {
    let release!: () => void;
    const gate = new Promise<void>(resolve => { release = resolve; });
    await page.route(/\/assets\/index-[^/]+\.js$/, async route => { await gate; await route.continue(); });
    try {
      await page.goto("./", { waitUntil: "commit" });
      await expect(page.getByRole("heading", { name: "Preparing your game", exact: true })).toBeVisible();
      await expect(page.getByRole("button", { name: "Open game menu", exact: true })).toBeHidden();
    } finally { release(); }
    await ready(page);
  });

  test("slow scenery keeps a full-screen preparation view through shaders and lighting, then releases the HUD", async ({ page }, info) => {
    await mkdir("docs/screenshots/startup", { recursive: true });
    await auditStartup(page);
    const errors: string[] = []; page.on("pageerror", error => errors.push(error.message));
    let release!: () => void, held = false;
    const gate = new Promise<void>(resolve => { release = resolve; });
    await page.route(/\/art3d\/voxel\/tree\.vox(?:\?|$)/, async route => { held = true; await gate; await route.continue(); });
    try {
      await page.goto("./", { waitUntil: "domcontentloaded" });
      const screen = page.getByTestId("startup-screen");
      await expect(screen).toBeVisible();
      await expect(screen).toContainText("Preparing your game");
      await expect.poll(() => held, { timeout: 30_000 }).toBe(true);
      await expect(screen).toHaveAttribute("data-stage", "assets");
      for (const viewport of [{ width: 1280, height: 800 }, { width: 390, height: 844 }, { width: 844, height: 390 }]) {
        await page.setViewportSize(viewport);
        await hiddenHUD(page);
        const dimensions = await screen.boundingBox();
        expect(dimensions).not.toBeNull();
        expect(dimensions!.x).toBeLessThanOrEqual(1); expect(dimensions!.y).toBeLessThanOrEqual(1);
        expect(dimensions!.width).toBeGreaterThanOrEqual(viewport.width - 1);
        expect(dimensions!.height).toBeGreaterThanOrEqual(viewport.height - 1);
        expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
        await page.keyboard.press("Tab"); await page.keyboard.press("w"); await page.keyboard.press("Escape");
        await page.mouse.click(viewport.width / 2, viewport.height / 2);
        await expect(page.getByRole("menu")).toBeHidden();
        await page.screenshot({ path: `docs/screenshots/startup/preparation-${viewport.width}.png` });
      }
      await page.emulateMedia({ reducedMotion: "reduce" });
      await expect.poll(() => screen.evaluate(node => node.getAnimations({ subtree: true }).filter(animation => animation.playState === "running").length)).toBe(0);
      expect(await page.evaluate(() => (window as Window & { startupAudit?: StartupAudit }).startupAudit!.commands)).toEqual([]);
    } finally { release(); }
    const world = await ready(page);
    await expect(world).toHaveAttribute("data-voxel-queued", "0");
    await expect(world).toHaveAttribute("data-gi-state", "ready", { timeout: readyTimeout });
    const audit = await noEarlyHUD(page), stages = audit.samples.map(sample => sample.stage);
    for (const stage of ["assets", "world", "shaders", "lighting"]) expect(stages, `missing preparation phase ${stage}`).toContain(stage);
    await page.getByRole("button", { name: "Open inventory", exact: true }).click();
    await expect(page.getByRole("region", { name: "bag panel", exact: true })).toBeVisible();
    await page.getByRole("button", { name: "Close panel", exact: true }).click();
    await page.screenshot({ path: "docs/screenshots/startup/prepared-landscape.png" });
    expect(errors).toEqual([]);
  });

  test("unavailable WebGL leaves preparation and exposes the usable chapter and retry", async ({ page }) => {
    await auditStartup(page);
    await page.addInitScript(() => {
      const getContext = HTMLCanvasElement.prototype.getContext;
      HTMLCanvasElement.prototype.getContext = function (this: HTMLCanvasElement, ...args: Parameters<typeof getContext>) {
        if (/^webgl|^experimental-webgl/.test(args[0])) return null;
        return getContext.apply(this, args);
      } as typeof getContext;
    });
    await page.goto("./", { waitUntil: "domcontentloaded" });
    await expect(page.getByTestId("rpg-world")).toHaveAttribute("data-status", "unavailable", { timeout: readyTimeout });
    await expect(page.getByTestId("startup-screen")).toBeHidden();
    await expect(page.getByRole("button", { name: "Retry voxel renderer", exact: true })).toBeVisible();
    await page.getByRole("button", { name: "Open game menu", exact: true }).click();
    await expect(page.getByRole("button", { name: "Save on device", exact: true })).toBeVisible();
    await noEarlyHUD(page);
  });

  test("a failed chapter worker replaces the spinner with a clear retry error", async ({ page }) => {
    await page.addInitScript(() => {
      const GameWorker = window.Worker;
      window.Worker = class extends GameWorker {
        constructor(...args: ConstructorParameters<typeof Worker>) {
          super(...args);
          if (String(args[0]).includes("game.worker")) {
            this.terminate();
            queueMicrotask(() => this.dispatchEvent(new ErrorEvent("error", { message: "Injected chapter startup failure" })));
          }
        }
      };
    });
    await page.goto("./", { waitUntil: "domcontentloaded" });
    const error = page.getByTestId("startup-screen");
    await expect(error).toHaveAttribute("role", "alert");
    await expect(error).toContainText("Your chapter could not open");
    await expect(error.getByRole("progressbar")).toHaveCount(0);
    await expect(error.getByRole("button", { name: /retry/i })).toBeVisible();
    await expect(page.getByRole("button", { name: "Open inventory", exact: true })).toBeHidden();
  });

  test("graphics context loss during warmup cannot later reopen a broken world", async ({ page }) => {
    await page.addInitScript(() => {
      const original = WebGL2RenderingContext.prototype.linkProgram;
      let injected = false;
      WebGL2RenderingContext.prototype.linkProgram = function (program: WebGLProgram) {
        const result = original.call(this, program);
        if (!injected) { injected = true; setTimeout(() => this.getExtension("WEBGL_lose_context")?.loseContext(), 0); }
        return result;
      };
    });
    await page.goto("./");
    const world = page.getByTestId("rpg-world");
    await expect(world).toHaveAttribute("data-status", "unavailable", { timeout: readyTimeout });
    await expect(page.getByTestId("startup-screen")).toBeHidden();
    await page.evaluate(async () => { for (let frame = 0; frame < 60; frame++) await new Promise(requestAnimationFrame); });
    await expect(world).toHaveAttribute("data-status", "unavailable");
    await expect(page.getByRole("button", { name: "Retry voxel renderer", exact: true })).toBeVisible();
  });
});

test("cached offline startup prepares the real WebGL world before showing the HUD", async ({ page, context }) => {
  await auditStartup(page);
  const errors: string[] = [], external: string[] = [];
  page.on("pageerror", error => errors.push(error.message));
  page.on("request", request => {
    const url = new URL(request.url());
    if (url.protocol.startsWith("http") && page.url().startsWith("http") && url.origin !== new URL(page.url()).origin) external.push(url.href);
  });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("./", { waitUntil: "domcontentloaded" });
  await ready(page);
  await expect.poll(() => page.evaluate(() => Boolean(navigator.serviceWorker.controller)), { timeout: 30_000 }).toBe(true);
  await context.setOffline(true);
  try {
    await page.reload({ waitUntil: "domcontentloaded" });
    await ready(page); await noEarlyHUD(page);
    await page.setViewportSize({ width: 844, height: 390 });
    await page.getByRole("button", { name: "Open game menu", exact: true }).click();
    await page.getByRole("button", { name: "Save on device", exact: true }).click();
    await expect(page.getByRole("status")).toContainText("Chronicle saved");
  } finally { await context.setOffline(false); }
  expect(errors).toEqual([]); expect(external).toEqual([]);
});

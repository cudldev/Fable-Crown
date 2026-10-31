import { expect, test, type Page } from "@playwright/test";
import { applyRpgCommand, createRpg } from "../src/rpg/engine";
import { WORLD, interactionTiles } from "../src/rpg/world";
import type { RpgState } from "../src/rpg/types";

async function restore(page: Page, state: RpgState) {
  await page.getByRole("button", { name: "Open game menu" }).click();
  await page.locator('input[type="file"]').setInputFiles({ name: "cursor.json", mimeType: "application/json", buffer: Buffer.from(JSON.stringify(state)) });
  await expect(page.getByRole("status")).toContainText("Chronicle restored");
  await page.getByRole("button", { name: "Close panel" }).click();
}

test("world click cursor uses target color and exact screen point; drag, context and Escape suppress it", async ({ page }) => {
  const errors: string[] = []; page.on("pageerror", error => errors.push(error.message));
  await page.goto("./"); await expect(page.getByTestId("rpg-world")).toHaveAttribute("data-status", "ready", { timeout: 30000 });
  const state = createRpg(Date.now(), 8128), ore = WORLD.objects.find(object => object.resourceId === "copper")!;
  applyRpgCommand(state, { type: "autoplay", enabled: false });
  state.player.position = { ...interactionTiles(ore)[0] }; state.player.previousPosition = { ...state.player.position };
  await restore(page, state);
  const target = page.locator(`[data-three-selection='${JSON.stringify({ kind: "object", id: ore.id })}']`);
  const bounds = (await target.boundingBox())!, point = { x: bounds.x + bounds.width / 2, y: bounds.y + bounds.height / 2 };
  await page.mouse.click(point.x, point.y);
  const marker = page.getByTestId("click-indicator");
  const sample = await marker.evaluate(element => ({ tone: (element as HTMLElement).dataset.tone, hidden: (element as HTMLElement).hidden,
    x: parseFloat((element as HTMLElement).style.left), y: parseFloat((element as HTMLElement).style.top), color: getComputedStyle(element).color }));
  expect(sample).toMatchObject({ tone: "neutral", hidden: false, color: "rgb(247, 212, 91)" });
  const world = (await page.getByTestId("rpg-world").boundingBox())!;
  expect(sample.x + world.x).toBeCloseTo(point.x, 1); expect(sample.y + world.y).toBeCloseTo(point.y, 1);
  await page.mouse.click(point.x, point.y);
  await page.screenshot({ path: "docs/screenshots/click-yellow.png" });
  await expect(marker).toBeHidden({ timeout: 2000 });
  await page.mouse.move(point.x, point.y); await page.mouse.down(); await page.mouse.move(point.x + 70, point.y + 30, { steps: 4 }); await page.mouse.up();
  await expect(marker).toBeHidden();
  await target.click({ button: "right" }); await expect(page.getByRole("menu")).toBeVisible(); await expect(marker).toBeHidden();
  await page.keyboard.press("Escape");
  await page.getByRole("button", { name: "Follow Alden", exact: true }).click();
  await page.emulateMedia({ reducedMotion: "reduce" });
  await target.focus(); await page.keyboard.press("Enter");
  expect(await marker.evaluate(element => element.getAnimations().length)).toBe(0);
  await page.keyboard.press("Escape"); await expect(marker).toBeHidden();
  expect(errors).toEqual([]);
});

test("combat text stays on a free effects layer when HUD panels cross its path", async ({ page }) => {
  await page.goto("./"); await expect(page.getByTestId("rpg-world")).toHaveAttribute("data-status", "ready", { timeout: 30000 });
  const state = createRpg(Date.now(), 8128), enemy = state.enemies.find(value => value.id === "boar-0")!;
  applyRpgCommand(state, { type: "autoplay", enabled: false });
  state.player.position = { ...enemy.position, x: enemy.position.x - 1 }; state.player.previousPosition = { ...state.player.position };
  await restore(page, state);
  const target = page.locator(`[data-three-selection='${JSON.stringify({ kind: "enemy", id: enemy.id })}']`);
  await target.click();
  const marker = page.getByTestId("click-indicator");
  await expect(marker).toHaveAttribute("data-tone", "hostile");
  await expect(marker).toHaveCSS("color", "rgb(241, 106, 87)");
  await page.screenshot({ path: "docs/screenshots/click-red.png" });
  const damage = page.locator('.world-effects-layer .three-feedback-damage[data-motion="free"]:not([hidden])').first();
  await expect(damage).toBeVisible({ timeout: 15000 });
  const before = await damage.evaluate(element => {
    const box = element.getBoundingClientRect();
    const overlay = document.createElement("div"); overlay.id = "feedback-hud-fixture"; overlay.className = "thought-peek";
    Object.assign(overlay.style, { position: "absolute", left: `${box.x - 20}px`, top: `${box.y - 20}px`, width: "220px", height: "180px", pointerEvents: "none", zIndex: "10" });
    document.querySelector("main")!.append(overlay);
    return { x: box.x, y: box.y };
  });
  await page.waitForTimeout(120);
  const after = await damage.evaluate(element => { const box = element.getBoundingClientRect(); return { x: box.x, y: box.y, pointer: getComputedStyle(element.parentElement!).pointerEvents, effectsPosition: getComputedStyle(element.parentElement!).position, effectsZIndex: Number(getComputedStyle(element.parentElement!).zIndex),
    statusAboveEffects: Number(getComputedStyle(document.querySelector(".world-status-layer")!).zIndex) > Number(getComputedStyle(element.parentElement!).zIndex) }; });
  expect(Math.abs(after.y - before.y)).toBeLessThan(35);
  expect(Math.abs(after.x - before.x)).toBeLessThan(20);
  expect(after).toMatchObject({ pointer: "none", effectsPosition: "absolute", statusAboveEffects: true });
  expect(after.effectsZIndex).toBeLessThan(10);
  await page.locator("#feedback-hud-fixture").evaluate(element => element.remove());
  await page.screenshot({ path: "docs/screenshots/combat-free-layer.png" });
});

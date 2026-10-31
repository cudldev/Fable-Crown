import { expect, test, type Page } from "@playwright/test";
import { applyRpgCommand, createRpg } from "../src/rpg/engine";
import { WORLD, interactionTiles } from "../src/rpg/world";
import { XP_THRESHOLDS } from "../src/rpg/skills";
import { ITEMS } from "../src/rpg/content";
import type { RpgState } from "../src/rpg/types";

const fresh = () => { const state = createRpg(Date.now(), 8128); applyRpgCommand(state, { type: "autoplay", enabled: false }); return state; };
async function restore(page: Page, state: RpgState) {
  await page.getByRole("button", { name: "Open game menu" }).click();
  await page.locator('input[type="file"]').setInputFiles({ name: "input.json", mimeType: "application/json", buffer: Buffer.from(JSON.stringify(state)) });
  await expect(page.getByRole("status")).toContainText("Chronicle restored");
  await page.getByRole("button", { name: "Close panel" }).click();
}
const hit = (page: Page, kind: string, id: string) => page.locator(`[data-three-selection='${JSON.stringify({ kind, id })}']`);

test("left click mines, right click offers options without acting, Escape cancels and keyboard activates", async ({ page }) => {
  await page.goto("./"); await expect(page.getByTestId("rpg-world")).toHaveAttribute("data-status", "ready", { timeout: 30000 });
  const state = fresh(), ore = WORLD.objects.find(value => value.resourceId === "copper")!;
  state.player.position = { ...interactionTiles(ore)[0] }; state.player.previousPosition = { ...state.player.position };
  await restore(page, state);
  const node = hit(page, "object", ore.id);
  await node.click({ button: "right" });
  const menu = page.getByRole("menu", { name: "World actions" });
  await expect(menu.getByRole("menuitem", { name: `Mine ${ore.name}`, exact: true })).toBeFocused();
  await expect(page.getByTestId("hud-work-status")).toHaveCount(0);
  await menu.getByRole("menuitem", { name: "Examine", exact: true }).click();
  await expect(page.getByRole("region", { name: "Object actions" })).toContainText("Requires mining");
  await page.getByRole("button", { name: "Close actions" }).click();
  await node.click();
  const marker = page.getByTestId("click-indicator");
  await expect(marker).toHaveAttribute("data-tone", "neutral");
  await expect(marker).toHaveCSS("pointer-events", "none");
  await expect(page.getByTestId("hud-work-status")).toBeVisible();
  await expect(page.getByRole("region", { name: "Object actions" })).toHaveCount(0);
  await page.keyboard.press("Escape");
  await expect(page.getByTestId("hud-work-status")).toHaveCount(0);
  await expect(page.getByLabel("Alden's current plan")).toContainText("Ready for your next move");
  await expect(page.getByRole("button", { name: "Autoplay", exact: true })).toHaveAttribute("aria-pressed", "false");
  await page.getByRole("button", { name: "Open inventory" }).click();
  await page.getByRole("button", { name: `${ITEMS["bronze-pickaxe"].name}, 1`, exact: true }).click();
  await page.getByRole("button", { name: "Use on a place", exact: true }).click();
  await expect(page.getByRole("status")).toContainText("Select a place");
  await page.keyboard.press("Escape");
  await expect(page.getByRole("status")).toHaveCount(0);
  await node.focus(); await page.keyboard.press("Shift+F10");
  await expect(menu).toBeVisible(); await page.keyboard.press("Escape");
  await expect(menu).toHaveCount(0);
  await node.focus(); await page.keyboard.press("Enter");
  await expect(page.getByTestId("hud-work-status")).toBeVisible();
  await page.screenshot({ path: "docs/screenshots/inputs-mining.png" });
});

test("left click attacks and animated damage originates at its victim", async ({ page }) => {
  await page.goto("./"); await expect(page.getByTestId("rpg-world")).toHaveAttribute("data-status", "ready", { timeout: 30000 });
  const state = fresh(), enemy = state.enemies.find(value => value.id === "boar-0")!;
  state.player.position = { ...enemy.position, x: enemy.position.x - 1 }; state.player.previousPosition = { ...state.player.position };
  state.player.skills.attack = XP_THRESHOLDS[19];
  await restore(page, state); await hit(page, "enemy", enemy.id).click();
  await expect(page.getByTestId("click-indicator")).toHaveAttribute("data-tone", "hostile");
  await expect(page.getByRole("region", { name: "Enemy actions" })).toHaveCount(0);
  const damage = page.locator('.three-feedback-damage[data-target-id="boar-0"]:not([hidden])').first();
  const sampleDamage = () => page.evaluate(id => {
    const number = document.querySelector<HTMLElement>(`.three-feedback-damage[data-target-id="${id}"]:not([hidden])`);
    const victim = document.querySelector<HTMLElement>(`[data-three-selection='${JSON.stringify({ kind: "enemy", id })}']`);
    if (!number || !victim || !number.offsetWidth) return null;
    const bounds = number.getBoundingClientRect(), target = victim.getBoundingClientRect();
    return { animation: getComputedStyle(number.querySelector(".floater-number")!).animationName,
      near: Math.abs(bounds.x + bounds.width / 2 - target.x - target.width / 2) < 45 && Math.abs(bounds.bottom - target.y - target.height / 2) < 140 };
  }, enemy.id);
  await expect.poll(sampleDamage, { timeout: 15000 }).toMatchObject({ animation: "damage-number-pop", near: true });
  await page.screenshot({ path: "docs/screenshots/inputs-damage.png" });
  await page.emulateMedia({ reducedMotion: "reduce" });
  await expect.poll(sampleDamage, { timeout: 15000 }).toMatchObject({ animation: "none", near: true });
  await page.keyboard.press("Escape");
  await expect(page.getByLabel("Alden's current plan")).toContainText("Ready for your next move");
});

test("touch hold opens a bounded menu, while a tap gathers", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("./"); await expect(page.getByTestId("rpg-world")).toHaveAttribute("data-status", "ready", { timeout: 30000 });
  const state = fresh(), ore = WORLD.objects.find(value => value.resourceId === "copper")!;
  state.player.position = { ...interactionTiles(ore)[0] }; state.player.previousPosition = { ...state.player.position };
  await restore(page, state);
  const node = hit(page, "object", ore.id), box = await node.boundingBox();
  const point = { clientX: box!.x + box!.width / 2, clientY: box!.y + box!.height / 2, pointerId: 8, pointerType: "touch", button: 0, bubbles: true };
  const cdp = await page.context().newCDPSession(page);
  await cdp.send("Emulation.setTouchEmulationEnabled", { enabled: true });
  await cdp.send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: [{ x: point.clientX, y: point.clientY }] });
  await expect(page.getByRole("menu", { name: "World actions" })).toBeVisible();
  await expect(page.getByTestId("click-indicator")).toBeHidden();
  await cdp.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });
  await expect(page.getByTestId("hud-work-status")).toHaveCount(0);
  const menuBox = await page.getByRole("menu").boundingBox();
  expect(menuBox!.x).toBeGreaterThanOrEqual(0); expect(menuBox!.x + menuBox!.width).toBeLessThanOrEqual(390);
  await page.screenshot({ path: "docs/screenshots/inputs-touch-menu.png" });
  await page.getByRole("menuitem", { name: "Cancel", exact: true }).click();
  await node.click(); await expect(page.getByTestId("hud-work-status")).toBeVisible();
});

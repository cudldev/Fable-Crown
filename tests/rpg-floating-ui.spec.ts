import { expect, test, type Page } from "@playwright/test";
import { mkdir } from "node:fs/promises";
import { applyRpgCommand, createRpg } from "../src/rpg/engine";
import { WORLD, interactionTiles } from "../src/rpg/world";
import { XP_THRESHOLDS } from "../src/rpg/skills";
import type { RpgState } from "../src/rpg/types";

const output = "docs/screenshots/floating-ui";
async function restore(page: Page, state: RpgState) {
  await page.getByRole("button", { name: "Open game menu", exact: true }).click();
  await page.locator('input[type="file"]').setInputFiles({ name: "floating-ui.json", mimeType: "application/json", buffer: Buffer.from(JSON.stringify(state)) });
  await expect(page.getByRole("status")).toContainText("Chronicle restored");
  await page.getByRole("button", { name: "Close panel", exact: true }).click();
  await page.getByRole("button", { name: "Dismiss notification" }).click();
}
function fixture() {
  const state = createRpg(Date.now(), 8128);
  applyRpgCommand(state, { type: "autoplay", enabled: false });
  return state;
}
async function unboxed(page: Page, selector: string) {
  const style = await page.locator(selector).first().evaluate(node => {
    const css = getComputedStyle(node);
    return { background: css.backgroundColor, border: css.borderTopWidth, shadow: css.textShadow, pointer: css.pointerEvents };
  });
  expect(style).toMatchObject({ background: "rgba(0, 0, 0, 0)", border: "0px", pointer: "none" });
  expect(style.shadow).not.toBe("none");
}

test("floating vials follow scene light with transparent labels and readable glass on phones", async ({ page }) => {
  await mkdir(output, { recursive: true });
  const errors: string[] = []; page.on("pageerror", error => errors.push(error.message));
  await page.goto("./"); await expect(page.getByTestId("rpg-world")).toHaveAttribute("data-status", "ready", { timeout: 30000 });
  const injured = fixture(); injured.player.health = 6;
  await restore(page, injured);
  const health = page.locator(".world-health-player");
  const tint = () => health.evaluate(node => (node as HTMLElement).style.getPropertyValue("--vial-light"));
  await page.getByRole("button", { name: "Day lighting", exact: true }).click();
  await expect.poll(tint).not.toBe(""); const day = await tint();
  await expect(health.locator(".health-vial")).toHaveCSS("height", "12px");
  const frontSheen = () => health.locator(".vial-reflection-core").evaluate(node => getComputedStyle(node).fill);
  const daySheen = await frontSheen();
  expect(daySheen).not.toBe("none");
  const depth = await health.locator(".vial-liquid-depth").evaluate(node => getComputedStyle(node).stopColor);
  const edge = await health.locator(".vial-liquid-edge").first().evaluate(node => getComputedStyle(node).stopColor);
  expect(depth).not.toBe(edge);
  await health.screenshot({ path: `${output}/glass-closeup-day.png` });
  await unboxed(page, ".world-health-player");
  await page.screenshot({ path: `${output}/day-desktop.png` });
  await page.getByRole("button", { name: "Night lighting", exact: true }).click();
  await expect.poll(tint).not.toBe(day); const night = await tint();
  await expect.poll(frontSheen).not.toBe(daySheen);
  await health.screenshot({ path: `${output}/glass-closeup-night.png` });
  await page.screenshot({ path: `${output}/night-desktop.png` });
  const forge = WORLD.objects.find(object => object.id === "oakrest-furnace")!;
  const near = fixture(); near.player.health = 6; near.player.position = { ...interactionTiles(forge)[0] }; near.player.previousPosition = { ...near.player.position };
  await restore(page, near);
  await expect.poll(tint).not.toBe(night);
  await page.screenshot({ path: `${output}/forge-night.png` });
  for (const viewport of [{ width: 390, height: 844 }, { width: 844, height: 390 }]) {
    await page.setViewportSize(viewport); await expect(health).toBeVisible();
    await unboxed(page, ".world-health-player");
    await page.screenshot({ path: `${output}/night-${viewport.width}.png` });
  }
  expect(errors).toEqual([]);
});

test("real work, XP, level-up and victim damage float without plates", async ({ page }) => {
  await mkdir(output, { recursive: true });
  await page.goto("./"); await expect(page.getByTestId("rpg-world")).toHaveAttribute("data-status", "ready", { timeout: 30000 });
  const state = fixture(), ore = WORLD.objects.find(object => object.resourceId === "copper")!;
  state.player.position = { ...interactionTiles(ore)[0] }; state.player.previousPosition = { ...state.player.position };
  state.player.skills.mining = XP_THRESHOLDS[1] - 100;
  expect(applyRpgCommand(state, { type: "gather", objectId: ore.id, quantity: 28 }).ok).toBe(true);
  await restore(page, state);
  await expect(page.getByTestId("world-work-status")).toBeVisible();
  await unboxed(page, ".world-work");
  await page.screenshot({ path: `${output}/work.png` });
  await expect(page.locator(".three-feedback-level").first()).toBeVisible({ timeout: 20000 });
  for (const tone of ["item", "xp", "level"]) await unboxed(page, `.three-feedback-${tone}`);
  await page.screenshot({ path: `${output}/rewards.png` });
  const combat = fixture(), enemy = combat.enemies.find(value => value.id === "boar-0")!;
  combat.player.position = { ...enemy.position, x: enemy.position.x - 1 }; combat.player.previousPosition = { ...combat.player.position };
  combat.player.skills.attack = XP_THRESHOLDS[19];
  expect(applyRpgCommand(combat, { type: "attack", enemyId: enemy.id }).ok).toBe(true);
  await restore(page, combat);
  await expect(page.locator(".world-health-enemy")).toBeVisible();
  await unboxed(page, ".world-health-enemy");
  await expect(page.locator(".three-feedback-damage").first()).toBeVisible({ timeout: 15000 });
  await unboxed(page, ".three-feedback-damage");
  await page.screenshot({ path: `${output}/combat.png` });
});

test("skilling ring follows the actual attempt and resets without growing the mobile dock", async ({ page }) => {
  await mkdir(output, { recursive: true });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("./"); await expect(page.getByTestId("rpg-world")).toHaveAttribute("data-status", "ready", { timeout: 30000 });
  const state = fixture(), ore = WORLD.objects.find(object => object.resourceId === "copper")!;
  state.player.position = { ...interactionTiles(ore)[0] }; state.player.previousPosition = { ...state.player.position };
  expect(applyRpgCommand(state, { type: "gather", objectId: ore.id, quantity: 28 }).ok).toBe(true);
  await restore(page, state);
  const work = page.getByTestId("world-work-status");
  await expect(work.locator(".action-cycle svg")).toBeVisible();
  await expect(page.getByTestId("hud-work-status").locator(".action-cycle svg")).toBeVisible();
  const cycle = await page.evaluate(async () => {
    let previous = 0, highest = 0, reset = false, error = 0;
    const start = performance.now();
    while (performance.now() - start < 16000) {
      await new Promise(requestAnimationFrame);
      // Successful attempts can briefly remove the indicator before the next one.
      const node = document.querySelector('[data-testid="world-work-status"]');
      if (!node) continue;
      const progress = node.querySelector("progress")!, arc = node.querySelector(".action-cycle-fill")!;
      const fraction = progress.value / progress.max;
      error = Math.max(error, Math.abs(parseFloat(getComputedStyle(arc).strokeDasharray) - fraction));
      highest = Math.max(highest, fraction);
      if (previous > .75 && fraction < .2) { reset = true; break; }
      previous = fraction;
    }
    return { highest, reset, error };
  });
  expect(cycle.reset).toBe(true); expect(cycle.highest).toBeGreaterThan(.75); expect(cycle.error).toBeLessThan(.001);
  expect((await page.locator(".intention-dock").boundingBox())!.height).toBeLessThanOrEqual(60);
  await page.screenshot({ path: `${output}/action-ring-phone.png` });
  await page.setViewportSize({ width: 844, height: 390 });
  await expect(work.locator(".action-cycle svg")).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.screenshot({ path: `${output}/action-ring-landscape.png` });
});

import { expect, test, type Page } from "@playwright/test";
import { applyRpgCommand, createRpg, validateRpgSave } from "../src/rpg/engine";
import { interactionTiles, WORLD, findPath } from "../src/rpg/world";
import { XP_THRESHOLDS } from "../src/rpg/skills";
import type { RpgState } from "../src/rpg/types";

async function restore(page: Page, state: RpgState) {
  expect(validateRpgSave(structuredClone(state))).not.toBeNull();
  await page.getByRole("button", { name: "Open game menu" }).click();
  await page.locator('input[type="file"]').setInputFiles({ name: "feel.json", mimeType: "application/json", buffer: Buffer.from(JSON.stringify(state)) });
  await expect(page.getByRole("status")).toContainText("Chronicle restored");
  await page.getByRole("button", { name: "Close panel" }).click();
}
const fixture = () => {
  const state = createRpg(Date.now(), 8128);
  applyRpgCommand(state, { type: "autoplay", enabled: false });
  return state;
};

test("harvesting has readable world and HUD cycles in all three professions", async ({ page }) => {
  const errors: string[] = [], external: string[] = [];
  page.on("pageerror", error => errors.push(error.message));
  page.on("request", request => { if (!request.url().startsWith("http://127.0.0.1") && !request.url().startsWith("blob:") && !request.url().startsWith("data:")) external.push(request.url()); });
  await page.goto("./");
  await expect(page.getByTestId("rpg-world")).toHaveAttribute("data-status", "ready");
  for (const [resource, label] of [["tree", "Chopping"], ["copper", "Mining"], ["shrimp", "Fishing"]]) {
    const state = fixture(), node = WORLD.objects.find(object => object.resourceId === resource)!;
    state.player.position = { ...interactionTiles(node)[0] };
    state.player.previousPosition = { ...state.player.position };
    expect(applyRpgCommand(state, { type: "gather", objectId: node.id, quantity: 10 }).ok).toBe(true);
    await restore(page, state);
    await expect(page.getByTestId("world-work-status")).toContainText(label);
    await expect(page.getByTestId("hud-work-status")).toBeVisible();
    const dock = await page.locator(".intention-dock").boundingBox();
    const messages = await page.locator(".rpg-messages").boundingBox();
    expect(messages!.y + messages!.height).toBeLessThanOrEqual(dock!.y);
    const bar = page.getByTestId("world-work-status").getByRole("progressbar");
    await expect(bar).toHaveAttribute("aria-label", `${label} world progress`);
    await page.screenshot({ path: `docs/screenshots/gameplay-${resource}.png` });
  }
  expect(errors).toEqual([]); expect(external).toEqual([]);
});

test("combat shows victim damage, health and separated reward labels", async ({ page }) => {
  await page.goto("./");
  await expect(page.getByTestId("rpg-world")).toHaveAttribute("data-status", "ready");
  const state = fixture(), enemy = state.enemies.find(value => value.id === "boar-0")!;
  state.player.position = { ...enemy.position, x: enemy.position.x - 1 };
  state.player.previousPosition = { ...state.player.position };
  state.player.skills.attack = XP_THRESHOLDS[19];
  expect(applyRpgCommand(state, { type: "attack", enemyId: enemy.id }).ok).toBe(true);
  await restore(page, state);
  await expect(page.locator(".world-health-enemy")).toBeVisible();
  await expect(page.locator(".three-feedback-damage").first()).toBeVisible({ timeout: 20000 });
  await expect(page.getByTestId("world-effects-layer").locator(".three-feedback-damage").first()).toBeVisible();
  await expect(page.locator(".three-hit-layer .three-feedback")).toHaveCount(0);
  const boxes = await page.locator(".world-health:not([hidden]), .world-work:not([hidden])").evaluateAll(elements => elements.map(element => {
    const box = element.getBoundingClientRect(); return { x: box.x, y: box.y, right: box.right, bottom: box.bottom };
  }));
  for (let i = 0; i < boxes.length; i++) for (let j = i + 1; j < boxes.length; j++) {
    const a = boxes[i], b = boxes[j];
    expect(a.x < b.right && a.right > b.x && a.y < b.bottom && a.bottom > b.y, `${i}/${j} overlap`).toBe(false);
  }
  await page.screenshot({ path: "docs/screenshots/gameplay-combat.png" });
});

test("manual idle, inventory tools, orientations and offline reload", async ({ page, context }) => {
  await page.goto("./");
  await expect(page.getByTestId("rpg-world")).toHaveAttribute("data-status", "ready");
  const state = fixture();
  state.player.inventory.push({ itemId: "iron-ore", quantity: 3 });
  await restore(page, state);
  await expect(page.getByRole("button", { name: "Autoplay", exact: true })).toHaveAttribute("aria-pressed", "false");
  const directions = [["d", 1, 0], ["s", 0, 1], ["a", -1, 0], ["w", 0, -1]] as const;
  const move = directions.find(([, dx, dy]) => findPath(state.player.position, { ...state.player.position, x: state.player.position.x + dx, y: state.player.position.y + dy })?.length === 1)!;
  await page.locator("canvas").first().focus();
  await page.keyboard.press(move[0]);
  const target = `${state.player.position.x + move[1]}, ${state.player.position.y + move[2]}`;
  await expect(page.locator(".three-test-note")).toContainText(target);
  await page.waitForTimeout(3200);
  await expect(page.locator(".three-test-note")).toContainText(target);
  await expect(page.getByLabel("Alden's current plan")).toContainText("Ready for your next move");
  await page.getByRole("button", { name: "Open inventory" }).click();
  await page.getByRole("button", { name: "Group items off" }).click();
  await page.getByRole("searchbox", { name: "Search inventory" }).fill("iron");
  await expect(page.getByRole("button", { name: "Iron ore, 3", exact: true })).toBeVisible();
  await expect(page.getByLabel("Backpack capacity")).toContainText("14 / 28");
  await page.getByRole("button", { name: "Iron ore, 3", exact: true }).click();
  await expect(page.locator(".rpg-item-inspect")).toContainText("3 slots");
  for (const viewport of [{ width: 390, height: 844 }, { width: 844, height: 390 }]) {
    await page.setViewportSize(viewport);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await page.screenshot({ path: `docs/screenshots/gameplay-bag-${viewport.width}.png` });
  }
  await page.getByRole("button", { name: "Close panel" }).click();
  await page.getByRole("button", { name: "Open game menu" }).click();
  await page.getByRole("button", { name: "Save on device" }).click();
  await expect(page.getByRole("status")).toContainText("Chronicle saved");
  await page.evaluate(async () => { await navigator.serviceWorker.ready; });
  await context.setOffline(true);
  await page.reload();
  await expect(page.getByTestId("rpg-world")).toHaveAttribute("data-status", "ready");
  await expect(page.getByRole("button", { name: "Autoplay", exact: true })).toHaveAttribute("aria-pressed", "false");
});

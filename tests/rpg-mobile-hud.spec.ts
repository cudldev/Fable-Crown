import { expect, test, type Page } from "@playwright/test";
import { createRpg } from "../src/rpg/engine";

async function start(page: Page) {
  await page.goto("./");
  await expect(page.getByTestId("rpg-world")).toHaveAttribute("data-status", "ready");
  const state = createRpg(Date.now(), 8128);
  Object.assign(state.control, { autoplay: false, waiting: false, active: null, goal: null, source: null,
    queue: [], thought: null, thinkingUntil: 1e9 });
  state.player.path = []; state.player.action = null; state.player.movement = null;
  await page.getByRole("button", { name: "Open game menu", exact: true }).click();
  await page.locator('input[type="file"]').setInputFiles({ name: "mobile-hud.json", mimeType: "application/json", buffer: Buffer.from(JSON.stringify(state)) });
  await expect(page.getByRole("status")).toContainText("Chronicle restored");
  await page.getByRole("button", { name: "Close panel", exact: true }).click();
  await page.getByRole("button", { name: "Dismiss notification" }).click();
}

test("phone HUD leaves the world clear with no overlapping or undersized controls", async ({ page }) => {
  await start(page);
  const measurements = [];
  for (const viewport of [{ width: 320, height: 568 }, { width: 390, height: 844 }, { width: 667, height: 375 }, { width: 844, height: 390 }]) {
    await page.setViewportSize(viewport);
    await expect(page.getByRole("button", { name: "World tools", exact: true })).toHaveAttribute("aria-expanded", "false");
    for (const selector of [".rpg-minimap", ".camera-controls", ".three-light-controls", ".three-performance", ".three-test-note", ".plan-why", ".plan-next"])
      await expect(page.locator(selector)).toBeHidden();
    const result = await page.evaluate(() => {
      const boxes = [...document.querySelectorAll<HTMLElement>(".world-header button,.intention-dock,.intention-readout,.rpg-messages")]
        .filter(node => node.checkVisibility()).map(node => node.getBoundingClientRect());
      const overlap = boxes.some((a, i) => boxes.slice(i + 1).some(b => Math.min(a.right, b.right) - Math.max(a.left, b.left) > 1 && Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top) > 1));
      return { coverage: boxes.reduce((sum, box) => sum + box.width * box.height, 0) / (innerWidth * innerHeight), overlap,
        overflow: document.documentElement.scrollWidth > innerWidth,
        outside: boxes.some(box => box.x < 0 || box.y < 0 || box.right > innerWidth || box.bottom > innerHeight) };
    });
    expect(result).toMatchObject({ overlap: false, overflow: false, outside: false });
    expect(result.coverage).toBeLessThan(.25);
    for (const name of ["Open thoughts", "Autoplay", "Open messages", "Inspect Alden", "Open inventory", "Open skills", "Open chronicle", "World tools", "Open game menu"]) {
      const size = await (name === "Inspect Alden" ? page.locator(".hero-status") : page.getByRole("button", { name, exact: true })).boundingBox();
      expect(size?.width, name).toBeGreaterThanOrEqual(44);
      expect(size?.height, name).toBeGreaterThanOrEqual(44);
    }
    measurements.push({ ...viewport, ...result });
    await page.screenshot({ path: `docs/screenshots/mobile-ui/after-${viewport.width}.png` });
  }
  console.log("Mobile HUD coverage", measurements);
});

test("mobile tools, thoughts and drawers remain usable through rotation", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", error => errors.push(error.message));
  await page.setViewportSize({ width: 390, height: 844 });
  await start(page);
  const tools = page.getByRole("button", { name: "World tools", exact: true });
  await tools.click();
  await expect(page.getByRole("complementary", { name: "Frontier minimap" })).toBeVisible();
  await page.screenshot({ path: "docs/screenshots/mobile-ui/tools-portrait.png" });
  const world = page.getByTestId("rpg-world");
  const zoom = await world.getAttribute("data-camera-zoom");
  await page.getByRole("button", { name: "Zoom out", exact: true }).click();
  await expect(world).not.toHaveAttribute("data-camera-zoom", zoom!);
  await page.getByRole("button", { name: "Follow Alden", exact: true }).click();
  await page.getByRole("button", { name: "Visual settings", exact: true }).click();
  const visual = page.getByRole("dialog", { name: "Visual settings", exact: true });
  await visual.getByRole("combobox", { name: "Lighting preset", exact: true }).selectOption("day");
  await expect(world).toHaveAttribute("data-lighting", "day");
  await visual.getByRole("combobox", { name: "Camera projection", exact: true }).selectOption("orthographic");
  await expect(world).toHaveAttribute("data-camera-mode", "orthographic");
  await page.setViewportSize({ width: 844, height: 390 });
  await expect(visual).toBeVisible();
  expect(await visual.locator(".visual-settings-body").evaluate(node => node.clientHeight)).toBeGreaterThan(100);
  await page.screenshot({ path: "docs/screenshots/mobile-ui/settings-landscape.png" });
  await visual.getByRole("button", { name: "Close visual settings" }).click();
  await tools.click();
  await page.getByRole("button", { name: "Open thoughts", exact: true }).click();
  await expect(page.getByRole("region", { name: "Current intention explained" })).toContainText("Why:");
  await page.getByRole("button", { name: "Pause Alden", exact: true }).click();
  await expect(page.getByRole("button", { name: "Resume Alden", exact: true })).toBeVisible();
  await page.setViewportSize({ width: 390, height: 844 });
  await expect(page.getByRole("button", { name: "Resume Alden", exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Close panel", exact: true }).click();
  await page.getByRole("button", { name: "Open messages", exact: true }).click();
  await expect(page.getByRole("log", { name: "Message history" })).toBeVisible();
  await expect(page.locator(".intention-readout")).toBeHidden();
  await page.getByRole("button", { name: "Collapse messages", exact: true }).click();
  await page.getByRole("button", { name: "Open inventory", exact: true }).click();
  await expect(page.locator(".intention-readout")).toBeHidden();
  await page.getByRole("button", { name: "Close panel", exact: true }).click();
  await expect(page.getByRole("button", { name: "Autoplay", exact: true })).toHaveAttribute("aria-pressed", "false");
  await page.getByRole("button", { name: "Autoplay", exact: true }).click();
  await expect(page.getByRole("button", { name: "Autoplay", exact: true })).toHaveAttribute("aria-pressed", "true");
  expect(errors).toEqual([]);
});

import { test, expect } from "@playwright/test";
import { mkdir, writeFile } from "node:fs/promises";
import { createRpg } from "../src/rpg/engine";
import { tile, WORLD } from "../src/rpg/world";

test("shore and bridge lens outline isolation", async ({ page }) => {
  const output = "docs/art-audit/shore-outline-v1"; await mkdir(output, { recursive: true }); const errors: string[] = [];
  page.on("pageerror", e => errors.push(e.message)); page.on("console", e => { if (e.type() === "error") errors.push(e.text()); });
  await page.emulateMedia({ reducedMotion: "reduce" }); await page.setViewportSize({ width: 1920, height: 1080 }); await page.goto("./?renderer=3d");
  const world = page.getByTestId("rpg-world"), panel = page.getByRole("dialog", { name: "Visual settings" });
  await expect(world).toHaveAttribute("data-status", "ready", { timeout: 60000 });
  const fixture = createRpg(Date.now(), 8128), y = 62, bank = WORLD.terrain.slice(y * WORLD.width, (y + 1) * WORLD.width).indexOf("water") - 1;
  Object.assign(fixture.control, { waiting: true, goal: null, active: null, source: null, queue: [], thought: null, thinkingUntil: 1e9 });
  fixture.player.position = tile(bank, y); fixture.player.previousPosition = { ...fixture.player.position }; fixture.player.path = []; fixture.player.action = null; fixture.player.movement = null;
  await page.getByRole("button", { name: "Open game menu" }).click(); await page.locator('input[type="file"]').setInputFiles({ name: "shore-outline.json", mimeType: "application/json", buffer: Buffer.from(JSON.stringify(fixture)) });
  await expect(page.getByRole("status")).toContainText("Chronicle restored"); await page.getByRole("button", { name: "Close panel" }).click();
  await page.getByRole("button", { name: "Follow Alden", exact: true }).click(); await page.getByRole("button", { name: "Dusk lighting", exact: true }).click();
  await expect(world).toHaveAttribute("data-gi-state", "ready", { timeout: 60000 });
  const counters = [];
  for (const variant of ["baseline", "no-ca", "no-rays", "no-dof", "no-reflections"] as const) {
    await page.getByRole("button", { name: "Visual settings", exact: true }).click();
    for (const [name, amount] of [["Chromatic aberration", variant === "no-ca" ? 0 : .18], ["Light rays", variant === "no-rays" ? 0 : .65], ["Depth of field", variant === "no-dof" ? 0 : .25]] as const)
      await panel.getByRole("slider", { name, exact: true }).evaluate((el, value) => { Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!.call(el, String(value)); el.dispatchEvent(new Event("input", { bubbles: true })); }, amount);
    await panel.getByRole("checkbox", { name: "Enable water reflections", exact: true }).setChecked(variant !== "no-reflections");
    await panel.getByRole("button", { name: "Done", exact: true }).click();
    await page.evaluate(async () => { for (let i = 0; i < 45; i++) await new Promise(resolve => requestAnimationFrame(resolve)); });
    await page.screenshot({ path: output + "/" + variant + ".png" });
    counters.push({ variant, values: await world.evaluate(el => ({ ...(el as HTMLElement).dataset })) });
  }
  expect(errors).toEqual([]); await writeFile(output + "/review.json", JSON.stringify({ counters, errors }, null, 2));
});

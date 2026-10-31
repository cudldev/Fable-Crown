import { expect, test, type Page } from "@playwright/test";
import { mkdir, writeFile } from "node:fs/promises";
import { createRpg } from "../src/rpg/engine";
import { tile } from "../src/rpg/world";

const output = "docs/art-audit/fidelity-cycle-v1";
async function slider(page: Page, name: string, value: number) {
  await page.getByRole("slider", { name, exact: true }).evaluate((element, n) => {
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!.call(element, String(n));
    element.dispatchEvent(new Event("input", { bubbles: true }));
  }, value);
}
async function measure(page: Page) {
  return page.evaluate(async () => {
    let previous = await new Promise<number>(resolve => requestAnimationFrame(resolve)); const start = previous, intervals: number[] = [];
    while (previous - start < 2000) { const now = await new Promise<number>(resolve => requestAnimationFrame(resolve)); intervals.push(now - previous); previous = now; }
    intervals.sort((a, b) => a - b);
    return { fps: intervals.length * 1000 / (previous - start), p95Ms: intervals[Math.floor(intervals.length * .95)],
      counters: { ...document.querySelector<HTMLElement>('[data-testid="rpg-world"]')!.dataset }, browser: navigator.userAgent };
  });
}

test("fidelity controls, diffuse bounce comparison and default saved-time daylight work offline", async ({ page, context }) => {
  test.setTimeout(210000); await mkdir(output, { recursive: true }); const errors: string[] = [], external: string[] = [];
  page.on("pageerror", e => errors.push(e.message)); page.on("console", e => { if (e.type() === "error") errors.push(e.text()); });
  page.on("request", r => { const u = new URL(r.url()); if (u.protocol.startsWith("http") && u.hostname !== "127.0.0.1") external.push(u.href); });
  await page.setViewportSize({ width: 1280, height: 800 }); await page.goto("./?renderer=3d");
  const world = page.getByTestId("rpg-world"), panel = page.getByRole("dialog", { name: "Visual settings" });
  await expect(world).toHaveAttribute("data-status", "ready", { timeout: 60000 });
  await expect(world).toHaveAttribute("data-day-night-cycle", "true");
  const fixture = createRpg(Date.now(), 8128);
  Object.assign(fixture.control, { waiting: true, goal: null, active: null, source: null, queue: [], thought: null, thinkingUntil: 1e9 });
  fixture.player.position = tile(60, 106); fixture.player.previousPosition = { ...fixture.player.position }; fixture.player.path = []; fixture.player.action = null; fixture.player.movement = null;
  await page.getByRole("button", { name: "Open game menu" }).click();
  await page.locator('input[type="file"]').setInputFiles({ name: "fidelity.json", mimeType: "application/json", buffer: Buffer.from(JSON.stringify(fixture)) });
  await expect(page.getByRole("status")).toContainText("Chronicle restored"); await page.getByRole("button", { name: "Close panel" }).click();
  await page.getByRole("button", { name: "Follow Alden", exact: true }).click();
  await page.getByRole("button", { name: "Dusk lighting", exact: true }).click();
  await expect(world).toHaveAttribute("data-day-night-cycle", "false");
  await expect(world).toHaveAttribute("data-light-ray-passes", "1");
  const open = () => page.getByRole("button", { name: "Visual settings", exact: true }).click();
  const close = () => panel.getByRole("button", { name: "Done", exact: true }).click();
  await open();
  for (const name of ["Ground contact shading", "Layered ground haze", "Warm light / cool shadows", "Wind strength"]) await slider(page, name, 0);
  await slider(page, "Ambient brightness", 1); await close();
  await expect(world).toHaveAttribute("data-gi-state", "ready", { timeout: 60000 });
  const baseline = await measure(page); await page.screenshot({ path: `${output}/controls-off.png` });
  await open(); await slider(page, "Ground contact shading", .45); await slider(page, "Layered ground haze", .65);
  await slider(page, "Warm light / cool shadows", .35); await slider(page, "Ambient brightness", .85); await close();
  await expect(world).toHaveAttribute("data-gi-state", "ready", { timeout: 60000 });
  const trials = [];
  for (const bounces of [1, 2, 3]) {
    await open(); await panel.getByRole("combobox", { name: "Diffuse bounces", exact: true }).selectOption(String(bounces)); await close();
    await expect(world).toHaveAttribute("data-gi-bounces", String(bounces), { timeout: 60000 });
    await expect(world).toHaveAttribute("data-gi-state", "ready", { timeout: 60000 });
    trials.push({ bounces, ...await measure(page) }); await page.screenshot({ path: `${output}/bounces-${bounces}.png` });
  }
  await open(); await panel.getByRole("combobox", { name: "Diffuse bounces", exact: true }).selectOption("1");
  await panel.getByRole("checkbox", { name: "Day–night cycle", exact: true }).check(); await slider(page, "Starting hour", 12); await close();
  await expect(world).toHaveAttribute("data-day-night-cycle", "true");
  await expect.poll(async () => Number(await world.getAttribute("data-day-hour"))).toBeLessThan(13);
  const firstHour = Number(await world.getAttribute("data-day-hour"));
  await expect.poll(async () => Number(await world.getAttribute("data-day-hour"))).toBeGreaterThan(firstHour);
  const cycle = [];
  for (const hour of [12, 18, 0]) {
    await open(); await slider(page, "Starting hour", hour); await close();
    await expect(world).toHaveAttribute("data-gi-state", "ready", { timeout: 60000 });
    cycle.push({ hour, ...await measure(page) }); await page.screenshot({ path: `${output}/cycle-${hour}.png` });
  }
  for (const viewport of [{ width: 390, height: 844 }, { width: 844, height: 390 }]) {
    await page.setViewportSize(viewport);
    await expect(page.getByTestId("fps-indicator")).toBeHidden();
    await expect(page.getByTestId("fps-indicator")).toHaveText(/\d+ FPS · \d+\.\d ms/);
    expect(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth + 1)).toBe(false);
    await page.screenshot({ path: `${output}/${viewport.width < 500 ? "portrait" : "landscape"}.png` });
  }
  await page.evaluate(async () => { await navigator.serviceWorker.ready; }); await context.setOffline(true); await page.reload();
  await expect(world).toHaveAttribute("data-status", "ready", { timeout: 60000 });
  await expect(world).toHaveAttribute("data-day-night-cycle", "true");
  expect(errors).toEqual([]); expect(external).toEqual([]);
  await writeFile(`${output}/review.json`, JSON.stringify({ baseline, trials, cycle, errors, external,
    note: "Same host/browser/full-scene trials, 2s RAF samples. Worker solve latency is separate from frame cost. No physical mobile benchmark. Controls-off comparison retains new soft foot contact." }, null, 2));
});

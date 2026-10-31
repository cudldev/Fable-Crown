import { expect, test, type Page } from "@playwright/test";
import { mkdir, writeFile } from "node:fs/promises";
import { createRpg } from "../src/rpg/engine";
import { objectById, tile, worldForState } from "../src/rpg/world";
import type { RpgState } from "../src/rpg/types";

const output = "docs/art-audit/sprite-lighting-v1";
test.use({ viewport: { width: 1280, height: 800 }, actionTimeout: 15000 });
test.setTimeout(150000);

function fixture() {
  const state = createRpg(Date.now(), 8128), spawns = worldForState(state).spawns;
  Object.assign(state.control, { waiting: true, goal: null, active: null, source: null, queue: [], thought: null, thinkingUntil: 1_000_000_000 });
  state.player.position = tile(45, 93); state.player.previousPosition = { ...state.player.position };
  state.player.path = []; state.player.action = null; state.player.movement = null;
  state.npcs.forEach((npc, i) => {
    npc.position = { ...spawns[8 + i % 16]! }; npc.previousPosition = { ...npc.position };
    npc.path = []; npc.action = null; npc.movement = null;
  });
  return state;
}
async function closePanel(page: Page) {
  const close = page.getByRole("button", { name: "Close panel", exact: true });
  if (await close.isVisible()) await close.click();
}
async function restore(page: Page, state: RpgState) {
  await page.getByRole("button", { name: "Open game menu", exact: true }).click();
  await page.locator('input[type="file"]').setInputFiles({ name: "sprite-lighting-fixture.json", mimeType: "application/json", buffer: Buffer.from(JSON.stringify(state)) });
  await expect(page.getByRole("status")).toContainText("Chronicle restored");
  await closePanel(page);
}
async function savedPlayer(page: Page) {
  await page.getByRole("button", { name: "Open game menu", exact: true }).click();
  await page.getByRole("button", { name: "Save on device", exact: true }).click();
  await expect(page.getByRole("status")).toContainText("Chronicle saved");
  const player = await page.evaluate(() => new Promise<RpgState["player"]>((resolve, reject) => {
    const open = indexedDB.open("fable-crown", 1);
    open.onerror = () => reject(open.error);
    open.onsuccess = () => {
      const db = open.result, get = db.transaction("saves").objectStore("saves").get("v5");
      get.onsuccess = () => { resolve((get.result as RpgState).player); db.close(); };
      get.onerror = () => { reject(get.error); db.close(); };
    };
  }));
  await closePanel(page);
  return { position: player.position, inventory: player.inventory, equipment: player.equipment, skills: player.skills, health: player.health, runEnergy: player.runEnergy };
}
async function visual(page: Page, sliders: Record<string, number>, diagnostic = false) {
  await page.getByRole("button", { name: "Visual settings", exact: true }).click();
  const panel = page.getByRole("dialog", { name: "Visual settings" });
  for (const [name, value] of Object.entries(sliders)) await panel.getByRole("slider", { name, exact: true }).fill(String(value));
  if (diagnostic) {
    for (const name of ["Enable sun shadows", "Enable bounced light", "Enable ambient occlusion", "Enable fog"])
      await panel.getByRole("checkbox", { name, exact: true }).uncheck();
    await panel.getByLabel("Sun tint", { exact: true }).fill("#ffffff");
    await panel.getByLabel("Ambient tint", { exact: true }).fill("#ffffff");
  }
  await panel.getByRole("button", { name: "Done", exact: true }).click();
  // Wait for two real presentation frames after React has committed the controls.
  await page.evaluate(() => new Promise<void>(resolve => requestAnimationFrame(() => requestAnimationFrame(() => resolve()))));
}
type Grid = { left: number; top: number; pitch: number };
type Samples = { grid: Grid; left: number; right: number; top: number; bottom: number; center: number };
async function analyze(page: Page, bytes: Buffer, knownGrid?: Grid): Promise<Samples> {
  return page.evaluate(async ({ base64, knownGrid }) => {
    const image = new Image(); image.src = "data:image/png;base64," + base64; await image.decode();
    const canvas = document.createElement("canvas"); canvas.width = image.width; canvas.height = image.height;
    const context = canvas.getContext("2d")!; context.drawImage(image, 0, 0);
    const { data, width, height } = context.getImageData(0, 0, canvas.width, canvas.height);
    let grid = knownGrid;
    if (!grid) {
      let minX = width, maxX = -1, minY = height;
      // Locate Alden's blue garment in the flat baseline, excluding surrounding UI/scenery.
      for (let y = Math.max(0, height / 2 - 45); y < Math.min(height, height / 2 + 75); y++)
        for (let x = Math.max(0, width / 2 - 70); x < Math.min(width, width / 2 + 70); x++) {
          const i = (y * width + x) * 4, r = data[i]!, g = data[i + 1]!, b = data[i + 2]!;
          if (b > 25 && b > r * 1.25 && b > g * 1.2) { minX = Math.min(minX, x); maxX = Math.max(maxX, x); minY = Math.min(minY, y); }
        }
      if (maxX < minX) throw Error("No Alden garment found in the actual rendered baseline");
      grid = { left: minX, top: minY, pitch: (maxX - minX + 1) / 17 };
    }
    const sample = (relativeX: number, nativeY: number) => {
      const x = Math.round(grid!.left + relativeX * grid!.pitch), y = Math.round(grid!.top + (nativeY - 18 + .5) * grid!.pitch);
      let sum = 0, n = 0;
      for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
        const i = ((y + dy) * width + x + dx) * 4;
        sum += .2126 * data[i]! + .7152 * data[i + 1]! + .0722 * data[i + 2]!; n++;
      }
      return sum / n;
    };
    // These centers lie on the same flat skin pigment, away from eye marks and alpha edges.
    return { grid, left: sample(5.5, 14), right: sample(11.5, 14), top: sample(8.5, 14), bottom: sample(8.5, 18), center: sample(8.5, 16) };
  }, { base64: bytes.toString("base64"), knownGrid });
}
async function capture(page: Page, name: string, knownGrid?: Grid) {
  const marker = (await page.getByTestId("rpg-world").getByRole("button", { name: "Inspect Alden", exact: true }).boundingBox())!;
  const clip = { x: Math.round(marker.x + marker.width / 2 - 120), y: Math.round(marker.y + marker.height / 2 - 120), width: 240, height: 240 };
  await page.evaluate(() => document.documentElement.classList.add("sprite-lighting-review"));
  let bytes: Buffer;
  try { bytes = await page.screenshot({ path: `${output}/browser-${name}.png`, clip }); }
  finally { await page.evaluate(() => document.documentElement.classList.remove("sprite-lighting-review")); }
  return { clip, samples: await analyze(page, bytes, knownGrid) };
}

test("pixel sprite form normals follow world lights in both mirror states without self illumination", async ({ page }) => {
  await mkdir(output, { recursive: true });
  const errors: string[] = [], shaderErrors: string[] = [], external: string[] = [];
  page.on("pageerror", error => errors.push(error.message));
  page.on("console", message => { if (message.type() === "error" && /shader|WebGLProgram|VALIDATE_STATUS|GL_INVALID/i.test(message.text())) shaderErrors.push(message.text()); });
  page.on("request", request => { const url = new URL(request.url()); if (url.protocol.startsWith("http") && page.url().startsWith("http") && url.origin !== new URL(page.url()).origin) external.push(url.href); });
  await page.goto("./?renderer=3d");
  const world = page.getByTestId("rpg-world");
  await expect(world).toHaveAttribute("data-status", "ready", { timeout: 60000 });
  await expect(world).toHaveAttribute("data-sprite-normal-strength", "0.85");
  const gl = await page.getByTestId("three-canvas").evaluate(element => {
    const gl = (element as HTMLCanvasElement).getContext("webgl2")!;
    return { version: String(gl.getParameter(gl.VERSION)), lost: gl.isContextLost() };
  });
  expect(gl.version).toContain("WebGL 2"); expect(gl.lost).toBe(false);
  await restore(page, fixture());
  await page.getByRole("button", { name: "Day lighting", exact: true }).click();
  for (let i = 0; i < 5; i++) await page.getByRole("button", { name: "Zoom in", exact: true }).click();
  await expect(world).toHaveAttribute("data-billboard-mode", "screen-aligned");
  await expect(world).toHaveAttribute("data-sprite-frame", "0");
  await page.addStyleTag({ content: 'html.sprite-lighting-review main.rpg-shell > :not([data-testid="rpg-world"]):not(.game-world),html.sprite-lighting-review .three-light-controls,html.sprite-lighting-review .three-performance,html.sprite-lighting-review .three-test-note,html.sprite-lighting-review .tile-hit-layer{visibility:hidden!important}' });
  const before = await savedPlayer(page);
  await visual(page, { Bloom: 0, "Chromatic aberration": 0, "Depth of field": 0, Exposure: 1, "Sun brightness": 1.4, "Ambient brightness": .15, "Lamp brightness": 0 }, true);
  const pairs: Record<string, { flat: Awaited<ReturnType<typeof capture>>; depth: Awaited<ReturnType<typeof capture>>; horizontalGain: number; verticalGain: number }> = {};
  const directions = [{ name: "sun-left", azimuth: 144.6, elevation: 35 }, { name: "sun-right", azimuth: 324.6, elevation: 35 }, { name: "sun-low", azimuth: 54.6, elevation: 5 }, { name: "sun-high", azimuth: 54.6, elevation: 85 }];
  for (const direction of directions) {
    await visual(page, { "Sun direction": direction.azimuth, "Sun elevation": direction.elevation, "Sprite depth": 0 });
    const flat = await capture(page, direction.name + "-flat");
    expect(flat.samples.grid.pitch).toBeGreaterThan(2); expect(flat.samples.grid.pitch).toBeLessThan(10);
    await visual(page, { "Sprite depth": .85 });
    const depth = await capture(page, direction.name + "-depth", flat.samples.grid);
    const gain = (part: "left" | "right" | "top" | "bottom") => depth.samples[part] / Math.max(1, flat.samples[part]);
    pairs[direction.name] = { flat, depth, horizontalGain: gain("left") - gain("right"), verticalGain: gain("top") - gain("bottom") };
  }
  await writeFile(`${output}/browser-directional-metrics.json`, JSON.stringify(pairs, null, 2) + "\n");
  // Global brightness alone cannot satisfy these opposing within-skin spatial responses.
  expect(pairs["sun-left"]!.horizontalGain).toBeGreaterThan(.04);
  expect(pairs["sun-right"]!.horizontalGain).toBeLessThan(-.04);
  // Low front sunlight differs only modestly from the camera's elevated view;
  // require the correct lower-face response without demanding a large contrast.
  expect(pairs["sun-low"]!.verticalGain).toBeLessThan(-.01);
  expect(pairs["sun-high"]!.verticalGain).toBeGreaterThan(.02);
  await visual(page, { "Sun brightness": 0, "Ambient brightness": 0, "Lamp brightness": 0 });
  const dark = await capture(page, "no-environment-light", pairs["sun-high"]!.flat.samples.grid);
  for (const part of ["left", "right", "top", "bottom", "center"] as const) expect(dark.samples[part]).toBeLessThan(2);
  const after = await savedPlayer(page); expect(after).toEqual(before);

  const mirrored: Record<string, unknown> = {};
  for (const left of [true, false]) {
    const state = fixture(); state.control.waiting = false; state.control.source = "player";
    state.player.position = tile(left ? 46 : 44, 93); state.player.previousPosition = { ...state.player.position };
    state.player.path = [tile(45, 93)]; state.control.active = { type: "move", position: tile(45, 93) };
    await restore(page, state);
    await expect(world).toHaveAttribute("data-sprite-flip-x", String(left));
    await expect(world).toHaveAttribute("data-sprite-frame", "0", { timeout: 10000 });
    await visual(page, { "Sun brightness": 1.4, "Ambient brightness": .15, "Sun direction": 144.6, "Sun elevation": 35, "Sprite depth": 0 });
    const label = left ? "mirrored-left" : "mirrored-right", flat = await capture(page, label + "-flat");
    await visual(page, { "Sprite depth": .85 });
    const depth = await capture(page, label + "-depth", flat.samples.grid);
    const gain = depth.samples.left / Math.max(1, flat.samples.left) - depth.samples.right / Math.max(1, flat.samples.right);
    expect(gain).toBeGreaterThan(.04); mirrored[label] = { flat, depth, horizontalGain: gain };
  }
  await restore(page, fixture());
  await page.getByRole("button", { name: "Visual settings", exact: true }).click();
  const panel = page.getByRole("dialog", { name: "Visual settings" });
  await panel.getByRole("button", { name: "Reset visual settings", exact: true }).click();
  for (const name of ["Enable sun shadows", "Enable bounced light", "Enable ambient occlusion"]) await panel.getByRole("checkbox", { name, exact: true }).check();
  await panel.getByRole("button", { name: "Done", exact: true }).click();
  await page.getByRole("button", { name: "Day lighting", exact: true }).click();
  await capture(page, "day-context");
  await page.getByRole("button", { name: "Dusk lighting", exact: true }).click();
  await capture(page, "dusk-context");
  const warm = fixture(), furnace = objectById("oakrest-furnace")!;
  warm.player.position = tile(furnace.position.x - 1, furnace.position.y + 2); warm.player.previousPosition = { ...warm.player.position };
  await restore(page, warm);
  await capture(page, "warm-source-context");
  expect(errors).toEqual([]); expect(shaderErrors).toEqual([]); expect(external).toEqual([]);
  const diagnostics = await world.evaluate(element => ({ ...((element as HTMLElement).dataset) }));
  await writeFile(`${output}/browser-review.json`, JSON.stringify({ errors, shaderErrors, external, gl, pairs, mirrored, dark, diagnostics, simulationUnchangedByLighting: true, physicalPhoneTest: false, visualReviewPending: true }, null, 2) + "\n");
});

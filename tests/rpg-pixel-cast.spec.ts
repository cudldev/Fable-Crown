import { expect, test, type Page } from "@playwright/test";
import { mkdir, writeFile } from "node:fs/promises";
import { createRpg } from "../src/rpg/engine";
import { interactionTiles, objectById, tile, worldForState } from "../src/rpg/world";
import type { RpgState } from "../src/rpg/types";
import { ENEMIES } from "../src/rpg/content";
import { createHeldUnitSheet, createUnitSheet, UNIT_KINDS, unitKindForActor, unitKindForEnemy } from "../src/render/pixel-units";

const output = "docs/art-audit/pixel-cast-v3";
test.use({ viewport: { width: 1280, height: 800 }, actionTimeout: 15000 });
test.setTimeout(150000);

async function openMenu(page: Page) {
  if (!(await page.getByRole("button", { name: "Save on device" }).isVisible()))
    await page.getByRole("button", { name: "Open game menu" }).click();
}
async function closePanel(page: Page) {
  const close = page.getByRole("button", { name: "Close panel" });
  if (await close.isVisible()) await close.click();
}
async function restore(page: Page, state: RpgState) {
  await openMenu(page);
  await page.locator('input[type="file"]').setInputFiles({ name: "pixel-cast-fixture.json", mimeType: "application/json", buffer: Buffer.from(JSON.stringify(state)) });
  await expect(page.getByRole("status")).toContainText("Chronicle restored");
  await closePanel(page);
}
async function saved(page: Page): Promise<RpgState> {
  await openMenu(page);
  await page.getByRole("button", { name: "Save on device" }).click();
  await expect(page.getByRole("status")).toContainText("Chronicle saved");
  const state = await page.evaluate(() => new Promise<RpgState>((resolve, reject) => {
    const request = indexedDB.open("fable-crown", 1);
    request.onerror = () => reject(request.error);
    request.onsuccess = () => {
      const db = request.result, get = db.transaction("saves").objectStore("saves").get("v5");
      get.onsuccess = () => { resolve(get.result); db.close(); };
      get.onerror = () => { reject(get.error); db.close(); };
    };
  }));
  await closePanel(page);
  return state;
}
function fixture() {
  const state = createRpg(Date.now(), 8128);
  Object.assign(state.control, { waiting: true, goal: null, active: null, source: null, queue: [], thought: null, thinkingUntil: 1_000_000_000 });
  state.player.position = tile(52, 95); state.player.previousPosition = tile(52, 95);
  state.player.path = []; state.player.action = null; state.player.movement = null;
  // Retain every actor/enemy definition while bringing representative villagers into the close view.
  state.npcs.slice(0, 3).forEach((npc, i) => { npc.position = tile(49 + i * 3, 98); npc.previousPosition = { ...npc.position }; npc.path = []; npc.action = null; npc.movement = null; });
  return state;
}
function movingFixture(left: boolean) {
  const state = fixture(); state.control.waiting = false; state.control.source = "player";
  const start = left ? 52 : 48, end = left ? 48 : 52, step = left ? -1 : 1;
  state.player.position = tile(start, 95); state.player.previousPosition = { ...state.player.position };
  state.control.active = { type: "move", position: tile(end, 95) };
  state.player.path = Array.from({ length: 4 }, (_, i) => tile(start + step * (i + 1), 95));
  return state;
}
function watch(page: Page) {
  const errors: string[] = [], shaderErrors: string[] = [], external: string[] = [];
  page.on("pageerror", error => errors.push(error.message));
  page.on("console", message => { if (message.type() === "error" && /shader|WebGLProgram|VALIDATE_STATUS|GL_INVALID/i.test(message.text())) shaderErrors.push(message.text()); });
  page.on("request", request => {
    const url = new URL(request.url());
    if (url.protocol.startsWith("http") && page.url().startsWith("http") && url.origin !== new URL(page.url()).origin) external.push(url.href);
  });
  return { errors, shaderErrors, external };
}
async function expectAnimatedFrame(page: Page, low: number, high: number) {
  const world = page.getByTestId("rpg-world");
  await expect.poll(async () => {
    const frame = Number(await world.getAttribute("data-sprite-frame"));
    return frame >= low && frame <= high;
  }, { intervals: [50, 75, 100, 150], timeout: 10000 }).toBe(true);
}

test("full Three pixel cast draws, animates and responds to optional normals without changing gameplay", async ({ page, context }) => {
  await mkdir(output, { recursive: true });
  const observed = watch(page);
  await page.goto("./?renderer=3d");
  const world = page.getByTestId("rpg-world"), canvas = page.getByTestId("three-canvas");
  await expect(world).toHaveAttribute("data-status", "ready", { timeout: 60000 });
  const state = fixture(); await restore(page, state);
  await expect(world).toHaveAttribute("data-actor-style", "pixel-billboard");
  await expect(world).toHaveAttribute("data-character-rig", "billboard");
  await expect(world).toHaveAttribute("data-billboard-mode", "screen-aligned");
  await expect(world).toHaveAttribute("data-sprite-grid", "voxel");
  await expect(world).toHaveAttribute("data-sprite-cell-meters", "0.0625");
  const expectedCount = 1 + state.npcs.length + state.enemies.length + worldForState(state).objects.filter(object => object.kind === "quest").length;
  expect([...new Set(state.enemies.map(enemy => enemy.definitionId))].sort()).toEqual(Object.keys(ENEMIES).sort());
  const questRoles = worldForState(state).objects.filter(object => object.kind === "quest").map(object => object.questId === "forge" ? "smith" : object.questId === "supper" ? "cook" : "merchant");
  const families = [...new Set([unitKindForActor(state.player), ...state.npcs.map(unitKindForActor), ...state.enemies.map(enemy => unitKindForEnemy(enemy.definitionId)), ...questRoles])].sort();
  for (const family of families) expect(UNIT_KINDS).toContain(family);
  const sheets = UNIT_KINDS.map(kind => {
    const body = createUnitSheet(kind), held = createHeldUnitSheet(kind, 0, "sword");
    expect([held.frameSize, held.footX, held.footY]).toEqual([body.frameSize, body.footX, body.footY]);
    expect(held.normal.length).toBe(held.rgba.length);
    return { kind, bodyHeightCells: body.bodyHeight, worldHeightMeters: body.bodyHeight * .0625, frameSize: body.frameSize, foot: [body.footX, body.footY] };
  });
  await expect(world).toHaveAttribute("data-billboard-count", String(expectedCount));
  await expect.poll(async () => Number(await world.getAttribute("data-draw-calls"))).toBeGreaterThan(0);
  const gl = await canvas.evaluate(element => {
    const gl = (element as HTMLCanvasElement).getContext("webgl2");
    return { version: gl?.getParameter(gl.VERSION) as string, lost: gl?.isContextLost() };
  });
  expect(gl.lost).toBe(false); expect(gl.version).toContain("WebGL 2");
  const player = world.getByRole("button", { name: "Inspect Alden", exact: true });
  await expect(player).toBeVisible();
  await page.getByRole("button", { name: "Day lighting", exact: true }).click();
  const canvasBox = (await canvas.boundingBox())!;
  await page.mouse.move(canvasBox.x + canvasBox.width / 2, canvasBox.y + canvasBox.height / 2);
  await page.mouse.wheel(0, -350);
  await expectAnimatedFrame(page, 0, 0);
  await page.screenshot({ path: output + "/browser-day.png" });
  const before = await saved(page);
  const spriteBox = (await player.boundingBox())!;
  const normalClip = { x: spriteBox.x, y: spriteBox.y, width: spriteBox.width, height: spriteBox.height };
  await page.getByRole("button", { name: "Visual settings", exact: true }).click();
  const panel = page.getByRole("dialog", { name: "Visual settings" }), depth = panel.getByRole("slider", { name: "Sprite depth", exact: true });
  await depth.fill("0"); await expect(world).toHaveAttribute("data-sprite-normal-strength", "0");
  await panel.getByRole("button", { name: "Done", exact: true }).click();
  const flat = await page.screenshot({ path: output + "/browser-depth-flat.png", clip: normalClip });
  await page.getByRole("button", { name: "Visual settings", exact: true }).click();
  await depth.fill("0.8"); await expect(world).toHaveAttribute("data-sprite-normal-strength", "0.8");
  await panel.getByRole("button", { name: "Done", exact: true }).click();
  const raised = await page.screenshot({ path: output + "/browser-depth-raised.png", clip: normalClip });
  expect(flat.equals(raised)).toBe(false); // Compare the sprite region, excluding changing FPS/UI text. Not a photometric benchmark.
  const after = await saved(page);
  expect(after.player.position).toEqual(before.player.position);
  expect(after.player.inventory).toEqual(before.player.inventory);
  expect(after.player.skills).toEqual(before.player.skills);
  const yaw = Number(await world.getAttribute("data-billboard-yaw"));
  await page.getByRole("button", { name: "Orthographic camera", exact: true }).click();
  await expect(world).toHaveAttribute("data-camera-mode", "orthographic");
  expect(Number(await world.getAttribute("data-billboard-yaw"))).toBeCloseTo(yaw, 3);

  await restore(page, movingFixture(true));
  await expectAnimatedFrame(page, 1, 4);
  await expect(world).toHaveAttribute("data-sprite-flip-x", "true");
  expect(Number(await world.getAttribute("data-billboard-yaw"))).toBeCloseTo(yaw, 3);
  await restore(page, movingFixture(false));
  await expectAnimatedFrame(page, 1, 4);
  await expect(world).toHaveAttribute("data-sprite-flip-x", "false");

  const working = fixture(), tree = objectById("oakrest-tree-0")!;
  working.player.position = { ...interactionTiles(tree)[0]! }; working.player.previousPosition = { ...working.player.position };
  await restore(page, working);
  await world.locator(`[data-three-selection*="${tree.id}"]`).press("Shift+F10");

  await page.getByRole("menuitem", { name: "More options", exact: true }).click();
  await page.getByText("Single action or queued order", { exact: true }).click();
  await page.getByRole("button", { name: "Do now", exact: true }).click();
  await closePanel(page); await expectAnimatedFrame(page, 5, 7);
  await page.screenshot({ path: output + "/browser-work.png" });
  await restore(page, fixture());
  await page.getByRole("button", { name: "Dusk lighting", exact: true }).click();
  await page.screenshot({ path: output + "/browser-dusk.png" });
  const wildlife = fixture(); wildlife.player.position = tile(64, 112); wildlife.player.previousPosition = { ...wildlife.player.position };
  await restore(page, wildlife);
  await page.getByRole("button", { name: "Day lighting", exact: true }).click();
  await page.screenshot({ path: output + "/browser-enemy.png" });
  const quest = worldForState(state).objects.find(object => object.kind === "quest" && object.questId === "forge")!;
  const questState = fixture(); questState.player.position = tile(quest.position.x - 2, quest.position.y + 1); questState.player.previousPosition = { ...questState.player.position };
  await restore(page, questState);
  await page.screenshot({ path: output + "/browser-quest.png" });
  await restore(page, fixture());
  for (const size of [{ width: 390, height: 844 }, { width: 844, height: 390 }]) {
    await page.setViewportSize(size); await expect(player).toBeVisible();
    await page.screenshot({ path: output + (size.width === 390 ? "/browser-portrait.png" : "/browser-landscape.png") });
  }
  await saved(page);
  await page.waitForFunction(async () => !!(await navigator.serviceWorker.getRegistration())?.active, null, { timeout: 20000 });
  await context.setOffline(true);
  try {
    await page.reload({ waitUntil: "domcontentloaded" });
    await expect(world).toHaveAttribute("data-status", "ready", { timeout: 60000 });
    await expect(world).toHaveAttribute("data-actor-style", "pixel-billboard");
    await expect(world).toHaveAttribute("data-character-rig", "billboard");
  } finally { await context.setOffline(false); }
  expect(observed.errors).toEqual([]); expect(observed.shaderErrors).toEqual([]); expect(observed.external).toEqual([]);
  await writeFile(output + "/browser-three-review.json", JSON.stringify({ ...observed, expectedCount, families, sheets, gl, billboardYaw: yaw, spriteCellMeters: .0625, normalControlChangesPixels: true, normalControlPreservesGameplay: true, walkFrames: true, horizontalFlip: true, workFrames: true, offlineReload: true, physicalPhoneTest: false }, null, 2) + "\n");
});

test("Alden style checkpoint shows the native pixel sprite clearly in the voxel world", async ({ page }) => {
  await mkdir(output, { recursive: true }); const observed = watch(page);
  await page.goto("./?renderer=3d");
  const world = page.getByTestId("rpg-world"), canvas = page.getByTestId("three-canvas");
  await expect(world).toHaveAttribute("data-status", "ready", { timeout: 60000 });
  const state = fixture(), positions = worldForState(state).spawns;
  state.player.position = tile(45, 93); state.player.previousPosition = { ...state.player.position };
  // The starting sword remains equipped once; move the shield into this review fixture's bag.
  state.player.equipment = { weapon: "bronze-sword", cape: "prince-cape" };
  state.player.inventory.push({ itemId: "bronze-shield", quantity: 1 });
  state.npcs.forEach((npc, index) => {
    npc.position = { ...positions[8 + index % 16]! }; npc.previousPosition = { ...npc.position };
    npc.path = []; npc.action = null; npc.movement = null;
  });
  await restore(page, state);
  await page.getByRole("button", { name: "Day lighting", exact: true }).click();
  await page.getByRole("button", { name: "Visual settings", exact: true }).click();
  const visualPanel = page.getByRole("dialog", { name: "Visual settings" });
  await visualPanel.getByRole("slider", { name: "Sprite depth", exact: true }).fill("0");
  await visualPanel.getByRole("button", { name: "Done", exact: true }).click();
  await expect(world).toHaveAttribute("data-sprite-normal-strength", "0");
  for (let i = 0; i < 5; i++) await page.getByRole("button", { name: "Zoom in", exact: true }).click();
  await expect(world).toHaveAttribute("data-character-rig", "billboard");
  await expect(world).toHaveAttribute("data-billboard-mode", "screen-aligned");
  await expectAnimatedFrame(page, 0, 0);
  const player = world.getByRole("button", { name: "Inspect Alden", exact: true });
  await expect(player).toBeVisible();
  const marker = await player.boundingBox(), worldBox = (await canvas.boundingBox())!;
  const diagnostics = await world.evaluate(element => ({ ...((element as HTMLElement).dataset) }));
  // This review capture hides chrome only; the actual world and sprite shader are unchanged.
  await page.locator('main.rpg-shell > :not([data-testid="rpg-world"]):not(.game-world)').evaluateAll(elements => elements.forEach(element => { (element as HTMLElement).style.visibility = "hidden"; }));
  await world.locator(".three-light-controls,.tile-hit-layer,.three-performance,.three-test-note").evaluateAll(elements => elements.forEach(element => { (element as HTMLElement).style.visibility = "hidden"; }));
  await page.screenshot({ path: output + "/browser-alden-world.png" });
  const centerX = marker ? marker.x + marker.width / 2 : worldBox.x + worldBox.width / 2;
  const centerY = marker ? marker.y + marker.height / 2 : worldBox.y + worldBox.height / 2;
  const clip = { x: Math.max(0, centerX - 180), y: Math.max(0, centerY - 180), width: 360, height: 360 };
  await page.screenshot({ path: output + "/browser-alden-close.png", clip });
  expect(observed.errors).toEqual([]); expect(observed.shaderErrors).toEqual([]); expect(observed.external).toEqual([]);
  await writeFile(output + "/browser-alden-checkpoint.json", JSON.stringify({ diagnostics, marker, clip, observed, equipment: state.player.equipment, normalStrength: 0, visualReviewPending: true, simulationFrozenPlayerOnly: true, physicalPhoneTest: false }, null, 2) + "\n");
});

test("unobstructed work contact keeps the pickaxe on Alden's shared cell grid", async ({ page }) => {
  await mkdir(output, { recursive: true }); const observed = watch(page);
  await page.goto("./?renderer=3d");
  const world = page.getByTestId("rpg-world");
  await expect(world).toHaveAttribute("data-status", "ready", { timeout: 60000 });
  const state = fixture(), ore = objectById("oakrest-ore-0")!;
  state.player.position = tile(ore.position.x - 1, ore.position.y + 1);
  state.player.previousPosition = { ...state.player.position };
  await restore(page, state);
  await page.getByRole("button", { name: "Day lighting", exact: true }).click();
  for (let i = 0; i < 5; i++) await page.getByRole("button", { name: "Zoom in", exact: true }).click();
  await world.locator(`[data-three-selection*="${ore.id}"]`).press("Shift+F10");

  await page.getByRole("menuitem", { name: "More options", exact: true }).click();
  await page.getByText("Single action or queued order", { exact: true }).click();
  await page.getByRole("button", { name: "Do now", exact: true }).click();
  await closePanel(page);
  await expectAnimatedFrame(page, 6, 6);
  const marker = (await world.getByRole("button", { name: "Inspect Alden", exact: true }).boundingBox())!;
  const clip = { x: marker.x + marker.width / 2 - 180, y: marker.y + marker.height / 2 - 180, width: 360, height: 360 };
  await page.locator('main.rpg-shell > :not([data-testid="rpg-world"]):not(.game-world)').evaluateAll(elements => elements.forEach(element => { (element as HTMLElement).style.visibility = "hidden"; }));
  await world.locator(".three-light-controls,.tile-hit-layer,.three-performance,.three-test-note").evaluateAll(elements => elements.forEach(element => { (element as HTMLElement).style.visibility = "hidden"; }));
  await page.screenshot({ path: output + "/browser-work-contact-close.png", clip });
  expect(observed.errors).toEqual([]); expect(observed.shaderErrors).toEqual([]); expect(observed.external).toEqual([]);
  await writeFile(output + "/browser-work-contact-review.json", JSON.stringify({ observed, objectId: ore.id, frameObserved: 6, clip, actualLegalOrder: true, physicalPhoneTest: false }, null, 2) + "\n");
});

// Isolated review: serve the local candidate at the existing fixture request.
// No public/default asset replacement and no service-worker cache mutation.
import { chromium } from "@playwright/test";
import { readFile, mkdir, writeFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import { resolve } from "node:path";
const base = process.env.DEMO_URL || "http://127.0.0.1:4174/Fable-Crown/";
const file = resolve("assets/source/3d/triposg-alden-painted-v1/alden-triposg-candidate.glb");
const bytes = await readFile(file), output = resolve("docs/art-audit/triposg-alden-browser-v1");
await mkdir(output, { recursive: true });
const browser = await chromium.launch({ channel: "chrome", headless: true });
const context = await browser.newContext({ viewport: { width: 1280, height: 900 }, serviceWorkers: "block" });
const page = await context.newPage(), errors = [], external = [], checks = [];
page.on("pageerror", error => errors.push(error.message));
page.on("request", request => { if (new URL(request.url()).origin !== new URL(base).origin) external.push(request.url()); });
let interceptions = 0;
await page.route("**/art3d/fitted/alden-fitted.glb", async route => { interceptions++; await route.fulfill({ status: 200, contentType: "model/gltf-binary", body: bytes }); });
try {
  await page.goto(new URL("?renderer=3d&assetReview=1&character=fitted", base).href);
  const review = page.getByTestId("asset-review");
  await review.waitFor({ state: "visible", timeout: 30000 });
  await page.waitForFunction(() => document.querySelector('[data-testid="asset-review"]')?.getAttribute("data-character-ready") === "true", null, { timeout: 30000 });
  for (const clip of ["idle", "walk", "gather", "tool_use"]) {
    await page.getByRole("combobox", { name: "Character animation" }).selectOption(clip);
    await page.waitForTimeout(220);
    if (await review.getAttribute("data-character-clip") !== clip) throw Error("Clip selection failed: " + clip);
    await page.screenshot({ path: resolve(output, `candidate-${clip}.png`) }); checks.push(`workbench ${clip}`);
  }
  for (const viewport of [{ width: 390, height: 844 }, { width: 844, height: 390 }]) {
    await page.setViewportSize(viewport);
    await page.screenshot({ path: resolve(output, `candidate-${viewport.width}x${viewport.height}.png`) });
    checks.push(`workbench ${viewport.width}x${viewport.height}`);
  }
  await page.setViewportSize({ width: 1280, height: 720 });
  await page.goto(new URL("?renderer=3d&character=fitted", base).href);
  await page.waitForFunction(() => document.querySelector('[data-testid="rpg-world"]')?.getAttribute("data-character-ready") === "true", null, { timeout: 30000 });
  await page.screenshot({ path: resolve(output, "candidate-game-camera.png") }); checks.push("actual game controller");
  if (errors.length || external.length || interceptions < 2) throw Error(JSON.stringify({ errors, external, interceptions }));
  const report = { candidate: file, sha256: createHash("sha256").update(bytes).digest("hex"), bytes: bytes.length,
    base, method: "Playwright request fulfilment of local candidate; current public fixture unchanged", checks, interceptions,
    pageErrors: errors, externalRequests: external, offlineCandidateTested: false, artAccepted: false };
  await writeFile(resolve(output, "browser-review.json"), JSON.stringify(report, null, 2) + "\n");
  console.log(JSON.stringify(report, null, 2));
} finally { await context.close(); await browser.close(); }

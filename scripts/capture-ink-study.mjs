// Actual GLB images for visual review; generated concept art is not used here.
import { chromium } from "@playwright/test";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
const args = process.argv.slice(2), index = args.indexOf("--url");
const url = new URL(index < 0 ? process.env.DEMO_URL || "http://127.0.0.1:4174/Fable-Crown/" : args[index + 1]);
url.searchParams.set("renderer", "3d"); url.searchParams.set("assetReview", "1"); url.searchParams.set("character", "ink");
const output = path.resolve("docs/art-audit/ink-study"); await mkdir(output, { recursive: true });
const browser = await chromium.launch({ channel: process.env.CI ? undefined : "chrome", headless: true });
try {
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1 });
  const errors = [], external = [];
  page.on("pageerror", error => errors.push(error.message));
  page.on("console", message => { if (message.type() === "error") errors.push(message.text()); });
  page.on("request", request => { if (/^https?:/.test(request.url()) && new URL(request.url()).origin !== url.origin) external.push(request.url()); });
  await page.goto(url.href);
  await page.waitForFunction(() => {
    const root = document.querySelector('[data-testid="asset-review"]');
    return root?.dataset.status === "ready" && root.dataset.characterStyle === "ink" && Number(root.dataset.drawCalls) > 0;
  }, undefined, { timeout: 30000 });
  await page.getByLabel("Preview model").selectOption("alden");
  await page.getByRole("button", { name: "Day lighting", exact: true }).click();
  const shot = async name => { await page.waitForTimeout(150); await page.screenshot({ path: path.join(output, `${name}.png`) }); };
  const left = async (count = 1) => { for (let i = 0; i < count; i++) await page.getByRole("button", { name: "Rotate preview left", exact: true }).click(); };
  const right = async (count = 1) => { for (let i = 0; i < count; i++) await page.getByRole("button", { name: "Rotate preview right", exact: true }).click(); };
  await shot("three-quarter"); await left(); await shot("front"); await right(2); await shot("side"); await right(2); await shot("back");
  await left(3); await page.getByRole("button", { name: "Walk animation preview", exact: true }).click(); await shot("walk");
  await page.getByRole("button", { name: "Walk animation preview", exact: true }).click();
  await page.getByRole("button", { name: "Game-scale preview", exact: true }).click(); await shot("game-scale");
  await page.getByRole("button", { name: "Game-scale preview", exact: true }).click();
  for (const [name, viewport] of [["portrait", { width: 390, height: 844 }], ["landscape", { width: 844, height: 390 }]]) {
    await page.setViewportSize(viewport); await shot(name);
  }
  if (errors.length || external.length) throw Error(JSON.stringify({ errors, external }));
  await writeFile(path.join(output, "capture.json"), JSON.stringify({ url: url.href, browser: await browser.version(), viewport: "1440x900 DPR1;390x844;844x390", source: "exported GLB", errors, external }, null, 2) + "\n");
  console.log(`Actual ink-character review images: ${output}`);
} finally { await browser.close(); }

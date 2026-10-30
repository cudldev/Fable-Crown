// Repeatable image evidence from exported assets in the actual browser renderer.
import { chromium } from "@playwright/test";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
const args = process.argv.slice(2);
const option = (name, fallback) => { const index = args.indexOf(name); return index < 0 ? fallback : args[index + 1]; };
const tag = option("--tag", "current");
if (!/^[a-z0-9-]+$/.test(tag)) throw Error("Use a simple lowercase review tag.");
const url = new URL(option("--url", process.env.DEMO_URL || "http://127.0.0.1:5173/Fable-Crown/"));
url.searchParams.set("renderer", "3d"); url.searchParams.set("assetReview", "1");
const output = path.resolve("docs", "art-audit", `three-${tag}`);
await mkdir(output, { recursive: true });
const browser = await chromium.launch({ channel: process.env.CI ? undefined : "chrome", headless: true });
try {
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1 });
  const errors = [], external = [];
  page.on("pageerror", error => errors.push(error.message));
  page.on("request", request => { const target = new URL(request.url()); if (/^https?:$/.test(target.protocol) && target.origin !== url.origin) external.push(target.href); });
  await page.goto(url.href);
  const root = page.getByTestId("asset-review");
  await page.waitForFunction(() => document.querySelector('[data-testid="asset-review"]')?.dataset.status === "ready", { timeout: 30000 });
  if (await root.getAttribute("data-assets") !== "blender") throw Error("Review must show exported Blender models, not fallback placeholders.");
  const shot = async name => { await page.waitForTimeout(120); await page.screenshot({ path: path.join(output, `${name}.png`) }); };
  const select = id => page.getByLabel("Preview model").selectOption(id);
  await shot("village-dusk");
  await page.getByRole("button", { name: "Orthographic camera", exact: true }).click(); await shot("village-ortho");
  await page.getByRole("button", { name: "Perspective camera", exact: true }).click();
  await page.getByRole("button", { name: "Day lighting", exact: true }).click();
  await select("alden"); await shot("alden-three-quarter");
  await page.getByRole("button", { name: "Rotate preview left" }).click(); await shot("alden-front");
  for (let i = 0; i < 2; i++) await page.getByRole("button", { name: "Rotate preview right" }).click();
  await shot("alden-side");
  for (let i = 0; i < 2; i++) await page.getByRole("button", { name: "Rotate preview right" }).click();
  await shot("alden-back");
  await page.getByRole("button", { name: "Walk animation preview" }).click(); await shot("alden-walk");
  await page.getByRole("button", { name: "Walk animation preview" }).click();
  for (let i = 0; i < 3; i++) await page.getByRole("button", { name: "Rotate preview left" }).click();
  for (const id of ["bank", "forge", "tree", "anvil", "crate", "lantern"]) { await select(id); await shot(id); }
  await select("bank"); await page.getByRole("button", { name: "Show roofs" }).click(); await shot("bank-cutaway");
  await page.getByRole("button", { name: "Show roofs" }).click(); await select("village");
  await page.getByRole("button", { name: "Night lighting", exact: true }).click(); await shot("village-night");
  await page.getByRole("button", { name: "Dusk lighting", exact: true }).click();
  await page.setViewportSize({ width: 390, height: 844 }); await shot("village-phone");
  if (errors.length || external.length) throw Error(JSON.stringify({ errors, external }));
  await writeFile(path.join(output, "capture.json"), JSON.stringify({ url: url.href, browser: await browser.version(), viewport: "1440x900 DPR1, phone390x844", models: await root.getAttribute("data-production-assets"), errors, external }, null, 2) + "\n");
  console.log(`Art review images: ${output}`);
} finally { await browser.close(); }

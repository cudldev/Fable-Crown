import { test, expect } from "@playwright/test";
import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { resolve, sep } from "node:path";
import type { AddressInfo } from "node:net";

test("PWA installation refreshes stale HTTP-cached shell and manifest before clearing the old installation", async ({ browser }) => {
  const root = resolve("dist"), assets = JSON.parse(await readFile(resolve(root, "world-assets.json"), "utf8"));
  const current = await readFile(resolve(root, "sw.js"), "utf8"), previousVersion = "previous-bake-fixture";
  const previous = current.replaceAll(assets.version, previousVersion).replace("c.addAll(fresh(FILES))", "c.addAll(FILES)").replace("c.addAll(fresh(CORE))", "c.addAll(CORE)");
  let upgraded = false;
  const server = createServer(async (request, response) => {
    try {
      const url = new URL(request.url!, "http://localhost");
      response.setHeader("Cache-Control", url.pathname === "/sw.js" ? "no-store" : "public, max-age=3600");
      if (url.pathname === "/sw.js") { response.setHeader("Content-Type", "text/javascript"); response.end(upgraded ? current : previous); return; }
      if (["/", "/index.html", "/probe.html"].includes(url.pathname)) {
        response.setHeader("Content-Type", "text/html"); response.end(`<!doctype html><title>${upgraded ? "new-shell" : "old-shell"}</title><p>Upgrade fixture</p>`); return;
      }
      if (url.pathname === "/world-assets.json") { response.setHeader("Content-Type", "application/json"); response.end(JSON.stringify({ ...assets, version: upgraded ? assets.version : previousVersion })); return; }
      const file = resolve(root, "." + url.pathname);
      if (!file.startsWith(root + sep)) { response.writeHead(403).end(); return; }
      response.end(await readFile(file));
    } catch { response.writeHead(404).end(); }
  });
  await new Promise<void>(ready => server.listen(0, "127.0.0.1", ready));
  const origin = `http://127.0.0.1:${(server.address() as AddressInfo).port}`, context = await browser.newContext();
  try {
    const page = await context.newPage();
    page.on("requestfailed", request => console.log("PWA fixture request failed", request.url(), request.failure()?.errorText));
    await page.goto(origin + "/probe.html");
    // Prime ordinary HTTP cache before a worker can intercept these requests.
    await page.evaluate(async () => { for (const url of ["./", "index.html", "world-assets.json"]) await (await fetch(url)).text(); });
    await page.evaluate(async () => { await navigator.serviceWorker.register("/sw.js"); await navigator.serviceWorker.ready; });
    await expect.poll(() => page.evaluate(() => !!navigator.serviceWorker.controller)).toBe(true);
    expect(await page.evaluate(async () => (await (await fetch("world-assets.json")).json()).version)).toBe(previousVersion);
    upgraded = true;
    await page.evaluate(async () => { await (await navigator.serviceWorker.ready).update(); });
    const names = ["fable-v3-" + assets.version, "fable-art-" + assets.version].sort();
    await expect.poll(() => page.evaluate(async () => (await caches.keys()).sort()), { timeout: 30000 }).toEqual(names);
    const installed = await page.evaluate(async version => {
      const cache = await caches.open("fable-v3-" + version);
      return { manifest: await (await cache.match("/world-assets.json"))!.json(),
        index: await (await cache.match("/index.html"))!.text(), root: await (await cache.match("/"))!.text() };
    }, assets.version);
    expect(installed.manifest.version).toBe(assets.version); expect(installed.index).toContain("new-shell"); expect(installed.root).toContain("new-shell");
    await context.setOffline(true); await page.goto(origin + "/index.html"); await expect(page).toHaveTitle("new-shell");
  } finally { await context.close(); server.closeAllConnections(); await new Promise<void>(done => server.close(() => done())); }
});

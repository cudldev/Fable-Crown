import { chromium, expect } from '@playwright/test';
import { mkdir, readFile, writeFile } from 'node:fs/promises';

const base = 'https://cudldev.github.io/Fable-Crown/';
const builtDir = process.env.RELEASE_DIST || 'dist';
const baselinePath = process.env.UPGRADE_BASELINE || 'tmp/live-upgrade-baseline.json';
await mkdir('tmp', { recursive: true });
const context = await chromium.launchPersistentContext(process.env.UPGRADE_PROFILE || 'tmp/live-upgrade-profile', {
  channel: 'chrome', headless: true, viewport: { width: 1280, height: 800 },
});
const readSave = page => page.evaluate(() => new Promise((resolve, reject) => {
  const open = indexedDB.open('fable-crown', 1);
  open.onerror = () => reject(open.error);
  open.onsuccess = () => {
    const db = open.result;
    const get = db.transaction('saves').objectStore('saves').get('v5');
    get.onerror = () => reject(get.error);
    get.onsuccess = () => { resolve(get.result); db.close(); };
  };
}));
try {
  const page = context.pages()[0];
  if (process.argv.includes('--before') && process.env.BASELINE_OFFLINE === '1') await context.setOffline(true);
  await page.goto(base, { waitUntil: 'domcontentloaded' });
  if (process.argv.includes('--before')) {
    await expect(page.getByRole('button', { name: 'Open game menu', exact: true })).toBeVisible({ timeout: 60000 });
    const pause = page.getByRole('button', { name: 'Pause Alden', exact: true });
    if (await pause.isVisible()) await pause.click();
    await page.evaluate(() => window.dispatchEvent(new Event('pagehide')));
    await page.getByRole('button', { name: 'Open game menu', exact: true }).click();
    await page.getByRole('button', { name: 'Save on device', exact: true }).click();
    await expect(page.getByRole('status')).toContainText('Chronicle saved');
    const state = await readSave(page);
    // Pause through the actual game command, so pagehide cannot overwrite a fixture.
    expect(state.control.waiting).toBe(true);
    await expect.poll(() => page.evaluate(() => Boolean(navigator.serviceWorker.controller)), { timeout: 60000 }).toBe(true);
    const cacheKeys = await page.evaluate(() => caches.keys());
    await writeFile(baselinePath, JSON.stringify({ state, cacheKeys }, null, 2));
    console.log(JSON.stringify({ baseline: true, tick: state.tick, cacheKeys }));
  } else {
    const before = JSON.parse(await readFile(baselinePath, 'utf8'));
    await page.evaluate(async () => {
      const registration = await navigator.serviceWorker.ready;
      void registration.update().catch(() => {});
    });
    console.log("Upgrade: checking installed cache and activation.");
    const localAssets = JSON.parse(await readFile(builtDir + '/world-assets.json', 'utf8'));
    const response = await context.request.get(base + 'world-assets.json?release=' + Date.now());
    expect(response.ok()).toBe(true);
    const expected = await response.json();
    expect(expected.files).toEqual(localAssets.files);
    await expect.poll(() => page.evaluate(() => caches.keys()), { timeout: 120000 }).toContain('fable-art-' + expected.version);
    // Opening a cache precedes addAll and activation; wait for the real swap.
    await page.waitForFunction(async () => {
      const registration = await navigator.serviceWorker.ready;
      return !registration.installing && !registration.waiting && registration.active?.state === 'activated';
    }, null, { timeout: 120000 });
    await page.reload({ waitUntil: 'domcontentloaded' });
    const world = page.getByTestId('rpg-world');
    await expect(world).toHaveAttribute('data-status', 'ready', { timeout: 60000 });
    await expect(world).toHaveAttribute('data-terrain-source', 'vox', { timeout: 60000 });
    const after = await readSave(page);
    expect(after.player.inventory).toEqual(before.state.player.inventory);
    expect(after.player.skills).toEqual(before.state.player.skills);
    expect(after.player.equipment).toEqual(before.state.player.equipment);
    const cacheKeys = await page.evaluate(() => caches.keys());
    expect(cacheKeys.filter(k => k.startsWith('fable-')).sort()).toEqual(['fable-art-' + expected.version, 'fable-v3-' + expected.version].sort());
    await context.setOffline(true);
    await page.reload({ waitUntil: 'domcontentloaded' });
    await expect(world).toHaveAttribute('data-status', 'ready', { timeout: 60000 });
    await expect(world).toHaveAttribute('data-terrain-source', 'vox');
    const report = { url: base, cachedPreviousReleaseUpgrade: true, inventorySkillsEquipmentPreserved: true, offlineReload: true, oldCachesRemoved: true, cacheKeys, verifiedAt: new Date().toISOString() };
    await writeFile('docs/LIVE_UPGRADE_VERIFICATION.json', JSON.stringify(report, null, 2) + '\n');
    console.log(JSON.stringify(report));
  }
} finally { await context.close(); }

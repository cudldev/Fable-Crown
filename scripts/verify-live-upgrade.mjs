import { chromium, expect } from '@playwright/test';
import { mkdir, readFile, writeFile } from 'node:fs/promises';

const base = 'https://cudldev.github.io/Fable-Crown/';
const baselinePath = 'tmp/live-upgrade-baseline.json';
await mkdir('tmp', { recursive: true });
const context = await chromium.launchPersistentContext('tmp/live-upgrade-profile', {
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
  await page.goto(base, { waitUntil: 'domcontentloaded' });
  if (process.argv.includes('--before')) {
    await expect(page.getByRole('button', { name: 'Open game menu', exact: true })).toBeVisible({ timeout: 60000 });
    await page.getByRole('button', { name: 'Open game menu', exact: true }).click();
    const pause = page.getByRole('button', { name: 'Pause simulation', exact: true });
    if (await pause.isVisible()) await pause.click();
    await page.getByRole('button', { name: 'Save on device', exact: true }).click();
    await expect(page.getByRole('status')).toContainText('Chronicle saved');
    const state = await readSave(page);
    // Hold this isolated test profile so offline gameplay cannot spend its belongings.
    Object.assign(state.control, { waiting: true, goal: null, active: null, queue: [], thought: null, thinkingUntil: 1e9 });
    state.player.path = []; state.player.action = null; state.player.movement = null;
    state.savedAt = Date.now();
    await page.evaluate(state => new Promise((resolve, reject) => {
      const open = indexedDB.open('fable-crown', 1);
      open.onsuccess = () => {
        const db = open.result, tx = db.transaction('saves', 'readwrite');
        tx.objectStore('saves').put(state, 'v5');
        tx.oncomplete = () => { db.close(); resolve(); };
        tx.onerror = () => reject(tx.error);
      };
    }), state);
    await expect.poll(() => page.evaluate(() => Boolean(navigator.serviceWorker.controller)), { timeout: 60000 }).toBe(true);
    const cacheKeys = await page.evaluate(() => caches.keys());
    await writeFile(baselinePath, JSON.stringify({ state, cacheKeys }, null, 2));
    console.log(JSON.stringify({ baseline: true, tick: state.tick, cacheKeys }));
  } else {
    const before = JSON.parse(await readFile(baselinePath, 'utf8'));
    await page.evaluate(async () => (await navigator.serviceWorker.ready).update());
    const localAssets = JSON.parse(await readFile('dist/world-assets.json', 'utf8'));
    const response = await context.request.get(base + 'world-assets.json?release=' + Date.now());
    expect(response.ok()).toBe(true);
    const expected = await response.json();
    expect(expected.files).toEqual(localAssets.files);
    await expect.poll(() => page.evaluate(() => caches.keys()), { timeout: 120000 }).toContain('fable-art-' + expected.version);
    await page.reload({ waitUntil: 'domcontentloaded' });
    const world = page.getByTestId('rpg-world');
    await expect(world).toHaveAttribute('data-status', 'ready', { timeout: 60000 });
    await expect(world).toHaveAttribute('data-terrain-source', 'vox');
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

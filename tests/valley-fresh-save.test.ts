import { afterEach, describe, expect, it, vi } from "vitest";
import { createRpg } from "../src/rpg/engine";
import { addItems, itemCount } from "../src/rpg/inventory";
import type { ValleySave } from "../src/valley/contracts";

const NOW = Date.UTC(2026, 10, 1, 12);
function database(entries: [string, unknown][] = []) {
  const values = new Map(entries.map(([key, value]) => [key, structuredClone(value)]));
  const reads: string[] = [], writes: string[] = [];
  const db = {
    objectStoreNames: { contains: () => true },
    transaction: () => {
      const transaction = {
        oncomplete: undefined as (() => void) | undefined,
        onerror: undefined as (() => void) | undefined,
        objectStore: () => ({
          get: (key: string) => {
            reads.push(key);
            const request = { result: structuredClone(values.get(key)), onsuccess: undefined as (() => void) | undefined, onerror: undefined as (() => void) | undefined };
            queueMicrotask(() => request.onsuccess?.());
            return request;
          },
          put: (value: unknown, key: string) => { writes.push(key); values.set(key, structuredClone(value)); },
        }),
      };
      queueMicrotask(() => transaction.oncomplete?.());
      return transaction;
    },
  };
  vi.stubGlobal("indexedDB", {
    open: () => {
      const request = { result: db, onsuccess: undefined as (() => void) | undefined, onerror: undefined as (() => void) | undefined };
      queueMicrotask(() => request.onsuccess?.());
      return request;
    },
  });
  return { values, reads, writes };
}
async function api() { vi.resetModules(); return import("../src/valley/save"); }
function archives(beta: ValleySave): [string, unknown][] {
  const old = createRpg(NOW, 42);
  addItems(old.bank, "coins", 999, Infinity);
  Object.assign(old.quests.forge, { accepted: true, complete: true, stageId: "complete" });
  const priorBeta = structuredClone(beta);
  priorBeta.chapter.bank = [{ itemId: "logs", quantity: 120 }];
  priorBeta.valley.goal = "Old beta reward";
  return [["v3", { ...old, version: 3 }], ["v4", { ...old, version: 4 }], ["v5", old], ["v6", { ...priorBeta, version: 6 }]];
}
afterEach(() => vi.unstubAllGlobals());

describe("fresh valley save boundary", () => {
  it("starts version 7 with 25 coins and no old rewards without reading v3–v6 keys", async () => {
    const saveApi = await api(), old = archives(saveApi.createValleySave(NOW));
    const storage = database(old), before = structuredClone(old);
    const fresh = await saveApi.readValleySave(NOW);
    expect(fresh.version).toBe(7);
    expect(itemCount(fresh.chapter.player.inventory, "coins")).toBe(25);
    expect(fresh.chapter.bank).toEqual([]);
    expect(fresh.chapter.quests.forge.complete).toBe(false);
    expect(fresh.valley.home).toBeNull(); expect(fresh.valley.paid).toBe(0);
    expect(fresh.valley.goal).not.toBe("Old beta reward");
    expect(storage.reads.length).toBeGreaterThan(0);
    expect(storage.reads.every(key => key === "valley-v1" || key === "valley-v1-backup")).toBe(true);
    expect(storage.writes).toEqual([]);
    for (const [key, value] of before) expect(storage.values.get(key)).toEqual(value);
  });

  it("writes only the new active/backup keys and leaves every old archive untouched", async () => {
    const saveApi = await api(), old = archives(saveApi.createValleySave(NOW));
    const storage = database(old), before = structuredClone(old);
    const fresh = await saveApi.readValleySave(NOW);
    fresh.valley.goal = "Current valley";
    await saveApi.writeValleySave(fresh);
    expect(new Set(storage.writes)).toEqual(new Set(["valley-v1", "valley-v1-backup"]));
    expect(storage.values.get("valley-v1")).toEqual(fresh);
    for (const [key, value] of before) expect(storage.values.get(key)).toEqual(value);
  });

  it("round-trips a valid current archive from the current storage key", async () => {
    const saveApi = await api(), current = saveApi.createValleySave(NOW, 8128);
    current.valley.goal = "Keep this current chapter";
    addItems(current.chapter.bank, "logs", 12, Infinity);
    const storage = database([...archives(current), ["valley-v1", current]]);
    expect(await saveApi.readValleySave(NOW)).toEqual(current);
    expect(saveApi.validateValleySave(JSON.parse(JSON.stringify(current)))).toEqual(current);
    expect(storage.reads).toEqual(["valley-v1"]);
  });

  it("rejects every old file version without mutating an archive or accepting its rewards", async () => {
    const saveApi = await api(), current = saveApi.createValleySave(NOW);
    for (const [, old] of archives(current)) {
      const before = structuredClone(old);
      expect(saveApi.validateValleySave(old)).toBeNull();
      expect(old).toEqual(before);
    }
    expect(saveApi.validateValleySave(current)).toEqual(current);
  });

  it("does not fall back to old keys when the current save and its backup are invalid", async () => {
    const saveApi = await api(), old = archives(saveApi.createValleySave(NOW));
    const broken = { version: 7, corrupt: true };
    const storage = database([...old, ["valley-v1", broken], ["valley-v1-backup", broken]]);
    const before = structuredClone([...storage.values]);
    await expect(saveApi.readValleySave(NOW)).rejects.toThrow();
    expect(storage.reads).toEqual(["valley-v1", "valley-v1-backup"]);
    expect(storage.writes).toEqual([]);
    expect([...storage.values]).toEqual(before);
  });

  it("recovers a valid current backup and preserves the older namespaces", async () => {
    const saveApi = await api(), backup = saveApi.createValleySave(NOW);
    backup.valley.goal = "Current backup";
    const old = archives(backup);
    const storage = database([...old, ["valley-v1", { version: 7, corrupt: true }], ["valley-v1-backup", backup]]);
    const restored = await saveApi.readValleySave(NOW);
    expect(restored.version).toBe(7); expect(restored.valley.goal).toBe("Current backup");
    expect(storage.reads).toEqual(["valley-v1", "valley-v1-backup"]);
    for (const [key, value] of old) expect(storage.values.get(key)).toEqual(value);
  });
});

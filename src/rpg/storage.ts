import type { RpgState } from "./types";
import { validateRpgSave } from "./engine";
let database: Promise<IDBDatabase> | undefined;
function db() {
  return (database ??= new Promise((resolve, reject) => {
    const r = indexedDB.open("fable-crown", 1);
    r.onupgradeneeded = () => {
      if (!r.result.objectStoreNames.contains("saves"))
        r.result.createObjectStore("saves");
    };
    r.onsuccess = () => resolve(r.result);
    r.onerror = () => reject(r.error);
  }));
}
async function read(key: string): Promise<unknown> {
  const d = await db();
  return new Promise((resolve, reject) => {
    const r = d.transaction("saves").objectStore("saves").get(key);
    r.onsuccess = () => resolve(r.result);
    r.onerror = () => reject(r.error);
  });
}
export async function readRpgSave() {
  return (
    validateRpgSave(await read("v5")) ??
    validateRpgSave(await read("v4")) ??
    validateRpgSave(await read("v3"))
  );
}
export async function readArchivedChapter() {
  const [village, tileRpg, tileRpgV4] = await Promise.all([
    read("v1"),
    read("v3"),
    read("v4"),
  ]);
  return village || tileRpg || tileRpgV4
    ? {
        village: village ?? null,
        tileRpg: tileRpg ?? null,
        tileRpgV4: tileRpgV4 ?? null,
      }
    : null;
}
export async function writeRpgSave(state: RpgState): Promise<void> {
  if (state.version !== 5)
    throw new Error("Only the current chapter may be saved.");
  const d = await db();
  return new Promise((resolve, reject) => {
    const t = d.transaction("saves", "readwrite");
    t.objectStore("saves").put(state, "v5");
    t.oncomplete = () => resolve();
    t.onerror = () => reject(t.error);
  });
}

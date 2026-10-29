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
  return validateRpgSave(await read("v3"));
}
export const readArchivedChapter = () => read("v1");
export async function writeRpgSave(state: RpgState): Promise<void> {
  const d = await db();
  return new Promise((resolve, reject) => {
    const t = d.transaction("saves", "readwrite");
    t.objectStore("saves").put(state, "v3");
    t.oncomplete = () => resolve();
    t.onerror = () => reject(t.error);
  });
}

import type { GameState } from "./types";
import { validateSave } from "./simulation";
let database: Promise<IDBDatabase> | undefined;
function db() {
  return (database ??= new Promise<IDBDatabase>((resolve, reject) => {
    const request = indexedDB.open("fable-crown", 1);
    request.onupgradeneeded = () => request.result.createObjectStore("saves");
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  }));
}
export async function readSave(): Promise<GameState | null> {
  const database = await db();
  return new Promise((resolve, reject) => {
    const request = database
      .transaction("saves")
      .objectStore("saves")
      .get("v1");
    request.onsuccess = () => resolve(validateSave(request.result));
    request.onerror = () => reject(request.error);
  });
}
export async function writeSave(state: GameState): Promise<void> {
  const database = await db();
  return new Promise((resolve, reject) => {
    const transaction = database.transaction("saves", "readwrite");
    transaction.objectStore("saves").put(state, "v1");
    transaction.oncomplete = () => resolve();
    transaction.onerror = () => reject(transaction.error);
  });
}

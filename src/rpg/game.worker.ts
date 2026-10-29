import {
  applyRpgCommand,
  calendarDate,
  createRpg,
  reconcileRpg,
  stepRpg,
  validateRpgSave,
} from "./engine";
import { readArchivedChapter, readRpgSave, writeRpgSave } from "./storage";
import { TICK_MS, type RpgState, type RpgCommand } from "./types";
let state: RpgState,
  ready = false,
  running = false,
  last = Date.now(),
  hasArchive = false,
  storageOkay = true,
  saving = Promise.resolve();
function emit(message = "", resetFeedback = false) {
  self.postMessage({ state, message, hasArchive, storageOkay, resetFeedback });
}
function save() {
  state.savedAt = Date.now();
  state.calendar = calendarDate(state.savedAt);
  const snapshot = structuredClone(state);
  return (saving = saving
    .then(() => writeRpgSave(snapshot))
    .catch(() => {
      storageOkay = false;
    }));
}
void (async () => {
  try {
    state = (await readRpgSave()) ?? createRpg(Date.now());
    hasArchive = Boolean(await readArchivedChapter());
  } catch {
    state = createRpg(Date.now());
    storageOkay = false;
  }
  const r = reconcileRpg(state, Date.now());
  await save();
  last = Date.now();
  ready = running = true;
  emit(
    r.ticks
      ? `While you were away: ${r.ticks} ticks at quarter speed.`
      : hasArchive
        ? "Your earlier chapter is archived. This is a fresh RPG journey."
        : "A new journey begins in Oakrest.",
    true,
  );
})();
self.onmessage = async (
  e: MessageEvent<{ type: string; command?: RpgCommand; value?: unknown }>,
) => {
  if (!ready) return;
  const { type, command, value } = e.data;
  if (type === "command" && command) {
    const r = applyRpgCommand(state, command);
    await save();
    emit(r.message);
  }
  if (type === "save") {
    await save();
    emit("Chronicle saved on this device.");
  }
  if (type === "pause") {
    running = false;
    await save();
    emit("", true);
  }
  if (type === "resume") {
    const r = reconcileRpg(state, Date.now());
    last = Date.now();
    running = true;
    await save();
    emit(
      r.ticks ? `While you were away: ${r.ticks} ticks at quarter speed.` : "",
      true,
    );
  }
  if (type === "import") {
    const imported = validateRpgSave(value);
    if (!imported) {
      emit("That RPG chronicle is invalid. Your current chapter is safe.");
      return;
    }
    state = imported;
    reconcileRpg(state, Date.now());
    last = Date.now();
    await save();
    emit("Chronicle restored.", true);
  }
  if (type === "reset") {
    state = createRpg(Date.now());
    last = Date.now();
    await save();
    emit("A fresh RPG chapter begins. The old archive is unchanged.", true);
  }
  if (type === "archive") {
    try {
      self.postMessage({ archive: await readArchivedChapter() });
    } catch {
      emit("The archived chapter could not be read.");
    }
  }
};
setInterval(() => {
  if (!ready || !running) return;
  const ticks = Math.min(36000, Math.floor((Date.now() - last) / TICK_MS));
  if (ticks < 1) return;
  stepRpg(state, ticks);
  last += ticks * TICK_MS;
  if (state.tick % 8 === 0) void save();
  emit("", ticks > 4);
}, 100);

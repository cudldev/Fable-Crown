import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { ValleySave, ValleyWorkerMessage, ValleyWorkerRequest } from "../src/valley/contracts";
import { idleActionInput } from "../src/action/simulation";
import { createValleySave } from "../src/valley/save";
import { itemCount } from "../src/rpg/inventory";

const storage = vi.hoisted(() => ({ read: vi.fn(), write: vi.fn() }));
vi.mock("../src/valley/save", async importOriginal => ({
  ...await importOriginal<typeof import("../src/valley/save")>(),
  readValleySave: storage.read, writeValleySave: storage.write,
}));
const NOW = Date.UTC(2026, 10, 1, 12);
type WorkerHarness = { onmessage: null | ((event: { data: ValleyWorkerRequest }) => Promise<void>) };
let messages: ValleyWorkerMessage[];
let worker: WorkerHarness;
const flush = async () => { for (let i = 0; i < 12; i++) await Promise.resolve(); };
async function boot(save: ValleySave = createValleySave(Date.now())) {
  vi.resetModules();
  worker = { onmessage: null };
  messages = [];
  storage.read.mockResolvedValueOnce(structuredClone(save));
  vi.stubGlobal("self", worker);
  vi.stubGlobal("postMessage", (message: ValleyWorkerMessage) => messages.push(structuredClone(message)));
  await import("../src/valley/game.worker");
  await flush();
}
async function send(request: ValleyWorkerRequest) { await worker.onmessage!({ data: request }); await flush(); }
function latest() {
  const value = messages.filter(message => message.save).at(-1)?.save;
  expect(value).toBeDefined(); return value!;
}
function actor() {
  const value = messages.filter(message => message.action).at(-1)?.action;
  expect(value).toBeDefined(); return value!;
}
async function exported() { await send({ type: "export" }); return messages.filter(message => message.export).at(-1)!.export!; }

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date", "performance", "setInterval", "clearInterval"] });
  vi.setSystemTime(NOW);
  storage.read.mockReset(); storage.write.mockReset(); storage.write.mockResolvedValue(undefined);
});
afterEach(() => { vi.clearAllTimers(); vi.useRealTimers(); vi.unstubAllGlobals(); });

describe("actual valley worker lifecycle", () => {
  it("ignores input and resume requests while storage is still preparing", async () => {
    let resolveRead!: (save: ValleySave) => void;
    storage.read.mockImplementationOnce(() => new Promise<ValleySave>(resolve => { resolveRead = resolve; }));
    await boot();
    expect(messages).toEqual([]);
    await send({ type: "resume" });
    await send({ type: "input", input: { ...idleActionInput(), moveX: 1 } });
    vi.advanceTimersByTime(2000);
    expect(messages).toEqual([]);
    resolveRead(createValleySave(Date.now())); await flush();
    expect(actor().frame).toBe(0);
    vi.advanceTimersByTime(2000);
    expect(actor().frame).toBe(0);
  });

  it("starts preparing and paused; input cannot advance actors before explicit resume", async () => {
    await boot();
    const initial = structuredClone(actor());
    await send({ type: "input", input: { ...idleActionInput(), moveX: 1, block: true, strike: true } });
    vi.advanceTimersByTime(2000);
    expect(actor()).toEqual(initial);
    await send({ type: "resume" });
    vi.advanceTimersByTime(24);
    expect(actor().frame).toBe(1);
    expect(actor().player.x).toBe(initial.player.x);
    expect(actor().player.blocking).toBe(false);
    expect(actor().player.swing).toBe(0);
  });

  it("retains a short strike pulse when release arrives before the next fixed step", async () => {
    await boot(); await send({ type: "resume" });
    await send({ type: "input", input: { ...idleActionInput(), strike: true, tool: true } });
    await send({ type: "input", input: idleActionInput() });
    vi.advanceTimersByTime(24);
    expect(actor().player.swing).toBe(35);
    expect(actor().swingTool).toBe(true);
    vi.advanceTimersByTime(1000);
    expect(actor().player.swing).toBe(0);
  });

  it("clears held movement, guard and queued strikes on pause and resume", async () => {
    await boot(); await send({ type: "resume" });
    await send({ type: "input", input: { moveX: 1, moveZ: 0, block: true, strike: true, tool: false } });
    vi.advanceTimersByTime(24);
    expect(actor().player.blocking).toBe(true);
    await send({ type: "pause" });
    const paused = await exported(), frame = paused.action.frame, x = paused.action.player.x;
    expect(paused.action.player.blocking).toBe(false);
    expect(paused.action.strikeHeld).toBe(false);
    vi.advanceTimersByTime(5000);
    expect((await exported()).action.frame).toBe(frame);
    await send({ type: "resume" });
    vi.advanceTimersByTime(24);
    expect(actor().frame).toBe(frame + 1);
    expect(actor().player.x).toBe(x);
    expect(actor().player.blocking).toBe(false);
  });

  it("moves and guards within one action frame without waiting for the 600ms settlement tick", async () => {
    await boot(); await send({ type: "resume" });
    const start = actor().player.x;
    await send({ type: "input", input: { ...idleActionInput(), moveX: 1, block: true } });
    vi.advanceTimersByTime(24);
    expect(actor().player.x).toBeGreaterThan(start);
    expect(actor().player.blocking).toBe(true);
    expect((await exported()).chapter.tick).toBe(0);
  });

  it("rejects invalid input and clamps axes before simulation", async () => {
    await boot(); await send({ type: "resume" });
    const start = actor().player.x;
    await send({ type: "input", input: { ...idleActionInput(), moveX: NaN } });
    vi.advanceTimersByTime(24);
    expect(actor().player.x).toBe(start);
    await send({ type: "input", input: { ...idleActionInput(), moveX: 100 } });
    vi.advanceTimersByTime(24);
    expect(actor().player.x - start).toBeGreaterThan(0);
    expect(actor().player.x - start).toBeLessThan(.2);
  });

  it("persists new movement, guard, tool state and continuous positions through the worker", async () => {
    await boot(); await send({ type: "resume" });
    await send({ type: "input", input: { moveX: 1, moveZ: 0, block: true, strike: true, tool: true } });
    vi.advanceTimersByTime(24);
    const current = structuredClone(actor());
    await send({ type: "save" });
    expect(storage.write.mock.calls.at(-1)![0].action).toEqual(current);
    expect((await exported()).action).toEqual(current);
    expect(current.player.x % 1).not.toBe(0);
  });

  it("preserves partial visible settlement time through pause, save and a fresh worker", async () => {
    await boot(); await send({ type: "resume" });
    vi.advanceTimersByTime(320);
    await send({ type: "pause" });
    const snapshot = structuredClone(storage.write.mock.calls.at(-1)![0] as ValleySave);
    expect(snapshot.chapter.tick).toBe(0);
    expect(snapshot.offlineRemainder).toBeGreaterThanOrEqual(300);
    expect(snapshot.offlineRemainder).toBeLessThan(600);
    vi.clearAllTimers();
    await boot(snapshot); await send({ type: "resume" });
    vi.advanceTimersByTime(320);
    await send({ type: "pause" });
    const restored = await exported();
    expect(restored.chapter.tick).toBe(1);
    expect(restored.offlineRemainder).toBeLessThan(100);
  });

  it("adds quarter-speed hidden time to partial visible time, exactly once", async () => {
    await boot(); await send({ type: "resume" });
    vi.advanceTimersByTime(320);
    await send({ type: "pause" });
    vi.advanceTimersByTime(1200);
    await send({ type: "resume" });
    expect(latest().chapter.tick).toBe(1);
    const tick = latest().chapter.tick;
    await send({ type: "pause" }); await send({ type: "resume" });
    expect(latest().chapter.tick).toBe(tick);
  });

  it("does not reinterpret visible elapsed time as offline work on duplicate resume", async () => {
    await boot(); await send({ type: "resume" });
    vi.advanceTimersByTime(1200);
    const before = await exported();
    await send({ type: "resume" });
    const after = await exported();
    expect(after.chapter.tick).toBe(before.chapter.tick);
    expect(after.offlineRemainder).toBe(before.offlineRemainder);
    expect(after.action).toEqual(before.action);
  });

  it("never rewinds its persisted clock during a device-clock rollback", async () => {
    await boot(); await send({ type: "resume" });
    vi.setSystemTime(NOW - 24 * 3_600_000);
    await send({ type: "pause" });
    const snapshot = await exported();
    expect(snapshot.savedAt).toBe(NOW);
    expect(snapshot.chapter.savedAt).toBe(NOW);
    vi.setSystemTime(NOW);
    await send({ type: "resume" });
    expect(latest().chapter.tick).toBe(0);
    expect(latest().offlineRemainder).toBe(0);
  });
});

describe("actual worker transactions and archives", () => {
  it("acknowledges command success and rejects failed commands atomically without persistence", async () => {
    await boot();
    await send({ type: "command", requestId: 10, command: { type: "place-home", x: 54, z: 155, rotation: 0 } });
    expect(messages.at(-1)?.receipt).toEqual({ requestId: 10, ok: true });
    expect(latest().valley.home).toEqual({ x: 54, z: 155, rotation: 0, tentPacked: false });
    const before = await exported(), writes = storage.write.mock.calls.length;
    await send({ type: "command", requestId: 11, command: { type: "pay", amount: 100 } });
    expect(messages.at(-1)?.receipt).toEqual({ requestId: 11, ok: false });
    expect(await exported()).toEqual(before);
    expect(storage.write).toHaveBeenCalledTimes(writes);
    expect(itemCount(latest().chapter.player.inventory, "coins")).toBe(25);
  });

  it("exports current state, rejects invalid imports without loss, and restores a valid snapshot", async () => {
    await boot();
    await send({ type: "command", command: { type: "pin-goal", goal: "Build a peaceful home" } });
    const before = await exported(), writes = storage.write.mock.calls.length;
    await send({ type: "import", value: { version: 6, chapter: {} } });
    expect(messages.at(-1)?.receipt?.ok).toBe(false);
    expect(await exported()).toEqual(before);
    expect(storage.write).toHaveBeenCalledTimes(writes);
    await send({ type: "command", command: { type: "pin-goal", goal: "Another goal" } });
    await send({ type: "import", value: before });
    expect((await exported()).valley.goal).toBe("Build a peaceful home");
    expect(storage.write.mock.calls.at(-1)![0].valley.goal).toBe("Build a peaceful home");
  });

  it("reports storage write failure while retaining exportable current progress", async () => {
    await boot();
    storage.write.mockRejectedValueOnce(new Error("quota"));
    await send({ type: "command", command: { type: "pin-goal", goal: "Keep this progress" } });
    expect(messages.some(m => m.storageOkay === false && m.message?.includes("could not be saved"))).toBe(true);
    expect((await exported()).valley.goal).toBe("Keep this progress");
  });

  it("reports unavailable storage and keeps its recovery chapter exportable without overwriting archives", async () => {
    storage.read.mockRejectedValueOnce(new Error("IndexedDB unavailable"));
    await boot();
    expect(latest().valley.paid).toBe(0);
    expect(messages.some(m => m.storageOkay === false && m.message?.includes("could not be opened"))).toBe(true);
    expect(storage.write).not.toHaveBeenCalled();
    expect((await exported()).version).toBe(7);
  });
});

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { ValleySave, ValleyWorkerMessage, ValleyWorkerRequest } from "../src/valley/contracts";
import { idleActionInput } from "../src/action/simulation";
import { createValleySave } from "../src/valley/save";
import { itemCount } from "../src/rpg/inventory";
import {tile} from "../src/rpg/world";

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
  it("preserves a queued controller strike across movement packets before the next step",async()=>{
    await boot();await send({type:"resume"});await send({type:"input",input:{...idleActionInput(),moveX:1,strike:true}});
    await send({type:"input",input:{...idleActionInput(),moveX:1,strike:false}});vi.advanceTimersByTime(24);
    expect(actor().player.swing).toBeGreaterThan(0);
  });
  it("keeps the swing recovery when a pointer activity is cancelled and selected again",async()=>{
    const fixture=createValleySave(Date.now(),2);Object.assign(fixture.action.player,{x:25,z:140});
    await boot(fixture);await send({type:"resume"});await send({type:"point",selection:{kind:"object",id:"valley-tree-1"}});vi.advanceTimersByTime(250);
    const hit=await exported();expect(hit.action.player.swing).toBeGreaterThan(0);expect(hit.chapter.player.skills.woodcutting).toBeGreaterThan(0);
    await send({type:"cancel"});await send({type:"point",selection:{kind:"object",id:"valley-tree-1"}});vi.advanceTimersByTime(250);
    const recovery=await exported();expect(recovery.chapter.player.skills.woodcutting).toBe(hit.chapter.player.skills.woodcutting);expect(recovery.action.player.swing).toBeGreaterThan(0);
    vi.advanceTimersByTime(400);expect((await exported()).chapter.player.skills.woodcutting).toBeGreaterThan(hit.chapter.player.skills.woodcutting);
  });
  it("repeats only the selected resource and stops cleanly on cancellation",async()=>{
    const fixture=createValleySave(Date.now(),2);Object.assign(fixture.action.player,{x:25,z:140});
    await boot(fixture);await send({type:"resume"});await send({type:"point",selection:{kind:"object",id:"valley-tree-1"}});
    vi.advanceTimersByTime(1600);const gathered=await exported();
    expect(gathered.chapter.player.skills.woodcutting).toBeGreaterThan(fixture.chapter.player.skills.woodcutting);
    expect(messages.filter(message=>message.feedback?.title?.startsWith("Collected")).length).toBeGreaterThan(0);
    await send({type:"cancel"});const stopped=await exported();vi.advanceTimersByTime(1000);const after=await exported();
    expect(after.chapter.player.inventory).toEqual(stopped.chapter.player.inventory);expect(after.chapter.player.skills).toEqual(stopped.chapter.player.skills);
  });
  it("walks continuously to a selected ground point and cancels on new direct movement",async()=>{
    await boot();await send({type:"resume"});await send({type:"point",selection:{kind:"tile",position:tile(55,146)}});
    vi.advanceTimersByTime(2400);const walked=await exported();
    expect(walked.action.player.x).toBeCloseTo(55,1);expect(walked.action.player.z).toBeCloseTo(146,1);
    expect(messages.some(message=>message.pointer?.kind==="walk")).toBe(true);expect(messages.at(-1)?.pointer).toBeNull();
    await send({type:"point",selection:{kind:"tile",position:tile(62,150)}});vi.advanceTimersByTime(160);
    await send({type:"input",input:{...idleActionInput(),moveX:-1}});vi.advanceTimersByTime(160);expect(messages.at(-1)?.pointer).toBeNull();
  });
  it("approaches a far station and opens only once it is nearby",async()=>{
    await boot();await send({type:"resume"});await send({type:"point",selection:{kind:"object",id:"valley-workbench"}});
    expect(messages.some(message=>message.open)).toBe(false);vi.advanceTimersByTime(6500);
    expect(messages.filter(message=>message.open)).toHaveLength(1);expect(messages.find(message=>message.open)?.service?.objectId).toBe("valley-workbench");
    const value=await exported();expect(Math.hypot(value.action.player.x-69,value.action.player.z-139)).toBeLessThanOrEqual(3);
  });
  it("cancels pointer work on menus, pause and reload rather than resuming it offline",async()=>{
    await boot();await send({type:"resume"});await send({type:"point",selection:{kind:"tile",position:tile(62,150)}});vi.advanceTimersByTime(100);
    await send({type:"interface",open:true});const stopped=actor();vi.advanceTimersByTime(1200);expect(actor().player).toEqual(stopped.player);
    await send({type:"interface",open:false});vi.advanceTimersByTime(160);expect(actor().player.x).toBe(stopped.player.x);
    await send({type:"point",selection:{kind:"tile",position:tile(62,150)}});await send({type:"pause"});const snapshot=await exported();
    expect(snapshot).not.toHaveProperty("pointer");await send({type:"import",value:snapshot});expect(messages.at(-1)?.pointer).toBeNull();
  });
  it("holds a visitor through a conversation while the other NPC routines continue",async()=>{
    await boot();await send({type:"resume"});await send({type:"point",selection:{kind:"object",id:"valley-visitor-builder"}});vi.advanceTimersByTime(32);
    await send({type:"interface",open:true,npcId:"valley-visitor-builder"});const initial=(await exported()).valley.visitorPositions?.builder;
    vi.advanceTimersByTime(15000);const during=await exported();expect(during.valley.visitorPositions?.builder).toEqual(initial);
    expect(during.chapter.npcs.some(npc=>npc.activity!=="Considering the road ahead")).toBe(true);
    await send({type:"interface",open:false});vi.advanceTimersByTime(12000);
    expect(messages.filter(message=>message.ambient?.some(npc=>npc.id==="valley-visitor-builder"&&npc.moving)).length).toBeGreaterThan(0);
  });
  it("collects the faced bag and preserves nearby recovery markers",async()=>{
    const fixture=createValleySave(Date.now());
    fixture.chapter.grave={position:tile(51,141),items:[{itemId:"logs",quantity:2}],attempts:0,retryAt:0};
    fixture.chapter.drops=[{id:"faced-bag",position:tile(53,141),items:[{itemId:"copper-ore",quantity:1}],expiresAt:0}];
    Object.assign(fixture.action.player,{facingX:1,facingZ:0});
    await boot(fixture);await send({type:"interact"});const result=await exported();
    expect(result.chapter.grave).toEqual(fixture.chapter.grave);expect(result.chapter.drops).toEqual([]);
    expect(itemCount(result.chapter.player.inventory,"copper-ore")).toBe(itemCount(fixture.chapter.player.inventory,"copper-ore")+1);
  });
  it("does not turn or swing at a distant clicked enemy",async()=>{
    await boot();const before=await exported();await send({type:"focus",selection:{kind:"enemy",id:"rock-mite-0"}});
    await send({type:"resume"});vi.advanceTimersByTime(32);const after=await exported();
    expect(after.action.player.facingX).toBe(before.action.player.facingX);expect(after.action.player.swing).toBe(0);
  });
  it("names connected storage when a finished batch cannot fit in the backpack",async()=>{
    const fixture=createValleySave(Date.now());fixture.chapter.player.inventory=[{itemId:"logs",quantity:28}];
    fixture.valley.workQueue=[{recipeId:"valley-plank",quantity:1,remainingTicks:1}];
    await boot(fixture);await send({type:"resume"});await send({type:"interface",open:true});vi.advanceTimersByTime(600);
    const feedback=messages.find(message=>message.feedback?.title==="Crafting complete")?.feedback;
    expect(feedback?.detail).toContain("+2 Sawn plank");expect(feedback?.detail).toContain("Delivered to connected storage.");
    const result=await exported();expect(itemCount(result.chapter.bank,"valley-plank")).toBe(2);expect(itemCount(result.chapter.player.inventory,"valley-plank")).toBe(0);
  });
  it("reports partial recovery and safe remaining belongings alongside the exact gain",async()=>{
    const fixture=createValleySave(Date.now());fixture.action.player.x=94;fixture.action.player.z=160;
    fixture.chapter.player.inventory=[{itemId:"logs",quantity:27}];
    fixture.chapter.grave={position:tile(94,160),items:[{itemId:"logs",quantity:2},{itemId:"coins",quantity:5}],attempts:0,retryAt:0};
    await boot(fixture);await send({type:"interact"});
    const feedback=messages.filter(message=>message.feedback).at(-1)?.feedback;
    expect(feedback?.title).toBe("Recovered what fits. Remaining belongings are safe.");expect(feedback?.detail).toBe("+1 Logs");
    const result=await exported();expect(itemCount(result.chapter.player.inventory,"logs")).toBe(28);
    expect(result.chapter.grave?.items).toEqual([{itemId:"logs",quantity:1},{itemId:"coins",quantity:5}]);
  });
  it("pauses action in menus while ordinary crafting continues, then resumes without replaying held inputs",async()=>{
    const fixture=createValleySave(Date.now());fixture.action.player.x=69;fixture.action.player.z=141;
    fixture.chapter.player.inventory.push({itemId:"logs",quantity:1});
    await boot(fixture);await send({type:"resume"});
    await send({type:"focus",selection:{kind:"object",id:"valley-workbench"}});
    expect(messages.at(-1)?.service).toMatchObject({kind:"workbench",station:"workbench"});
    await send({type:"interface",open:true});const frozen=structuredClone(actor());
    await send({type:"command",command:{type:"craft",recipeId:"valley-plank",quantity:1}});
    await send({type:"input",input:{...idleActionInput(),moveX:1,strike:true,block:true}});
    vi.advanceTimersByTime(2400);
    const completed=await exported();expect(completed.action).toEqual(frozen);expect(completed.chapter.tick).toBe(4);
    expect(itemCount(completed.chapter.player.inventory,"valley-plank")).toBe(2);
    expect(messages.find(message=>message.feedback?.title==="Crafting complete")?.feedback?.detail).toContain("+2 Sawn plank");
    expect(messages.find(message=>message.feedback?.title==="Crafting complete")?.feedback?.detail).toContain("+10 carpentry XP");
    expect(completed).not.toHaveProperty("feedback");expect(completed).not.toHaveProperty("service");
    await send({type:"interface",open:false});vi.advanceTimersByTime(24);
    expect(actor().frame).toBe(frozen.frame+1);expect(actor().player.x).toBe(frozen.player.x);
    expect(actor().player.swing).toBe(0);expect(actor().player.blocking).toBe(false);
  });

  it("explains distant station interaction and grants only the actual nearby object's menu",async()=>{
    await boot();await send({type:"focus",selection:{kind:"object",id:"valley-workbench"}});
    expect(messages.some(message=>message.open)).toBe(false);
    expect(messages.at(-1)?.feedback?.title).toContain("Walk closer");
    const fixture=createValleySave(Date.now());Object.assign(fixture.action.player,{x:81,z:141,facingX:0,facingZ:-1});
    await boot(fixture);await send({type:"interact"});
    expect(messages.find(message=>message.open)?.service).toMatchObject({objectId:"valley-cooking-fire",kind:"range",station:"range"});
    expect(messages.find(message=>message.open)?.open).toBe("craft");
  });

  it("explains discarded rapid presses and renews identical empty swings without inventing rewards",async()=>{
    await boot();await send({type:"resume"});const initial=await exported();
    await send({type:"input",input:{...idleActionInput(),strike:true,tool:true}});vi.advanceTimersByTime(80);
    await send({type:"input",input:{...idleActionInput(),strike:true,tool:true}});vi.advanceTimersByTime(32);
    expect(messages.some(message=>message.feedback?.title==="Finishing this swing")).toBe(true);
    vi.advanceTimersByTime(700);
    const first=messages.filter(message=>message.feedback?.title==="Nothing gathered this swing").at(-1)?.feedback;
    expect(first).toBeDefined();
    await send({type:"input",input:{...idleActionInput(),strike:true,tool:true}});vi.advanceTimersByTime(250);
    const second=messages.filter(message=>message.feedback?.title==="Nothing gathered this swing").at(-1)?.feedback;
    expect(second?.id).toBeGreaterThan(first!.id);expect(second?.tone).toBe("info");
    const final=await exported();expect(final.chapter.player.inventory).toEqual(initial.chapter.player.inventory);expect(final.chapter.player.skills).toEqual(initial.chapter.player.skills);
  });

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
    const pausedAt=Date.now();
    expect(pausedAt).toBe(NOW+320);
    expect(snapshot.savedAt).toBe(pausedAt);
    vi.clearAllTimers();
    // Vitest5 clears timers by resetting its clock to installation time; keep this
    // simulated worker restart at the saved instant rather than adding wall-clock offline work.
    vi.setSystemTime(pausedAt);
    expect(Date.now()).toBe(snapshot.savedAt);
    await boot(snapshot);
    expect(latest().chapter.tick).toBe(0);
    expect(latest().offlineRemainder).toBe(snapshot.offlineRemainder);
    await send({ type: "resume" });
    vi.advanceTimersByTime(320);
    await send({ type: "pause" });
    const restored = await exported();
    expect(restored.chapter.tick).toBe(1);
    expect(restored.offlineRemainder).toBe(40);
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

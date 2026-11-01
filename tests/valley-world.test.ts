import { describe, expect, it } from "vitest";
import { canStep, COLLISION, isWalkable, tile, WORLD } from "../src/rpg/world";
import { findPath } from "../src/rpg/pathfinding";
import {rpgActionWorld} from "../src/action/rpg-adapter";
import {createValleySave} from "../src/valley/save";
import {planPointerRoute} from "../src/valley/pointer-navigation";
import type { ValleyData } from "../src/valley/contracts";
import { COTTAGE_TICKS, FORGE_TICKS } from "../src/valley/contracts";
import { canTraverseValley, createValleyWorld, editValleyGround, furnitureFootprint, homeFootprints, inValley,
  isOwned, OWNED_BOUNDS, sampleValleyGround, undoValleyGround, validateFurniturePlacement, validateHomePlacement,
  VALLEY_BOUNDS, VALLEY_ENTRANCE } from "../src/valley/world";

function data(overrides: Partial<ValleyData> = {}): ValleyData {
  return { home: null, paid: 0, cottageTicks: 0, forge: { logs: 0, bars: 0, ticks: 0 }, furniture: [], plants: [],
    ground: {}, undo: [], layoutRevision: 0, commissions: [], dailyCommissions: [], dailyHelp: [], introduced: [], flags: [],
    carpentryXp: 0, goal: "", startedAt: 0, lastDate: "2026-11-01", message: "", workQueue:[], ...overrides };
}
const complete = (overrides: Partial<ValleyData> = {}) => data({ cottageTicks: COTTAGE_TICKS, ...overrides });

describe("valley ownership and immutable world compilation", () => {
  it("routes through a modest detour on actual player-laid paths",()=>{
    const save=createValleySave(Date.now());for(let x=48;x<=52;x++)save.valley.ground[`${x},151`]={level:0,path:true};
    const world=createValleyWorld(save.valley,save.chapter),env=rpgActionWorld(save.chapter,world),route=planPointerRoute({x:48,z:150},{x:52,z:150,range:0},env,world);
    expect(env.travelCost?.(50,151)).toBe(.6);expect(env.travelCost?.(50,150)).toBe(1);expect(route?.some(p=>p.z===151)).toBe(true);
  });
  it("keeps moving visitors out of new home, furnishing and ground edits",()=>{
    const d=data({visitorPositions:{builder:{x:55,z:156}}});
    expect(validateHomePlacement(d,54,155,0)).toMatch(/neighbours/);
    expect(validateFurniturePlacement(d,"stool",55,156,0)).toMatch(/neighbour/);
    const before=structuredClone(d);expect(editValleyGround(d,55,156,"raise").ok).toBe(false);expect(d).toEqual(before);
  });
  it("updates visitor anchors when their saved positions change without changing building layout",()=>{
    const d=data({visitorPositions:{builder:{x:52,z:143}}}),before=createValleyWorld(d);
    d.visitorPositions!.builder={x:53,z:143};const after=createValleyWorld(d);
    expect(after).not.toBe(before);expect(after.objects.find(o=>o.id==="valley-visitor-builder")?.position).toEqual(tile(53,143));
  });
  it("uses the exact safe and owned inclusive bounds without accepting NaN", () => {
    expect(VALLEY_BOUNDS).toEqual({ minX: 8, maxX: 87, minZ: 136, maxZ: 183 });
    expect(OWNED_BOUNDS).toEqual({ minX: 16, maxX: 79, minZ: 144, maxZ: 175 });
    expect(inValley(8, 136)).toBe(true); expect(inValley(87, 183)).toBe(true);
    expect(inValley(88, 183)).toBe(false); expect(isOwned(79, 175)).toBe(true);
    expect(isOwned(80, 175)).toBe(false); expect(isOwned(16, 143)).toBe(false);
    expect(inValley(NaN, 150)).toBe(false); expect(isOwned(40, Infinity)).toBe(false);
  });

  it("preserves all original content, collision and pond while adding safe outer-band resources", () => {
    const original = JSON.stringify(WORLD), world = createValleyWorld(data());
    expect(world.objects.slice(0, WORLD.objects.length)).toEqual(WORLD.objects);
    expect(new Set(world.objects.map(o => o.id)).size).toBe(world.objects.length);
    const timber = world.objects.filter(o => o.id.startsWith("valley-tree-")), ore = world.objects.filter(o => o.id.startsWith("valley-ore-"));
    expect(timber).toHaveLength(12); expect(ore).toHaveLength(6);
    expect(timber.every(o => inValley(o.position.x, o.position.y) && !isOwned(o.position.x, o.position.y) && o.resourceId === "tree")).toBe(true);
    expect(ore.map(o => o.resourceId)).toEqual(["copper", "tin", "copper", "tin", "copper", "tin"]);
    expect(world.objects.find(o => o.id === "valley-pond-shrimp")?.resourceId).toBe("shrimp");
    expect(world.objects.find(o => o.id === "valley-brazier")?.kind).toBe("furnace");
    expect(world.objects.find(o => o.id === "valley-cooking-fire")?.kind).toBe("range");
    for (let z = 0; z < WORLD.height; z++) for (let x = 0; x < WORLD.width; x++) {
      const index = z * WORLD.width + x;
      if (!inValley(x, z)) { expect(world.terrain[index]).toBe(WORLD.terrain[index]); expect(world.collision[index]).toBe(WORLD.collision[index]); }
      if (WORLD.terrain[index] === "water") { expect(world.terrain[index]).toBe("water"); expect(world.collision[index] & COLLISION.BLOCKED).toBeTruthy(); }
    }
    const changed = complete(); editValleyGround(changed, 58, 163, "raise"); createValleyWorld(changed);
    expect(JSON.stringify(WORLD)).toBe(original);
  });

  it("reuses geometry across clock/economy updates and invalidates even stale revision fields", () => {
    const d = data(), first = createValleyWorld(d);
    d.cottageTicks = 1; d.carpentryXp = 100; d.message = "Changed";
    expect(createValleyWorld(d)).toBe(first);
    d.ground["58,163"] = { level: 1, path: false };
    expect(createValleyWorld(d)).not.toBe(first);
    d.ground = {}; expect(createValleyWorld(d)).toBe(first);
    d.paid = 1; expect(createValleyWorld(d)).toBe(first);
    d.paid = 100; expect(createValleyWorld(d)).not.toBe(first);
  });

  it("evicts oldest worlds after eight geometry entries", () => {
    const d = data({ layoutRevision: 50000 }), first = createValleyWorld(d);
    for (let i = 1; i <= 8; i++) createValleyWorld({ ...d, layoutRevision: 50000 + i });
    expect(createValleyWorld(d)).not.toBe(first);
  });
});

describe("freely placed reserved home pads", () => {
  it.each([0, 1, 2, 3] as const)("rotates tent, cottage, apron and walk-in doorway together (%i)", rotation => {
    const d = complete({ paid: 100, home: { x: 54, z: 155, rotation, tentPacked: false } });
    expect(validateHomePlacement(d, 54, 155, rotation)).toBeNull();
    const fp = homeFootprints(d)!, world = createValleyWorld(d);
    expect([fp.pad.width, fp.pad.height]).toEqual(rotation % 2 ? [8, 10] : [10, 8]);
    expect([fp.cottage.width, fp.cottage.height]).toEqual(rotation % 2 ? [5, 6] : [6, 5]);
    expect(fp.tent.width * fp.tent.height).toBe(9);
    const doorway = tile(fp.door.x, fp.door.z), approach = tile(fp.approach.x, fp.approach.z);
    expect(isWalkable(doorway, world)).toBe(true); expect(canStep(approach, doorway, world)).toBe(true);
    expect(findPath(tile(VALLEY_ENTRANCE.x, VALLEY_ENTRANCE.z), doorway, world)).not.toBeNull();
    const wallSide = [COLLISION.SOUTH, COLLISION.WEST, COLLISION.NORTH, COLLISION.EAST][rotation];
    expect(world.collision[doorway.y * world.width + doorway.x] & wallSide).toBe(0);
    const cottage = world.objects.find(o => o.id === "valley-home-cottage")!;
    expect(cottage.art).toBe("valley-cottage"); expect(cottage.blocks).toBe(false); expect(cottage.cutaway).toBe(true);
  });

  it("allows multiple owned positions and rejects border, pond shore, entrance and nonflat pads", () => {
    expect(validateHomePlacement(data(), 38, 156, 0)).toBeNull();
    expect(validateHomePlacement(data(), 65, 165, 0)).toBeNull();
    expect(validateHomePlacement(data(), 75, 170, 0)).toMatch(/inside your land/);
    expect(validateHomePlacement(data(), 36, 146, 0)).toMatch(/shore/);
    expect(validateHomePlacement(data(), 44, 144, 0)).toMatch(/entrance/);
    expect(validateHomePlacement(data(), 53.5, 156, 0)).toMatch(/whole tile/);
    const d = data({ ground: { "58,160": { level: 1, path: false } } });
    expect(validateHomePlacement(d, 54, 155, 0)).toMatch(/flat/);
  });

  it("shows tent, commission scaffold, cottage, packed tent and public forge from geometry state", () => {
    const d = data({ home: { x: 54, z: 155, rotation: 0, tentPacked: false } });
    expect(createValleyWorld(d).objects.find(o => o.id === "valley-home-tent")?.art).toBe("valley-tent");
    expect(createValleyWorld(d).objects.some(o => o.id === "valley-home-cottage")).toBe(false);
    d.paid = 99;
    expect(createValleyWorld(d).objects.some(o => o.id === "valley-home-cottage")).toBe(false);
    d.paid = 100; expect(createValleyWorld(d).objects.find(o => o.id === "valley-home-cottage")?.art).toBe("valley-cottage-build");
    d.forge.logs = 1; expect(createValleyWorld(d).objects.some(o => o.id === "valley-public-forge")).toBe(false);
    d.cottageTicks = COTTAGE_TICKS;
    expect(createValleyWorld(d).objects.find(o => o.id === "valley-public-forge")?.art).toBe("valley-forge-build");
    d.forge.ticks = FORGE_TICKS;
    expect(createValleyWorld(d).objects.find(o => o.id === "valley-public-forge")?.art).toBe("valley-forge");
    d.home!.tentPacked = true; expect(createValleyWorld(d).objects.some(o => o.id === "valley-home-tent")).toBe(false);
    expect(validateFurniturePlacement(d, "stool", 55, 158, 0)).toBeNull();
  });

  it("only exposes cottage geometry after the complete commission payment", () => {
    const d = complete({ home: { x: 54, z: 155, rotation: 0, tentPacked: false }, paid: 99 });
    expect(createValleyWorld(d).objects.some(o => o.id === "valley-home-cottage")).toBe(false);
    d.paid = 100;
    expect(createValleyWorld(d).objects.find(o => o.id === "valley-home-cottage")?.art).toBe("valley-cottage");
  });

  it("progresses visitor figures and invalidates their geometry cache without legacy quest IDs", () => {
    const d = data(), initial = createValleyWorld(d);
    expect(initial.objects.find(o => o.id === "valley-visitor-builder")).toMatchObject({ name: "Rowan the builder", kind: "quest", serviceId: "valley-visitor-builder" });
    expect(initial.objects.some(o => o.id === "valley-visitor-merchant")).toBe(false);
    expect(initial.objects.some(o => o.id === "valley-visitor-smith")).toBe(false);
    d.introduced.push("merchant");
    const merchant = createValleyWorld(d);
    expect(merchant).not.toBe(initial);
    expect(merchant.objects.find(o => o.id === "valley-visitor-merchant")?.name).toBe("Pella the merchant");
    d.introduced.push("smith");
    const smith = createValleyWorld(d);
    expect(smith).not.toBe(merchant);
    expect(smith.objects.find(o => o.id === "valley-visitor-smith")?.name).toBe("Garrick the smith");
    expect(smith.objects.filter(o => o.id.startsWith("valley-visitor-")).every(o => o.questId === undefined && o.description?.includes("draft"))).toBe(true);
  });

  it("opens the completed forge's actual doorway and keeps its interior anvil reachable", () => {
    const d = complete({ forge: { logs: 20, bars: 10, ticks: FORGE_TICKS - 1 } }), draft = createValleyWorld(d);
    expect(isWalkable(tile(72, 180), draft)).toBe(false);
    d.forge.ticks = FORGE_TICKS;
    const world = createValleyWorld(d), forge = world.objects.find(o => o.id === "valley-public-forge")!;
    expect(forge).toMatchObject({ kind: "building", blocks: false, cutaway: true, entrance: { x: 72, z: 180 } });
    expect(canStep(tile(72, 181), tile(72, 180), world)).toBe(true);
    expect(canStep(tile(72, 180), tile(72, 179), world)).toBe(true);
    expect(canStep(tile(70, 180), tile(70, 181), world)).toBe(false);
    expect(findPath(tile(VALLEY_ENTRANCE.x, VALLEY_ENTRANCE.z), tile(72, 179), world)).not.toBeNull();
    expect(world.objects.find(o => o.id === "valley-public-anvil")).toMatchObject({ kind: "anvil", position: tile(71, 179), width: 1, height: 1 });
  });
});

describe("furnishing footprint and passage checks", () => {
  it("rotates rectangular furniture and rejects overlap, shore, stairs and owned boundaries", () => {
    expect(furnitureFootprint("bed", 55, 160, 0)).toEqual({ x: 55, z: 160, width: 2, height: 3 });
    expect(furnitureFootprint("bed", 55, 160, 1)).toEqual({ x: 55, z: 160, width: 3, height: 2 });
    expect(validateFurniturePlacement(complete(), "bed", 78, 173, 1)).toMatch(/whole furnishing/);
    expect(validateFurniturePlacement(complete(), "stool", 36, 150, 0)).toMatch(/shore/);
    const d = complete({ furniture: [{ id: "chair-1", itemId: "stool", x: 60, z: 160, rotation: 0 }],
      ground: { "64,160": { level: 0, path: false, stairs: 1 } } });
    expect(validateFurniturePlacement(d, "table", 60, 160, 0)).toMatch(/occupied/);
    expect(validateFurniturePlacement(d, "stool", 60, 160, 0, "chair-1")).toBeNull();
    expect(validateFurniturePlacement(d, "stool", 64, 160, 0)).toMatch(/flat/);
  });

  it.each([0, 1, 2, 3] as const)("reserves doors/apron and allows completed cottage interiors (%i)", rotation => {
    const d = complete({ paid: 100, home: { x: 54, z: 155, rotation, tentPacked: false } }), fp = homeFootprints(d)!;
    expect(validateFurniturePlacement(d, "stool", fp.door.x, fp.door.z, 0)).toMatch(/entrance/);
    expect(validateFurniturePlacement(d, "stool", fp.approach.x, fp.approach.z, 0)).toMatch(/entrance/);
    expect(validateFurniturePlacement(d, "stool", fp.tent.x + 1, fp.tent.z + 1, 0)).toMatch(/tent/);
    const x = fp.cottage.x + 1, z = fp.cottage.z + 1;
    // One interior column is a protected entry route; pick any free interior tile.
    const spots: [number, number][] = [];
    for (let zz = z; zz < fp.cottage.z + fp.cottage.height - 1; zz++) for (let xx = x; xx < fp.cottage.x + fp.cottage.width - 1; xx++)
      if (!validateFurniturePlacement(d, "stool", xx, zz, 0)) spots.push([xx, zz]);
    expect(spots.length).toBeGreaterThan(0);
    const [sx, sz] = spots[0]; d.furniture.push({ id: "inside", itemId: "stool", x: sx, z: sz, rotation: 0 });
    expect(createValleyWorld(d).objects.find(o => o.id === "valley-furniture-inside")?.art).toBe("valley-stool");
  });
});

describe("half-metre terrain and actual stair support", () => {
  it("allows early paths, gates terraces on cottage completion and bounds edits", () => {
    const d = data(); expect(editValleyGround(d, 58, 163, "path").ok).toBe(true);
    expect(createValleyWorld(d).terrain[163 * WORLD.width + 58]).toBe("dirt");
    expect(editValleyGround(d, 58, 163, "raise").ok).toBe(false);
    d.cottageTicks = COTTAGE_TICKS;
    expect(editValleyGround(d, 58, 163, "raise").ok).toBe(true);
    expect(sampleValleyGround(d, 58.49, 163.49)).toBe(.5);
    expect(editValleyGround(d, 58, 163, "raise").ok).toBe(false);
    expect(editValleyGround(d, 58, 163, "lower").ok).toBe(true);
    expect(editValleyGround(d, 58, 163, "lower").ok).toBe(true);
    expect(sampleValleyGround(d, 58, 163)).toBe(-.5);
    expect(editValleyGround(d, 58, 163, "lower").ok).toBe(false);
    expect(editValleyGround(d, 29, 150, "path").ok).toBe(false);
    expect(editValleyGround(d, 36, 150, "raise").ok).toBe(false);
    expect(editValleyGround(d, 80, 163, "raise").ok).toBe(false);
  });

  it.each([0, 1, 2, 3] as const)("samples four exact treads and connects only matching end sockets (%i)", direction => {
    const [dx, dz] = [[0, -1], [1, 0], [0, 1], [-1, 0]][direction], x = 60, z = 165;
    const d = complete({ ground: { [`${x},${z}`]: { level: 0, path: false, stairs: direction },
      [`${x + dx},${z + dz}`]: { level: 1, path: false } } });
    const offsets = [-.49, -.24, .01, .26];
    expect(offsets.map(t => sampleValleyGround(d, x + dx * t, z + dz * t))).toEqual([.125, .25, .375, .5]);
    expect(canTraverseValley(d, x - dx, z - dz, x, z)).toBe(true);
    expect(canTraverseValley(d, x, z, x + dx, z + dz)).toBe(true);
    expect(canTraverseValley(d, x, z, x + dz, z - dx)).toBe(false);
    expect(canTraverseValley(d, x + dx, z + dz, x + 2 * dx, z + 2 * dz)).toBe(false);
    expect(canStep(tile(x - dx, z - dz), tile(x, z), createValleyWorld(d))).toBe(true);
  });

  it("supports lowered stair sockets without any smooth cross-tile interpolation", () => {
    const d = complete({ ground: { "60,165": { level: -1, path: false, stairs: 1 }, "59,165": { level: -1, path: false } } });
    expect(sampleValleyGround(d, 59.49, 165)).toBe(-.5);
    expect(sampleValleyGround(d, 59.51, 165)).toBe(-.375);
    expect(sampleValleyGround(d, 60.49, 165)).toBe(0);
    expect(canTraverseValley(d, 59, 165, 60, 165)).toBe(true);
    expect(canTraverseValley(d, 60, 165, 61, 165)).toBe(true);
  });

  it("rejects cliffs and diagonal corner cutting in both action and tile navigation", () => {
    const d = complete({ ground: { "60,165": { level: 1, path: false } } });
    expect(canTraverseValley(d, 59, 165, 60, 165)).toBe(false);
    expect(canTraverseValley(d, 59, 164, 60, 165)).toBe(false);
    expect(canTraverseValley(d, 60, 165, 60.1, 165.1)).toBe(true);
    expect(canTraverseValley(d, 58, 165, 61, 165)).toBe(false);
    expect(canTraverseValley(d, NaN, 165, 60, 165)).toBe(false);
  });

  it("protects occupied pads and rejects edits which trap the actor", () => {
    const d = complete({ home: { x: 54, z: 155, rotation: 0, tentPacked: false },
      furniture: [{ id: "one", itemId: "table", x: 65, z: 166, rotation: 0 }], plants: [{ id: "p", kind: "flowers", x: 64, z: 166 }] });
    expect(editValleyGround(d, 57, 155, "raise").ok).toBe(false);
    expect(editValleyGround(d, 58, 162, "path").ok).toBe(false);
    expect(editValleyGround(d, 48, 145, "raise").ok).toBe(false);
    expect(editValleyGround(d, 65, 166, "raise").ok).toBe(false);
    expect(editValleyGround(d, 64, 166, "path").ok).toBe(false);
    expect(editValleyGround(d, 67, 166, "raise", { x: 67, z: 166 }).ok).toBe(false);
    expect(d.ground["67,166"]).toBeUndefined();
  });

  it("rejects the final terrace segment which disconnects a home entrance", () => {
    const home = { x: 54, z: 155, rotation: 0 as const, tentPacked: false }, ground: ValleyData["ground"] = {};
    // Wall of raised tiles around the reserved pad, except one walkable south doorway.
    for (let x = 53; x <= 64; x++) for (const z of [154, 163]) ground[`${x},${z}`] = { level: 1, path: false };
    for (let z = 155; z <= 162; z++) for (const x of [53, 64]) ground[`${x},${z}`] = { level: 1, path: false };
    delete ground["61,163"];
    const d = complete({ home, ground });
    expect(editValleyGround(d, 61, 163, "raise").ok).toBe(false);
    expect(d.ground["61,163"]).toBeUndefined();
  });

  it("keeps undo bounded, conserves items/XP, and refuses unsafe or newly occupied reversal", () => {
    const d = complete(); const rewards = JSON.stringify([d.carpentryXp, d.furniture, d.forge, d.paid, d.commissions]);
    for (let i = 0; i < 40; i++) expect(editValleyGround(d, 58 + i % 10, 166 + Math.floor(i / 10), "path").ok).toBe(true);
    expect(d.undo).toHaveLength(32);
    expect(undoValleyGround(d).ok).toBe(true);
    expect(d.ground["67,169"]).toBeUndefined();
    expect(JSON.stringify([d.carpentryXp, d.furniture, d.forge, d.paid, d.commissions])).toBe(rewards);
    const d2 = complete({ ground: { "60,165": { level: 1, path: false } } });
    expect(editValleyGround(d2, 60, 165, "lower").ok).toBe(true);
    expect(undoValleyGround(d2, { x: 60, z: 165 }).ok).toBe(false);
    expect(d2.undo).toHaveLength(1);
    const d3 = complete(); editValleyGround(d3, 65, 165, "path");
    d3.furniture.push({ id: "new", itemId: "stool", x: 65, z: 165, rotation: 0 });
    expect(undoValleyGround(d3).ok).toBe(false);
    expect(undoValleyGround(complete()).ok).toBe(false);
  });
});

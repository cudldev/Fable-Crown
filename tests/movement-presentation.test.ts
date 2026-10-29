import { describe, expect, it } from "vitest";
import { createRpg } from "../src/rpg/engine";
import { actorAtlas } from "../src/render/actor-atlas";
import type { ActorState, TilePosition } from "../src/rpg/types";
import { tile } from "../src/rpg/world";
import { actorFrameGeometry, actorFrameKey, observeActorMotion, resolveActorFrameKey, sampleActorMotion } from "../src/render/presentation";

function actorAt(position: TilePosition): ActorState {
  return { ...createRpg(0).player, position, previousPosition: position, movement: null, path: [], action: null };
}
function moving(actor: ActorState, tick: number, mode: "walk" | "run", ...destinations: TilePosition[]): ActorState {
  return { ...actor, previousPosition: actor.position, position: destinations.at(-1)!, movement: { tick, mode, tiles: [actor.position, ...destinations] } };
}
describe("legal movement presentation", () => {
  it("carries an early adjacent walking snapshot through the old corner at constant speed", () => {
    const actor = actorAt(tile(10, 10));
    const initial = observeActorMotion(actor, 0, 0, 0);
    const firstWalk = moving(actor, 1, "walk", tile(11, 10));
    const first = observeActorMotion(firstWalk, 1, 0, 600, initial);
    const secondWalk = moving(firstWalk, 2, "walk", tile(11, 11));
    const before = sampleActorMotion(first, 1100);
    const second = observeActorMotion(secondWalk, 2, 0, 1100, first);
    expect(sampleActorMotion(second, 1100)).toEqual(before);
    expect(sampleActorMotion(second, 1200)).toMatchObject({ position: { x: 11, y: 10 }, facing: "sw", gaitDistance: 1 });
    expect(sampleActorMotion(second, 1350)).toMatchObject({ position: { x: 11, y: 10.25 }, gaitDistance: 1.25 });
    expect(sampleActorMotion(second, 1500)).toMatchObject({ position: { x: 11, y: 10.5 }, gaitDistance: 1.5 });
  });
  it("carries an early two-step run without cutting either legal turn", () => {
    const actor = actorAt(tile(10, 10));
    const initial = observeActorMotion(actor, 0, 0, 0);
    const firstRun = moving(actor, 1, "run", tile(11, 10), tile(11, 11));
    const first = observeActorMotion(firstRun, 1, 0, 600, initial);
    const secondRun = moving(firstRun, 2, "run", tile(12, 11), tile(12, 12));
    const before = sampleActorMotion(first, 1100);
    const second = observeActorMotion(secondRun, 2, 0, 1100, first);
    expect(sampleActorMotion(second, 1100)).toEqual(before);
    expect(sampleActorMotion(second, 1150).position.y).toBeCloseTo(10 + 5 / 6);
    expect(sampleActorMotion(second, 1200)).toMatchObject({ position: { x: 11, y: 11 }, facing: "se", gaitDistance: 2 });
    expect(sampleActorMotion(second, 1350)).toMatchObject({ position: { x: 11.5, y: 11 }, gaitDistance: 2.5 });
    expect(sampleActorMotion(second, 1500)).toMatchObject({ position: { x: 12, y: 11 }, facing: "sw", gaitDistance: 3 });
  });
  it("holds a completed endpoint until a late adjacent snapshot arrives", () => {
    const actor = actorAt(tile(10, 10));
    const initial = observeActorMotion(actor, 0, 0, 0);
    const firstWalk = moving(actor, 1, "walk", tile(11, 10));
    const first = observeActorMotion(firstWalk, 1, 0, 600, initial);
    expect(sampleActorMotion(first, 1299)).toMatchObject({ position: { x: 11, y: 10 }, moving: false, gaitDistance: 1 });
    const secondWalk = moving(firstWalk, 2, "walk", tile(11, 11));
    const second = observeActorMotion(secondWalk, 2, 0, 1300, first);
    expect(sampleActorMotion(second, 1300)).toMatchObject({ position: { x: 11, y: 10 }, gaitDistance: 1 });
    expect(sampleActorMotion(second, 1600)).toMatchObject({ position: { x: 11, y: 10.5 }, gaitDistance: 1.5 });
  });
  it("finishes a carried step before stationary idle but clears carry on import or gaps", () => {
    const actor = actorAt(tile(10, 10));
    const initial = observeActorMotion(actor, 0, 0, 0);
    const walk = moving(actor, 1, "walk", tile(11, 10));
    const first = observeActorMotion(walk, 1, 0, 600, initial);
    const still = { ...walk, previousPosition: walk.position, movement: null };
    const second = observeActorMotion(still, 2, 0, 1100, first);
    expect(sampleActorMotion(second, 1100)).toEqual(sampleActorMotion(first, 1100));
    expect(sampleActorMotion(second, 1200)).toMatchObject({ position: { x: 11, y: 10 }, moving: false });
    expect(observeActorMotion(still, 2, 1, 1100, first).segments).toEqual([]);
    expect(observeActorMotion(still, 3, 0, 1100, first).segments).toEqual([]);
  });
  it("bounds early-snapshot backlog to two old legal steps", () => {
    let actor = actorAt(tile(10, 10));
    let timeline = observeActorMotion(actor, 0, 0, 0);
    for (let tick = 1; tick < 20; tick++) {
      actor = moving(actor, tick, "walk", tile(10 + tick, 10));
      timeline = observeActorMotion(actor, tick, 0, tick * 100, timeline);
      expect(timeline.segments.length).toBeLessThanOrEqual(3); // two carried + one new walk
      const end = timeline.segments.at(-1)!;
      expect(end.at + 600 - tick * 100).toBeLessThanOrEqual(1800);
      for (const segment of timeline.segments) expect(segment.to.x - segment.from.x).toBe(1);
    }
  });
  it("follows both legs of a running corner without cutting diagonally", () => {
    const actor = actorAt(tile(10, 10));
    const initial = observeActorMotion(actor, 0, 0, 0);
    const run = moving(actor, 1, "run", tile(11, 10), tile(11, 11));
    const timeline = observeActorMotion(run, 1, 0, 600, initial);
    expect(sampleActorMotion(timeline, 750)).toMatchObject({ position: { x: 10.5, y: 10 }, facing: "se", mode: "run" });
    expect(sampleActorMotion(timeline, 900)).toMatchObject({ position: { x: 11, y: 10 }, facing: "sw" });
    expect(sampleActorMotion(timeline, 1050)).toMatchObject({ position: { x: 11, y: 10.5 }, facing: "sw" });
    expect(sampleActorMotion(timeline, 1200)).toMatchObject({ position: { x: 11, y: 11 }, moving: false, gaitDistance: 2 });
  });
  it("keeps a blocked final run step at run speed and then rests", () => {
    const actor = actorAt(tile(10, 10));
    const initial = observeActorMotion(actor, 0, 0, 0);
    const run = moving(actor, 1, "run", tile(11, 10));
    run.path = [tile(11, 11)]; // A remaining route is not proof that a second step occurred.
    const timeline = observeActorMotion(run, 1, 0, 600, initial);
    expect(sampleActorMotion(timeline, 750)).toMatchObject({ position: { x: 10.5, y: 10 }, moving: true, mode: "run" });
    expect(actorFrameKey(run, "se", 150, false, undefined, sampleActorMotion(timeline, 750))).toBe("se:run:1");
    expect(sampleActorMotion(timeline, 900)).toMatchObject({ position: { x: 11, y: 10 }, moving: false, gaitDistance: 1 });
    expect(sampleActorMotion(timeline, 1199).gaitDistance).toBe(1);
  });
  it("preserves gait through ticks, turns and an energy-induced walk transition", () => {
    const actor = actorAt(tile(10, 10));
    const initial = observeActorMotion(actor, 0, 0, 0);
    const run = moving(actor, 1, "run", tile(11, 10));
    const first = observeActorMotion(run, 1, 0, 600, initial);
    const walk = moving(run, 2, "walk", tile(11, 11));
    const second = observeActorMotion(walk, 2, 0, 1200, first);
    const sample = sampleActorMotion(second, 1350);
    expect(sample).toMatchObject({ position: { x: 11, y: 10.25 }, facing: "sw", mode: "walk", gaitDistance: 1.25 });
    expect(actorFrameKey(walk, "sw", 150, false, undefined, sample)).toBe("sw:walk:2");
    const still = { ...walk, previousPosition: walk.position, movement: null };
    const third = observeActorMotion(still, 3, 0, 1800, second);
    expect(sampleActorMotion(third, 9000)).toMatchObject({ facing: "sw", moving: false, gaitDistance: 2 });
  });
  it("does not restart interpolation or gait on same-tick command updates", () => {
    const actor = actorAt(tile(10, 10));
    const first = observeActorMotion(actor, 0, 0, 0);
    const walk = moving(actor, 1, "walk", tile(11, 10));
    const timeline = observeActorMotion(walk, 1, 0, 600, first);
    const updated = observeActorMotion({ ...structuredClone(walk), activity: "New direct order" }, 1, 0, 850, timeline);
    expect(updated).toBe(timeline);
    expect(sampleActorMotion(updated, 900)).toMatchObject({ position: { x: 10.5, y: 10 }, gaitDistance: 0.5 });
  });
  it("keeps a walking cycle continuous when the next tick changes direction", () => {
    const actor = actorAt(tile(10, 10));
    const initial = observeActorMotion(actor, 0, 0, 0);
    const firstWalk = moving(actor, 1, "walk", tile(11, 10));
    const first = observeActorMotion(firstWalk, 1, 0, 600, initial);
    const nextWalk = moving(firstWalk, 2, "walk", tile(12, 9));
    const second = observeActorMotion(nextWalk, 2, 0, 1200, first);
    const sample = sampleActorMotion(second, 1200);
    expect(sample).toMatchObject({ position: { x: 11, y: 10 }, facing: "e", gaitDistance: 1 });
    expect(actorFrameKey(nextWalk, sample.facing, 0, false, undefined, sample)).toBe("e:walk:2");
  });
  it("snaps initial loads, imports, tick gaps, teleports and invalid traces", () => {
    const actor = actorAt(tile(10, 10));
    const first = observeActorMotion(actor, 0, 0, 0);
    const run = moving(actor, 1, "run", tile(11, 10), tile(11, 11));
    for (const timeline of [observeActorMotion(run, 1, 0, 600), observeActorMotion(run, 1, 1, 600, first), observeActorMotion(run, 5, 0, 600, first)]) {
      expect(sampleActorMotion(timeline, 600)).toMatchObject({ position: { x: 11, y: 11 }, moving: false });
    }
    const teleport = moving(actor, 1, "run", tile(100, 100));
    expect(sampleActorMotion(observeActorMotion(teleport, 1, 0, 600, first), 700)).toMatchObject({ position: { x: 100, y: 100 }, moving: false });
    const valid = observeActorMotion(run, 1, 0, 600, first);
    expect(sampleActorMotion(observeActorMotion({ ...run, position: tile(20, 20) }, 1, 0, 700, valid), 700)).toMatchObject({ position: { x: 20, y: 20 }, moving: false });
  });
  it("reduced motion snaps to the final heading and stays visually still", () => {
    const actor = actorAt(tile(10, 10));
    const first = observeActorMotion(actor, 0, 0, 0);
    const run = moving(actor, 1, "run", tile(11, 10), tile(11, 11));
    const timeline = observeActorMotion(run, 1, 0, 600, first);
    const sample = sampleActorMotion(timeline, 610, true);
    expect(sample).toMatchObject({ position: { x: 11, y: 11 }, facing: "sw", moving: false });
    expect(sampleActorMotion(timeline, 1100, true)).toEqual(sample);
  });
  it("keeps anatomical pivots on a crosshair with bounded cell bakes", () => {
    for (const [width, height, pivotX, pivotY] of [[400, 600, 170, 540], [900, 1400, 450, 1260], [1800, 600, 900, 540]]) {
      const frame = { sheet: "test", x: 0, y: 0, width, height, pivotX, pivotY, boundsWidth: width, boundsHeight: height, bodyHeight: 500 };
      const geometry = actorFrameGeometry(frame);
      expect(geometry.x + pivotX / width * geometry.width).toBeCloseTo(0);
      expect(geometry.y + pivotY / height * geometry.height).toBeCloseTo(0);
      expect(geometry.bakeWidth).toBeLessThanOrEqual(256);
      expect(geometry.bakeHeight).toBeLessThanOrEqual(256);
      expect(geometry.height / height * frame.bodyHeight).toBeCloseTo(90);
    }
  });
  it("mirrors asymmetric sprite cells around the same anatomical ground anchor", () => {
    const frame = { sheet: "test", x: 400, y: 500, width: 400, height: 700, pivotX: 130, pivotY: 650, boundsWidth: 330, boundsHeight: 650, bodyHeight: 500 };
    const normal = actorFrameGeometry(frame);
    const flipped = actorFrameGeometry({ ...frame, flipX: true });
    // A source point u is baked at (1-u/width)*bakeWidth by translate(width),scale(-1,1).
    const mirroredWorldX = (sourceX: number) => flipped.x + (1 - sourceX / frame.width) * flipped.width;
    expect(mirroredWorldX(frame.pivotX)).toBeCloseTo(0);
    expect(flipped.y + frame.pivotY / frame.height * flipped.height).toBeCloseTo(0);
    expect(mirroredWorldX(frame.pivotX - 20)).toBeGreaterThan(0);
    expect(normal.x + (frame.pivotX - 20) / frame.width * normal.width).toBeLessThan(0);
    expect(flipped).toMatchObject({ width: normal.width, height: normal.height, bakeWidth: normal.bakeWidth, bakeHeight: normal.bakeHeight, flipX: true });
    expect(flipped.bakeWidth).toBeLessThanOrEqual(256);
    expect(flipped.bakeHeight).toBeLessThanOrEqual(256);
  });
  it("keeps northeast animation keys and screen heading when northwest pixels are mirrored", () => {
    const actor = actorAt(tile(10, 10));
    const first = observeActorMotion(actor, 0, 0, 0);
    const walk = moving(actor, 1, "walk", tile(10, 9));
    const motion = sampleActorMotion(observeActorMotion(walk, 1, 0, 600, first), 900);
    expect(motion.facing).toBe("ne");
    const key = actorFrameKey(walk, motion.facing, 300, false, undefined, motion);
    expect(resolveActorFrameKey(key, actorAtlas)).toBe("ne:walk:1");
    expect(actorAtlas[key].flipX).toBe(true);
    expect(actorAtlas[key].sheet).toBe(actorAtlas["nw:walk:1"].sheet);
    expect(actorAtlas["ne:mine"].flipX).not.toBe(true);
  });
  it("prefers eight-way locomotion while retaining old diagonal action/fallback art", () => {
    const frames = { "s:run:3": {}, "sw:walk:0": {}, "sw:idle": {}, "se:mine": {} };
    expect(resolveActorFrameKey("s:run:3", frames)).toBe("s:run:3");
    expect(resolveActorFrameKey("s:walk:3", frames)).toBe("sw:walk:0");
    expect(resolveActorFrameKey("e:mine", frames)).toBe("se:mine");
  });
});

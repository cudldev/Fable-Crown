import { describe, expect, it } from "vitest";
import { createRpg } from "../src/rpg/engine";
import type { SimulationEffect } from "../src/rpg/types";
import { tile } from "../src/rpg/world";
import { actorFrameKey, committedImpact, consumeEffects, observeWorkContact, resolveActorFrameKey, resourceArt, workStroke } from "../src/render/presentation";

const hit = (id: number, tick: number): SimulationEffect => ({ id, tick, kind: "hit", actorId: "player", position: tile(5, 5), targetId: "boar-0", targetPosition: tile(6, 5), success: true, amount: 3 });
describe("committed presentation effects", () => {
  it("baselines historical IDs, accepts fresh same-tick effects once and keeps outcome positions", () => {
    const state = createRpg(0);
    state.effects = [hit(5, state.tick)]; state.effectSequence = 5;
    const baseline = consumeEffects(state, 0);
    expect(baseline.effects).toEqual([]);
    state.effects.push(hit(6, state.tick)); state.effectSequence = 6;
    const fresh = consumeEffects(state, 0, baseline.cursor);
    expect(fresh.effects.map(effect => effect.id)).toEqual([6]);
    expect(committedImpact(fresh.effects[0])).toEqual({ position: tile(6, 5), text: "3", hit: true });
    expect(consumeEffects(structuredClone(state), 0, fresh.cursor).effects).toEqual([]);
    state.tick++; state.effects.push(hit(7, state.tick)); state.effectSequence = 7;
    expect(consumeEffects(state, 0, fresh.cursor).effects.map(effect => effect.id)).toEqual([7]);
  });
  it("suppresses imports, tick jumps and sequence regressions, then resumes from the new baseline", () => {
    const state = createRpg(0);
    const baseline = consumeEffects(state, 0);
    state.effects = [hit(1, state.tick)]; state.effectSequence = 1;
    expect(consumeEffects(state, 1, baseline.cursor)).toMatchObject({ reset: true, effects: [] });
    state.tick += 20; state.effects = [hit(2, state.tick)]; state.effectSequence = 2;
    const gap = consumeEffects(state, 0, baseline.cursor);
    expect(gap).toMatchObject({ reset: true, effects: [] });
    state.tick++; state.effects.push(hit(3, state.tick)); state.effectSequence = 3;
    expect(consumeEffects(state, 0, gap.cursor).effects.map(effect => effect.id)).toEqual([3]);
    state.effectSequence = 1; state.effects = [];
    expect(consumeEffects(state, 0, gap.cursor)).toMatchObject({ reset: true, effects: [] });
  });
  it("clears prior visuals on teleport but retains a fresh committed death at its historical tile", () => {
    const state = createRpg(0), baseline = consumeEffects(state, 0);
    state.player.position = tile(100, 100);
    const defeat: SimulationEffect = { ...hit(1, state.tick), kind: "defeat", actorId: "boar-0", targetId: "player" };
    state.effects = [defeat]; state.effectSequence = 1;
    const result = consumeEffects(state, 0, baseline.cursor);
    expect(result.reset).toBe(true);
    expect(result.effects).toEqual([defeat]);
    state.player.position = tile(130, 100);
    expect(consumeEffects(state, 0, result.cursor).effects).toEqual([]);
  });
  it("binds hit/miss only to committed success and positive damage", () => {
    expect(committedImpact({ ...hit(1, 1), success: false, amount: 0 })).toMatchObject({ text: "Miss", hit: false });
    expect(committedImpact({ ...hit(1, 1), success: true, amount: 0 })).toMatchObject({ text: "Miss", hit: false });
    expect(committedImpact({ ...hit(1, 1), kind: "projectile" })).toBeNull();
    expect(committedImpact({ ...hit(1, 1), targetPosition: undefined })).toBeNull();
  });
});
describe("real work cycle presentation", () => {
  const target = { id: "rock", name: "Rock", kind: "rock" as const, position: tile(10, 10), width: 1, height: 1, blocks: true };
  function worker() {
    const actor = createRpg(0).player;
    actor.path = []; actor.previousPosition = actor.position; actor.movement = null;
    actor.action = { kind: "gather", targetId: "rock", duration: 4, remaining: 4 };
    return actor;
  }
  it("prepares, contacts once and recovers along an unchanged authoritative cycle", () => {
    const actor = worker();
    const prepare = workStroke(actor, 10, 0, target)!;
    expect(prepare.phase).toBe("prepare");
    let contact = observeWorkContact(undefined, prepare, 0);
    expect(contact.contact).toBe(false);
    actor.action!.remaining = 2;
    const stroke = workStroke(actor, 12, 0, target)!;
    expect(stroke.key).toBe(prepare.key);
    expect(stroke.phase).toBe("contact");
    contact = observeWorkContact(contact.cursor, stroke, 0);
    expect(contact.contact).toBe(true);
    expect(observeWorkContact(contact.cursor, stroke, 0).contact).toBe(false);
    actor.action!.remaining = 1;
    const recover = workStroke(actor, 13, 500, target)!;
    expect(recover.phase).toBe("recover");
    expect(observeWorkContact(contact.cursor, recover, 0).contact).toBe(false);
  });
  it("cancels contact on movement/interruption/import and never replays late-observed contact", () => {
    const actor = worker();
    const prepare = observeWorkContact(undefined, workStroke(actor, 10, 0, target), 0);
    actor.action!.remaining = 2;
    const contact = workStroke(actor, 12, 0, target)!;
    expect(observeWorkContact(prepare.cursor, contact, 1).contact).toBe(false);
    const cancelled = observeWorkContact(prepare.cursor, null, 0);
    expect(observeWorkContact(cancelled.cursor, contact, 0).contact).toBe(false);
    expect(observeWorkContact(undefined, contact, 0).contact).toBe(false);
    actor.path = [tile(11, 10)];
    expect(workStroke(actor, 12, 0, target)).toBeNull();
    actor.path = []; actor.action = null;
    expect(workStroke(actor, 12, 0, target)).toBeNull();
  });
  it("uses stable reduced-motion contact poses and falls back to old four-way action artwork", () => {
    const actor = worker();
    expect(actorFrameKey(actor, "e", 0, true, target)).toBe("se:mine:contact");
    expect(actorFrameKey(actor, "e", 500, true, target)).toBe("se:mine:contact");
    const frames = { "se:mine": {}, "se:idle": {} };
    expect(resolveActorFrameKey("se:mine:recover", frames)).toBe("se:mine");
    expect(resolveActorFrameKey("e:mine:contact", frames)).toBe("se:mine");
  });
});
describe("resource depletion art", () => {
  it("replaces depleted resources with solid distinct props and restores originals on respawn", () => {
    expect(resourceArt("tree", false, "iso-oak")).toBe("prop-stump");
    expect(resourceArt("rock", false, "ore")).toBe("prop-exhausted-ore");
    expect(resourceArt("tree", true, "iso-willow")).toBe("iso-willow");
    expect(resourceArt("rock", true, "ore")).toBe("ore");
    expect(resourceArt("fish", false, "water")).toBe("water");
  });
});

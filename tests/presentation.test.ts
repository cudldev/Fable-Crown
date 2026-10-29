import { describe, expect, it } from "vitest";
import { createRpg } from "../src/rpg/engine";
import { tile } from "../src/rpg/world";
import { actionPose, actorFrameKey, facingFromMotion, observedHits, observeHealth } from "../src/render/presentation";

describe("actor presentation never controls the simulation", () => {
  it("projects tile movement to eight screen headings and keeps an idle heading", () => {
    expect(facingFromMotion(tile(0, 0), tile(1, 0))).toBe("se");
    expect(facingFromMotion(tile(0, 0), tile(0, 1))).toBe("sw");
    expect(facingFromMotion(tile(1, 0), tile(0, 0))).toBe("nw");
    expect(facingFromMotion(tile(0, 1), tile(0, 0))).toBe("ne");
    expect(facingFromMotion(tile(0, 0), tile(1, -1))).toBe("e");
    expect(facingFromMotion(tile(0, 0), tile(1, 1))).toBe("s");
    expect(facingFromMotion(tile(0, 0), tile(-1, 1))).toBe("w");
    expect(facingFromMotion(tile(0, 0), tile(-1, -1))).toBe("n");
    expect(facingFromMotion(tile(0, 0), tile(0, 0), "nw")).toBe("nw");
  });
  it("requires observed legal motion rather than inferring movement from an endpoint", () => {
    const actor = createRpg(0).player;
    actor.previousPosition = tile(10, 10); actor.position = tile(11, 10);
    expect(actorFrameKey(actor, "se", 0, false)).toBe("se:idle");
    actor.position = tile(12, 10);
    expect(actorFrameKey(actor, "se", 700, false)).toBe("se:idle");
    expect(actorFrameKey(actor, "se", 350, true)).toBe("se:idle");
  });
  it("uses the real action target and only animates work after travel", () => {
    const actor = createRpg(0).player;
    actor.previousPosition = actor.position; actor.path = [];
    actor.action = { kind: "gather", duration: 3, remaining: 2 };
    const target = { id: "rock", name: "Rock", kind: "rock" as const, position: actor.position, width: 1, height: 1, blocks: true };
    expect(actionPose(actor, target)).toBe("mine");
    expect(actionPose(actor, { ...target, kind: "tree" })).toBe("cut");
    expect(actionPose(actor, { ...target, kind: "fish" })).toBe("fish");
    expect(actorFrameKey(actor, "nw", 20, false, target)).toBe("nw:mine");
    expect(actorFrameKey(actor, "nw", 350, false, target)).toBe("nw:idle");
    expect(actorFrameKey(actor, "nw", 350, true, target)).toBe("nw:mine");
    actor.path = [tile(50, 50)];
    expect(actorFrameKey(actor, "nw", 20, false, target)).toBe("nw:idle");
    actor.path = []; actor.action.kind = "craft";
    expect(actionPose(actor, { ...target, kind: "range" })).toBe("cook");
    expect(actionPose(actor, { ...target, kind: "anvil" })).toBe("smith");
    actor.action.kind = "fight";
    expect(actionPose(actor)).toBe("melee");
    actor.equipment.weapon = "ordinary-bow";
    expect(actionPose(actor)).toBe("bow");
    actor.action = null;
    expect(actionPose(actor)).toBe("idle");
  });
  it("shows only observed health losses; resets, healing, catch-up and teleports are quiet", () => {
    const state = createRpg(0);
    const first = observeHealth(state);
    state.tick++; state.player.health -= 3;
    expect(observedHits(first, observeHealth(state))).toMatchObject([{ id: "player", damage: 3 }]);
    expect(observedHits(first, observeHealth(state, 1))).toEqual([]);
    state.tick++;
    expect(observedHits(first, observeHealth(state))).toEqual([]);
    state.tick--;
    state.player.position = { ...state.player.position, x: state.player.position.x + 10 };
    expect(observedHits(first, observeHealth(state))).toEqual([]);
    state.player.position = first.entities.get("player")!.position;
    state.player.health += 6;
    expect(observedHits(first, observeHealth(state))).toEqual([]);
  });
});

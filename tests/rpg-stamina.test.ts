import { describe, expect, it } from "vitest";
import { applyRpgCommand, createRpg, reconcileRpg, stepRpg, validateRpgSave } from "../src/rpg/engine";
import { explainIntention } from "../src/rpg/intention-explanation";
import { findPath, tile } from "../src/rpg/world";
import type { RpgState } from "../src/rpg/types";

const NOW = Date.UTC(2026, 9, 30, 12);
function trip(energy: number, length?: number) {
  const s = createRpg(NOW, 7);
  s.control.thinkingUntil = 1e9;
  const path = findPath(s.player.position, tile(97, 105))!;
  const destination = length ? path[length - 1] : path.at(-1)!;
  expect(applyRpgCommand(s, { type: "move", position: destination }).ok).toBe(true);
  s.control.source = "autonomous";
  s.player.runEnergy = energy;
  return s;
}
function valid(s: RpgState) { expect(validateRpgSave(JSON.parse(JSON.stringify(s)))).not.toBeNull(); }

describe("autonomous run energy management", () => {
  it("turns running back on after recovery instead of walking forever", () => {
    const s = trip(4000); s.control.running = false;
    stepRpg(s);
    expect(s.player.movement?.mode).toBe("run");
    expect(s.player.runEnergy).toBe(3880); valid(s);
  });

  it("walks short approaches at low energy and avoids rapid run/walk toggling", () => {
    const s = trip(1500, 12); s.control.running = true;
    stepRpg(s, 5);
    expect(s.control.running).toBe(false); expect(s.control.staminaResting).toBeUndefined();
    expect(s.player.runEnergy).toBe(1575); expect(s.player.movement?.mode).toBe("walk");
    expect(s.player.path).toHaveLength(7); valid(s);
  });

  it("rests before a long trip, retains the plan, then resumes the same legal route", () => {
    const s = trip(1500), route = structuredClone(s.player.path), order = structuredClone(s.control.active);
    const inventory = structuredClone(s.player.inventory), skills = structuredClone(s.player.skills);
    stepRpg(s, 30);
    expect(s.control.staminaResting).toBe(true); expect(s.player.runEnergy).toBe(6000);
    expect(s.player.path).toEqual(route); expect(s.control.active).toEqual(order);
    expect(s.player.movement).toBeNull(); expect(s.player.action).toBeNull();
    expect(s.player.inventory).toEqual(inventory); expect(s.player.skills).toEqual(skills);
    const view = explainIntention(s);
    expect(view).toMatchObject({ phase: "wait", title: "Resting to recover run energy", progress: { value: 6000, max: 6000 } });
    expect(view.next).toContain("same route"); valid(s);
    stepRpg(s);
    expect(s.control.staminaResting).toBeUndefined(); expect(s.control.running).toBe(true);
    expect(s.player.movement?.mode).toBe("run"); expect(s.player.path).toEqual(route.slice(2)); valid(s);
  });

  it("keeps recovery deterministic through save/load and offline catch-up", () => {
    const s = trip(0), start = { ...s.player.position }, routeLength = s.player.path.length; stepRpg(s, 7);
    const loaded = validateRpgSave(JSON.parse(JSON.stringify(s)))!;
    expect(loaded).not.toBeNull();
    reconcileRpg(s, NOW + 120000); reconcileRpg(loaded, NOW + 120000);
    expect(loaded).toEqual(s); valid(s);
    expect(s.player.position).not.toEqual(start); expect(s.player.path.length).toBeLessThan(routeLength);
    expect(s.control.staminaResting).toBeUndefined();
  });

  it("lets direct orders, Wait and manual pace choices interrupt a break", () => {
    const s = trip(1500); stepRpg(s);
    expect(applyRpgCommand(s, { type: "run", enabled: false }).ok).toBe(true);
    expect(s.control.staminaResting).toBeUndefined(); stepRpg(s, 4);
    expect(s.player.movement?.mode).toBe("walk"); expect(s.control.paceOverride).toBe(true); valid(s);
    expect(applyRpgCommand(s, { type: "run", enabled: true }).ok).toBe(true); stepRpg(s);
    expect(s.player.movement?.mode).toBe("run"); valid(s);
    const direct = trip(0); stepRpg(direct);
    expect(applyRpgCommand(direct, { type: "move", position: tile(60, 100) }).ok).toBe(true);
    expect(direct.control.staminaResting).toBeUndefined(); stepRpg(direct);
    expect(direct.player.movement?.mode).toBe("walk"); valid(direct);
    const paused = trip(0); stepRpg(paused); applyRpgCommand(paused, { type: "wait" });
    const energy = paused.player.runEnergy; stepRpg(paused);
    expect(paused.control.staminaResting).toBeUndefined(); expect(paused.player.runEnergy).toBe(energy + 15); valid(paused);
  });

  it("never rests during grave recovery, an attack approach or a low-health retreat", () => {
    const attack = trip(1500); attack.control.active = { type: "attack", enemyId: "boar-0" };
    stepRpg(attack); expect(attack.player.movement?.mode).toBe("walk"); expect(attack.control.staminaResting).toBeUndefined();
    const recovery = trip(1500); recovery.control.active = { type: "recover" };
    stepRpg(recovery); expect(recovery.player.movement?.mode).toBe("run"); expect(recovery.control.staminaResting).toBeUndefined();
    const retreat = trip(1500); stepRpg(retreat); retreat.player.health = 2;
    retreat.player.inventory = retreat.player.inventory.filter((item) => item.itemId !== "cooked-shrimp");
    stepRpg(retreat); expect(retreat.player.movement?.mode).toBe("run"); expect(retreat.control.staminaResting).toBeUndefined(); valid(retreat);
  });

  it("loads older saves without pace fields and rejects malformed new values", () => {
    const s = trip(5000); valid(s);
    for (const field of ["staminaResting", "paceOverride"] as const) {
      const bad = JSON.parse(JSON.stringify(s)); bad.control[field] = "yes";
      expect(validateRpgSave(bad)).toBeNull();
    }
  });
});

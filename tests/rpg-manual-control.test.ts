import { describe, expect, it } from "vitest";
import { applyRpgCommand, createRpg, reconcileRpg, stepRpg, validateRpgSave } from "../src/rpg/engine";
import { interactionTiles, objectById, tile } from "../src/rpg/world";
import { itemCount } from "../src/rpg/inventory";
import type { RpgCommand, RpgState } from "../src/rpg/types";

const NOW = Date.UTC(2026, 9, 31, 12);
function fresh() {
  const state = createRpg(NOW, 42);
  state.player.position = tile(70, 108);
  state.player.previousPosition = { ...state.player.position };
  return state;
}
function accept(state: RpgState, command: RpgCommand) {
  expect(applyRpgCommand(state, command).ok).toBe(true);
}

describe("persistent manual control", () => {
  it("holds a direct destination through idle ticks and offline reconciliation", () => {
    const state = fresh(), destination = tile(71, 108);
    accept(state, { type: "move", position: destination });
    expect(state.control.autoplay).toBe(false);
    stepRpg(state, 250);
    expect(state.player.position).toEqual(destination);
    expect(state.control.active).toBeNull();
    expect(state.player.action).toBeNull();
    expect(state.control.goal?.questId).toBe("forge");
    const loaded = validateRpgSave(JSON.parse(JSON.stringify(state)))!;
    expect(loaded).not.toBeNull();
    const replay = structuredClone(loaded);
    reconcileRpg(loaded, NOW + 600 * 120 * 4);
    stepRpg(replay, 120);
    expect(loaded.player).toEqual(replay.player);
    expect(loaded.control).toEqual(replay.control);
    expect(loaded.player.position).toEqual(destination);
  });

  it("stops autonomous travel and restarts only after explicitly enabling autoplay", () => {
    const state = fresh();
    stepRpg(state, 3);
    expect(state.control.source).toBe("autonomous");
    accept(state, { type: "autoplay", enabled: false });
    const stopped = { ...state.player.position };
    expect(state.player.path).toEqual([]);
    expect(state.player.movement).toBeNull();
    stepRpg(state, 30);
    expect(state.player.position).toEqual(stopped);
    expect(state.control.active).toBeNull();
    accept(state, { type: "autoplay", enabled: true });
    stepRpg(state, 3);
    expect(state.control.autoplay).toBe(true);
    expect(state.control.source).toBe("autonomous");
    expect(state.player.position).not.toEqual(stopped);
    expect(validateRpgSave(state)).not.toBeNull();
  });

  it("runs manual queues and inventory transactions without re-enabling autoplay", () => {
    const state = fresh();
    accept(state, { type: "autoplay", enabled: false });
    accept(state, { type: "unequip", slot: "weapon" });
    accept(state, { type: "enqueue", order: { type: "move", position: tile(71, 108) } });
    accept(state, { type: "enqueue", order: { type: "move", position: tile(72, 108) } });
    stepRpg(state, 30);
    expect(state.player.position).toEqual(tile(72, 108));
    expect(state.player.equipment.weapon).toBeUndefined();
    expect(itemCount(state.player.inventory, "bronze-sword")).toBe(1);
    accept(state, { type: "equip", itemId: "bronze-sword" });
    stepRpg(state, 30);
    expect(state.control.autoplay).toBe(false);
    expect(state.player.equipment.weapon).toBe("bronze-sword");
    expect(state.control.active).toBeNull();
    expect(state.player.position).toEqual(tile(72, 108));
    expect(validateRpgSave(state)).not.toBeNull();
    const automatic = fresh();
    accept(automatic, { type: "unequip", slot: "weapon" });
    expect(automatic.control.autoplay).toBe(true);
  });

  it("finishes one selected ambition without selecting another adventure", () => {
    const state = fresh();
    state.player.position = { ...interactionTiles(objectById("oakrest-ore-0")!)[0] };
    state.player.previousPosition = { ...state.player.position };
    accept(state, { type: "autoplay", enabled: false });
    accept(state, { type: "goal", goal: {
      id: "manual-copper", title: "One copper", kind: "gather", resourceId: "copper", quantity: 1,
      targetId: "oakrest-ore-0",
    } });
    stepRpg(state, 100);
    expect(itemCount(state.player.inventory, "copper-ore")).toBe(1);
    expect(state.control.goal?.id).toBe("manual-copper");
    expect(state.control.manualGoal).toBeUndefined();
    expect(state.control.autoplay).toBe(false);
    expect(state.control.active).toBeNull();
    const stopped = { ...state.player.position };
    stepRpg(state, 100);
    expect(state.player.position).toEqual(stopped);
    expect(itemCount(state.player.inventory, "copper-ore")).toBe(1);
    expect(validateRpgSave(state)).not.toBeNull();
  });

  it("preserves old chapter defaults, validates mode flags and rejects commands without mutation", () => {
    const old = fresh();
    delete old.control.autoplay;
    const loaded = validateRpgSave(old)!;
    expect(loaded).not.toBeNull();
    stepRpg(loaded, 3);
    expect(loaded.control.source).toBe("autonomous");
    for (const flag of ["autoplay", "manualGoal"] as const) {
      const invalid = fresh();
      Object.assign(invalid.control, { [flag]: "yes" });
      expect(validateRpgSave(invalid)).toBeNull();
    }
    const state = fresh(), before = JSON.stringify(state);
    expect(applyRpgCommand(state, { type: "move", position: tile(0, 0) }).ok).toBe(false);
    expect(JSON.stringify(state)).toBe(before);
    expect(applyRpgCommand(state, { type: "autoplay", enabled: "yes" } as unknown as RpgCommand).ok).toBe(false);
    expect(JSON.stringify(state)).toBe(before);
  });
});

import { expect, it } from "vitest";
import { createRpg, applyRpgCommand, stepRpg, validateRpgSave } from "../src/rpg/engine";
import { defaultInteraction } from "../src/rpg/default-interaction";
import { WORLD, tile, interactionTiles } from "../src/rpg/world";
import { inventorySlots } from "../src/rpg/inventory";

it("chooses direct attack/harvest/walk defaults and opens bank without depositing", () => {
  const state = createRpg(Date.UTC(2026, 9, 31));
  for (const [resource, verb] of [["copper", "Mine"], ["tree", "Chop"], ["shrimp", "Fish"]]) {
    const object = WORLD.objects.find(value => value.resourceId === resource)!;
    expect(defaultInteraction(state, { kind: "object", id: object.id })).toMatchObject({ label: expect.stringContaining(verb), order: { type: "gather", objectId: object.id, quantity: 28 - inventorySlots(state.player.inventory) } });
  }
  expect(defaultInteraction(state, { kind: "enemy", id: "boar-0" }).order).toEqual({ type: "attack", enemyId: "boar-0" });
  expect(defaultInteraction(state, { kind: "tile", position: tile(71, 108) }).order?.type).toBe("move");
  expect(defaultInteraction(state, { kind: "object", id: WORLD.objects.find(value => value.kind === "bank")!.id }).order).toBeUndefined();
  state.player.inventory.push({ itemId: "logs", quantity: 28 - inventorySlots(state.player.inventory) });
  const full = defaultInteraction(state, { kind: "object", id: WORLD.objects.find(value => value.resourceId === "copper")!.id });
  expect(full.order).toBeUndefined(); expect(full.blocked).toContain("full");
});

it("Escape cancellation clears movement and pending orders while preserving items and manual idle", () => {
  const state = createRpg(Date.UTC(2026, 9, 31));
  state.player.position = tile(70, 108); state.player.previousPosition = { ...state.player.position };
  applyRpgCommand(state, { type: "move", position: tile(73, 108) });
  applyRpgCommand(state, { type: "enqueue", order: { type: "move", position: tile(74, 108) } });
  const items = JSON.stringify([state.player.inventory, state.player.equipment, state.bank]);
  expect(applyRpgCommand(state, { type: "cancel" }).ok).toBe(true);
  const stopped = { ...state.player.position };
  stepRpg(state, 250);
  expect(state.player.position).toEqual(stopped);
  expect(state.control).toMatchObject({ autoplay: false, waiting: false, active: null, queue: [] });
  expect(state.player.path).toEqual([]); expect(state.player.action).toBeNull();
  expect(JSON.stringify([state.player.inventory, state.player.equipment, state.bank])).toBe(items);
  expect(validateRpgSave(state)).not.toBeNull();
});

it("a default conversation talks once and does not send Alden after quest requirements", () => {
  const state = createRpg(Date.UTC(2026, 9, 31)), giver = WORLD.objects.find(value => value.id === "quest-forge")!;
  state.player.position = { ...interactionTiles(giver)[0] }; state.player.previousPosition = { ...state.player.position };
  const action = defaultInteraction(state, { kind: "object", id: giver.id });
  expect(action.order).toMatchObject({ type: "interact", once: true });
  expect(applyRpgCommand(state, action.order!).ok).toBe(true);
  stepRpg(state, 150);
  expect(state.control.autoplay).toBe(false); expect(state.control.active).toBeNull();
  expect(state.control.manualGoal).not.toBe(true); expect(state.player.position).toEqual(interactionTiles(giver)[0]);
  expect(validateRpgSave(state)).not.toBeNull();
});

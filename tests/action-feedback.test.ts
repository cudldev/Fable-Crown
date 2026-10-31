import { expect, it } from "vitest";
import { createRpg } from "../src/rpg/engine";
import { actionFeedback } from "../src/rpg/action-feedback";
import { WORLD } from "../src/rpg/world";

it("names real harvesting actions and hides work during travel or pause", () => {
  const state = createRpg(Date.UTC(2026, 9, 31));
  for (const [resourceId, label] of [["tree", "Chopping"], ["copper", "Mining"], ["shrimp", "Fishing"]]) {
    const object = WORLD.objects.find(value => value.resourceId === resourceId)!;
    state.player.action = { kind: "gather", targetId: object.id, duration: 5, remaining: 3 };
    expect(actionFeedback(state)).toMatchObject({ label, detail: object.name, elapsed: 2, duration: 5 });
  }
  state.player.path = [state.player.position];
  expect(actionFeedback(state)).toBeNull();
  state.player.path = [];
  state.control.waiting = true;
  expect(actionFeedback(state)).toBeNull();
});

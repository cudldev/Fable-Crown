import { describe, it, expect } from "vitest";
import { createRpg } from "../src/rpg/engine";
import { WORLD, objectById } from "../src/rpg/world";
import { examineObject, itemUses } from "../src/rpg/interactions";
describe("world item interactions", () => {
  it("offers only owned matching tools and valid crafting preparation", () => {
    const s = createRpg(Date.now()),
      ore = WORLD.objects.find((o) => o.resourceId === "copper")!;
    expect(itemUses(s, "bronze-pickaxe", ore)[0].command.type).toBe("goal");
    expect(itemUses(s, "bronze-axe", ore)).toEqual([]);
    expect(itemUses(s, "steel-pickaxe", ore)).toEqual([]);
    s.player.inventory.push({ itemId: "copper-ore", quantity: 1 });
    expect(
      itemUses(s, "copper-ore", objectById("oakrest-furnace")!)[0].label,
    ).toContain("Prepare");
  });
  it("examines actual availability and completed quests", () => {
    const s = createRpg(Date.now()),
      ore = WORLD.objects.find((o) => o.resourceId === "copper")!;
    expect(examineObject(s, ore)).toContain("Ready");
    s.resources[ore.id].available = false;
    expect(examineObject(s, ore)).toContain("Recovering");
    s.quests.forge.complete = true;
    expect(examineObject(s, objectById("quest-forge")!)).toContain("completed");
  });
});

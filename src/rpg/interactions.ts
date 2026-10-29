import { ITEMS, RECIPES, RESOURCES, QUESTS } from "./content";
import { itemCount } from "./inventory";
import { contextGoals } from "./context-goals";
import { levelForXp } from "./skills";
import type { RpgCommand, RpgState, WorldObject } from "./types";
export function examineObject(s: RpgState, o: WorldObject) {
  if (o.resourceId) {
    const r = RESOURCES[o.resourceId];
    return `${o.name} provides ${ITEMS[r.itemId].name}. Requires ${r.skill} ${r.level} and a ${r.tool}. ${s.resources[o.id]?.available ? "Ready to harvest." : "Recovering; another nearby node may be available."}`;
  }
  if (o.questId)
    return s.quests[o.questId]?.complete
      ? `${QUESTS[o.questId]?.name ?? o.name}: completed. Rewards have been claimed.`
      : (QUESTS[o.questId]?.description ?? o.name);
  return (
    (
      {
        bank: "Your personal bank is connected across the frontier. Each carried ore uses one backpack slot.",
        shop: "Inspect the stock and prices before buying or selling.",
        furnace: "Smelt carried ores into useful metal bars.",
        anvil:
          "Shape bars with a hammer. Frontier services may need a quest first.",
        range: "Cook carried raw food here; low-level attempts can burn.",
        bridge: "A physical crossing between the two riverbanks.",
      } as Record<string, string>
    )[o.kind] ??
    `A place in the frontier. Travel here to explore its surroundings.`
  );
}
export function itemUses(
  s: RpgState,
  itemId: string,
  o: WorldObject,
): { label: string; command: RpgCommand }[] {
  const item = ITEMS[itemId];
  if (!item || !itemCount(s.player.inventory, itemId)) return [];
  if (o.resourceId && item.tool === RESOURCES[o.resourceId].tool) {
    const goal = contextGoals(s, o, 10).find(
      (c) => c.goal.kind === "gather",
    )?.goal;
    return goal
      ? [
          {
            label: `Use ${item.name} · gather here`,
            command: { type: "goal", goal },
          },
        ]
      : [];
  }
  return Object.values(RECIPES)
    .filter(
      (r) => r.station === o.kind && r.inputs.some((i) => i.itemId === itemId),
    )
    .map((r) => {
      const ready =
        levelForXp(s.player.skills[r.skill]) >= r.level &&
        r.inputs.every(
          (i) => itemCount(s.player.inventory, i.itemId) >= i.quantity,
        ) &&
        (!r.tool || itemCount(s.player.inventory, r.tool) > 0);
      return {
        label: ready ? r.name : `Prepare to ${r.name.toLowerCase()}`,
        command: ready
          ? { type: "craft", recipeId: r.id, quantity: 1 }
          : {
              type: "goal",
              goal: {
                id: `prepare-${r.id}`,
                kind: "skill",
                skill: r.skill,
                level: Math.min(
                  99,
                  Math.max(r.level, levelForXp(s.player.skills[r.skill]) + 1),
                ),
                title: `Prepare for ${r.name}`,
              },
            },
      } as { label: string; command: RpgCommand };
    })
    .slice(0, 5);
}

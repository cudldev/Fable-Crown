import type {
  Ambition,
  RpgState,
  SkillId,
  Thought,
  WorldObject,
} from "./types";
import { ITEMS, QUESTS, RESOURCES, SHOPS } from "./content";
import { itemCount } from "./inventory";
import { levelForXp, skillName } from "./skills";
import { ownsItem } from "./planning";
import { objectById } from "./world";

/** Pure contextual intention choices. quantity is additional supplies; the saved goal stores total held. */
export function contextGoals(
  s: RpgState,
  object: WorldObject,
  quantity = 10,
): Thought["choices"] {
  const known = objectById(object.id);
  if (!known) return [];
  const choices: Thought["choices"] = [];
  const add = (goal: Ambition, label: string, description: string) =>
    choices.push({ id: goal.id, goal, label, description });
  const train = (skill: SkillId, level: number, targetId?: string) => {
    if (levelForXp(s.player.skills[skill]) >= level) return;
    add(
      {
        id: `train-${skill}-${level}-${known.id}`,
        kind: "skill",
        skill,
        level,
        title: `${skillName(skill)} level ${level}`,
        ...(targetId ? { targetId } : {}),
      },
      `Train ${skillName(skill)} to ${level}`,
      targetId
        ? `Work toward ${known.name}; train with usable resources first when needed.`
        : `Gather ingredients and practice ${skill} at local stations.`,
    );
  };
  const explore = () =>
    add(
      {
        id: `explore-${known.id}`,
        kind: "explore",
        targetId: known.id,
        title: `Visit ${known.name}`,
      },
      `Visit ${known.name}`,
      "Travel to this place along the local paths.",
    );
  if (known.resourceId) {
    const r = RESOURCES[known.resourceId];
    const held =
      itemCount(s.player.inventory, r.itemId) + itemCount(s.bank, r.itemId);
    const amount =
      Number.isSafeInteger(quantity) && quantity > 0
        ? Math.min(quantity, 10000)
        : 10;
    const gather = (count: number) =>
      add(
        {
          id: `gather-${r.id}-${Math.min(2_000_000_000, held + count)}`,
          kind: "gather",
          resourceId: r.id,
          quantity: Math.min(2_000_000_000, held + count),
          targetId: known.id,
          title: `Gather ${count} ${ITEMS[r.itemId].name}`,
        },
        `Gather ${count} ${ITEMS[r.itemId].name}`,
        `Keep gathering across full backpacks and depleted nodes; train and obtain tools first if needed.`,
      );
    gather(amount);
    const level = levelForXp(s.player.skills[r.skill]);
    train(r.skill, Math.min(99, Math.max(level + 1, r.level)), known.id);
    const upgrade = Object.values(ITEMS)
      .filter(
        (i) =>
          i.tool === r.tool &&
          !ownsItem(s, i.id) &&
          Object.values(SHOPS).some((shop) => !!shop.stock[i.id]),
      )
      .sort((a, b) => (a.tier ?? 1) - (b.tier ?? 1) || a.value - b.value)[0];
    if (upgrade && choices.length < 3)
      add(
        {
          id: `obtain-${upgrade.id}`,
          kind: "equipment",
          itemId: upgrade.id,
          title: `Obtain ${upgrade.name}`,
        },
        `Earn ${upgrade.name}`,
        "Earn coins, train if needed, and buy this working tool.",
      );
    if (choices.length < 2)
      gather(amount === 10000 ? 5000 : Math.min(10000, amount * 2));
  } else if (
    known.kind === "furnace" ||
    known.kind === "anvil" ||
    known.kind === "range"
  ) {
    const skill = known.kind === "range" ? "cooking" : "smithing";
    train(skill, Math.min(99, levelForXp(s.player.skills[skill]) + 1));
    if (known.kind === "range" && !s.quests.supper.complete) {
      const q = QUESTS.supper;
      add(
        { id: `quest-${q.id}`, kind: "quest", questId: q.id, title: q.name },
        q.name,
        q.description,
      );
    } else if (known.kind === "anvil" && !s.quests.forge.complete) {
      const q = QUESTS.forge;
      add(
        { id: `quest-${q.id}`, kind: "quest", questId: q.id, title: q.name },
        q.name,
        q.description,
      );
    }
    if (!choices.length) explore();
  } else if (known.kind === "shop") {
    const tool = Object.keys(SHOPS[known.shopId ?? known.id]?.stock ?? {}).find(
      (id) => ITEMS[id].kind === "tool" && !ownsItem(s, id),
    );
    if (tool)
      add(
        {
          id: `obtain-${tool}`,
          kind: "equipment",
          itemId: tool,
          title: `Obtain ${ITEMS[tool].name}`,
        },
        `Earn ${ITEMS[tool].name}`,
        "Train and sell supplies to afford this shop tool.",
      );
    explore();
  } else if (
    known.kind === "quest" &&
    known.questId &&
    !s.quests[known.questId]?.complete
  ) {
    const q = QUESTS[known.questId];
    add(
      { id: `quest-${q.id}`, kind: "quest", questId: q.id, title: q.name },
      q.name,
      q.description,
    );
  } else if (known.kind === "bank") {
    train("mining", Math.min(99, levelForXp(s.player.skills.mining) + 1));
    explore();
  } else explore();
  return choices.slice(0, 3);
}

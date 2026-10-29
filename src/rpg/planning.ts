import type { Ambition, RpgState, Thought } from "./types";
import { ITEMS, QUESTS } from "./content";
import { levelForXp } from "./skills";
import { itemCount } from "./inventory";
export function ownsItem(s: RpgState, id: string) {
  return (
    itemCount(s.player.inventory, id) +
      itemCount(s.bank, id) +
      Object.values(s.player.equipment).filter((i) => i === id).length >
    0
  );
}
export function goalMet(s: RpgState, goal: Ambition) {
  if (goal.kind === "equipment")
    return !!goal.itemId && ownsItem(s, goal.itemId);
  if (goal.kind === "skill")
    return (
      !!goal.skill &&
      !!goal.level &&
      levelForXp(s.player.skills[goal.skill]) >= goal.level
    );
  if (goal.kind === "explore")
    return !!goal.targetId && s.control.visited.includes(goal.targetId);
  if (goal.kind === "quest")
    return !!goal.questId && !!s.quests[goal.questId]?.complete;
  return false;
}
export function suggestGoals(s: RpgState): Thought["choices"] {
  const choices: Thought["choices"] = [];
  const tool =
    !ownsItem(s, "iron-pickaxe") && !ownsItem(s, "steel-pickaxe")
      ? "iron-pickaxe"
      : !ownsItem(s, "steel-pickaxe")
        ? "steel-pickaxe"
        : !ownsItem(s, "steel-axe")
          ? "steel-axe"
          : null;
  if (tool)
    choices.push({
      id: `obtain-${tool}`,
      label: `Earn a ${ITEMS[tool].name}`,
      description:
        "Gather and sell supplies, then visit a shop for a lasting tool upgrade.",
      goal: {
        id: `obtain-${tool}`,
        kind: "equipment",
        title: `Obtain a ${ITEMS[tool].name}`,
        itemId: tool,
      },
    });
  const quest = Object.values(QUESTS).find((q) => !s.quests[q.id]?.complete);
  if (quest) {
    const choice = {
      id: `quest-${quest.id}`,
      label: quest.name,
      description: quest.description,
      goal: {
        id: `quest-${quest.id}`,
        kind: "quest" as const,
        title: quest.name,
        questId: quest.id,
      },
    };
    // Preserve the proven initial iron→steel ambition, then progress through actual quests.
    if (ownsItem(s, "steel-pickaxe")) choices.unshift(choice);
    else choices.push(choice);
  }
  for (const skill of [
    "mining",
    "woodcutting",
    "fishing",
    "smithing",
    "cooking",
    "attack",
    "strength",
    "defence",
    "hitpoints",
  ] as const) {
    if (choices.length === 3) break;
    const level = levelForXp(s.player.skills[skill]);
    if (level === 99) continue;
    const next =
      skill === "mining" && level < 6
        ? 6
        : Math.min(99, level < 5 ? 5 : Math.ceil((level + 1) / 5) * 5);
    choices.push({
      id: `train-${skill}-${next}`,
      label: `Train ${skill} to ${next}`,
      description: `Work with local resources, bank full bags, and build ${skill} experience.`,
      goal: {
        id: `train-${skill}-${next}`,
        kind: "skill",
        title: `${skill} level ${next}`,
        skill,
        level: next,
      },
    });
  }
  for (const [id, title] of [
    ["hill-shrine", "the hill shrine"],
    ["east-watch", "the eastern watch"],
    ["north-bridge", "Willow bridge"],
  ] as const)
    if (choices.length < 3 && !s.control.visited.includes(id))
      choices.push({
        id: `explore-${id}`,
        label: `Visit ${title}`,
        description: "Follow the paths to a new landmark.",
        goal: {
          id: `explore-${id}`,
          kind: "explore",
          title: `Visit ${title}`,
          targetId: id,
        },
      });
  return choices;
}
export function goalSteps(s: RpgState, goal: Ambition): string[] {
  if (goalMet(s, goal)) return ["Ambition achieved"];
  if (goal.kind === "equipment" && goal.itemId && ITEMS[goal.itemId]) {
    const item = ITEMS[goal.itemId];
    return [
      ...(item.skill &&
      levelForXp(s.player.skills[item.skill]) < (item.level ?? 1)
        ? [`Train ${item.skill} to ${item.level}`]
        : []),
      `Earn ${item.value} coins by gathering and selling surplus`,
      `Visit a supplies shop and buy ${item.name}`,
      "Use the improved tool",
    ];
  }
  if (
    goal.kind === "skill" &&
    ["attack", "strength", "defence", "hitpoints"].includes(goal.skill!)
  )
    return [
      "Prepare a weapon and healing meals",
      "Practice against woodland creatures; eat or retreat when needed",
      `Reach ${goal.skill} level ${goal.level}`,
    ];
  if (goal.kind === "skill" && ["smithing", "cooking"].includes(goal.skill!))
    return [
      goal.skill === "smithing"
        ? "Mine copper and tin, or collect banked ores"
        : "Catch shrimp, or collect banked fish",
      goal.skill === "smithing"
        ? "Smelt bronze at a furnace"
        : "Cook at an available range",
      `Reach ${goal.skill} level ${goal.level}`,
    ];
  if (goal.kind === "skill")
    return [
      `Choose ${goal.skill} resources suitable for my tools and level`,
      "Bank full backpacks and resume training",
      `Reach level ${goal.level}`,
    ];
  if (goal.kind === "quest" && goal.questId && QUESTS[goal.questId]) {
    const q = QUESTS[goal.questId];
    return [
      "Visit the quest giver and accept",
      ...Object.entries(q.requirements ?? {}).map(
        ([skill, level]) => `Train ${skill} to ${level}`,
      ),
      ...q.items.map((i) => `Acquire ${i.quantity} ${ITEMS[i.itemId].name}`),
      ...(q.kills
        ? [`Defeat ${q.kills.quantity} outlaws after accepting`]
        : []),
      "Deliver supplies to the quest giver",
    ];
  }
  return [`Travel to ${goal.title}`];
}

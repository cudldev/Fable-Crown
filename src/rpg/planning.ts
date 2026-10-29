import type { Ambition, RpgState, Thought } from "./types";
import { ITEMS, QUESTS, RESOURCES } from "./content";
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
  if (goal.kind === "gather" && goal.resourceId && goal.quantity)
    return (
      itemCount(s.player.inventory, RESOURCES[goal.resourceId].itemId) +
        itemCount(s.bank, RESOURCES[goal.resourceId].itemId) >=
      goal.quantity
    );
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
  const questOrder = ["forge", "bowyer", "supper", "letters", "road", "watch"];
  const quest = questOrder.map((id) => QUESTS[id]).find((q) => !s.quests[q.id]?.complete && q.prerequisites?.every((id) => s.quests[id]?.complete) !== false);
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
    // Stories and their useful services lead the journey; tool upgrades remain explicit alternatives.
    choices.unshift(choice);
  }
  if (s.quests.bowyer?.complete && levelForXp(s.player.skills.ranged) < 5)
    choices.unshift({ id: "train-ranged-5", label: "Learn field archery", description: "Prepare a bow, arrows and meals; practice on woodland wildlife.",
      goal: { id: "train-ranged-5", title: "Ranged level 5", kind: "skill", skill: "ranged", level: 5 } });
  const landmark = [["hill-shrine", "the hill shrine"], ["east-watch", "the eastern watch"], ["north-bridge", "Willow bridge"]]
    .find(([id]) => !s.control.visited.includes(id));
  if (landmark && choices.length < 3) {
    const [id, title] = landmark;
    const choice = { id: `explore-${id}`, label: `Visit ${title}`, description: "Follow the paths to a new landmark.",
      goal: { id: `explore-${id}`, kind: "explore" as const, title: `Visit ${title}`, targetId: id } };
    if (!quest) choices.unshift(choice); else choices.push(choice);
  }
  const skills = [
    "mining",
    "woodcutting",
    "fishing",
    "smithing",
    "cooking",
    "attack",
    "strength",
    "defence",
    "hitpoints",
    "ranged",
  ] as const;
  for (const skill of [...skills].sort((a, b) => levelForXp(s.player.skills[a]) - levelForXp(s.player.skills[b]))) {
    if (choices.length >= 3) break;
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
  return choices.slice(0, 3);
}
export function goalSteps(s: RpgState, goal: Ambition): string[] {
  if (goalMet(s, goal)) return ["Ambition achieved"];
  if (goal.kind === "gather" && goal.resourceId) {
    const r = RESOURCES[goal.resourceId];
    return [
      ...(levelForXp(s.player.skills[r.skill]) < r.level
        ? [`Train ${r.skill} to ${r.level} using available resources`]
        : []),
      `Bring a usable ${r.tool}${r.bait ? ` and ${ITEMS[r.bait].name}` : ""}`,
      `Gather ${ITEMS[r.itemId].name} until backpack and bank hold ${goal.quantity}`,
      "Bank full backpacks, keep working tools, and resume gathering",
    ];
  }
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
    ["attack", "strength", "defence", "hitpoints", "ranged"].includes(goal.skill!)
  )
    return [
      goal.skill === "ranged" ? "Prepare a bow, purchased or recovered arrows, and healing meals" : "Prepare a weapon and healing meals",
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
    if (q.stages) {
      const p = s.quests[q.id], stage = q.stages.find((stage) => stage.id === p?.stageId);
      return [
        ...(!p?.accepted ? ["Talk to the quest giver and accept"] : []),
        ...(q.prerequisites ?? []).filter((id) => !s.quests[id]?.complete).map((id) => `Complete ${QUESTS[id].name}`),
        ...(stage ? [stage.description] : []),
        "Keep supplies in the personal bank; retrieve them for delivery",
        `Claim ${q.reward.unlock} when the story is complete`,
      ];
    }
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

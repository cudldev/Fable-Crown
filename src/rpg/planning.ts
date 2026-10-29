import type { Ambition, GoalAssessment, RpgState, SkillId, Thought } from "./types";
import { ITEMS, QUESTS, RECIPES, RESOURCES, SHOPS } from "./content";
import { levelForXp } from "./skills";
import { itemCount } from "./inventory";
import { objectById, WORLD } from "./world";
import { getPlannerProfile } from "./planner-profile";
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
const QUEST_ORDER = ["forge", "bowyer", "supper", "letters", "road", "watch"] as const;
const LANDMARKS = [["hill-shrine", "the hill shrine"], ["east-watch", "the eastern watch"], ["north-bridge", "Willow bridge"]] as const;
const COMBAT_SKILLS: readonly SkillId[] = ["attack", "strength", "defence", "ranged"];
const WORK_SKILLS: readonly SkillId[] = ["mining", "woodcutting", "fishing", "smithing", "cooking"];
const countHeld = (s: RpgState, id: string) => itemCount(s.player.inventory, id) + itemCount(s.bank, id);
const compareIds = (a: string, b: string) => a < b ? -1 : a > b ? 1 : 0;

/** Bounded local candidates. No pathfinding, RNG, simulation actions or network calls. */
export function evaluateGoals(s: RpgState): GoalAssessment[] {
  const profile = getPlannerProfile(s), candidates: GoalAssessment[] = [];
  const held = [...s.player.inventory, ...s.bank];
  const owned = [...held.map((i) => i.itemId), ...Object.values(s.player.equipment)];
  const hasTool = (tool: string) => owned.some((id) => id && ITEMS[id]?.tool === tool &&
    (!ITEMS[id].skill || levelForXp(s.player.skills[ITEMS[id].skill!]) >= (ITEMS[id].level ?? 1)));
  const usableWeapon = (ranged: boolean) => owned.some((id) => id && ITEMS[id]?.slot === "weapon" &&
    (ranged ? ITEMS[id].weaponType === "bow" : ITEMS[id].weaponType !== "bow" && (ITEMS[id].attack ?? 0) > 0) &&
    levelForXp(s.player.skills.attack) >= (ITEMS[id].attackLevel ?? 1) &&
    levelForXp(s.player.skills.ranged) >= (ITEMS[id].rangedLevel ?? 1));
  const food = held.reduce((n, stack) => n + (ITEMS[stack.itemId]?.heals ? stack.quantity : 0), 0);
  const arrows = held.reduce((n, stack) => n + (ITEMS[stack.itemId]?.ammoTier ? stack.quantity : 0), 0) +
    (s.player.ammo && ITEMS[s.player.ammo.itemId]?.ammoTier ? s.player.ammo.quantity : 0);
  const healthy = s.player.health >= Math.ceil(levelForXp(s.player.skills.hitpoints) * 0.7);
  const prepared = (ranged: boolean) => usableWeapon(ranged) && (!ranged || arrows >= 10) && food >= 3 && healthy;
  const distance = (id: string) => {
    const target = objectById(id);
    return target ? Math.abs(target.position.x - s.player.position.x) + Math.abs(target.position.y - s.player.position.y) : 0;
  };
  const add = (goal: Ambition, score: number, reasons: string[], targetId?: string) => {
    if (goalMet(s, goal)) return;
    if (targetId) {
      const travel = distance(targetId);
      score -= Math.min(70, Math.floor(travel / 5)) + Math.floor(travel * profile.caution / 1200);
      if (travel <= 35) reasons.push("The next stop is nearby");
      else if (travel > 120) reasons.push("A longer journey lowers its priority");
    }
    candidates.push({ goal, score: Math.max(0, Math.min(1000, Math.round(score))), reasons: reasons.slice(0, 4) });
  };
  for (const [index, id] of QUEST_ORDER.entries()) {
    const quest = QUESTS[id], progress = s.quests[id];
    if (progress?.complete || quest.prerequisites?.some((required) => !s.quests[required]?.complete)) continue;
    let score = 790 - index * 42 + (profile.helpfulness - 50) * 4;
    const reasons = [profile.helpfulness > 60 ? "Helpfulness favours helping villagers" : "Continues the village story and opens useful services"];
    if (progress?.accepted) { score += 14; reasons.push("This story is already under way"); }
    const stageIndex = quest.stages?.findIndex((stage) => stage.id === progress?.stageId) ?? -1;
    if (stageIndex > 0) score += Math.round(stageIndex / quest.stages!.length * 30);
    const required = Object.entries(quest.requirements ?? {}).filter(([skill, level]) => levelForXp(s.player.skills[skill as SkillId]) < level!);
    if (required.length) { score -= Math.min(60, required.length * 15); reasons.push("Train " + required.map(([skill, level]) => skill + " " + level).join(", ") + " first"); }
    if (quest.items.length) {
      const supplied = quest.items.reduce((n, item) => n + Math.min(1, countHeld(s, item.itemId) / item.quantity), 0) / quest.items.length;
      score += Math.round(supplied * 35);
      if (supplied > 0) reasons.push("Held and banked supplies shorten this task");
    }
    if (quest.kills || quest.stages?.some((stage) => stage.kind === "kill")) {
      score += prepared(false) ? 25 : -Math.round(40 + profile.caution * 0.8);
      reasons.unshift(prepared(false) ? "A weapon and healing meals are ready" : "Danger needs a weapon, healing meals and recovery first");
    }
    add({ id: "quest-" + id, kind: "quest", title: quest.name, questId: id }, score, reasons, quest.giverId);
  }
  const tool = !ownsItem(s, "iron-pickaxe") && !ownsItem(s, "steel-pickaxe") ? "iron-pickaxe" :
    !ownsItem(s, "steel-pickaxe") ? "steel-pickaxe" : !ownsItem(s, "steel-axe") ? "steel-axe" : null;
  if (tool) {
    const item = ITEMS[tool], money = countHeld(s, "coins");
    let score = 485 + (profile.craftsmanship - 50) * 7 + Math.round(Math.min(1, money / item.value) * 40);
    const reasons = [profile.craftsmanship > 60 ? "Craftsmanship favours a lasting tool upgrade" : "A better tool supports future gathering"];
    if (levelForXp(s.player.skills[item.skill!]) < item.level!) { score -= 35; reasons.push("Train " + item.skill + " to " + item.level + " before using it"); }
    reasons.push(money >= item.value ? "Saved coins cover the purchase" : "Gather and sell surplus to earn the purchase price");
    const shop = WORLD.objects.filter((object) => object.kind === "shop" && (!object.serviceId || s.quests[object.serviceId]?.complete) && SHOPS[object.id]?.stock[tool])
      .sort((a, b) => distance(a.id) - distance(b.id) || compareIds(a.id, b.id))[0];
    if (shop) add({ id: "obtain-" + tool, kind: "equipment", title: "Obtain a " + item.name, itemId: tool }, score, reasons, shop.id);
  }
  for (const [id, title] of LANDMARKS) add({ id: "explore-" + id, kind: "explore", title: "Visit " + title, targetId: id },
    510 + (profile.curiosity - 50) * 7, [profile.curiosity > 60 ? "Curiosity favours a new place" : "Discover an unvisited landmark"], id);
  for (const skill of [...WORK_SKILLS, ...COMBAT_SKILLS]) {
    const level = levelForXp(s.player.skills[skill]);
    // Existing content's useful unlocks stop at 30; no endless level grind.
    if (level >= 30) continue;
    const unlocks = [...Object.values(RESOURCES), ...Object.values(RECIPES)].filter((entry) => entry.skill === skill && entry.level > level && entry.level <= level + 5).map((entry) => entry.level);
    const next = skill === "mining" && level < 6 ? 6 : Math.min(30, unlocks.length ? Math.min(...unlocks) : Math.ceil((level + 1) / 5) * 5);
    const combat = COMBAT_SKILLS.includes(skill);
    let score = 400 + (combat ? (profile.adventurousness - 50) * 6 : (profile.craftsmanship - 50) * 6);
    const reasons = [combat ? "Build field skills against woodland wildlife" : "A bounded skill milestone improves useful work"];
    if (combat) {
      const ranged = skill === "ranged", ready = prepared(ranged);
      score += ready ? 70 : -Math.round(65 + profile.caution * 1.2);
      if (!usableWeapon(ranged) || ranged && arrows < 10) reasons.push(ranged ? "Acquire a usable bow and at least ten arrows first" : "Prepare a usable melee weapon first");
      if (food < 3 || !healthy) reasons.push("Healing meals and recovery are needed first");
      if (ready) reasons.push("Usable equipment, healing meals and health are ready");
      if (profile.adventurousness > 60) reasons.push("Adventurousness favours prepared combat practice");
      if (!ready && profile.caution > 60) reasons.unshift("Caution lowers unprepared combat priorities");
      // The completed tutorial leads into real archery; the action planner prepares equipment.
      if (ranged && s.quests.bowyer?.complete && level < 5) { score += 640; reasons.unshift("Put the bowyer’s lessons into practice"); }
    } else {
      const resourceSkill = skill === "smithing" ? "mining" : skill === "cooking" ? "fishing" : skill;
      const starter = Object.values(RESOURCES).find((resource) => resource.skill === resourceSkill && resource.level === 1);
      if (starter && hasTool(starter.tool)) { score += 25; reasons.push("A suitable gathering tool is owned"); }
      else { score -= 45; reasons.push("Obtain a suitable gathering tool first"); }
      const materials = skill === "smithing" ? Math.min(countHeld(s, "copper-ore"), countHeld(s, "tin-ore")) : skill === "cooking" ? countHeld(s, "raw-shrimp") : 0;
      if (materials) { score += Math.min(40, materials * 5); reasons.push("Banked supplies make production achievable"); }
      if (profile.craftsmanship > 60) reasons.unshift("Craftsmanship favours useful production skills");
    }
    score += Math.round((level - Math.floor((level - 1) / 5) * 5) * 2);
    add({ id: "train-" + skill + "-" + next, kind: "skill", title: skill + " level " + next, skill, level: next }, score, reasons);
  }
  for (const id of ["tree", "shrimp"] as const) {
    const resource = RESOURCES[id], quantity = 12, current = countHeld(s, resource.itemId);
    const reasons = [id === "tree" ? "Keep a small timber reserve for workshop deliveries" : "Build a small supply of fish for cooking"];
    let score = 350 + (profile.craftsmanship - 50) * 5 + Math.round(current / quantity * 30);
    if (hasTool(resource.tool)) score += 20;
    else { score -= 45; reasons.push("Obtain a usable " + resource.tool + " first"); }
    add({ id: "stock-" + id + "-" + quantity, kind: "gather", title: "Stock " + quantity + " " + ITEMS[resource.itemId].name, resourceId: id, quantity }, score, reasons);
  }
  return candidates.sort((a, b) => b.score - a.score || compareIds(a.goal.id, b.goal.id)).slice(0, 8);
}

export function suggestGoals(s: RpgState): Thought["choices"] {
  return evaluateGoals(s).slice(0, 3).map(({ goal, reasons }) => ({
    id: goal.id, label: goal.title, description: reasons.join(". ") + ".", goal,
  }));
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

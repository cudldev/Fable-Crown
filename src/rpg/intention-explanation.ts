import { ENEMIES, ITEMS, QUESTS, RECIPES, RESOURCES, SHOPS } from "./content";
import { inventorySlots, itemCount } from "./inventory";
import { goalMet } from "./planning";
import { levelForXp, skillName } from "./skills";
import { getPlannerProfile } from "./planner-profile";
import { objectById, WORLD } from "./world";
import type { Ambition, IntentionView, ItemStack, QuestStage, RpgOrder, RpgState, TilePosition, WorldObject } from "./types";

const distance = (a: TilePosition, b: TilePosition) => Math.max(Math.abs(a.x - b.x), Math.abs(a.y - b.y));
const beside = (p: TilePosition, o: WorldObject) => p.worldId === o.position.worldId && p.plane === o.position.plane &&
  p.x >= o.position.x - 1 && p.x <= o.position.x + o.width && p.y >= o.position.y - 1 && p.y <= o.position.y + o.height;
const name = (id: string) => ITEMS[id]?.name ?? id;
const trim = (text: string, length: number) => text.length <= length ? text : `${text.slice(0, length - 1)}…`;
const held = (s: RpgState, id: string) => itemCount(s.player.inventory, id) + itemCount(s.bank, id);
const meals = (s: RpgState) => s.player.inventory.reduce((sum, item) => sum + (ITEMS[item.itemId].heals ? item.quantity : 0), 0);
const list = (s: RpgState, items: ItemStack[]) => items.map((item) => `${name(item.itemId)} ${Math.min(held(s, item.itemId), item.quantity)}/${item.quantity} held (bag ${itemCount(s.player.inventory, item.itemId)}, bank ${itemCount(s.bank, item.itemId)})`).join("; ");
const stageFor = (s: RpgState, id: string) => QUESTS[id]?.stages?.find((stage) => stage.id === s.quests[id]?.stageId);
const objectAtDestination = (s: RpgState, filter: (object: WorldObject) => boolean) => {
  const endpoint = s.player.path.at(-1) ?? s.player.position;
  const choices = WORLD.objects.filter(filter);
  return choices.filter((object) => beside(endpoint, object)).sort((a, b) => distance(endpoint, a.position) - distance(endpoint, b.position) || a.id.localeCompare(b.id))[0] ??
    choices.sort((a, b) => distance(s.player.position, a.position) - distance(s.player.position, b.position) || a.id.localeCompare(b.id))[0];
};
function signature(text: string) {
  let value = 2166136261;
  for (let i = 0; i < text.length; i++) value = Math.imul(value ^ text.charCodeAt(i), 16777619) >>> 0;
  return value.toString(36);
}
function orderName(s: RpgState, order: RpgOrder) {
  if (order.type === "move") return `travel to ${order.position.x},${order.position.y}`;
  if (order.type === "gather") return `gather ${name(RESOURCES[objectById(order.objectId)!.resourceId!].itemId)}`;
  if (order.type === "craft") return RECIPES[order.recipeId].name.toLowerCase();
  if (order.type === "equip") return `${ITEMS[order.itemId].ammoTier ? "load" : "equip"} ${name(order.itemId)}`;
  if (order.type === "eat") return `eat ${name(order.itemId)}`;
  if (order.type === "withdraw") return `withdraw ${name(order.itemId)}`;
  if (order.type === "buy" || order.type === "sell") return `${order.type} ${name(order.itemId)}`;
  if (order.type === "attack") return `fight ${ENEMIES[s.enemies.find((enemy) => enemy.id === order.enemyId)?.definitionId ?? ""]?.name ?? "the selected enemy"}`;
  if (order.type === "quest") return `visit ${QUESTS[order.questId].name}`;
  if (order.type === "talk-actor") return `talk to ${s.npcs.find((actor) => actor.id === order.actorId)?.name ?? "the selected villager"}`;
  if (order.type === "interact") return `${order.verb === "inspect" ? "inspect" : order.verb} ${objectById(order.objectId)!.name}`;
  if (order.type === "gate") return `${order.open ? "open" : "close"} ${objectById(order.objectId)!.name}`;
  if (order.type === "travel-service") return `use ${objectById(order.objectId)!.name}`;
  if (order.type === "bank") return "store supplies in the bank";
  if (order.type === "recover") return "recover the backpack";
  if (order.type === "loot") return "collect nearby fallen supplies";
  return order.type === "unequip-ammo" ? "return equipped arrows to the bag" : "remove equipped gear";
}
interface Context { reason: string; next: string; tag: string; stage?: QuestStage; recipeId?: string; target?: WorldObject; missing?: string }
function missingRecipeInput(s: RpgState, recipeId: string, skip?: string) {
  return RECIPES[recipeId].inputs.find((item) => item.itemId !== skip && itemCount(s.player.inventory, item.itemId) < item.quantity);
}
function inputRequirement(s: RpgState, input: ItemStack) {
  return `Next requirement: ${itemCount(s.bank, input.itemId) ? "withdraw" : "obtain"} ${name(input.itemId)} (${itemCount(s.player.inventory, input.itemId)}/${input.quantity} carried; ${itemCount(s.bank, input.itemId)} banked).`;
}
function context(s: RpgState, goal: Ambition | null, depth = 0): Context {
  if (!goal) return { reason: "No ambition is selected yet.", next: "Choose an ambition or issue a direct order.", tag: "none" };
  if (goal.kind === "quest") {
    const q = QUESTS[goal.questId!], progress = s.quests[q.id], stage = stageFor(s, q.id);
    const requiredQuest = q.prerequisites?.find((id) => !s.quests[id]?.complete);
    if (requiredQuest && depth < 3) {
      const prerequisite = context(s, { id: `quest-${requiredQuest}`, kind: "quest", title: QUESTS[requiredQuest].name, questId: requiredQuest }, depth + 1);
      return { ...prerequisite, reason: `${q.name} first requires ${QUESTS[requiredQuest].name}. ${prerequisite.reason}` };
    }
    if (progress.complete) return { reason: `${q.name} is complete; its reward has already been claimed.`, next: "Alden can choose another available ambition on the next planning tick.", tag: `${q.id}-complete` };
    if (!progress.accepted) return { reason: `${q.name} is available from ${objectById(q.giverId)!.name}${q.prerequisites?.length ? "; its prerequisite quests are complete" : " without another quest prerequisite"}.${q.items.length ? ` Requested supplies: ${list(s, q.items)}.` : ""}`,
      next: `Next requirement: talk to ${objectById(q.giverId)!.name}.`, tag: `${q.id}-accept`, target: objectById(q.giverId) };
    const skill = Object.entries(q.requirements ?? {}).find(([id, level]) => levelForXp(s.player.skills[id as keyof typeof s.player.skills]) < level!);
    if (skill) return { reason: `${q.name} requires ${skillName(skill[0] as keyof typeof s.player.skills)} ${skill[1]}; current level ${levelForXp(s.player.skills[skill[0] as keyof typeof s.player.skills])}.`,
      next: `Next requirement: train ${skill[0]} to ${skill[1]}.`, tag: `${q.id}-train-${skill[0]}` };
    if (!stage) return { reason: `${q.name}: the staged work is ready for its final reward check.`, next: `Next requirement: return to ${objectById(q.giverId)!.name}.`, tag: `${q.id}-claim`, target: objectById(q.giverId) };
    const items = stage.items ?? (stage.recipeId ? [{ itemId: RECIPES[stage.recipeId].output.itemId, quantity: stage.quantity ?? 1 }] : []);
    if (items.length) {
      const needed = items.find((item) => itemCount(s.player.inventory, item.itemId) < item.quantity);
      const recipeId = stage.recipeId ?? (needed ? Object.values(RECIPES).find((recipe) => recipe.output.itemId === needed.itemId)?.id : undefined);
      const recipe = recipeId ? RECIPES[recipeId] : undefined;
      const input = recipe ? missingRecipeInput(s, recipe.id) : undefined;
      let next = needed ? itemCount(s.bank, needed.itemId) ? `Next requirement: withdraw ${name(needed.itemId)} from the bank.` : input ? inputRequirement(s, input) : recipe ? `Next requirement: ${recipe.name.toLowerCase()}.` : `Next requirement: obtain ${name(needed.itemId)}.`
        : stage.kind === "deliver" ? `Next requirement: deliver the carried supplies to ${objectById(stage.targetId!)!.name}.` : `Next stage: ${q.stages?.[q.stages.indexOf(stage) + 1]?.description ?? "return to the quest giver"}`;
      if (inventorySlots(s.player.inventory) >= 28 && needed) next = "Next requirement: free backpack space at the bank, then resume these supplies.";
      return { reason: `${q.name} — ${stage.description} ${list(s, items)}.${recipe ? ` Each ${name(recipe.output.itemId)} uses ${recipe.inputs.map((item) => `${item.quantity} ${name(item.itemId)}`).join(" + ")}.` : ""}`,
        next, tag: `${q.id}-${stage.id}`, stage, recipeId, missing: needed?.itemId, target: stage.targetId ? objectById(stage.targetId) : undefined };
    }
    if (stage.kind === "kill") return { reason: `${q.name} needs ${stage.quantity ?? 1} ${ENEMIES[stage.enemyId!].name} defeats; ${progress.counters?.[stage.id] ?? 0}/${stage.quantity ?? 1} recorded after acceptance.`,
      next: `Next requirement: ${stage.description}`, tag: `${q.id}-${stage.id}`, stage };
    if (stage.kind === "practice") return { reason: `${q.name}: ${progress.counters?.[stage.id] ?? 0}/${stage.quantity ?? 1} practice cycles completed. Bring the commissioned practice bow and blunt arrows.`,
      next: `Next requirement: ${stage.description}`, tag: `${q.id}-${stage.id}`, stage, target: objectById(stage.targetId!) };
    return { reason: `${q.name} — ${stage.description}`, next: `Next requirement: ${stage.description}`, tag: `${q.id}-${stage.id}`, stage, target: stage.targetId ? objectById(stage.targetId) : undefined };
  }
  if (goal.kind === "gather") {
    const resource = RESOURCES[goal.resourceId!], level = levelForXp(s.player.skills[resource.skill]);
    return { reason: `${name(resource.itemId)} ${held(s, resource.itemId)}/${goal.quantity} held across backpack and bank.${level < resource.level ? ` ${skillName(resource.skill)} ${resource.level} is required; current level ${level}.` : ""}`,
      next: level < resource.level ? `Next requirement: train ${resource.skill} to ${resource.level} with usable resources.` : `Continue until ${goal.quantity} ${name(resource.itemId)} are held.`,
      tag: `gather-${resource.id}`, target: goal.targetId ? objectById(goal.targetId) : undefined };
  }
  if (goal.kind === "skill") {
    const level = levelForXp(s.player.skills[goal.skill!]), selected = goal.targetId ? objectById(goal.targetId) : undefined;
    return { reason: `${skillName(goal.skill!)} is ${level}; the ambition is level ${goal.level}.${selected?.resourceId && level < RESOURCES[selected.resourceId].level ? ` ${selected.name} needs level ${RESOURCES[selected.resourceId].level}, so a usable resource trains the prerequisite first.` : ""}`,
      next: goal.skill === "smithing" ? "Next requirement: copper and tin for a bronze bar." : goal.skill === "cooking" ? "Next requirement: raw fish and an available cooking range." : goal.skill === "ranged" ? "Keep a usable bow, loaded arrows and healing meals before fighting." : `Keep training ${goal.skill} until level ${goal.level}.`,
      tag: `skill-${goal.skill}`, recipeId: goal.skill === "smithing" ? "bronze-bar" : goal.skill === "cooking" ? "cooked-shrimp" : undefined };
  }
  if (goal.kind === "equipment") {
    const item = ITEMS[goal.itemId!];
    return { reason: `${item.name} is the equipment ambition (catalogue price ${item.value} coins). Coins: ${itemCount(s.player.inventory, "coins")} carried, ${itemCount(s.bank, "coins")} banked.${item.skill && levelForXp(s.player.skills[item.skill]) < (item.level ?? 1) ? ` ${skillName(item.skill)} ${item.level} is required before use.` : ""}`,
      next: `Collect banked coins or sell accepted surplus; buy ${item.name} when its requirements, shop stock and carrying space permit.`, tag: `equipment-${item.id}` };
  }
  return { reason: `${goal.title} is the exploration ambition; the selected landmark is ${s.control.visited.includes(goal.targetId!) ? "already visited" : "not yet visited"}.`,
    next: "Reach a legal tile beside the landmark.", tag: `explore-${goal.targetId}`, target: objectById(goal.targetId!) };
}

/** Read-only facts about the committed order and current state, never a planner or a narrative model. */
export function explainIntention(s: RpgState): IntentionView {
  const p = s.player, goal = s.control.goal, order = s.control.active, objective = context(s, goal);
  const source = s.control.waiting ? "player" : s.control.source ?? "autonomous";
  const direct = source === "player" ? "Your order. " : "";
  let title = "Ready for the next requirement", reason = objective.reason, next = objective.next;
  let phase: IntentionView["phase"] = "ready", tag = order?.type ?? "goal", targetId: string | undefined, targetPosition: TilePosition | undefined;
  let progress: IntentionView["progress"], blocked = "";
  const target = (object: WorldObject | undefined) => { if (object) { targetId = object.id; targetPosition = { ...object.position }; } };
  const bankDetour = p.action?.kind === "bank";
  if (s.control.waiting) {
    phase = "wait"; tag = "pause"; title = "Waiting for you"; reason = "Your pause holds Alden’s planning and queued orders; the world continues.";
    next = `Resume Alden to continue${s.control.queue.length ? " the held queue" : goal ? ` ${goal.title}` : " choosing an ambition"}.`;
  } else if (bankDetour || order?.type === "bank") {
    const bank = bankDetour ? objectById(p.action!.targetId!) : order?.type === "bank" && order.objectId ? objectById(order.objectId) : objectAtDestination(s, (o) => o.kind === "bank"); target(bank);
    tag = bankDetour ? "bank-detour" : "bank"; title = `${p.path.length ? "Going to" : "Banking at"} ${bank?.name ?? "the bank"}`;
    reason = `${direct}${s.grave ? "Make room to recover the remaining backpack belongings." : `Backpack ${inventorySlots(p.inventory)}/28 slots.${bankDetour || inventorySlots(p.inventory) >= 28 ? " Bank supplies to free space for the remaining work." : " Store the carried supplies in the connected personal bank."}`} ${objective.reason}`;
    next = s.grave ? "Next requirement: recover the remaining grave items." : bankDetour ? `Resume ${order?.type === "gather" ? name(RESOURCES[objectById(order.objectId)!.resourceId!].itemId) : goal?.title ?? "the current work"} after freeing space.` : objective.next;
  } else if (order?.type === "gather") {
    const requested = objectById(order.objectId)!;
    const node = p.action?.kind === "gather" ? objectById(p.action.targetId!) : p.path.length
      ? objectAtDestination(s, (o) => o.resourceId === requested.resourceId) : requested;
    target(node); const resource = RESOURCES[requested.resourceId!];
    title = `${p.path.length ? "Going to" : p.action?.kind === "gather" ? "Gathering" : "Preparing to gather"} ${p.path.length ? node?.name ?? resource.name : name(resource.itemId)}`;
    reason = `${direct}${objective.reason} ${order.quantity} successful harvest${order.quantity === 1 ? "" : "s"} remain in this batch.`;
    if (requested.id !== node?.id && !s.resources[requested.id].available) reason += " The selected node is depleted; the route leads to a same-resource replacement.";
    if (objective.recipeId) {
      const input = missingRecipeInput(s, objective.recipeId, resource.itemId);
      next = input ? inputRequirement(s, input) : `After this resource: ${RECIPES[objective.recipeId].name.toLowerCase()}.`;
    }
    const usableTool = [...p.inventory.map((stack) => ITEMS[stack.itemId]), ...Object.values(p.equipment).map((id) => ITEMS[id!])]
      .some((item) => item.tool === resource.tool && levelForXp(p.skills[resource.skill]) >= (item.level ?? 1));
    if (levelForXp(p.skills[resource.skill]) < resource.level) blocked = `Requires ${resource.skill} level ${resource.level}.`;
    else if (!usableTool) blocked = `A usable ${resource.tool} is missing from the backpack/equipment.`;
    else if (resource.bait && !itemCount(p.inventory, resource.bait)) blocked = `Missing ${name(resource.bait)} for this resource.`;
    else if (inventorySlots(p.inventory) >= 28 && !bankDetour) blocked = "Backpack full (28/28); free carrying space before harvesting.";
    else if (!p.path.length && node && !s.resources[node.id].available) { phase = "wait"; reason += ` The node returns in ${Math.ceil(Math.max(0, s.resources[node.id].respawnAt - s.tick) * .6)} seconds.`; }
  } else if (order?.type === "craft") {
    const recipe = RECIPES[order.recipeId]; target(objectAtDestination(s, (o) => o.kind === recipe.station &&
      !(o.kind === "anvil" && o.id !== "oakrest-anvil" && !s.quests.forge.complete) && !(o.id === "briarford-range" && !s.quests.supper.complete)));
    title = p.path.length ? `Going to ${objectById(targetId!)?.name ?? recipe.station} for ${recipe.name.toLowerCase()}` : p.action?.kind === "craft" ? recipe.name : `Preparing to ${recipe.name.toLowerCase()}`;
    reason = `${direct}${objective.reason} Each attempt uses ${recipe.inputs.map((item) => `${item.quantity} ${name(item.itemId)}`).join(" + ")}; ${order.quantity} attempts remain. ${list(s, recipe.inputs)}.`;
    const missing = missingRecipeInput(s, recipe.id);
    next = missing ? inputRequirement(s, missing) : "Complete the current attempt, then check the remaining ingredients.";
    if (missing) blocked = `Missing carried ${name(missing.itemId)} for the next attempt.`;
    else if (levelForXp(p.skills[recipe.skill]) < recipe.level) blocked = `Requires ${recipe.skill} level ${recipe.level}.`;
  } else if (order?.type === "move") {
    targetPosition = { ...order.position }; title = `Travelling to ${order.position.x}, ${order.position.y}`;
    const safe = objectAtDestination(s, (o) => o.kind === "bank");
    const retreat = source === "autonomous" && p.health <= Math.max(3, Math.ceil(levelForXp(p.skills.hitpoints) * (.2 + .3 * getPlannerProfile(s).caution / 100))) && !meals(s) && safe && beside(order.position, safe);
    if (retreat) { target(safe); tag = "retreat"; title = `Retreating toward ${safe.name}`; reason = `Health ${p.health}/${levelForXp(p.skills.hitpoints)} and no carried healing meals. Alden is moving to safety before another fight.`; next = "Next requirement: obtain healing meals and recover health before fighting."; }
    else if (source === "autonomous" && goal?.kind === "explore") { target(objective.target); title = `Travelling to ${objective.target?.name ?? goal.title}`; }
    else reason = `${direct}This selected destination overrides Alden’s current work. ${goal ? `The ambition remains ${goal.title}.` : ""}`;
  } else if (order?.type === "attack") {
    const enemy = s.enemies.find((entry) => entry.id === order.enemyId);
    if (enemy) { targetId = enemy.id; targetPosition = { ...enemy.position }; title = `${p.path.length ? "Approaching" : "Fighting"} ${ENEMIES[enemy.definitionId].name}`; }
    else blocked = "The selected enemy is no longer present.";
    reason = `${direct}${objective.reason} Health ${p.health}/${levelForXp(p.skills.hitpoints)}; carried meals ${meals(s)}${ITEMS[p.equipment.weapon ?? ""]?.weaponType === "bow" ? `; loaded arrows ${p.ammo?.quantity ?? 0}` : ""}. Combat style: ${s.control.style}.`;
    next = s.tick < s.control.eatReadyAt ? `Recover from the meal for ${Math.ceil((s.control.eatReadyAt - s.tick) * .6)} more seconds before attacking.` : objective.next;
  } else if (order?.type === "recover") {
    title = `${p.path.length ? "Approaching" : "Recovering"} the backpack grave`; targetId = "grave"; targetPosition = s.grave ? { ...s.grave.position } : undefined;
    reason = `${direct}${s.grave ? `${s.grave.items.reduce((sum, item) => sum + item.quantity, 0)} items remain at the grave; recovery keeps those belongings safe.` : "No backpack grave remains."}`;
    next = `Recover what fits, then ${goal ? `resume ${goal.title}` : "choose another ambition"}.`;
  } else if (order?.type === "eat") {
    title = `Eating ${name(order.itemId)}`;
    reason = `${direct}Health ${p.health}/${levelForXp(p.skills.hitpoints)}. This carried meal restores up to ${ITEMS[order.itemId].heals} health.${source === "autonomous" ? ` Caution ${getPlannerProfile(s).caution}/100 sets the meal threshold at ${Math.ceil(levelForXp(p.skills.hitpoints) * (.3 + .4 * getPlannerProfile(s).caution / 100))} health.` : ""}`;
    next = `Observe the meal recovery delay, then ${goal ? `resume ${goal.title}` : "choose the next action"}.`;
  } else if (order?.type === "withdraw" || order?.type === "buy" || order?.type === "sell") {
    target(order.type === "withdraw" ? objectAtDestination(s, (o) => o.kind === "bank") : objectById(order.shopId));
    title = `${order.type === "withdraw" ? "Collecting banked" : order.type === "buy" ? "Buying" : "Selling"} ${name(order.itemId)}`;
    reason = `${direct}${objective.reason} ${order.type === "withdraw" ? `${itemCount(s.bank, order.itemId)} ${name(order.itemId)} are banked; ${itemCount(p.inventory, order.itemId)} carried.` : `This shop ${order.type === "buy" ? "charges" : "pays"} ${SHOPS[order.shopId].stock[order.itemId][order.type === "buy" ? "buy" : "sell"]} coins per item; carried coins ${itemCount(p.inventory, "coins")}.`}`;
  } else if (order?.type === "talk-actor") {
    const npc = s.npcs.find((actor) => actor.id === order.actorId); title = `${p.path.length ? "Approaching" : "Talking to"} ${npc?.name ?? "the selected villager"}`;
    targetId = `npc-${order.actorId}`; targetPosition = npc ? { ...npc.position } : undefined;
    reason = `${direct}A real greeting requires reaching the villager’s current position; talking grants no items or XP.`;
    next = goal ? `Resume ${goal.title} after the direct conversation.` : "Choose the next intention after the conversation.";
    if (!npc || npc.health <= 0) blocked = "That villager is no longer available.";
  } else if (order?.type === "loot") {
    const drop = s.drops.find((item) => item.id === order.dropId); title = "Collecting fallen supplies"; targetId = drop?.id; targetPosition = drop ? { ...drop.position } : undefined;
    reason = `${direct}Nearby supplies are on the ground; only items that fit can be collected. ${objective.reason}`;
    if (!drop) blocked = "Those supplies are no longer present.";
  } else if (order?.type === "quest" || order?.type === "interact" || order?.type === "gate" || order?.type === "travel-service") {
    const object = objectById(order.type === "quest" ? QUESTS[order.questId].giverId : order.objectId); target(object);
    title = order.type === "quest" ? `Visiting ${object?.name}` : order.type === "interact" ? `${order.verb === "inspect" ? "Inspecting" : order.verb === "practice" ? "Practising at" : "Talking to"} ${object?.name}`
      : order.type === "gate" ? `${order.open ? "Opening" : "Closing"} ${object?.name}` : `Using ${object?.name}`;
    reason = `${direct}${order.type === "gate" ? "Change this gate while keeping the open side passage available." : order.type === "travel-service" ? "River Letters opens this physical ferry; crossing costs 5 carried coins." : objective.reason}`;
  } else if (order) {
    title = orderName(s, order); reason = `${direct}${objective.reason}`;
  } else if (s.dialogue) {
    phase = "wait"; tag = "dialogue"; title = "Choosing how to reply"; targetId = s.dialogue.targetId; targetPosition = { ...objectById(targetId)!.position };
    reason = s.dialogue.text; next = `Choose an option, or Alden will take “${s.dialogue.choices[0].label}” in ${Math.ceil(Math.max(0, s.dialogue.expiresAt - s.tick) * .6)} seconds.`;
  } else {
    target(objective.target);
    title = goal && goalMet(s, goal) ? `Finished ${goal.title}` : goal ? `Ready to continue ${goal.title}` : "Ready for an intention";
    if (s.grave && s.tick >= s.grave.retryAt) { title = "Ready to recover the backpack"; targetId = "grave"; targetPosition = { ...s.grave.position }; reason = "Backpack belongings remain at the grave; recovery takes priority when its retry window opens."; next = "Recover the remaining belongings before resuming the ambition."; tag = "recover"; }
    if (!(goal && goalMet(s, goal)) && /^(Blocked:|Cannot |No safe |No arrows |You need |Missing |Requires |Backpack full|Recover Iori|Prepare .*obtain|.*: need \d)/.test(s.control.reason)) blocked = s.control.reason;
  }
  if (!s.control.waiting && p.path.length) {
    phase = "travel";
    if (!/^(Travelling|Going to|Approaching|Retreating)/.test(title)) title = `Going to ${targetId ? objectById(targetId)?.name ?? title : title}`;
    const trace = p.movement?.tick === s.tick ? p.movement : null;
    progress = { label: `${p.path.length} tiles remaining`, value: trace ? trace.tiles.length - 1 : 0,
      max: trace ? trace.mode === "run" ? 2 : 1 : s.control.running !== false && p.runEnergy >= 60 ? 2 : 1 };
  } else if (!s.control.waiting && p.action && phase !== "wait") {
    phase = "work"; progress = { label: "Action progress", value: p.action.duration - p.action.remaining, max: p.action.duration };
  }
  if (blocked) { phase = "blocked"; reason = `${blocked} ${objective.reason}`; next = `Resolve this blocker. ${objective.next}`; }
  const assessment = s.control.goalSource === "autonomous" && s.control.deliberation?.chosenId === goal?.id
    ? s.control.deliberation?.options.find((option) => option.goal.id === goal?.id) : undefined;
  if (assessment && source === "autonomous" && !s.control.waiting) reason += ` Chosen because: ${assessment.reasons.join("; ")}.`;
  else if (goal && s.control.goalSource === "player" && source === "autonomous" && !s.control.waiting) reason += " You selected this ambition; Alden is carrying out its next requirement.";
  const result = s.effects.at(-1);
  if (result?.kind === "action-result" && result.actionKind === "craft" && result.success === false && result.tick === s.tick && !s.control.waiting)
    reason = `The last crafting attempt failed and awarded no success XP. ${reason}`;
  if (!s.control.waiting && s.control.queue.length) next = `Next queued: ${s.control.queue.slice(0, 2).map((pending) => orderName(s, pending)).join("; then ")}${s.control.queue.length > 2 ? "; further accepted orders remain" : ""}.`;
  const queueKey = s.control.queue.map((pending) => JSON.stringify(pending, (key, value) => key === "quantity" ? undefined : value)).join("|");
  const semantic = [source, goal?.id, objective.tag, targetId, order?.type === "move" ? order.position : "", order?.type === "craft" ? order.recipeId : "", order?.type === "equip" || order?.type === "eat" ? order.itemId : "", order?.type === "buy" || order?.type === "sell" || order?.type === "withdraw" ? order.itemId : "", order?.type === "attack" ? s.control.style : "", blocked.replace(/\d+/g, "#"), queueKey];
  return { tick: s.tick, key: `intent:${phase}:${tag}:${signature(JSON.stringify(semantic))}`, source, title: trim(title, 200), reason: trim(reason, 1000), next: trim(next, 500), phase,
    ...(goal ? { goalId: goal.id } : {}), ...(targetId ? { targetId } : {}), ...(targetPosition ? { targetPosition: { ...targetPosition } } : {}), ...(progress ? { progress } : {}) };
}

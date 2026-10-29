import { SKILLS, TICK_MS, type ActorState, type Ambition, type RpgState, type RpgCommand, type RpgOrder, type TilePosition, type WorldObject, type ItemStack, type ResourceDefinition } from './types';
import { WORLD, TOWNS, isWalkable, canStep, findPath, pathToObject, objectById } from './world';
import { startingSkills, levelForXp } from './skills';
import { ITEMS, RESOURCES, RECIPES, SHOPS } from './content';
import { addItems, removeItems, exchangeItems, inventorySlots, itemCount } from './inventory';
import { goalMet, goalSteps, suggestGoals } from './planning';

export const calendarDate = (now: number) => {
  const d = new Date(now);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};
export function createRpg(now: number, seed = 1234567): RpgState {
  const names = ['Alden', 'Mira', 'Toma', 'Jun', 'Hana', 'Ren', 'Edda', 'Bram', 'Iori', 'Nell', 'Orin', 'Sora', 'Ada', 'Fenn', 'Lio', 'Yuna', 'Reed', 'Wren', 'Moss', 'Finch', 'Galen', 'Opal', 'Pip', 'Vale'];
  const actors = names.map((name, id): ActorState => {
    const position = { ...WORLD.spawns[id] };
    return { id, name, role: id === 0 ? 'prince' : id % 4 === 0 ? 'miner' : id % 4 === 1 ? 'woodcutter' : id % 4 === 2 ? 'fisher' : 'smith', home: TOWNS[Math.floor(id / 8)].id, position, previousPosition: { ...position }, path: [], skills: startingSkills(), inventory: [{ itemId: 'bronze-axe', quantity: 1 }, { itemId: 'bronze-pickaxe', quantity: 1 }, { itemId: 'small-net', quantity: 1 }, { itemId: 'hammer', quantity: 1 }], equipment: {}, health: 10, runEnergy: 10000, action: null, activity: 'Considering the road ahead', completed: 0, bank: [] };
  });
  actors[0].inventory.unshift({ itemId: 'coins', quantity: 25 });
  actors[0].inventory.push({ itemId: 'cooked-shrimp', quantity: 6 });
  actors[0].equipment = { weapon: 'bronze-sword', shield: 'bronze-shield', cape: 'prince-cape' };
  const s: RpgState = {
    version: 3, tick: 0, savedAt: now, calendar: calendarDate(now), offlineRemainder: 0, seed: seed >>> 0,
    player: actors[0], npcs: actors.slice(1), resources: Object.fromEntries(WORLD.objects.filter(o => o.resourceId).map(o => [o.id, { objectId: o.id, available: true, respawnAt: 0 }])), bank: [],
    shops: Object.values(SHOPS).map(shop => ({ id: shop.id, stock: Object.fromEntries(Object.entries(shop.stock).map(([id, entry]) => [id, entry.max])), restockAt: 100 })),
    enemies: [], quests: {}, grave: null,
    control: { waiting: false, active: null, source: null, queue: [], goal: null, thinkingUntil: 6, reason: 'A better pickaxe would help me learn a useful trade.', steps: [], style: 'attack', visited: [], thought: null, lastThought: 0 },
    journal: ['A new chapter begins. Earlier village chronicles remain archived.'],
  };
  s.control.goal = suggestGoals(s)[0].goal;
  s.control.steps = goalSteps(s, s.control.goal);
  return s;
}
function random(s: RpgState) { s.seed = (Math.imul(s.seed, 1664525) + 1013904223) >>> 0; return s.seed / 4294967296; }
const distance = (a: TilePosition, b: TilePosition) => Math.max(Math.abs(a.x - b.x), Math.abs(a.y - b.y));
const adjacent = (p: ActorState, o: WorldObject) => p.position.worldId === o.position.worldId && p.position.plane === o.position.plane && p.position.x >= o.position.x - 1 && p.position.x <= o.position.x + o.width && p.position.y >= o.position.y - 1 && p.position.y <= o.position.y + o.height;
const RESOURCE_OBJECTS = WORLD.objects.filter(o => o.resourceId);
// The world is immutable. Reuse only routes actually requested, copying before travel consumes them.
const ROUTES = new Map<string, TilePosition[] | null>();
function objectRoute(from: TilePosition, o: WorldObject) {
  const key = `${from.worldId}:${from.plane}:${from.x}:${from.y}:${o.id}`;
  if (!ROUTES.has(key)) {
    ROUTES.set(key, pathToObject(from, o));
    if (ROUTES.size > 1024) ROUTES.delete(ROUTES.keys().next().value!);
  }
  return ROUTES.get(key)?.map(p => ({ ...p })) ?? null;
}
function nearest(p: ActorState, filter: (o: WorldObject) => boolean) { return WORLD.objects.filter(filter).sort((a, b) => distance(p.position, a.position) - distance(p.position, b.position) || a.id.localeCompare(b.id))[0]; }
function route(p: ActorState, o: WorldObject): boolean {
  if (adjacent(p, o)) return true;
  const path = objectRoute(p.position, o);
  p.path = path ?? [];
  p.activity = path ? `Walking to ${o.name}` : `Cannot reach ${o.name}`;
  return false;
}
function travel(p: ActorState) {
  let steps = p.runEnergy > 0 ? 2 : 1;
  while (steps-- && p.path.length) {
    const next = p.path[0];
    if (!canStep(p.position, next)) { p.path = []; p.action = null; p.activity = 'The route changed'; return; }
    p.position = { ...next }; p.path.shift();
    if (p.runEnergy > 0) p.runEnergy = Math.max(0, p.runEnergy - 60);
  }
}
function toolFor(p: ActorState, resource: ResourceDefinition) {
  return [...p.inventory.map(i => ITEMS[i.itemId]), ...Object.values(p.equipment).map(id => ITEMS[id!])]
    .filter(i => i?.tool === resource.tool && levelForXp(p.skills[resource.skill]) >= (i.level ?? 1))
    .sort((a, b) => (b.tier ?? 1) - (a.tier ?? 1))[0];
}
function gatherProblem(p: ActorState, r: ResourceDefinition): string | null {
  if (levelForXp(p.skills[r.skill]) < r.level) return `${r.name} requires ${r.skill} level ${r.level}.`;
  if (!toolFor(p, r)) return `You need a usable ${r.tool}.`;
  if (r.bait && !itemCount(p.inventory, r.bait)) return `You need ${r.bait}.`;
  return null;
}
function craftProblem(p: ActorState, id: string, inputs = true) {
  const recipe = RECIPES[id];
  if (!recipe) return 'Unknown recipe.';
  if (levelForXp(p.skills[recipe.skill]) < recipe.level) return `Requires ${recipe.skill} level ${recipe.level}.`;
  if (recipe.tool && !itemCount(p.inventory, recipe.tool)) return `You need a ${recipe.tool}.`;
  if (inputs && recipe.inputs.some(i => itemCount(p.inventory, i.itemId) < i.quantity)) return 'Missing recipe inputs.';
  return null;
}
function bankOutput(s: RpgState, p: ActorState) {
  const bank = p.id === 0 ? s.bank : p.bank;
  for (const stack of [...p.inventory]) {
    if (ITEMS[stack.itemId].kind === 'resource' || ITEMS[stack.itemId].kind === 'food') {
      const quantity = stack.itemId === 'cooked-shrimp' && p.id === 0 ? Math.max(0,stack.quantity - 6) : stack.quantity;
      if (quantity && addItems(bank, stack.itemId, quantity, Infinity)) removeItems(p.inventory, stack.itemId, quantity);
    }
  }
}
function bankDetour(s: RpgState, p: ActorState) {
  const bank = p.action?.kind === 'bank' && p.action.targetId ? objectById(p.action.targetId) : nearest(p, o => o.kind === 'bank');
  if (!bank) return;
  p.action = { kind: 'bank', targetId: bank.id, duration: 1, remaining: 1 };
  if (route(p, bank)) { bankOutput(s, p); p.action = null; p.activity = 'Stored gathered supplies in the personal bank'; }
}
function finish(s: RpgState, message?: string) {
  s.control.active = null; s.control.source = null; s.player.action = null; s.player.path = [];
  s.control.thinkingUntil = s.tick + 2;
  if (message) { s.control.reason = message; s.player.activity = message; }
}
function pulse(p: ActorState, kind: 'gather' | 'craft', id: string, ticks: number): boolean {
  if (p.action?.kind !== kind || (kind === 'gather' ? p.action.targetId !== id : p.action.recipeId !== id)) {
    p.action = { kind, ...(kind === 'gather' ? { targetId: id } : { recipeId: id }), duration: ticks, remaining: ticks };
  }
  p.action.remaining--;
  if (p.action.remaining > 0) return false;
  p.action = null; return true;
}
function gather(s: RpgState, p: ActorState, target: WorldObject): boolean {
  const r = RESOURCES[target.resourceId!];
  if (gatherProblem(p, r)) { p.action = null; return false; }
  if (p.action?.kind === 'bank') { bankDetour(s, p); return false; }
  if (inventorySlots(p.inventory) === 28) {
    if (p.inventory.some(i => ITEMS[i.itemId].kind === 'resource' || ITEMS[i.itemId].kind === 'food' && (i.itemId !== 'cooked-shrimp' || i.quantity > 6))) bankDetour(s, p);
    else { p.action = null; p.activity = 'Backpack full (28/28); free a slot'; }
    return false;
  }
  if (!s.resources[target.id].available) { p.action = null; p.activity = 'Waiting for the resource to recover'; return false; }
  if (!route(p, target)) return false;
  const tool = toolFor(p, r)!;
  const duration = r.skill === 'mining' ? r.ticks - ((tool.tier ?? 1) - 1) : r.ticks;
  p.activity = `Gathering ${r.name}`;
  if (!pulse(p, 'gather', target.id, duration)) return false;
  if (p.id !== 0) p.action = { kind: 'gather', targetId: target.id, duration, remaining: duration };
  const chance = r.skill === 'woodcutting' ? Math.min(1, r.success * (1 + ((tool.tier ?? 1) - 1) * .5) + (levelForXp(p.skills.woodcutting) - r.level) * .005) : r.success;
  if (random(s) >= chance) return false;
  if (!exchangeItems(p.inventory, r.bait ? [{ itemId: r.bait, quantity: 1 }] : [], [{ itemId: r.itemId, quantity: 1 }])) return false;
  p.skills[r.skill] = Math.min(2_000_000_000, p.skills[r.skill] + r.xp); p.completed++;
  if (random(s) < r.depletion) s.resources[target.id] = { objectId: target.id, available: false, respawnAt: s.tick + r.respawnTicks };
  return true;
}
function resourceFor(s: RpgState, p: ActorState, skill: string, available = true) {
  // Rank cheaply first. Only the selected destination receives a route search.
  const allowed = new Set(Object.values(RESOURCES).filter(r => r.skill === skill && !gatherProblem(p, r)).map(r => r.id));
  let best: WorldObject | undefined, bestScore = -1;
  for (const o of RESOURCE_OBJECTS) {
    if (!allowed.has(o.resourceId!) || (available && !s.resources[o.id].available)) continue;
    const r = RESOURCES[o.resourceId!], score = r.xp / r.ticks / (1 + distance(p.position, o.position) / 15);
    if (score > bestScore) { best = o; bestScore = score; }
  }
  return best;
}
function equip(s: RpgState, id: string): boolean {
  const p = s.player, item = ITEMS[id];
  if (!item?.slot || !itemCount(p.inventory, id) || levelForXp(p.skills.attack) < (item.attackLevel ?? 1) || levelForXp(p.skills.defence) < (item.defenceLevel ?? 1) || (item.skill && levelForXp(p.skills[item.skill]) < (item.level ?? 1))) return false;
  const old = p.equipment[item.slot];
  if (!exchangeItems(p.inventory, [{ itemId: id, quantity: 1 }], old ? [{ itemId: old, quantity: 1 }] : [])) return false;
  p.equipment[item.slot] = id; return true;
}
function execute(s: RpgState, order: RpgOrder) {
  const p = s.player;
  if (order.type === 'move') {
    if (distance(p.position, order.position) === 0) { finish(s, 'Reached the selected tile'); return; }
    const path = findPath(p.position, order.position);
    if (!path) finish(s, 'The destination is unreachable'); else { p.path = path; p.activity = 'Traveling to the selected tile'; }
    return;
  }
  if (order.type === 'equip') { const ok = equip(s, order.itemId); finish(s, ok ? `Equipped ${ITEMS[order.itemId].name}` : 'Cannot equip that item'); return; }
  if (order.type === 'unequip') {
    const id = p.equipment[order.slot];
    if (id && addItems(p.inventory, id, 1)) { delete p.equipment[order.slot]; finish(s, `Removed ${ITEMS[id].name}`); }
    else finish(s, 'No equipped item or backpack space');
    return;
  }
  if (order.type === 'gather') {
    let target = objectById(order.objectId)!;
    const problem = gatherProblem(p, RESOURCES[target.resourceId!]);
    if (problem) { finish(s, problem); return; }
    if (!s.resources[target.id].available && p.action?.kind !== 'bank') {
      const alternative = nearest(p, o => o.resourceId === target.resourceId && s.resources[o.id].available);
      if (alternative) { target = alternative; order.objectId = target.id; p.action = null; }
    }
    if (gather(s, p, target) && --order.quantity === 0) finish(s, 'Gathering batch complete');
    return;
  }
  if (order.type === 'craft') {
    const problem = craftProblem(p, order.recipeId);
    if (problem) { finish(s, problem); return; }
    if (p.action?.kind === 'bank') { bankDetour(s, p); return; }
    const recipe = RECIPES[order.recipeId], station = nearest(p, o => o.kind === recipe.station)!;
    if (!route(p, station)) return;
    p.activity = recipe.name;
    if (!pulse(p, 'craft', recipe.id, recipe.ticks)) return;
    const probe = p.inventory.map(i => ({ ...i }));
    if (!exchangeItems(probe, recipe.inputs, [recipe.output])) { bankDetour(s, p); return; }
    const chance = recipe.skill === 'cooking' ? Math.min(1, recipe.success + (levelForXp(p.skills.cooking) - recipe.level) * .02) : recipe.success;
    const success = random(s) < chance;
    const outputs = success ? [recipe.output] : recipe.skill === 'cooking' ? [{ itemId: recipe.output.itemId.replace('cooked-', 'burnt-'), quantity: 1 }] : [];
    if (!exchangeItems(p.inventory, recipe.inputs, outputs)) return;
    if (success) p.skills[recipe.skill] = Math.min(2_000_000_000, p.skills[recipe.skill] + recipe.xp);
    p.completed++;
    if (--order.quantity === 0) finish(s, success ? 'Crafting batch complete' : 'The last attempt failed; its ingredients were consumed');
    return;
  }
  if (order.type === 'bank' || order.type === 'withdraw') {
    const bank = order.type === 'bank' && order.objectId ? objectById(order.objectId)! : nearest(p, o => o.kind === 'bank')!;
    if (!route(p, bank)) return;
    if (order.type === 'bank') {
      for (const i of [...p.inventory]) if (addItems(s.bank, i.itemId, i.quantity, Infinity)) removeItems(p.inventory, i.itemId, i.quantity);
      finish(s, 'Deposited backpack into the connected personal bank');
    } else {
      let quantity = Math.min(order.quantity, itemCount(s.bank, order.itemId));
      if (!ITEMS[order.itemId].stackable) quantity = Math.min(quantity, 28 - inventorySlots(p.inventory));
      const staged = p.inventory.map(i => ({ ...i }));
      if (quantity > 0 && addItems(staged, order.itemId, quantity) && removeItems(s.bank, order.itemId, quantity)) { p.inventory = staged; finish(s, `Withdrew ${quantity} ${ITEMS[order.itemId].name}`); }
      else finish(s, 'No banked items or backpack space available');
    }
    return;
  }
  if (order.type === 'buy' || order.type === 'sell') {
    const shop = s.shops.find(x => x.id === order.shopId)!, definition = SHOPS[order.shopId].stock[order.itemId], target = objectById(order.shopId)!;
    if (!route(p, target)) return;
    let quantity = order.quantity;
    if (order.type === 'buy') {
      quantity = Math.min(quantity, shop.stock[order.itemId], Math.floor(itemCount(p.inventory, 'coins') / definition.buy));
      if (!ITEMS[order.itemId].stackable) quantity = Math.min(quantity, 28 - inventorySlots(p.inventory));
      if (quantity > 0 && exchangeItems(p.inventory, [{ itemId: 'coins', quantity: quantity * definition.buy }], [{ itemId: order.itemId, quantity }])) { shop.stock[order.itemId] -= quantity; finish(s, `Bought ${quantity} ${ITEMS[order.itemId].name}`); }
      else finish(s, 'Purchase blocked: coins, stock or backpack space');
    } else {
      quantity = Math.min(quantity, itemCount(p.inventory, order.itemId), 2_000_000_000 - shop.stock[order.itemId]);
      if (quantity > 0 && exchangeItems(p.inventory, [{ itemId: order.itemId, quantity }], [{ itemId: 'coins', quantity: quantity * definition.sell }])) { shop.stock[order.itemId] += quantity; finish(s, `Sold ${quantity} ${ITEMS[order.itemId].name}`); }
      else finish(s, 'Sale blocked: no items or no backpack space for coins');
    }
    return;
  }
  finish(s, 'This adventure is not yet available');
}
function autoOrder(s: RpgState): RpgOrder | null {
  const p = s.player;
  let goal = s.control.goal;
  if (!goal || goalMet(s, goal)) {
    if (goal) { s.journal.push(`Ambition achieved: ${goal.title}`); s.journal = s.journal.slice(-60); }
    goal = s.control.goal = suggestGoals(s)[0].goal;
  }
  s.control.steps = goalSteps(s, goal); s.control.reason = goal.title;
  if (goal.kind === 'explore') {
    const target = objectById(goal.targetId!);
    if (!target) return null;
    if (adjacent(p, target)) { if (!s.control.visited.includes(target.id)) s.control.visited.push(target.id); return null; }
    const path = pathToObject(p.position, target);
    return path?.length ? { type: 'move', position: path[path.length - 1] } : null;
  }
  const skill = goal.kind === 'skill' ? goal.skill! : ITEMS[goal.itemId!]?.skill ?? 'mining';
  if (goal.kind === 'equipment' && itemCount(s.bank, 'coins') && itemCount(p.inventory, 'coins') < ITEMS[goal.itemId!].value) return { type: 'withdraw', itemId: 'coins', quantity: itemCount(s.bank, 'coins') };
  const gatheringSkill = skill === 'smithing' ? 'mining' : skill === 'cooking' ? 'fishing' : skill;
  const starterResource = Object.values(RESOURCES).find(r => r.skill === gatheringSkill && r.level === 1);
  if (starterResource && !toolFor(p, starterResource)) {
    const savedTool = s.bank.find(i => ITEMS[i.itemId].tool === starterResource.tool && levelForXp(p.skills[starterResource.skill]) >= (ITEMS[i.itemId].level ?? 1));
    if (savedTool) return { type: 'withdraw', itemId: savedTool.itemId, quantity: 1 };
    const basic = Object.values(ITEMS).filter(i => i.tool === starterResource.tool && (i.level ?? 1) <= levelForXp(p.skills[starterResource.skill])).sort((a,b)=>a.value-b.value)[0];
    const shop = nearest(p, o => o.kind === 'shop' && !!SHOPS[o.id]?.stock[basic?.id]);
    if (basic && shop && itemCount(p.inventory,'coins') >= basic.value) return { type: 'buy', shopId:shop.id, itemId:basic.id, quantity:1 };
    s.control.reason = `${goal.title}: obtain a ${starterResource.tool} to continue`;
    return null;
  }
  if (skill === 'smithing' && !itemCount(p.inventory,'hammer') && itemCount(s.bank,'hammer')) return { type:'withdraw',itemId:'hammer',quantity:1 };
  if (goal.kind === 'equipment') {
    const item = ITEMS[goal.itemId!];
    if (!item) return null;
    if (itemCount(s.bank, item.id)) return { type: 'withdraw', itemId: item.id, quantity: 1 };
    if (itemCount(p.inventory, item.id)) return item.slot ? { type: 'equip', itemId: item.id } : null;
    const shopObject = nearest(p, o => o.kind === 'shop' && !!SHOPS[o.id]?.stock[item.id] && (s.shops.find(x => x.id === o.id)?.stock[item.id] ?? 0) > 0);
    if (!shopObject) return null;
    if (levelForXp(p.skills[skill]) >= (item.level ?? 1)) {
      if (itemCount(p.inventory, 'coins') >= SHOPS[shopObject.id].stock[item.id].buy) return { type: 'buy', shopId: shopObject.id, itemId: item.id, quantity: 1 };
      const surplus = p.inventory.find(i => ITEMS[i.itemId].kind === 'resource' && (SHOPS[shopObject.id].stock[i.itemId]?.sell ?? 0) > 0);
      if (surplus && (inventorySlots(p.inventory) >= 26 || itemCount(p.inventory, 'coins') + surplus.quantity * SHOPS[shopObject.id].stock[surplus.itemId].sell >= item.value)) return { type: 'sell', shopId: shopObject.id, itemId: surplus.itemId, quantity: surplus.quantity };
      const saved = s.bank.find(i => ITEMS[i.itemId].kind === 'resource' && (SHOPS[shopObject.id].stock[i.itemId]?.sell ?? 0) > 0);
      if (saved && inventorySlots(p.inventory) < 26) return { type: 'withdraw', itemId: saved.itemId, quantity: Math.min(saved.quantity, 28 - inventorySlots(p.inventory)) };
    }
  }
  if (skill === 'smithing' || skill === 'cooking') {
    const recipe = skill === 'smithing' ? RECIPES['bronze-bar'] : RECIPES['cooked-shrimp'];
    if (!craftProblem(p, recipe.id)) return { type: 'craft', recipeId: recipe.id, quantity: 1 };
    const missing = recipe.inputs.find(i => itemCount(p.inventory, i.itemId) < i.quantity);
    if (missing && itemCount(s.bank, missing.itemId)) return { type: 'withdraw', itemId: missing.itemId, quantity: 1 };
    const target = nearest(p, o => !!o.resourceId && RESOURCES[o.resourceId].itemId === missing?.itemId && !gatherProblem(p, RESOURCES[o.resourceId]));
    return target ? { type: 'gather', objectId: target.id, quantity: 1 } : null;
  }
  if (!['woodcutting', 'mining', 'fishing'].includes(skill)) { s.control.reason = `${goal.title}: combat training opens in the next chapter`; return null; }
  const target = resourceFor(s, p, skill) ?? resourceFor(s, p, skill, false);
  if (!target) { s.control.reason = `${goal.title}: obtain the required working tool first`; return null; }
  return { type: 'gather', objectId: target.id, quantity: Math.max(1, 28 - inventorySlots(p.inventory)) };
}
function npcStep(s: RpgState, p: ActorState) {
  if (p.action?.kind === 'bank') { bankDetour(s, p); return; }
  const stored = [...p.inventory, ...p.bank].reduce((n,i) => n + (ITEMS[i.itemId].kind === 'resource' ? i.quantity : 0),0);
  if (stored >= 64) {
    if (p.inventory.some(i => ITEMS[i.itemId].kind === 'resource')) bankDetour(s,p);
    else { p.action = null; p.activity = 'Personal stores are stocked; resting from work'; }
    return;
  }
  if (inventorySlots(p.inventory) === 28) { bankDetour(s, p); return; }
  let target = p.action?.kind === 'gather' ? objectById(p.action.targetId!) : undefined;
  if (!target || !s.resources[target.id].available) target = resourceFor(s, p, p.role === 'miner' ? 'mining' : p.role === 'fisher' ? 'fishing' : 'woodcutting');
  if (target) gather(s, p, target); else p.activity = 'Waiting for local resources';
}
export function stepRpg(s: RpgState, count = 1): RpgState {
  if (!Number.isInteger(count) || count < 0 || count > 36000) throw Error('Invalid tick count');
  for (let n = 0; n < count; n++) {
    s.tick++;
    for (const r of Object.values(s.resources)) if (!r.available && s.tick >= r.respawnAt) { r.available = true; r.respawnAt = 0; }
    for (const shop of s.shops) if (s.tick >= shop.restockAt) { for (const [id, entry] of Object.entries(SHOPS[shop.id].stock)) shop.stock[id] += Math.sign(entry.max - shop.stock[id]); shop.restockAt = s.tick + 100; }
    for (const p of [s.player, ...s.npcs]) {
      p.previousPosition = { ...p.position };
      if (p.id === 0 && s.control.waiting) continue;
      if (p.path.length) { travel(p); continue; }
      p.runEnergy = Math.min(10000, p.runEnergy + 15);
      if (p.id !== 0) { npcStep(s, p); continue; }
      for (const town of TOWNS) if (distance(p.position, town.position) < 12 && !s.control.visited.includes(town.id)) s.control.visited.push(town.id);
      if (s.control.thought && s.tick >= s.control.thought.expiresAt) s.control.thought = null;
      if (!s.control.thought && s.tick - s.control.lastThought >= 200) { s.control.thought = { id: `thought-${s.tick}`, title: 'A useful next ambition', body: s.control.goal?.title ?? 'There is work worth learning.', expiresAt: s.tick + 34, choices: suggestGoals(s) }; s.control.lastThought = s.tick; }
      if (!s.control.active) {
        if (s.control.queue.length) { s.control.active = s.control.queue.shift()!; s.control.source = 'player'; }
        else if (s.tick >= s.control.thinkingUntil) { s.control.active = autoOrder(s); s.control.source = s.control.active ? 'autonomous' : null; }
      }
      const autonomous = s.control.source === 'autonomous';
      if (s.control.active) execute(s, s.control.active);
      if (autonomous && !s.control.active && s.control.goal?.kind === 'equipment' && s.control.goal.itemId && itemCount(p.inventory, s.control.goal.itemId)) equip(s, s.control.goal.itemId);
    }
  }
  return s;
}
const object = (v: unknown): v is Record<string, unknown> => v !== null && typeof v === 'object' && !Array.isArray(v);
const integer = (v: unknown, max = 1e12): v is number => typeof v === 'number' && Number.isSafeInteger(v) && v >= 0 && v <= max;
const positive = (v: unknown, max = 2_000_000_000): v is number => integer(v, max) && v > 0;
function position(v: unknown): v is TilePosition { return object(v) && v.worldId === WORLD.id && v.plane === 0 && integer(v.x, WORLD.width - 1) && integer(v.y, WORLD.height - 1) && isWalkable(v as unknown as TilePosition); }
function validGoal(v: unknown): v is Ambition {
  if (!object(v) || typeof v.id !== 'string' || !v.id || v.id.length > 100 || typeof v.title !== 'string' || !v.title || v.title.length > 200) return false;
  if (v.kind === 'equipment') return typeof v.itemId === 'string' && Object.hasOwn(ITEMS, v.itemId) && ['tool', 'gear'].includes(ITEMS[v.itemId].kind);
  if (v.kind === 'skill') return typeof v.skill === 'string' && (SKILLS as readonly string[]).includes(v.skill) && positive(v.level, 99);
  if (v.kind === 'explore') return typeof v.targetId === 'string' && !!objectById(v.targetId);
  return false;
}
function validOrder(v: unknown): v is RpgOrder {
  if (!object(v)) return false;
  switch (v.type) {
    case 'move': return position(v.position);
    case 'gather': return typeof v.objectId === 'string' && !!objectById(v.objectId)?.resourceId && positive(v.quantity, 10000);
    case 'craft': return typeof v.recipeId === 'string' && Object.hasOwn(RECIPES, v.recipeId) && positive(v.quantity, 10000);
    case 'bank': return v.objectId === undefined || (typeof v.objectId === 'string' && objectById(v.objectId)?.kind === 'bank');
    case 'withdraw': return typeof v.itemId === 'string' && Object.hasOwn(ITEMS, v.itemId) && positive(v.quantity);
    case 'buy': case 'sell': return typeof v.shopId === 'string' && Object.hasOwn(SHOPS, v.shopId) && typeof v.itemId === 'string' && Object.hasOwn(SHOPS[v.shopId].stock, v.itemId) && positive(v.quantity, 10000);
    case 'equip': return typeof v.itemId === 'string' && Object.hasOwn(ITEMS, v.itemId) && !!ITEMS[v.itemId].slot;
    case 'unequip': return typeof v.slot === 'string' && ['weapon', 'shield', 'head', 'body', 'legs', 'cape'].includes(v.slot);
    default: return false;
  }
}
function orderProblem(s: RpgState, order: RpgOrder, queued = false): string | null {
  const p = s.player;
  if (order.type === 'gather') return gatherProblem(p, RESOURCES[objectById(order.objectId)!.resourceId!]);
  if (order.type === 'craft') return craftProblem(p, order.recipeId, !queued);
  if (order.type === 'equip') {
    const item = ITEMS[order.itemId];
    if (!itemCount(p.inventory, item.id)) return 'That item is not in your backpack.';
    if (levelForXp(p.skills.attack) < (item.attackLevel ?? 1) || levelForXp(p.skills.defence) < (item.defenceLevel ?? 1) || (item.skill && levelForXp(p.skills[item.skill]) < (item.level ?? 1))) return 'You do not meet the equipment requirements.';
  }
  if (order.type === 'unequip' && (!p.equipment[order.slot] || inventorySlots(p.inventory) >= 28)) return 'No equipped item or backpack space.';
  if (!queued && order.type === 'withdraw' && itemCount(s.bank, order.itemId) < order.quantity) return 'Not enough items in your personal bank.';
  if (!queued && order.type === 'sell' && itemCount(p.inventory, order.itemId) < order.quantity) return 'Not enough items to sell.';
  if (!queued && order.type === 'buy' && (itemCount(p.inventory, 'coins') < SHOPS[order.shopId].stock[order.itemId].buy || !s.shops.find(x => x.id === order.shopId)?.stock[order.itemId])) return 'Not enough coins or shop stock.';
  return null;
}
export function applyRpgCommand(s: RpgState, command: RpgCommand): { ok: boolean; message: string } {
  const ok = (message: string) => ({ ok: true, message }), fail = (message: string) => ({ ok: false, message });
  if (!object(command)) return fail('Invalid command.');
  if (command.type === 'wait') { s.control.waiting = true; s.control.active = null; s.control.source = null; s.control.queue = []; s.player.path = []; s.player.action = null; s.player.activity = 'Waiting for your guidance'; return ok('Alden will wait here.'); }
  if (command.type === 'resume') { s.control.waiting = false; s.control.thinkingUntil = s.tick + 6; return ok('Alden is considering his next intention.'); }
  if (command.type === 'style') { if (!['attack', 'strength', 'defence'].includes(command.skill)) return fail('Unknown combat style.'); s.control.style = command.skill; return ok('Combat training style changed.'); }
  if (command.type === 'goal') {
    if (!validGoal(command.goal)) return fail('That ambition is not available.');
    s.control.goal = structuredClone(command.goal); s.control.waiting = false; s.control.steps = goalSteps(s, command.goal); s.control.thought = null;
    if (s.control.source === 'autonomous') finish(s);
    s.control.thinkingUntil = s.tick + 1; return ok(`Ambition: ${command.goal.title}`);
  }
  const order = command.type === 'enqueue' ? command.order : command;
  if (!validOrder(order)) return fail('This activity or target is not available.');
  const problem = orderProblem(s, order, command.type === 'enqueue');
  if (problem) return fail(problem);
  if (command.type === 'enqueue') {
    if (s.control.queue.length >= 8) return fail('The intention queue is full.');
    s.control.queue.push(structuredClone(order)); if (s.control.source === 'autonomous') finish(s);
    s.control.waiting = false; return ok('Added to the intention queue.');
  }
  const path = order.type === 'move' ? findPath(s.player.position, order.position) : null;
  if (order.type === 'move' && !path) return fail('That tile is blocked or unreachable.');
  s.control.waiting = false; s.control.active = structuredClone(order); s.control.source = 'player'; s.player.path = path ?? []; s.player.action = null; s.control.reason = 'Following your direct intention.';
  return ok('Following your intention.');
}
export function reconcileRpg(s: RpgState, now: number) {
  if (!Number.isSafeInteger(now) || now < 0 || now > 8.64e15) throw Error('Invalid reconciliation time');
  const elapsed = Math.max(0, now - s.savedAt), effective = Math.min(elapsed, 86400000) * .25 + s.offlineRemainder, ticks = Math.floor(effective / TICK_MS);
  s.offlineRemainder = effective % TICK_MS; stepRpg(s, ticks); s.savedAt = Math.max(s.savedAt, now); s.calendar = calendarDate(s.savedAt);
  return { state: s, ticks };
}
function stacks(v: unknown, capacity = Infinity): v is ItemStack[] {
  return Array.isArray(v) && v.length <= Object.keys(ITEMS).length && v.every(i => object(i) && typeof i.itemId === 'string' && Object.hasOwn(ITEMS, i.itemId) && positive(i.quantity)) && new Set(v.map(i => i.itemId)).size === v.length && inventorySlots(v) <= capacity;
}
const text = (v: unknown, max = 500): v is string => typeof v === 'string' && v.length <= max;
export function validateRpgSave(v: unknown): RpgState | null {
  try {
    if (!object(v) || v.version !== 3 || !integer(v.tick) || !integer(v.savedAt, 8.64e15) || !integer(v.seed, 4294967295) || typeof v.calendar !== 'string' || v.calendar !== calendarDate(v.savedAt) || !(typeof v.offlineRemainder === 'number' && Number.isFinite(v.offlineRemainder) && v.offlineRemainder >= 0 && v.offlineRemainder < TICK_MS) || !object(v.control) || !Array.isArray(v.npcs) || v.npcs.length !== 23 || !stacks(v.bank) || !Array.isArray(v.shops) || v.shops.length !== Object.keys(SHOPS).length || !Array.isArray(v.enemies) || v.enemies.length !== 0 || !object(v.resources) || !object(v.quests) || Object.keys(v.quests).length !== 0 || v.grave !== null || !Array.isArray(v.journal) || v.journal.length > 60 || !v.journal.every(i => text(i))) return null;
    for (const [index, p] of [v.player, ...v.npcs].entries()) {
      if (!object(p) || p.id !== index || !text(p.name, 100) || !text(p.role, 100) || !TOWNS.some(t => t.id === p.home) || !position(p.position) || !position(p.previousPosition) || !Array.isArray(p.path) || p.path.length > 2000 || !p.path.every(position) || !object(p.skills) || Object.keys(p.skills).length !== SKILLS.length || !SKILLS.every(k => integer((p.skills as Record<string, unknown>)[k], 2_000_000_000)) || !stacks(p.inventory, 28) || !stacks(p.bank) || !object(p.equipment) || !integer(p.health, 99) || !integer(p.runEnergy, 10000) || !integer(p.completed) || !text(p.activity)) return null;
      let last = p.position;
      for (const next of p.path) { if (!canStep(last, next)) return null; last = next; }
      for (const [slot, id] of Object.entries(p.equipment)) {
        if (typeof id !== 'string' || !Object.hasOwn(ITEMS, id) || ITEMS[id].slot !== slot) return null;
        const item = ITEMS[id], skills = p.skills as ActorState['skills'];
        if (levelForXp(skills.attack) < (item.attackLevel ?? 1) || levelForXp(skills.defence) < (item.defenceLevel ?? 1) || (item.skill && levelForXp(skills[item.skill]) < (item.level ?? 1))) return null;
      }
      if (p.action !== null) {
        const a = p.action;
        if (!object(a) || typeof a.kind !== 'string' || !['gather', 'craft', 'bank', 'rest'].includes(a.kind) || !positive(a.duration, 100) || !positive(a.remaining, a.duration)) return null;
        if (a.kind === 'gather') {
          if (typeof a.targetId !== 'string' || !objectById(a.targetId)?.resourceId) return null;
          const r = RESOURCES[objectById(a.targetId)!.resourceId!], actor = p as unknown as ActorState;
          if (gatherProblem(actor,r)) return null;
          const ticks = r.skill === 'mining' ? r.ticks - ((toolFor(actor,r)!.tier ?? 1) - 1) : r.ticks;
          if (a.duration !== ticks) return null;
        }
        if (a.kind === 'craft' && (typeof a.recipeId !== 'string' || !Object.hasOwn(RECIPES, a.recipeId) || a.duration !== RECIPES[a.recipeId].ticks || craftProblem(p as unknown as ActorState,a.recipeId))) return null;
        if (a.kind === 'bank' && (typeof a.targetId !== 'string' || objectById(a.targetId)?.kind !== 'bank')) return null;
      }
    }
    const c = v.control;
    if (typeof c.waiting !== 'boolean' || !Array.isArray(c.queue) || c.queue.length > 8 || !c.queue.every(validOrder) || !(c.active === null || validOrder(c.active)) || !(c.goal === null || validGoal(c.goal)) || !integer(c.thinkingUntil) || !text(c.reason) || !Array.isArray(c.steps) || c.steps.length > 10 || !c.steps.every(i => text(i)) || typeof c.style !== 'string' || !['attack', 'strength', 'defence'].includes(c.style) || !Array.isArray(c.visited) || c.visited.length > WORLD.objects.length || !c.visited.every(i => typeof i === 'string' && !!objectById(i)) || new Set(c.visited).size !== c.visited.length || !integer(c.lastThought) || ![undefined, null, 'player', 'autonomous'].includes(c.source as undefined) || (c.active === null && c.source != null)) return null;
    if (c.waiting && (c.active !== null || c.queue.length || (v.player as ActorState).action !== null || (v.player as ActorState).path.length)) return null;
    const playerAction = (v.player as ActorState).action;
    if (playerAction && c.active === null) return null;
    if (playerAction?.kind === 'gather' && (!object(c.active) || c.active.type !== 'gather' || c.active.objectId !== playerAction.targetId)) return null;
    if (playerAction?.kind === 'craft' && (!object(c.active) || c.active.type !== 'craft' || c.active.recipeId !== playerAction.recipeId)) return null;
    if (c.thought !== null) {
      const t = c.thought;
      if (!object(t) || !text(t.id, 100) || !text(t.title) || !text(t.body) || !integer(t.expiresAt) || !Array.isArray(t.choices) || t.choices.length < 2 || t.choices.length > 3 || !t.choices.every(ch => object(ch) && text(ch.id, 100) && text(ch.label) && text(ch.description) && validGoal(ch.goal))) return null;
    }
    const resourceIds = WORLD.objects.filter(o => o.resourceId).map(o => o.id);
    if (Object.keys(v.resources).length !== resourceIds.length) return null;
    for (const id of resourceIds) { const r = v.resources[id]; if (!object(r) || r.objectId !== id || typeof r.available !== 'boolean' || !integer(r.respawnAt) || (r.available ? r.respawnAt !== 0 : r.respawnAt <= v.tick)) return null; }
    const ids = new Set<string>();
    for (const shop of v.shops) {
      if (!object(shop) || typeof shop.id !== 'string' || !Object.hasOwn(SHOPS, shop.id) || ids.has(shop.id) || !object(shop.stock) || !integer(shop.restockAt) || Object.keys(shop.stock).length !== Object.keys(SHOPS[shop.id].stock).length || !Object.keys(SHOPS[shop.id].stock).every(id => integer((shop.stock as Record<string, unknown>)[id], 2_000_000_000))) return null;
      ids.add(shop.id);
    }
    return structuredClone(v) as unknown as RpgState;
  } catch { return null; }
}

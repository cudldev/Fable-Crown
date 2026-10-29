import type { ItemDefinition, Recipe, ResourceDefinition, ResourceId, QuestDefinition } from './types';
import { TOWNS } from './world';

/** Fixed local content; prices and XP never depend on a network service. XP is tenths. */
export const ITEMS: Record<string, ItemDefinition> = {};
function item(id: string, name: string, kind: ItemDefinition['kind'], value: number, extra: Partial<ItemDefinition> = {}) {
  ITEMS[id] = { id, name, kind, value, stackable: false, weight: 1, ...extra };
}
item('coins', 'Coins', 'currency', 1, { stackable: true, weight: 0 });
item('bait', 'Fishing bait', 'supply', 1, { stackable: true, weight: 0 });
item('feather', 'Feather', 'supply', 2, { stackable: true, weight: 0 });
item('small-net', 'Small fishing net', 'tool', 5, { tool: 'net', skill: 'fishing', level: 1 });
item('fishing-rod', 'Fishing rod', 'tool', 5, { tool: 'rod', skill: 'fishing', level: 5 });
item('fly-fishing-rod', 'Fly fishing rod', 'tool', 5, { tool: 'flyrod', skill: 'fishing', level: 20 });
item('hammer', 'Hammer', 'tool', 1, { tool: 'hammer' });
item('prince-cape', 'Prince’s travelling cape', 'gear', 0, { slot: 'cape', defence: 1 });
for (const [id, name, price] of [
  ['logs', 'Logs', 4], ['oak-logs', 'Oak logs', 8], ['willow-logs', 'Willow logs', 12],
  ['copper-ore', 'Copper ore', 8], ['tin-ore', 'Tin ore', 8], ['iron-ore', 'Iron ore', 15], ['coal', 'Coal', 25],
  ['bronze-bar', 'Bronze bar', 16], ['iron-bar', 'Iron bar', 30], ['steel-bar', 'Steel bar', 80],
] as const) item(id, name, 'resource', price);
for (const [id, level, heal, value] of [['shrimp', 1, 3, 5], ['sardine', 1, 4, 8], ['trout', 15, 7, 15]] as const) {
  item(`raw-${id}`, `Raw ${id}`, 'resource', value);
  item(`cooked-${id}`, `Cooked ${id}`, 'food', value * 2, { heals: heal, skill: 'cooking', level });
  item(`burnt-${id}`, `Burnt ${id}`, 'resource', 0);
}
for (const [metal, tier, use, wield, axe, pick] of [
  ['bronze', 1, 1, 1, 16, 1], ['iron', 2, 1, 1, 56, 140], ['steel', 3, 6, 5, 200, 500],
] as const) {
  item(`${metal}-axe`, `${metal} axe`, 'tool', axe, { tool: 'axe', tier, skill: 'woodcutting', level: use, slot: 'weapon', attackLevel: wield, attack: tier * 3, strength: tier * 2, attackTicks: 5 });
  item(`${metal}-pickaxe`, `${metal} pickaxe`, 'tool', pick, { tool: 'pickaxe', tier, skill: 'mining', level: use, slot: 'weapon', attackLevel: wield, attack: tier * 2, strength: tier * 2, attackTicks: 5 });
  for (const [kind, slot, price, defence] of [
    ['sword', 'weapon', 26, 0], ['med-helm', 'head', 24, 3], ['shield', 'shield', 48, 4], ['body', 'body', 160, 10], ['legs', 'legs', 80, 6],
  ] as const) item(`${metal}-${kind}`, `${metal} ${kind.replace('-', ' ')}`, 'gear', price * (tier === 1 ? 1 : tier === 2 ? 3 : 10), {
    tier, slot, ...(slot === 'weapon' ? { attackLevel: wield, attack: 4 * tier, strength: 3 * tier, attackTicks: 4 } : { defenceLevel: wield, defence: defence * tier }),
  });
}
const resource = (id: ResourceId, name: string, skill: ResourceDefinition['skill'], level: number, tool: ResourceDefinition['tool'], itemId: string, xp: number, ticks: number, respawnTicks: number, depletion: number, success: number, bait?: string): ResourceDefinition =>
  ({ id, name, skill, level, tool, itemId, xp, ticks, respawnTicks, depletion, success, ...(bait ? { bait } : {}) });
export const RESOURCES: Record<ResourceId, ResourceDefinition> = {
  tree: resource('tree', 'Mosswood tree', 'woodcutting', 1, 'axe', 'logs', 250, 4, 8, .18, .5),
  oak: resource('oak', 'Old oak', 'woodcutting', 15, 'axe', 'oak-logs', 375, 4, 14, .15, .35),
  willow: resource('willow', 'River willow', 'woodcutting', 30, 'axe', 'willow-logs', 675, 4, 20, .12, .3),
  copper: resource('copper', 'Copper outcrop', 'mining', 1, 'pickaxe', 'copper-ore', 175, 8, 8, 1, 1),
  tin: resource('tin', 'Tin outcrop', 'mining', 1, 'pickaxe', 'tin-ore', 175, 8, 8, 1, 1),
  iron: resource('iron', 'Iron outcrop', 'mining', 15, 'pickaxe', 'iron-ore', 350, 8, 16, 1, 1),
  coal: resource('coal', 'Coal outcrop', 'mining', 30, 'pickaxe', 'coal', 500, 8, 30, 1, 1),
  shrimp: resource('shrimp', 'Shrimp fishing', 'fishing', 1, 'net', 'raw-shrimp', 100, 5, 12, .1, .7),
  sardine: resource('sardine', 'Sardine fishing', 'fishing', 5, 'rod', 'raw-sardine', 200, 5, 12, .1, .65, 'bait'),
  trout: resource('trout', 'Trout fishing', 'fishing', 20, 'flyrod', 'raw-trout', 500, 5, 12, .1, .6, 'feather'),
};
export const RECIPES: Record<string, Recipe> = {};
for (const [metal, level, xp, inputs, success] of [
  ['bronze', 1, 62, [{ itemId: 'copper-ore', quantity: 1 }, { itemId: 'tin-ore', quantity: 1 }], 1],
  ['iron', 15, 125, [{ itemId: 'iron-ore', quantity: 1 }], .5],
  ['steel', 30, 175, [{ itemId: 'iron-ore', quantity: 1 }, { itemId: 'coal', quantity: 2 }], 1],
] as const) {
  RECIPES[`${metal}-bar`] = { id: `${metal}-bar`, name: `Smelt ${metal} bar`, skill: 'smithing', level, station: 'furnace', inputs: [...inputs], output: { itemId: `${metal}-bar`, quantity: 1 }, xp, ticks: 5, success };
  for (const [kind, base, bars] of [['axe', 1, 1], ['sword', 4, 1], ['med-helm', 3, 1], ['shield', 8, 2]] as const) {
    const id = `${metal}-${kind}`;
    RECIPES[id] = { id, name: `Smith ${metal} ${kind}`, skill: 'smithing', level: base + (metal === 'bronze' ? 0 : metal === 'iron' ? 15 : 30), station: 'anvil', tool: 'hammer', inputs: [{ itemId: `${metal}-bar`, quantity: bars }], output: { itemId: id, quantity: 1 }, xp: (metal === 'bronze' ? 125 : metal === 'iron' ? 250 : 375) * bars, ticks: 5, success: 1 };
  }
}
for (const [fish, level, xp] of [['shrimp', 1, 300], ['sardine', 1, 400], ['trout', 15, 700]] as const) {
  const id = `cooked-${fish}`;
  RECIPES[id] = { id, name: `Cook ${fish}`, skill: 'cooking', level, station: 'range', inputs: [{ itemId: `raw-${fish}`, quantity: 1 }], output: { itemId: id, quantity: 1 }, xp, ticks: 4, success: .65 };
}
export interface ShopDefinition { id: string; name: string; stock: Record<string, { max: number; buy: number; sell: number; restockTicks: number }> }
export const SHOPS: Record<string, ShopDefinition> = Object.fromEntries(TOWNS.map(t => {
  const id = `${t.id}-shop`;
  return [id, { id, name: `${t.name} supplies`, stock: Object.fromEntries(Object.values(ITEMS).filter(i => i.value > 0 && i.id !== 'coins').map(i => [i.id, {
    max: i.kind === 'tool' || i.kind === 'gear' ? 3 : i.stackable ? 100 : 30,
    buy: i.value, sell: i.kind === 'resource' ? i.value : Math.max(1, Math.floor(i.value / 2)), restockTicks: 100,
  }])) }];
}));
export const QUESTS: Record<string, QuestDefinition> = {};

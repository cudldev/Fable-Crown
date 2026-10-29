import { describe, it, expect } from 'vitest';
import { createRpg, stepRpg, applyRpgCommand, reconcileRpg, validateRpgSave } from '../src/rpg/engine';
import { ITEMS, RESOURCES, RECIPES, SHOPS } from '../src/rpg/content';
import { addItems, removeItems, exchangeItems, itemCount, inventorySlots } from '../src/rpg/inventory';
import { goalMet, suggestGoals } from '../src/rpg/planning';
import { levelForXp, XP_THRESHOLDS } from '../src/rpg/skills';
import { WORLD, interactionTiles, objectById, tile } from '../src/rpg/world';
import type { ItemStack, RpgState } from '../src/rpg/types';
const NOW = Date.UTC(2026, 9, 29, 12);
function fresh() { const s = createRpg(NOW); s.control.thinkingUntil = 1e9; return s; }
function at(s: RpgState, id: string) { s.player.position = { ...interactionTiles(objectById(id)!)[0] }; s.player.previousPosition = { ...s.player.position }; s.player.path = []; }
function runOrder(s: RpgState, max = 1000) { for (let i = 0; i < max && s.control.active; i++) stepRpg(s); expect(s.control.active).toBeNull(); s.control.thinkingUntil = 1e9; }
function assertValid(s: RpgState) { expect(validateRpgSave(s), `Invalid at tick ${s.tick}: ${JSON.stringify(s.control)} action ${JSON.stringify(s.player.action)}`).not.toBeNull(); }
describe('tile RPG inventory and local content', () => {
  it('counts unstackable quantities as slots and stages exchanges atomically', () => {
    const bag: ItemStack[] = [];
    expect(addItems(bag, 'coins', 100000)).toBe(true);
    expect(addItems(bag, 'bait', 100)).toBe(true);
    expect(addItems(bag, 'logs', 26)).toBe(true);
    expect(inventorySlots(bag)).toBe(28);
    expect(addItems(bag, 'logs', 1)).toBe(false);
    expect(addItems(bag, 'coins', 1)).toBe(true);
    const prior = structuredClone(bag);
    expect(exchangeItems(bag, [{ itemId: 'coins', quantity: 50 }], [{ itemId: 'bronze-axe', quantity: 1 }])).toBe(false);
    expect(bag).toEqual(prior);
    expect(removeItems(bag, 'logs', 27)).toBe(false);
    expect(addItems(bag, 'missing', 1)).toBe(false);
    expect(addItems(bag, 'logs', .5)).toBe(false);
  });
  it('pins gathering XP, tool prices and recipe/tool restrictions', () => {
    expect(RESOURCES.tree.xp).toBe(250); expect(RESOURCES.oak.level).toBe(15); expect(RESOURCES.willow.xp).toBe(675);
    expect(RESOURCES.copper.xp).toBe(175); expect(RESOURCES.trout.bait).toBe('feather'); expect(RESOURCES.sardine.level).toBe(5);
    expect(RECIPES['iron-bar'].success).toBe(.5); expect(RECIPES['bronze-bar'].xp).toBe(62); expect(RECIPES['steel-shield'].inputs[0].quantity).toBe(2);
    expect(Object.keys(RECIPES).some(id => id.includes('pickaxe'))).toBe(false);
    expect(SHOPS['oakrest-shop'].stock['iron-pickaxe'].buy).toBe(140);
    expect(SHOPS['oakrest-shop'].stock['steel-pickaxe'].buy).toBe(500);
    for (const id of ['coins','bronze-axe','bronze-pickaxe','small-net','hammer','cooked-shrimp','bronze-sword','bronze-shield','prince-cape']) expect(ITEMS[id]).toBeDefined();
  });
});
describe('tile RPG legal gathering and production', () => {
  it('awards exact mining XP, depletes and respawns nodes; validates every transaction tick', () => {
    const s = fresh(); at(s, 'oakrest-ore-0');
    expect(applyRpgCommand(s, { type: 'gather', objectId: 'oakrest-ore-0', quantity: 1 }).ok).toBe(true);
    for (let i = 0; i < 7; i++) { stepRpg(s); assertValid(s); }
    expect(s.player.skills.mining).toBe(0); stepRpg(s); assertValid(s);
    expect(itemCount(s.player.inventory, 'copper-ore')).toBe(1); expect(s.player.skills.mining).toBe(175);
    expect(s.resources['oakrest-ore-0'].available).toBe(false);
    stepRpg(s, 8); expect(s.resources['oakrest-ore-0'].available).toBe(true); assertValid(s);
  });
  it('rejects illegal tools and levels without cancelling current work', () => {
    const s = fresh(); applyRpgCommand(s, { type:'move', position: tile(60, 100) });
    const prior = structuredClone(s.control.active);
    expect(applyRpgCommand(s, { type:'gather', objectId:'oakrest-ore-2', quantity:1 }).ok).toBe(false);
    removeItems(s.player.inventory, 'bronze-axe', 1);
    expect(applyRpgCommand(s, { type:'gather', objectId:'oakrest-tree-0', quantity:1 }).ok).toBe(false);
    expect(s.control.active).toEqual(prior);
  });
  it('uses steel picks from the bag at Mining 6 despite Attack 1', () => {
    const s = fresh(); at(s, 'oakrest-ore-0'); s.player.skills.mining = XP_THRESHOLDS[5]; addItems(s.player.inventory, 'steel-pickaxe', 1);
    expect(applyRpgCommand(s,{type:'equip',itemId:'steel-pickaxe'}).ok).toBe(false);
    expect(applyRpgCommand(s,{type:'gather',objectId:'oakrest-ore-0',quantity:1}).ok).toBe(true);
    stepRpg(s,5); expect(itemCount(s.player.inventory,'copper-ore')).toBe(0);
    stepRpg(s); expect(itemCount(s.player.inventory,'copper-ore')).toBe(1); assertValid(s);
  });
  it('catches shrimp and consumes bait only for a successful legal sardine catch', () => {
    const s=fresh(); at(s,'fish-west-shrimp'); s.seed=1;
    expect(applyRpgCommand(s,{type:'gather',objectId:'fish-west-shrimp',quantity:1}).ok).toBe(true); stepRpg(s,5);
    expect(itemCount(s.player.inventory,'raw-shrimp')).toBe(1); expect(s.player.skills.fishing).toBe(100); assertValid(s);
    s.player.skills.fishing=XP_THRESHOLDS[4]; at(s,'fish-west-sardine'); addItems(s.player.inventory,'fishing-rod',1);
    expect(applyRpgCommand(s,{type:'gather',objectId:'fish-west-sardine',quantity:1}).ok).toBe(false);
    addItems(s.player.inventory,'bait',2); s.seed=1; expect(applyRpgCommand(s,{type:'gather',objectId:'fish-west-sardine',quantity:1}).ok).toBe(true); stepRpg(s,5);
    expect(itemCount(s.player.inventory,'bait')).toBe(1); expect(itemCount(s.player.inventory,'raw-sardine')).toBe(1); expect(s.player.skills.fishing).toBe(XP_THRESHOLDS[4]+200); assertValid(s);
  });
  it('banks full gathering bags, travels and resumes the original batch', () => {
    const s = fresh(); at(s, 'oakrest-ore-0'); addItems(s.player.inventory,'logs',17); expect(inventorySlots(s.player.inventory)).toBe(28);
    expect(applyRpgCommand(s,{type:'gather',objectId:'oakrest-ore-0',quantity:2}).ok).toBe(true);
    const before = {...s.player.position}; stepRpg(s); expect(s.player.action?.kind).toBe('bank'); expect(s.bank).toEqual([]);
    runOrder(s); expect(s.player.position).not.toEqual(before); expect(itemCount(s.bank,'logs')).toBe(17); expect(itemCount(s.player.inventory,'copper-ore')).toBe(2); expect(inventorySlots(s.player.inventory)).toBeLessThanOrEqual(28); assertValid(s);
  });
  it('smelts and smiths only at stations, atomically consuming inputs once', () => {
    const s = fresh(); addItems(s.player.inventory,'copper-ore',1); addItems(s.player.inventory,'tin-ore',1);
    expect(applyRpgCommand(s,{type:'craft',recipeId:'bronze-bar',quantity:1}).ok).toBe(true);
    stepRpg(s); expect(itemCount(s.player.inventory,'bronze-bar')).toBe(0); expect(s.player.path.length).toBeGreaterThan(0);
    runOrder(s); expect(itemCount(s.player.inventory,'bronze-bar')).toBe(1); expect(itemCount(s.player.inventory,'copper-ore')).toBe(0); expect(itemCount(s.player.inventory,'tin-ore')).toBe(0); expect(s.player.skills.smithing).toBe(62);
    expect(applyRpgCommand(s,{type:'craft',recipeId:'bronze-axe',quantity:1}).ok).toBe(true); runOrder(s);
    expect(itemCount(s.player.inventory,'bronze-bar')).toBe(0); expect(itemCount(s.player.inventory,'bronze-axe')).toBe(2); expect(s.player.skills.smithing).toBe(187);
    const prior = structuredClone(s.player.inventory); expect(applyRpgCommand(s,{type:'craft',recipeId:'bronze-axe',quantity:1}).ok).toBe(false); expect(s.player.inventory).toEqual(prior); assertValid(s);
  });
  it('consumes failed iron ore and cooking inputs without awarding success XP', () => {
    const s = fresh(); s.player.skills.smithing=XP_THRESHOLDS[14]; addItems(s.player.inventory,'iron-ore',1); at(s,'oakrest-furnace'); s.seed=1000;
    // Seed 1000 produces an LCG roll above .5; actors have not yet reached a resource.
    expect(applyRpgCommand(s,{type:'craft',recipeId:'iron-bar',quantity:1}).ok).toBe(true); stepRpg(s,5);
    expect(itemCount(s.player.inventory,'iron-ore')).toBe(0); expect(itemCount(s.player.inventory,'iron-bar')).toBe(0); expect(s.player.skills.smithing).toBe(XP_THRESHOLDS[14]); assertValid(s);
    const cook=fresh(); addItems(cook.player.inventory,'raw-shrimp',1); at(cook,'oakrest-range'); cook.seed=1500;
    applyRpgCommand(cook,{type:'craft',recipeId:'cooked-shrimp',quantity:1}); stepRpg(cook,4);
    expect(itemCount(cook.player.inventory,'raw-shrimp')).toBe(0); expect(itemCount(cook.player.inventory,'burnt-shrimp')).toBe(1); expect(cook.player.skills.cooking).toBe(0); assertValid(cook);
  });
  it('cancels a partially completed craft without consuming or duplicating ingredients', () => {
    const s=fresh(); at(s,'oakrest-furnace'); addItems(s.player.inventory,'copper-ore',1); addItems(s.player.inventory,'tin-ore',1);
    applyRpgCommand(s,{type:'craft',recipeId:'bronze-bar',quantity:1}); stepRpg(s,4); applyRpgCommand(s,{type:'wait'}); stepRpg(s,20);
    expect(itemCount(s.player.inventory,'copper-ore')).toBe(1); expect(itemCount(s.player.inventory,'bronze-bar')).toBe(0); expect(s.player.skills.smithing).toBe(0);
    applyRpgCommand(s,{type:'craft',recipeId:'bronze-bar',quantity:1}); stepRpg(s,5); expect(itemCount(s.player.inventory,'bronze-bar')).toBe(1); expect(s.player.skills.smithing).toBe(62); assertValid(s);
  });
});
describe('tile RPG banking, shops and autonomy', () => {
  it('travels to banks and withdraws connected stock in another town; NPC banks are private', () => {
    const s=fresh(); addItems(s.player.inventory,'logs',2); s.npcs[0].bank=[{itemId:'steel-bar',quantity:10}];
    expect(applyRpgCommand(s,{type:'bank',objectId:'oakrest-bank'}).ok).toBe(true); stepRpg(s); expect(itemCount(s.bank,'logs')).toBe(0); runOrder(s); expect(itemCount(s.bank,'logs')).toBe(2);
    at(s,'briarford-bank'); expect(applyRpgCommand(s,{type:'withdraw',itemId:'logs',quantity:2}).ok).toBe(true); runOrder(s); expect(itemCount(s.player.inventory,'logs')).toBe(2); expect(itemCount(s.bank,'logs')).toBe(0);
    expect(applyRpgCommand(s,{type:'withdraw',itemId:'steel-bar',quantity:1}).ok).toBe(false); expect(s.npcs[0].bank[0].quantity).toBe(10); assertValid(s);
  });
  it('buys and sells after travel, respects finite stock and restocks locally', () => {
    const s=fresh(); addItems(s.player.inventory,'coins',200); const shop=s.shops.find(x=>x.id==='oakrest-shop')!;
    expect(applyRpgCommand(s,{type:'buy',shopId:shop.id,itemId:'iron-pickaxe',quantity:1}).ok).toBe(true); stepRpg(s); expect(itemCount(s.player.inventory,'iron-pickaxe')).toBe(0); runOrder(s);
    expect(itemCount(s.player.inventory,'coins')).toBe(85); expect(itemCount(s.player.inventory,'iron-pickaxe')).toBe(1); expect(shop.stock['iron-pickaxe']).toBe(2);
    addItems(s.player.inventory,'copper-ore',3); applyRpgCommand(s,{type:'sell',shopId:shop.id,itemId:'copper-ore',quantity:3}); runOrder(s); expect(itemCount(s.player.inventory,'coins')).toBe(109); expect(itemCount(s.player.inventory,'copper-ore')).toBe(0);
    applyRpgCommand(s,{type:'wait'}); stepRpg(s,100); expect(shop.stock['iron-pickaxe']).toBe(3); assertValid(s);
  });
  it('handles partial purchases without exceeding bag capacity or paying for missing items', () => {
    const s=fresh(); at(s,'oakrest-shop'); addItems(s.player.inventory,'coins',1000); addItems(s.player.inventory,'logs',16); expect(inventorySlots(s.player.inventory)).toBe(27);
    const shop=s.shops.find(x=>x.id==='oakrest-shop')!;
    applyRpgCommand(s,{type:'buy',shopId:shop.id,itemId:'iron-pickaxe',quantity:3}); stepRpg(s);
    expect(inventorySlots(s.player.inventory)).toBe(28); expect(itemCount(s.player.inventory,'iron-pickaxe')).toBe(1); expect(itemCount(s.player.inventory,'coins')).toBe(885); expect(shop.stock['iron-pickaxe']).toBe(2); assertValid(s);
  });
  it('removes equipment into available bag space and rejects full-bag removal without cancelling work', () => {
    const s=fresh(); addItems(s.player.inventory,'logs',17); applyRpgCommand(s,{type:'move',position:tile(60,100)}); const order=structuredClone(s.control.active);
    expect(applyRpgCommand(s,{type:'unequip',slot:'shield'}).ok).toBe(false); expect(s.control.active).toEqual(order);
    removeItems(s.player.inventory,'logs',1); expect(applyRpgCommand(s,{type:'unequip',slot:'shield'}).ok).toBe(true); stepRpg(s);
    expect(s.player.equipment.shield).toBeUndefined(); expect(itemCount(s.player.inventory,'bronze-shield')).toBe(1); expect(inventorySlots(s.player.inventory)).toBe(28); assertValid(s);
  });
  it('autonomously earns and uses an improved pickaxe, progresses Mining and keeps ambitions persistent', () => {
    const s=createRpg(NOW); const initial=s.control.goal!.id; stepRpg(s,20); expect(s.control.goal!.id).toBe(initial);
    let first=false, steel=false;
    for(let i=0;i<4500;i++){ stepRpg(s); if(i%50===0) assertValid(s); if(s.player.equipment.weapon==='iron-pickaxe') first=true; if(itemCount(s.player.inventory,'steel-pickaxe')) { steel=true; break; } }
    expect(first).toBe(true); expect(steel).toBe(true); expect(levelForXp(s.player.skills.mining)).toBeGreaterThanOrEqual(6);
    expect(s.journal.some(x=>x.includes('iron pickaxe'))).toBe(true); expect(s.npcs.some(p=>p.bank.length>0)).toBe(true); expect(s.npcs.every(p=>inventorySlots(p.inventory)<=28)).toBe(true); assertValid(s);
  });
  it('gives manual queue priority and Wait stops all prince work while NPCs continue', () => {
    const s=createRpg(NOW); stepRpg(s,10); expect(s.control.source).toBe('autonomous');
    const goal=structuredClone(s.control.goal); expect(applyRpgCommand(s,{type:'enqueue',order:{type:'move',position:tile(60,100)}}).ok).toBe(true); stepRpg(s); expect(s.control.source).toBe('player'); expect(s.control.goal).toEqual(goal);
    applyRpgCommand(s,{type:'wait'}); const p=structuredClone(s.player); const total=s.npcs.reduce((n,a)=>n+a.completed,0); stepRpg(s,200); expect(s.player).toEqual({...p,runEnergy:Math.min(10000,p.runEnergy+15*200)}); expect(s.control.active).toBeNull(); expect(s.control.queue).toEqual([]); expect(s.npcs.reduce((n,a)=>n+a.completed,0)).toBeGreaterThan(total); assertValid(s);
    expect(suggestGoals(s).length).toBeGreaterThanOrEqual(2); expect(goalMet(s,goal!)).toBe(false);
  });
});
describe('tile RPG persistence and catch-up', () => {
  it('replays a seeded economic route across serialization', () => {
    const a=createRpg(NOW,981); stepRpg(a,230); const b=validateRpgSave(JSON.parse(JSON.stringify(a)))!; expect(b).not.toBeNull(); stepRpg(a,750); stepRpg(b,750); expect(b).toEqual(a); assertValid(a);
  });
  it('rejects malformed stacks, equipment, paths, ambitions, resources and queues', () => {
    const corruptions: ((s:RpgState)=>void)[] = [
      s=>s.player.inventory.push({itemId:'coins',quantity:1}), s=>s.player.inventory[0].quantity=0, s=>s.player.inventory[0].quantity=NaN,
      s=>s.player.inventory.push({itemId:'logs',quantity:29}), s=>s.player.inventory.push({itemId:'invented',quantity:1}), s=>s.player.equipment.body='bronze-sword',
      s=>s.player.path=[tile(151,43)], s=>s.control.goal={id:'bad',title:'bad',kind:'skill',skill:'mining',level:100},
      s=>s.control.queue=[{type:'gather',objectId:'no-node',quantity:1}], s=>s.resources['oakrest-ore-0'].respawnAt=-1,
      s=>s.npcs[0].id=0, s=>s.shops[0].stock['bronze-axe']=-1,
      s=>s.player.action={kind:'craft',recipeId:'bronze-bar',duration:5,remaining:0},
    ];
    for(const corrupt of corruptions){const s=createRpg(NOW);corrupt(s);expect(validateRpgSave(s)).toBeNull();}
  });
  it('retains fractional time and handles 0/1/24/72h absence with one idempotent cap', () => {
    const s=createRpg(NOW); expect(reconcileRpg(s,NOW).ticks).toBe(0); expect(reconcileRpg(s,NOW+7).ticks).toBe(0); expect(s.offlineRemainder).toBe(1.75); expect(reconcileRpg(s,NOW+2400).ticks).toBe(1); assertValid(s);
    const a=createRpg(NOW), b=createRpg(NOW), c=createRpg(NOW); expect(reconcileRpg(a,NOW+3600000).ticks).toBe(1500); expect(reconcileRpg(b,NOW+86400000).ticks).toBe(36000); expect(reconcileRpg(c,NOW+72*3600000).ticks).toBe(36000);
    expect(c.player).toEqual(b.player); expect(c.seed).toBe(b.seed); const prior=JSON.stringify(c); expect(reconcileRpg(c,NOW+72*3600000).ticks).toBe(0); expect(JSON.stringify(c)).toBe(prior); assertValid(c);
  },60000);
});

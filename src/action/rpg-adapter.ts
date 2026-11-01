import type { ActionEvent, ActionState, ActionWorld } from "./contracts";
import type { RpgState, TilePosition, WorldDefinition } from "../rpg/types";
import { isWalkable, canStep, tile, worldForState } from "../rpg/world";
import { ITEMS, RESOURCES, ENEMIES, QUESTS } from "../rpg/content";
import { addItems, itemCount, removeItems, exchangeItems, inventorySlots, BAG_SLOTS } from "../rpg/inventory";
import { levelForXp } from "../rpg/skills";
import { appendGameMessage, appendSimulationEffect } from "../rpg/events";

export const actionSafe = (x: number, z: number): boolean =>
  (x >= 8 && x <= 87 && z >= 136 && z <= 183) ||
  [[52,95],[151,43],[207,142]].some(([tx,tz]) => Math.abs(x-tx) <= 14 && Math.abs(z-tz) <= 14);

export function rpgActionWorld(state: RpgState, world: WorldDefinition = worldForState(state),
  safe = actionSafe, height = (_x:number,_z:number) => 0): ActionWorld {
  return {
    isSafe: safe, groundHeight: height,
    travelCost(x,z){const terrain=world.terrain[Math.round(z)*world.width+Math.round(x)];return terrain==="dirt"?.6:terrain==="sand"?1.15:1;},
    canOccupy(x,z,fromX,fromZ) {
      if (![x,z,fromX,fromZ].every(Number.isFinite)) return false;
      const next = tile(Math.round(x),Math.round(z)), previous = tile(Math.round(fromX),Math.round(fromZ));
      if (!isWalkable(next,world)) return false;
      if (Math.abs(next.x-previous.x)>1 || Math.abs(next.y-previous.y)>1) {
        const samples = Math.ceil(Math.hypot(x-fromX,z-fromZ)*4);
        let prior = previous;
        for (let i=1;i<=samples;i++) {
          const at=tile(Math.round(fromX+(x-fromX)*i/samples),Math.round(fromZ+(z-fromZ)*i/samples));
          if (!isWalkable(at,world) || ((at.x!==prior.x || at.y!==prior.y) && !canStep(prior,at,world))) return false;
          prior=at;
        }
      } else if ((next.x!==previous.x || next.y!==previous.y) && !canStep(previous,next,world)) return false;
      return [[-.2,-.2],[.2,-.2],[-.2,.2],[.2,.2]].every(([dx,dz]) => isWalkable(tile(Math.round(x+dx),Math.round(z+dz)),world));
    },
    targets: world.objects.filter(object => object.resourceId && state.resources[object.id]?.available !== false)
      .map(object => ({id:object.id,x:object.position.x,z:object.position.y,kind:"resource" as const})),
  };
}

function random(state:RpgState):number { state.seed=(Math.imul(state.seed,1664525)+1013904223)>>>0; return state.seed/4294967296; }
export function applyActionEvents(state:RpgState, action:ActionState, events:readonly ActionEvent[],
  world:WorldDefinition=worldForState(state), home:TilePosition=tile(52,95)):string {
  let message="";
  for (const event of events) {
    if (event.kind === "resource-hit") {
      const object=world.objects.find(value=>value.id===event.targetId), resource=object?.resourceId && RESOURCES[object.resourceId];
      if (!object || !resource || state.resources[object.id]?.available===false) continue;
      const hasTool=[...state.player.inventory,...Object.values(state.player.equipment).map(itemId=>({itemId:itemId!,quantity:1}))]
        .some(stack=>{const tool=ITEMS[stack.itemId];return tool?.tool===resource.tool && (!tool.skill || levelForXp(state.player.skills[tool.skill]) >= (tool.level??1));});
      if (!hasTool || levelForXp(state.player.skills[resource.skill])<resource.level) { message=`Requires ${resource.tool} and ${resource.skill} ${resource.level}.`; continue; }
      if (resource.bait && !itemCount(state.player.inventory,resource.bait)) {message=`Requires ${ITEMS[resource.bait].name}.`;continue;}
      state.player.action=null;
      if (random(state)>resource.success) { message=`Working on ${object.name}.`; continue; }
      if (!exchangeItems(state.player.inventory,resource.bait?[{itemId:resource.bait,quantity:1}]:[],[{itemId:resource.itemId,quantity:1}])) {message="Your backpack is full. Store or use some items.";continue;}
      state.player.skills[resource.skill]+=resource.xp;
      if (random(state)<resource.depletion) state.resources[object.id]={objectId:object.id,available:false,respawnAt:state.tick+resource.respawnTicks};
      appendSimulationEffect(state,{kind:"action-result",actorId:"player",position:object.position,targetId:object.id,actionKind:"gather",success:true});
      message=`Collected ${ITEMS[resource.itemId].name}.`;
    } else if (event.kind === "enemy-hit" || event.kind === "player-hit") {
      const enemy=action.enemies.find(value=>value.id===event.targetId);
      if(event.kind==="enemy-hit") {state.player.skills.attack+=event.damage*40;state.player.skills.hitpoints+=event.damage*13;}
      appendSimulationEffect(state,{kind:"hit",actorId:event.kind==="enemy-hit"?"player":event.targetId,
        position:tile(Math.round(action.player.x),Math.round(action.player.z)),targetId:event.kind==="enemy-hit"?event.targetId:"player",
        targetPosition:enemy?tile(Math.round(enemy.x),Math.round(enemy.z)):state.player.position,actionKind:"fight",success:true,amount:event.damage});
    } else if (event.kind === "enemy-defeat") {
      const old=state.enemies.find(value=>value.id===event.targetId), enemy=action.enemies.find(value=>value.id===event.targetId);
      if (old && enemy) {
        if(old.health===0 && old.respawnAt>0) continue;
        old.respawnAt=state.tick+ENEMIES[old.definitionId].respawnTicks;
        let drop=state.drops.find(value=>value.id===`loot-${event.targetId}`);
        if(!drop){drop={id:`loot-${event.targetId}`,position:tile(Math.round(enemy.x),Math.round(enemy.z)),items:[],expiresAt:0};state.drops.push(drop);}
        for(const item of ENEMIES[old.definitionId].loot)addItems(drop.items,item.itemId,item.quantity,Infinity);
        const road=state.quests.road;
        if(old.definitionId==="bandit" && road.accepted && !road.complete) road.kills=Math.min(3,road.kills+1);
        for(const [id,quest] of Object.entries(QUESTS)) {
          const progress=state.quests[id];
          if(progress.accepted && !progress.complete) for(const stage of quest.stages??[])
            if(stage.kind==="kill" && stage.enemyId===old.definitionId)
              (progress.counters??={})[stage.id]=Math.min(stage.quantity??1,(progress.counters[stage.id]??0)+1);
        }
      }
      message="Encounter won. Collect the supplies left behind.";
    } else if (event.kind === "block") message="Blocked.";
    else if (event.kind === "player-defeat") {
      const items=state.grave?.items.map(item=>({...item}))??[];
      for (const item of state.player.inventory) addItems(items,item.itemId,item.quantity,Infinity);
      if (items.length) state.grave={position:tile(Math.round(action.player.x),Math.round(action.player.z)),items,attempts:0,retryAt:state.tick};
      state.player.inventory=[];
      Object.assign(action.player,{x:home.x,z:home.y,height:0,health:action.player.maxHealth,guard:100,swing:0,blocking:false,moveRemainderX:0,moveRemainderZ:0});
      for (const enemy of action.enemies) {enemy.windup=0;enemy.cooldown=60;}
      message="Returned home. Equipped gear is safe; recover your backpack in the wilderness.";
      appendGameMessage(state,"event","action-defeat",message);
    }
  }
  state.player.position=tile(Math.round(action.player.x),Math.round(action.player.z));
  action.player.maxHealth=levelForXp(state.player.skills.hitpoints);
  state.player.health=action.player.health;
  for (const enemy of action.enemies) {
    const old=state.enemies.find(value=>value.id===enemy.id);
    if (old) {old.position=tile(Math.round(enemy.x),Math.round(enemy.z));old.health=enemy.health;}
  }
  return message;
}

export function syncActionRespawns(state:RpgState,action:ActionState):void {
  for(const enemy of action.enemies) {
    const old=state.enemies.find(value=>value.id===enemy.id);
    if(enemy.defeated && old?.respawnAt && state.tick>=old.respawnAt) {
      Object.assign(enemy,{health:enemy.maxHealth,defeated:false,x:enemy.homeX,z:enemy.homeZ,cooldown:60,windup:0});
      old.health=enemy.maxHealth;old.respawnAt=0;
    }
  }
}

export function actionInteract(state:RpgState,action:ActionState,target?:{kind:"grave"}|{kind:"drop";id:string}):string {
  const near=(p:TilePosition)=>Math.hypot(p.x-action.player.x,p.y-action.player.z)<2;
  const collect=(items:RpgState["player"]["inventory"])=>{
    for(const item of [...items]){
      const held=itemCount(state.player.inventory,item.itemId),room=ITEMS[item.itemId].stackable?
        (held||inventorySlots(state.player.inventory)<BAG_SLOTS?2_000_000_000-held:0):BAG_SLOTS-inventorySlots(state.player.inventory);
      const count=Math.min(item.quantity,room);
      if(count>0&&addItems(state.player.inventory,item.itemId,count))removeItems(items,item.itemId,count);
    }
  };
  if (state.grave && (!target||target.kind==="grave") && near(state.grave.position)) {
    collect(state.grave.items);
    if (!state.grave.items.length) state.grave=null;
    return state.grave?"Recovered what fits. Remaining belongings are safe.":"Backpack recovered.";
  }
  const drop=target?.kind==="grave"?undefined:state.drops.find(value=>(!target||target.id===value.id)&&near(value.position));
  if (drop) {
    collect(drop.items);
    state.drops=state.drops.filter(value=>value.items.length);
    return "Collected supplies that fit your backpack.";
  }
  return "Face a nearby tree or ore and press Tool for each swing.";
}

import type {ActionEvent,ActionState} from "../action/contracts";
import {actionSafe,rpgActionWorld} from "../action/rpg-adapter";
import {findActionTarget} from "../action/simulation";
import {ENEMIES,ITEMS,RESOURCES} from "../rpg/content";
import {exchangeItems,itemCount} from "../rpg/inventory";
import {levelForXp} from "../rpg/skills";
import type {RpgState,WorldDefinition,WorldObject} from "../rpg/types";
import type {TileSelection} from "../render/scene-types";
import type {ValleyFeedback,ValleySave} from "./contracts";
import {serviceForObject} from "./services";

type Feedback=Omit<ValleyFeedback,"id">;
const distance=(action:ActionState,x:number,z:number)=>Math.hypot(x-action.player.x,z-action.player.z);
const resourceVerb=(object:WorldObject)=>{
  const tool=object.resourceId?RESOURCES[object.resourceId]?.tool:undefined;
  return tool==="axe"?"Chop":tool==="pickaxe"?"Mine":tool==="net"||tool==="rod"||tool==="flyrod"?"Fish":"Gather";
};
export function resourceRequirement(save:ValleySave,object:WorldObject):string|null {
  const resource=object.resourceId&&RESOURCES[object.resourceId];if(!resource)return null;
  const tools=[...save.chapter.player.inventory.map(item=>item.itemId),...Object.values(save.chapter.player.equipment)];
  const hasTool=tools.some(id=>{const tool=ITEMS[id??""];return tool?.tool===resource.tool&&(!tool.skill||levelForXp(save.chapter.player.skills[tool.skill])>=(tool.level??1));});
  if(!hasTool||levelForXp(save.chapter.player.skills[resource.skill])<resource.level)return `Requires ${resource.tool} and ${resource.skill} ${resource.level}.`;
  if(resource.bait&&!itemCount(save.chapter.player.inventory,resource.bait))return `Requires ${ITEMS[resource.bait].name}.`;
  const staged=save.chapter.player.inventory.map(item=>({...item}));
  if(!exchangeItems(staged,resource.bait?[{itemId:resource.bait,quantity:1}]:[],[{itemId:resource.itemId,quantity:1}]))return "Backpack full — store or use an item first.";
  return null;
}
export interface NearbyInteraction {selection:TileSelection;label:string;detail:string;x:number;z:number}
const objectAnchor=(save:ValleySave,object:WorldObject)=>{
  const service=serviceForObject(save,object);
  return service?{x:service.x,z:service.z,limit:service.range}:{x:object.position.x+(object.width-1)/2,z:object.position.y+(object.height-1)/2,limit:5};
};
/** Deliberate mouse activation may turn toward a nearby target, but never extends its reach. */
export function selectionInRange(save:ValleySave,action:ActionState,world:WorldDefinition,selection:TileSelection):boolean {
  if(selection.kind==="actor"){const npc=save.chapter.npcs.find(npc=>npc.id===selection.id&&npc.health>0);return !!npc&&distance(action,npc.position.x,npc.position.y)<=3;}
  if(selection.kind==="object"){
    const object=world.objects.find(value=>value.id===selection.id);if(!object)return false;
    if(object.resourceId)return distance(action,object.position.x,object.position.y)<=1.65;
    const anchor=objectAnchor(save,object);return distance(action,anchor.x,anchor.z)<=anchor.limit;
  }
  if(selection.kind==="enemy"){
    const enemy=action.enemies.find(value=>value.id===selection.id);if(!enemy)return false;
    const dx=enemy.x-action.player.x,dz=enemy.z-action.player.z,length=Math.hypot(dx,dz);
    const faced={...action,player:{...action.player,facingX:length?dx/length:action.player.facingX,facingZ:length?dz/length:action.player.facingZ}};
    // Reuse authoritative range and safe-segment checks without changing the player's facing.
    return findActionTarget({...faced,enemies:[enemy]},rpgActionWorld(save.chapter,world),false)?.id===enemy.id;
  }
  const position=selection.kind==="grave"?save.chapter.grave?.position:selection.kind==="drop"?save.chapter.drops.find(value=>value.id===selection.id)?.position:null;
  return !!position&&distance(action,position.x,position.y)<2;
}
const forwardAlignment=(action:ActionState,x:number,z:number):number=>{
  const dx=x-action.player.x,dz=z-action.player.z,range=Math.hypot(dx,dz);
  if(range<=.25)return 1;
  const facing=Math.hypot(action.player.facingX,action.player.facingZ);
  return facing?(dx*action.player.facingX+dz*action.player.facingZ)/(range*facing):-1;
};
export function nearbyValleyInteraction(save:ValleySave,action:ActionState,world:WorldDefinition):NearbyInteraction|null {
  const candidates:NearbyInteraction[]=world.objects.filter(object=>!object.resourceId&&(["quest","shop","building","furnace","range","anvil","sign"].includes(object.kind)||!!object.serviceId))
    .flatMap(object=>{const anchor=objectAnchor(save,object);return distance(action,anchor.x,anchor.z)<=anchor.limit?[{selection:{kind:"object"as const,id:object.id},label:object.id.startsWith("valley-visitor-")?"Talk":object.kind==="sign"?"Read":"Open",detail:object.name,x:anchor.x,z:anchor.z}]:[];});
  for(const npc of save.chapter.npcs)if(npc.health>0&&distance(action,npc.position.x,npc.position.y)<=3)candidates.push({selection:{kind:"actor",id:npc.id},label:"Talk",detail:npc.name,x:npc.position.x,z:npc.position.y});
  if(save.chapter.grave&&distance(action,save.chapter.grave.position.x,save.chapter.grave.position.y)<2)candidates.push({selection:{kind:"grave"},label:"Recover",detail:"Your backpack",x:save.chapter.grave.position.x,z:save.chapter.grave.position.y});
  for(const drop of save.chapter.drops)if(distance(action,drop.position.x,drop.position.y)<2)candidates.push({selection:{kind:"drop",id:drop.id},label:"Collect",detail:"Dropped supplies",x:drop.position.x,z:drop.position.y});
  const key=(target:NearbyInteraction)=>target.selection.kind==="grave"?"0-grave":target.selection.kind==="drop"?`1-${target.selection.id}`:target.selection.kind==="object"?`2-${target.selection.id}`:target.selection.kind==="actor"?`3-${target.selection.id}`:"";
  return candidates.map(target=>({target,alignment:forwardAlignment(action,target.x,target.z),range:distance(action,target.x,target.z)}))
    .filter(value=>value.alignment>=.5)
    .sort((a,b)=>b.alignment-a.alignment||a.range-b.range||(key(a.target)<key(b.target)?-1:key(a.target)>key(b.target)?1:0))[0]?.target??null;
}
/** One live target marker shares the exact resolver used by the nearby-action button. */
export function valleyInteractionCue(save:ValleySave,action:ActionState,world:WorldDefinition,tool:boolean){
  const p=action.player,player={x:p.x,z:p.z,facingX:p.facingX,facingZ:p.facingZ};
  const interaction=nearbyValleyInteraction(save,action,world);
  if(interaction)return {player,target:{x:interaction.x,z:interaction.z,label:`${interaction.label} · ${interaction.detail}`}};
  const target=findActionTarget(action,rpgActionWorld(save.chapter,world),tool);
  if(!target)return {player};
  const object=target.kind==="resource"?world.objects.find(value=>value.id===target.id):undefined;
  const enemy=target.kind==="enemy"?save.chapter.enemies.find(value=>value.id===target.id):undefined;
  const label=object?`${resourceVerb(object)} · ${object.name}`:`Attack · ${enemy?ENEMIES[enemy.definitionId].name:"Wilderness foe"}`;
  return {player,target:{x:target.x,z:target.z,label}};
}
export function valleyActionContext(save:ValleySave,action:ActionState,world:WorldDefinition,tool:boolean){
  const env=rpgActionWorld(save.chapter,world),target=findActionTarget(action,env,tool);
  let strikeLabel=tool?"Swing tool":"Attack",strikeHint=tool?"Face a tree, rock or pond":"Face a foe in the wilderness",targetName="",targetId:string|undefined;
  if(tool){
    const nearest=world.objects.filter(object=>!!object.resourceId).map(object=>({object,range:distance(action,object.position.x,object.position.y)}))
      .filter(value=>value.range<=5).sort((a,b)=>a.range-b.range||a.object.id.localeCompare(b.object.id))[0];
    const object=target?world.objects.find(value=>value.id===target.id):nearest?.object;
    if(object){
      const range=distance(action,object.position.x,object.position.y),available=save.chapter.resources[object.id]?.available!==false;
      targetId=object.id;targetName=object.name;strikeLabel=resourceVerb(object);
      strikeHint=!available?"Resting — try another spot":resourceRequirement(save,object)??(target?"Tap once for each swing":range>1.65?`${Math.ceil(range)} m · move closer`:`Face ${object.name}`);
    }
  }else{
    const enemy=target&&action.enemies.find(value=>value.id===target.id);
    if(enemy){const definition=save.chapter.enemies.find(value=>value.id===enemy.id);targetId=enemy.id;targetName=definition?ENEMIES[definition.definitionId].name:"Wilderness foe";strikeHint=`${enemy.health}/${enemy.maxHealth} HP · tap to strike`;}
    else if(actionSafe(action.player.x,action.player.z))strikeHint="Your valley is safe · switch to Tool to gather";
  }
  const interaction=nearbyValleyInteraction(save,action,world);
  return {strikeLabel,strikeHint,targetName,targetId,ready:!!target,interaction};
}
export function emptySwingFeedback(save:ValleySave,action:ActionState,world:WorldDefinition,tool:boolean):Feedback {
  const context=valleyActionContext(save,action,world,tool);
  return {tone:"info",title:tool?"Nothing gathered this swing":"No foe in reach",detail:context.targetName?`${context.targetName}: ${context.strikeHint}`:context.strikeHint};
}
export interface RewardSnapshot {items:Record<string,number>;skills:Record<string,number>}
export function rewardSnapshot(chapter:RpgState,carpentryXp=0):RewardSnapshot {
  const items:Record<string,number>={};
  for(const item of [...chapter.player.inventory,...chapter.bank])items[item.itemId]=(items[item.itemId]??0)+item.quantity;
  return {items,skills:{...chapter.player.skills,carpentry:carpentryXp}};
}
export function rewardChanges(before:RewardSnapshot,chapter:RpgState,carpentryXp=0):string {
  const after=rewardSnapshot(chapter,carpentryXp),parts:string[]=[];
  for(const [id,count] of Object.entries(after.items)){const gain=count-(before.items[id]??0);if(gain>0)parts.push(`+${gain} ${ITEMS[id]?.name??id}`);}
  for(const [skill,xp] of Object.entries(after.skills)){const gain=xp-(before.skills[skill]??0);if(gain>0)parts.push(`+${Number((gain/10).toFixed(1))} ${skill} XP`);}
  return parts.join(" · ");
}
export function actionResultFeedback(save:ValleySave,action:ActionState,events:readonly ActionEvent[],message:string,rewards:string):Feedback|null {
  if(events.some(event=>event.kind==="player-defeat"))return {tone:"danger",title:"Returned home safely",detail:message};
  const hit=events.find(event=>event.kind==="player-hit");
  if(hit?.kind==="player-hit")return {tone:"danger",title:`Hit! −${hit.damage} HP`,detail:action.player.guardBroken>0?"Guard broken — release Block to recover.":"Block facing the foe or move clear of its attack."};
  if(events.some(event=>event.kind==="enemy-defeat"))return {tone:"success",title:"Encounter won",detail:[rewards,"Collect the supplies left behind."].filter(Boolean).join(" · ")};
  const attack=events.find(event=>event.kind==="enemy-hit");
  if(attack?.kind==="enemy-hit")return {tone:"success",title:`Hit! −${attack.damage} foe HP`,detail:rewards};
  if(events.some(event=>event.kind==="block"))return {tone:action.player.guardBroken>0?"warning":"info",title:action.player.guardBroken>0?"Guard broken":"Blocked · −25 guard",detail:action.player.guardBroken>0?"Release Block and give your guard time to recover.":"Release Block to recover stamina."};
  if(events.some(event=>event.kind==="resource-hit"))return {tone:rewards?"success":message.startsWith("Working")?"info":"warning",title:message,detail:rewards|| (message.startsWith("Working")?"No material yet — tap again when the swing finishes.":undefined)};
  return message?{tone:"info",title:message,detail:rewards||undefined}:null;
}

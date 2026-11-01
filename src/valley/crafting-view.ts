import {ITEMS} from "../rpg/content";
import {exchangeItems,itemCount} from "../rpg/inventory";
import {levelForXp} from "../rpg/skills";
import {COTTAGE_TICKS,FORGE_TICKS} from "./contracts";
import type {ValleySave,ValleyService} from "./contracts";
import {VALLEY_RECIPES} from "./content";
import type {ValleyRecipe} from "./content";

export const craftingQuantity=(value:number)=>Number.isFinite(value)?Math.max(1,Math.min(100,Math.trunc(value))):1;
export function recipesForService(service:ValleyService):ValleyRecipe[]{
  if(!["workbench","furnace","range","caravan"].includes(service.kind)||!service.station)return [];
  return Object.values(VALLEY_RECIPES).filter(recipe=>recipe.station===service.station&&(service.kind!=="caravan"||!recipe.requiresCottage));
}
export const craftingTicks=(save:ValleySave,recipe:ValleyRecipe)=>recipe.id==="bronze-bar"&&save.valley.forge.ticks>=FORGE_TICKS?4:recipe.ticks;
export function craftingView(save:ValleySave,service:ValleyService,recipe:ValleyRecipe,requestedQuantity:number){
  const quantity=craftingQuantity(requestedQuantity),bag=save.chapter.player.inventory;
  const materials=recipe.inputs.map(input=>({itemId:input.itemId,name:ITEMS[input.itemId]?.name??input.itemId,
    have:itemCount(bag,input.itemId),need:input.quantity*quantity}));
  const level=levelForXp(recipe.skill==="carpentry"?save.valley.carpentryXp:save.chapter.player.skills[recipe.skill]);
  let reason="";
  if(!recipesForService(service).some(value=>value.id===recipe.id))reason="Use the matching station for this recipe.";
  else if(Math.hypot(save.action.player.x-service.x,save.action.player.z-service.z)>service.range)reason=`Move closer to ${service.name}.`;
  else if(save.valley.workQueue.length)reason="A batch is already being made.";
  else if(recipe.requiresCottage&&save.valley.cottageTicks<COTTAGE_TICKS)reason="Complete your cottage first.";
  else if(level<recipe.level)reason=`${recipe.skill[0].toUpperCase()+recipe.skill.slice(1)} level ${recipe.level} required.`;
  else {
    const missing=materials.find(material=>material.have<material.need);
    if(missing)reason=`Need ${missing.need-missing.have} more ${missing.name.toLowerCase()}.`;
    else if(!exchangeItems(bag.map(item=>({...item})),materials.map(material=>({itemId:material.itemId,quantity:material.need})),[{itemId:recipe.output.itemId,quantity:recipe.output.quantity*quantity}]))reason="Make room in your backpack.";
    else if(itemCount(save.chapter.bank,recipe.output.itemId)+recipe.output.quantity*quantity>2_000_000_000)reason="Make room in connected storage.";
  }
  return {quantity,materials,level,reason,canCraft:!reason,outputName:ITEMS[recipe.output.itemId]?.name??recipe.output.itemId,
    outputQuantity:recipe.output.quantity*quantity,seconds:craftingTicks(save,recipe)*quantity*.6,xp:recipe.xp*quantity/10};
}
export interface CraftCompletionCheck {recipeId:string;quantity:number;ownedBefore:number}
export function craftedReceipt(previous:CraftCompletionCheck,save:ValleySave):string {
  const recipe=VALLEY_RECIPES[previous.recipeId];if(!recipe||save.valley.workQueue.length)return "";
  const count=recipe.output.quantity*previous.quantity;
  const after=itemCount(save.chapter.player.inventory,recipe.output.itemId)+itemCount(save.chapter.bank,recipe.output.itemId);
  return after-previous.ownedBefore>=count?`+${count} ${ITEMS[recipe.output.itemId]?.name??recipe.output.itemId} · Backpack or storage`:"";
}

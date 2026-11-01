import { ITEMS } from "../rpg/content";
import { calendarDate } from "../rpg/engine";
import { addItems, exchangeItems, itemCount, removeItems } from "../rpg/inventory";
import { levelForXp } from "../rpg/skills";
import type { ItemStack } from "../rpg/types";
import { COTTAGE_TICKS, FIRST_BILL, FORGE_TICKS } from "./contracts";
import type { ValleyCommand, ValleyResult, ValleySave } from "./contracts";
import { VALLEY_COMMISSIONS, VALLEY_RECIPES, VALLEY_STOCK, visitorStock } from "./content";
import { getVisitors } from "./onboarding";
import { createValleyWorld, editValleyGround, homeFootprints, undoValleyGround, validateFurniturePlacement, validateHomePlacement } from "./world";

const result=(ok:boolean,message:string):ValleyResult=>({ok,message});
const quantity=(n:number)=>Number.isSafeInteger(n)&&n>0&&n<=100;
const complete=(save:ValleySave)=>save.valley.cottageTicks>=COTTAGE_TICKS;
const near=(save:ValleySave,x:number,z:number,r=3)=>Math.hypot(save.action.player.x-x,save.action.player.z-z)<=r;
const overlapsPlayer=(save:ValleySave,x:number,z:number,width:number,height:number)=>{
  const p=save.action.player;
  return p.x+.2>x-.5&&p.x-.2<x+width-.5&&p.z+.2>z-.5&&p.z-.2<z+height-.5;
};
const carried=(save:ValleySave)=>save.chapter.player.inventory;
const flag=(save:ValleySave,id:string)=>{if(!save.valley.flags.includes(id))save.valley.flags.push(id);};
function syncVisitors(save:ValleySave,now:number):void {
  for(const visitor of getVisitors(save,now)) if(!save.valley.introduced.includes(visitor.id)) {save.valley.introduced.push(visitor.id);save.valley.layoutRevision++;}
}
function bankNearby(save:ValleySave):boolean {
  if(near(save,74,140))return true;
  const fp=homeFootprints(save.valley);
  return !!fp&&((!save.valley.home?.tentPacked&&near(save,fp.tentDoor.x,fp.tentDoor.z))||(complete(save)&&near(save,fp.door.x,fp.door.z)));
}
function orderNearby(save:ValleySave):boolean {const fp=complete(save)?homeFootprints(save.valley):null;return near(save,51,141)||near(save,74,140)||bankNearby(save)||!!fp&&near(save,fp.planningTable.x,fp.planningTable.z);}
function gift(save:ValleySave,itemId:string,n:number):boolean {
  if(!addItems(carried(save),itemId,n)) {
    // Connected storage has no slot limit, but the shared inventory integer ceiling still applies.
    if(!addItems(save.chapter.bank,itemId,n,Number.MAX_SAFE_INTEGER)) return false;
    save.valley.message="Your completed supplies were delivered to connected storage.";
  }
  return true;
}
export function ensureValleyResources(save:ValleySave):void {
  for(const object of createValleyWorld(save.valley).objects) if(object.resourceId&&!save.chapter.resources[object.id])
    save.chapter.resources[object.id]={objectId:object.id,available:true,respawnAt:0};
}
function execute(save:ValleySave,command:ValleyCommand,now:number):ValleyResult {
  const v=save.valley,bag=carried(save),date=calendarDate(now);
  switch(command.type) {
    case "eat": {
      const food=Object.hasOwn(ITEMS,command.itemId)?ITEMS[command.itemId]:undefined;
      if(!food?.heals||!itemCount(bag,command.itemId))return result(false,"Carry a cooked meal to eat it.");
      if(save.action.player.health>=save.action.player.maxHealth)return result(false,"You are already rested and healthy.");
      removeItems(bag,command.itemId,1);save.action.player.health=Math.min(save.action.player.maxHealth,save.action.player.health+food.heals);
      save.chapter.player.health=save.action.player.health;return result(true,`Ate ${food.name}.`);
    }
    case "equip": {
      const item=Object.hasOwn(ITEMS,command.itemId)?ITEMS[command.itemId]:undefined;
      if(!item?.slot||!itemCount(bag,item.id))return result(false,"Carry that equipment before equipping it.");
      if(levelForXp(save.chapter.player.skills.attack)<(item.attackLevel??1)||levelForXp(save.chapter.player.skills.defence)<(item.defenceLevel??1)||levelForXp(save.chapter.player.skills.ranged)<(item.rangedLevel??1)||
        (item.skill&&levelForXp(save.chapter.player.skills[item.skill])<(item.level??1)))return result(false,"Your skill level is too low for this equipment.");
      const equipment=save.chapter.player.equipment;
      if(item.slot==="shield"&&ITEMS[equipment.weapon??""]?.twoHanded)return result(false,"Put away the two-handed weapon before equipping a shield.");
      const returned=[];
      if(equipment[item.slot])returned.push({itemId:equipment[item.slot]!,quantity:1});
      if(item.twoHanded&&equipment.shield)returned.push({itemId:equipment.shield,quantity:1});
      if(!exchangeItems(bag,[{itemId:item.id,quantity:1}],returned))return result(false,"Make room for your previous equipment first.");
      equipment[item.slot]=item.id;if(item.twoHanded)delete equipment.shield;return result(true,`Equipped ${item.name}.`);
    }
    case "unequip": {
      if(!["weapon","shield","head","body","legs","cape"].includes(command.slot))return result(false,"Choose an equipment slot.");
      const id=save.chapter.player.equipment[command.slot];
      if(!id||!addItems(bag,id,1))return result(false,"Make room in your backpack first.");
      delete save.chapter.player.equipment[command.slot];return result(true,`Put away ${ITEMS[id].name}.`);
    }
    case "place-home": {
      if(v.home)return result(false,"Your home pad is already chosen.");
      const reason=validateHomePlacement(v,command.x,command.z,command.rotation);if(reason)return result(false,reason);
      v.home={x:command.x,z:command.z,rotation:command.rotation,tentPacked:false};v.layoutRevision++;
      if(!v.flags.includes("welcome-seeds")){if(!gift(save,"valley-flower-seeds",4))return result(false,"Make room for your welcome seeds in storage.");flag(save,"welcome-seeds");}
      return result(true,"Your tent is ready. Connected storage is shared with the caravan and future cottage.");
    }
    case "pay": {
      if(!v.home)return result(false,"Place your free tent before commissioning the cottage.");
      if(!orderNearby(save))return result(false,"Speak to Rowan, or use your home or caravan account nearby.");
      if(!quantity(command.amount)||command.amount>FIRST_BILL-v.paid)return result(false,"Choose an amount within the unpaid cottage bill.");
      if(itemCount(bag,"coins")+itemCount(save.chapter.bank,"coins")<command.amount)return result(false,"You need more coins for that payment.");
      const held=Math.min(command.amount,itemCount(bag,"coins"));if(held)removeItems(bag,"coins",held);
      if(command.amount>held)removeItems(save.chapter.bank,"coins",command.amount-held);
      v.paid+=command.amount;if(v.paid===FIRST_BILL){v.layoutRevision++;flag(save,"cottage-commissioned");}
      return result(true,v.paid===FIRST_BILL?"Account paid. Rowan has started the 90-minute cottage build.":`Cottage account: ${v.paid}/100 coins. Construction starts when fully paid.`);
    }
    case "craft": {
      const recipe=VALLEY_RECIPES[command.recipeId];if(!Object.hasOwn(VALLEY_RECIPES,command.recipeId)||!recipe||!quantity(command.quantity))return result(false,"Choose a known recipe and a quantity from 1 to 100.");
      if(v.workQueue.length)return result(false,"Finish your current craft batch first.");
      if(recipe.requiresCottage&&!complete(save))return result(false,"This furnishing unlocks when your cottage is complete.");
      if(recipe.skill!=="carpentry"&&levelForXp(save.chapter.player.skills[recipe.skill])<recipe.level)return result(false,"Your skill level is too low.");
      const fp=homeFootprints(v),personalBench=complete(save)&&fp&&near(save,fp.workbench.x,fp.workbench.z);
      const caravanBench=!recipe.requiresCottage&&near(save,74,140);
      const station=recipe.station==="workbench"?(near(save,69,139)||personalBench||caravanBench):recipe.station==="range"?near(save,81,139):near(save,78,139)||(v.forge.ticks>=FORGE_TICKS&&near(save,72,180));
      if(!station)return result(false,"Stand near the communal workbench, brazier, or cooking fire for this recipe.");
      const inputs=recipe.inputs.map(i=>({...i,quantity:i.quantity*command.quantity})),output={...recipe.output,quantity:recipe.output.quantity*command.quantity};
      const staged=bag.map(i=>({...i}));if(!exchangeItems(staged,inputs,[output]))return result(false,"You need the exact carried ingredients and room for the finished batch.");
      if(itemCount(save.chapter.bank,output.itemId)+output.quantity>2_000_000_000)return result(false,"Make room in connected storage first.");
      for(const i of inputs)removeItems(bag,i.itemId,i.quantity);
      const ticks=recipe.id==="bronze-bar"&&v.forge.ticks>=FORGE_TICKS?4:recipe.ticks;
      v.workQueue.push({recipeId:recipe.id,quantity:command.quantity,remainingTicks:ticks*command.quantity});
      return result(true,`Started ${command.quantity} × ${recipe.name.toLowerCase()}. Ingredients reserved.`);
    }
    case "commission": {
      const order=VALLEY_COMMISSIONS.find(c=>c.id===command.id);if(!order)return result(false,"That order is unavailable.");
      if(!orderNearby(save))return result(false,"Bring the order to Rowan or the caravan.");
      const key=`${date}:${order.id}`,latest=v.dailyCommissions.map(k=>k.slice(0,10)).sort().at(-1),done=order.daily?(v.dailyCommissions.includes(key)||(latest!==undefined&&date<latest)):v.commissions.includes(order.id);
      if(done)return result(false,order.daily?"You already completed that order today.":"That one-time commission is complete.");
      if(order.requiresCottage&&!complete(save))return result(false,"Finish the cottage first.");
      if(!exchangeItems(bag,order.inputs,[{itemId:"coins",quantity:order.coins}]))return result(false,"Carry the requested supplies and leave room for your payment.");
      if(order.daily){v.dailyCommissions.push(key);v.dailyCommissions=v.dailyCommissions.slice(-270);}else v.commissions.push(order.id);
      return result(true,`${order.name} delivered. Earned ${order.coins} coins.`);
    }
    case "buy": case "sell": {
      if(!near(save,74,140))return result(false,"Stand near the supply caravan to trade.");
      if(!quantity(command.quantity))return result(false,"Choose a quantity from 1 to 100.");
      const stock=VALLEY_STOCK.find(s=>s.itemId===command.itemId);
      if(!stock||(stock.requiresCottage&&!complete(save)))return result(false,"That item is unavailable at the caravan.");
      const buying=command.type==="buy",price=(buying?stock.buy:stock.sell)*command.quantity;
      if(buying&&!visitorStock(now).some(s=>s.itemId===stock.itemId))return result(false,"That decoration is not in today's visitor stock. You can craft it at your workbench.");
      const inputs:ItemStack[]=[{itemId:buying?"coins":stock.itemId,quantity:buying?price:command.quantity}],outputs:ItemStack[]=[{itemId:buying?stock.itemId:"coins",quantity:buying?command.quantity:price}];
      if(!exchangeItems(bag,inputs,outputs))return result(false,"Trade blocked: carried supplies, coins, or backpack space.");
      return result(true,`${buying?"Bought":"Sold"} ${command.quantity} ${stock.name.toLowerCase()} for ${price} coins.`);
    }
    case "store": case "withdraw": {
      if(!bankNearby(save))return result(false,"Use storage near your tent, cottage, or caravan.");
      if(!Object.hasOwn(ITEMS,command.itemId)||!quantity(command.quantity))return result(false,"Choose a known item and quantity from 1 to 100.");
      const store=command.type==="store",from=store?bag:save.chapter.bank,to=store?save.chapter.bank:bag;
      if(!removeItems(from,command.itemId,command.quantity)||!addItems(to,command.itemId,command.quantity,store?Number.MAX_SAFE_INTEGER:28))return result(false,"Storage transfer blocked: quantity or backpack space.");
      return result(true,store?"Stored in connected storage.":"Withdrawn to your backpack.");
    }
    case "place-furniture": case "move-furniture": {
      const moving=command.type==="move-furniture",existing=moving?v.furniture.find(f=>f.id===command.id):undefined;
      if(moving&&!existing)return result(false,"That furnishing no longer exists.");
      const itemId=existing?.itemId??(command as Extract<ValleyCommand,{type:"place-furniture"}>).itemId;
      if(itemId!=="stool"&&!complete(save))return result(false,"Finish the cottage before placing this furnishing.");
      if(!v.home||!near(save,command.x,command.z,6))return result(false,"Place your tent, then stand near the furnishing's new position.");
      const reason=validateFurniturePlacement(v,itemId,command.x,command.z,command.rotation,existing?.id,save.action.player);if(reason)return result(false,reason);
      if(existing){existing.x=command.x;existing.z=command.z;existing.rotation=command.rotation;}
      else {if(!removeItems(bag,`valley-${itemId}`,1))return result(false,"Carry the furnishing you want to place.");v.furniture.push({id:`f-${v.layoutRevision}-${save.chapter.tick}`,itemId,x:command.x,z:command.z,rotation:command.rotation});}
      v.layoutRevision++;return result(true,moving?"Furnishing moved.":"Furnishing placed.");
    }
    case "terrain":
      if(!near(save,command.x,command.z,6))return result(false,"Stand near the ground you want to edit.");
      return editValleyGround(v,command.x,command.z,command.operation,{x:save.action.player.x,z:save.action.player.z});
    case "undo-terrain": return undoValleyGround(v,{x:save.action.player.x,z:save.action.player.z});
    case "plant": {
      if(!v.home||!near(save,command.x,command.z,6))return result(false,"Place your tent and stand near the planting spot.");
      // The one-tile placement rules protect water, buildings and entrance routes.
      const reason=validateFurniturePlacement(v,"planter",command.x,command.z,0);if(reason)return result(false,reason);
      if(command.kind!=="flowers"&&command.kind!=="sapling")return result(false,"Choose flowers or a young sapling.");
      const itemId=command.kind==="flowers"?"valley-flower-seeds":"valley-sapling";
      if(!removeItems(bag,itemId,1))return result(false,`Carry ${ITEMS[itemId].name.toLowerCase()} for planting.`);
      v.plants.push({id:`p-${v.layoutRevision}-${save.chapter.tick}`,x:command.x,z:command.z,kind:command.kind});v.layoutRevision++;return result(true,"Planted. Ground work awards no experience.");
    }
    case "daily-help": {
      if(!near(save,51,141))return result(false,"Speak to Rowan for a small daily timber parcel.");
      if(v.dailyHelp.includes(date)||v.dailyHelp.some(day=>day>date))return result(false,"Rowan has already given you today's timber parcel.");
      if(!gift(save,"logs",4))return result(false,"Make room for the timber parcel in connected storage.");v.dailyHelp.push(date);v.dailyHelp=v.dailyHelp.slice(-90);return result(true,"Rowan gave you four logs. One parcel is available per local date.");
    }
    case "lift-plant": {
      const plant=v.plants.find(p=>p.id===command.id);
      if(!plant||!near(save,plant.x,plant.z,6))return result(false,"Stand near your planting to lift it.");
      if(!gift(save,plant.kind==="flowers"?"valley-flower-seeds":"valley-sapling",1))return result(false,"Make room for the planting in your backpack or connected storage.");
      v.plants=v.plants.filter(p=>p.id!==plant.id);v.layoutRevision++;
      return result(true,"Planting lifted. Its original seeds or sapling remain yours; no experience was awarded.");
    }
    case "forge-deliver": {
      if(!complete(save))return result(false,"The public forge is optional after your cottage is complete.");
      if(!near(save,70,178,5))return result(false,"Carry materials to the public forge site.");
      if(overlapsPlayer(save,70,178,4,3))return result(false,"Step clear of the forge's building pad before delivering materials.");
      if(!quantity(command.quantity)||!["logs","bronze-bar"].includes(command.itemId))return result(false,"Choose an exact material quantity.");
      const key=command.itemId==="logs"?"logs":"bars",limit=key==="logs"?12:2;
      if(command.quantity>limit-v.forge[key]||!removeItems(bag,command.itemId,command.quantity))return result(false,"Bring carried materials within the remaining project requirement.");
      v.forge[key]+=command.quantity;v.layoutRevision++;return result(true,v.forge.logs===12&&v.forge.bars===2?"Materials delivered. The optional forge will take 18 active minutes.":"Materials delivered to the optional forge.");
    }
    case "pin-goal":
      if(typeof command.goal!=="string"||!command.goal.trim()||command.goal.length>256)return result(false,"Choose a short goal.");
      v.goal=command.goal.trim();return result(true,"Goal pinned.");
    case "talk-visitor": {
      const visitor=getVisitors(save,now).find(n=>n.id===command.id);if(!visitor)return result(false,"That visitor has not arrived yet.");
      if(!near(save,visitor.x,visitor.z))return result(false,`Walk closer to ${visitor.name}.`);
      flag(save,`talked-${visitor.id}`);return result(true,visitor.dialogue);
    }
    case "pack-tent":
      if(!v.home||!complete(save)||v.home.tentPacked)return result(false,"Pack your tent after the cottage is complete.");
      v.home.tentPacked=true;v.layoutRevision++;return result(true,"Tent packed. Your connected storage remains available in your cottage and caravan.");
  }
}
/** Failed commands leave every byte of the supplied save unchanged. */
export function applyValleyCommand(save:ValleySave,command:ValleyCommand,now:number):ValleyResult {
  if(!Number.isFinite(now)||now<0)return result(false,"Invalid local time.");
  const staged=structuredClone(save);
  try {
    const reply=execute(staged,command,now);if(!reply?.ok)return reply??result(false,"Unknown valley command.");
    staged.valley.message=reply.message;syncVisitors(staged,now);staged.chapter.action=staged.action;
    Object.assign(save,staged);return reply;
  }catch{return result(false,"The transaction could not be completed.");}
}
/** Settlement clock only: actor movement, combat and regeneration are deliberately absent. */
export function advanceSettlement(save:ValleySave,ticks:number,now:number):void {
  if(!Number.isSafeInteger(ticks)||ticks<0||ticks>36000||!Number.isFinite(now)||now<0)throw new RangeError("Settlement batch must be 0–36000 integer ticks with a valid date.");
  ensureValleyResources(save);
  const v=save.valley,wasComplete=complete(save),forgeComplete=v.forge.ticks>=FORGE_TICKS;
  if(v.paid===FIRST_BILL&&v.home)v.cottageTicks=Math.min(COTTAGE_TICKS,v.cottageTicks+ticks);
  if(complete(save)&&v.forge.logs===12&&v.forge.bars===2)v.forge.ticks=Math.min(FORGE_TICKS,v.forge.ticks+ticks);
  const work=v.workQueue[0];if(work) {
    work.remainingTicks=Math.max(0,work.remainingTicks-ticks);
    if(work.remainingTicks===0) {
      const recipe=VALLEY_RECIPES[work.recipeId];
      if(recipe&&gift(save,recipe.output.itemId,recipe.output.quantity*work.quantity)){
        if(recipe.skill==="carpentry")v.carpentryXp=Math.min(2_000_000_000,v.carpentryXp+recipe.xp*work.quantity);else save.chapter.player.skills[recipe.skill]=Math.min(2_000_000_000,save.chapter.player.skills[recipe.skill]+recipe.xp*work.quantity);
        if(recipe.id==="valley-stool")flag(save,"crafted-stool");v.workQueue.shift();
      }else v.message="Your finished batch is waiting for room in your backpack or connected storage.";
    }
  }
  save.chapter.tick+=ticks;
  for(const resource of Object.values(save.chapter.resources))if(!resource.available&&resource.respawnAt<=save.chapter.tick){resource.available=true;resource.respawnAt=0;}
  if(!wasComplete&&complete(save)){v.layoutRevision++;v.message="Your cottage is complete. Pella and Garrick have arrived; furnishing and terrace planning are unlocked.";}
  if(!forgeComplete&&v.forge.ticks>=FORGE_TICKS){v.layoutRevision++;v.message="The public forge is complete. Bronze smelting now takes four ticks.";}
  syncVisitors(save,now);v.lastDate=calendarDate(now);
}

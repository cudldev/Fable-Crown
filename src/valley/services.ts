import type {ActionState} from "../action/contracts";
import type {WorldObject} from "../rpg/types";
import {COTTAGE_TICKS,FORGE_TICKS} from "./contracts";
import type {ValleySave,ValleyService,ValleyServicePanel} from "./contracts";

export function serviceForObject(save:ValleySave,object:WorldObject):ValleyService|null {
  const base={objectId:object.id,name:object.name,x:object.position.x,z:object.position.y,range:3};
  if(object.id.startsWith("valley-visitor-"))return {...base,kind:"visitor",visitorId:object.id.slice("valley-visitor-".length)};
  if(object.id==="valley-caravan")return {...base,kind:"caravan",x:74,z:140,station:"workbench"};
  if(object.id==="valley-workbench"||object.id==="valley-home-workbench")return {...base,kind:"workbench",station:"workbench"};
  if(object.id==="valley-home-planning-table")return {...base,kind:"planning"};
  if(object.id==="valley-forge-site")return {...base,kind:"forge",x:70,z:178,range:5};
  if(object.id==="valley-public-forge"||object.id==="valley-public-anvil")return save.valley.forge.ticks>=FORGE_TICKS?{...base,kind:"furnace",station:"furnace",x:72,z:180}:{...base,kind:"forge",x:70,z:178,range:5};
  if(object.id==="valley-brazier")return {...base,kind:"furnace",station:"furnace"};
  if(object.id==="valley-cooking-fire")return {...base,kind:"range",station:"range"};
  if(object.id==="valley-home-tent"||object.id==="valley-home-cottage"){
    const entrance=(object as WorldObject&{entrance?:{x:number;z:number}}).entrance;
    return {...base,kind:"home",x:entrance?.x??base.x,z:entrance?.z??base.z};
  }
  return null;
}
export const serviceDistance=(action:ActionState,service:ValleyService)=>Math.hypot(action.player.x-service.x,action.player.z-service.z);
export function serviceSections(service:ValleyService|null):{panel:ValleyServicePanel;label:string}[]{
  if(!service)return [];
  switch(service.kind){
    case "workbench":case "furnace":case "range":return [{panel:"craft",label:service.kind==="furnace"?"Smelting":service.kind==="range"?"Cooking":"Carpentry"}];
    case "caravan":return [{panel:"trade",label:"Trade"},{panel:"craft",label:"Carpentry"},{panel:"inventory",label:"Storage"},{panel:"projects",label:"Orders"},{panel:"home",label:"Account"}];
    case "home":return [{panel:"home",label:"Home"},{panel:"inventory",label:"Storage"}];
    case "planning":return [{panel:"projects",label:"Planning & orders"}];
    case "forge":return [{panel:"projects",label:"Forge project"}];
    case "visitor":return service.visitorId==="builder"?[{panel:"visitor",label:"Rowan"},{panel:"projects",label:"Orders"},{panel:"home",label:"Royal account"}]:[{panel:"visitor",label:"Conversation"}];
  }
}
export function servicePanel(service:ValleyService):ValleyServicePanel {return serviceSections(service)[0].panel;}
export function hasPlanningTable(save:ValleySave):boolean{return !!save.valley.home&&save.valley.cottageTicks>=COTTAGE_TICKS;}

import type {WorldDefinition} from "../rpg/types";
import {ENEMIES,RESOURCES} from "../rpg/content";
import {actionSafe} from "../action/rpg-adapter";
import type {TileSelection} from "../render/scene-types";
import type {PointerActivity,ValleySave} from "./contracts";
import {serviceForObject} from "./services";
import {resourceRequirement} from "./interaction-feedback";

export interface PointTarget {x:number;z:number;range:number;kind:PointerActivity["kind"];label:string;problem?:string;description?:string}
export function pointTarget(save:ValleySave,world:WorldDefinition,selection:TileSelection):PointTarget|null {
  if(selection.kind==="tile"){
    const p=selection.position;if(p.worldId!==world.id||p.plane!==0||!Number.isFinite(p.x)||!Number.isFinite(p.y)||p.x<0||p.y<0||p.x>=world.width||p.y>=world.height)return null;
    return {x:p.x,z:p.y,range:0,kind:"walk",label:"Walking"};
  }
  if(selection.kind==="actor"){
    const actor=save.chapter.npcs.find(npc=>npc.id===selection.id&&npc.health>0);
    return actor?{x:actor.position.x,z:actor.position.y,range:3,kind:"interact",label:`Talk to ${actor.name}`,description:`${actor.name} · ${actor.role}. ${actor.activity}`} : null;
  }
  if(selection.kind==="object"){
    const object=world.objects.find(item=>item.id===selection.id);if(!object)return null;
    const service=serviceForObject(save,object);
    if(object.resourceId){const tool=RESOURCES[object.resourceId].tool,verb=tool==="axe"?"Chopping":tool==="pickaxe"?"Mining":"Fishing";
      return {x:object.position.x,z:object.position.y,range:1.65,kind:"gather",label:`${verb} · ${object.name}`,problem:save.chapter.resources[object.id]?.available===false?`${object.name} is resting.`:resourceRequirement(save,object)??undefined,description:object.description};}
    return {x:service?.x??object.position.x+(object.width-1)/2,z:service?.z??object.position.y+(object.height-1)/2,range:service?.range??5,kind:"interact",label:`${service?.kind==="visitor"?"Talk to":"Use"} ${object.name}`,description:object.description};
  }
  if(selection.kind==="enemy"){
    const enemy=save.action.enemies.find(item=>item.id===selection.id&&!item.defeated&&item.health>0),original=save.chapter.enemies.find(item=>item.id===selection.id);
    return enemy?{x:enemy.x,z:enemy.z,range:1.65,kind:"attack",label:`Attacking ${original?ENEMIES[original.definitionId].name:"foe"}`,problem:actionSafe(enemy.x,enemy.z)?"Combat stays outside the safe valley.":undefined}:null;
  }
  const position=selection.kind==="grave"?save.chapter.grave?.position:save.chapter.drops.find(drop=>drop.id===selection.id)?.position;
  return position?{x:position.x,z:position.y,range:1.95,kind:"interact",label:selection.kind==="grave"?"Recover backpack":"Collect supplies"}:null;
}

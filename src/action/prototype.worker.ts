import { createRpg,stepRpg } from "../rpg/engine";
import { ENEMIES } from "../rpg/content";
import { WORLD, tile } from "../rpg/world";
import { createActionState,idleActionInput,stepAction } from "./simulation";
import type { ActionInput } from "./contracts";
import { rpgActionWorld,applyActionEvents,actionInteract,syncActionRespawns } from "./rpg-adapter";
import type { TileSelection } from "../render/scene-types";
const state=createRpg(Date.now()), action=createActionState(52,95);
state.action=action;state.control.autoplay=false;state.control.waiting=true;state.control.thought=null;
action.enemies=state.enemies.map(enemy=>({id:enemy.id,x:enemy.position.x,z:enemy.position.y,homeX:enemy.position.x,homeZ:enemy.position.y,
  health:enemy.health,maxHealth:enemy.health,cooldown:0,windup:0,damage:ENEMIES[enemy.definitionId].maxHit,aggressive:ENEMIES[enemy.definitionId].aggressive,defeated:false}));
let input=idleActionInput(),running=true,last=performance.now(),accumulator=0,step=0;
const emit=(message="")=>postMessage({state,message});
emit();postMessage({action});
self.onmessage=(event:MessageEvent<{type:string;input?:ActionInput;selection?:TileSelection;kind?:string}>)=>{
  const command=event.data;
  if(command.type==="input" && command.input) input={...command.input,strike:input.strike || command.input.strike,
    tool:command.input.strike?command.input.tool:input.strike?input.tool:command.input.tool};
  if(command.type==="pause") {running=false;input=idleActionInput();}
  if(command.type==="resume") {running=true;last=performance.now();accumulator=0;}
  if(command.type==="interact") emit(actionInteract(state,action));
  if(command.type==="practice") {
    const point=command.kind==="woods"?tile(33,94):tile(64,112);
    Object.assign(action.player,{x:point.x,z:point.y,health:10,guard:100,facingX:1,facingZ:0,swing:0});
    emit("Practice location changed.");postMessage({action});
  }
  if(command.type==="focus" && command.selection) {
    const selection=command.selection;
    const target=selection.kind==="object"?WORLD.objects.find(value=>value.id===selection.id)?.position:
      selection.kind==="enemy"?state.enemies.find(value=>value.id===selection.id)?.position:undefined;
    if(target) {
      const dx=target.x-action.player.x,dz=target.y-action.player.z,length=Math.hypot(dx,dz);
      if(length) {action.player.facingX=dx/length;action.player.facingZ=dz/length;}
      input={...input,strike:true,tool:selection.kind!=="enemy"};
    }
  }
};
setInterval(()=>{
  const now=performance.now();if(!running){last=now;return;}
  accumulator+=Math.min(200,now-last);last=now;
  let advanced=false;
  while(accumulator>=1000/60) {
    accumulator-=1000/60;
    const events=stepAction(action,input,rpgActionWorld(state));
    input.strike=false;
    const message=applyActionEvents(state,action,events);
    if(++step%36===0){stepRpg(state);syncActionRespawns(state,action);emit();}
    if(events.length) emit(message);
    advanced=true;
  }
  if(advanced)postMessage({action});
},8);

import { readValleySave,writeValleySave,validateValleySave,createValleySave } from "./save";
import { reconcileValley } from "./offline";
import { applyValleyCommand,advanceSettlement,ensureValleyResources } from "./settlement";
import { createValleyWorld,canTraverseValley,sampleValleyGround,homeFootprints } from "./world";
import { COTTAGE_TICKS,FORGE_TICKS,VALLEY_TICK_MS,VALLEY_ACTION_QUANTA } from "./contracts";
import type { ValleySave,ValleyWorkerMessage,ValleyWorkerRequest,ValleyFeedback,PointerActivity } from "./contracts";
import {pointTarget} from "./point-actions";
import {planPointerRoute,followPointerRoute} from "./pointer-navigation";
import type {Point} from "./pointer-navigation";
import {ValleyNpcRoutines} from "./npc-routines";
import { stepAction,idleActionInput,SWING_CONTACT } from "../action/simulation";
import type { ActionInput } from "../action/contracts";
import { actionInteract,actionSafe,applyActionEvents,rpgActionWorld,syncActionRespawns } from "../action/rpg-adapter";
import { calendarDate } from "../rpg/engine";
import { tile } from "../rpg/world";
import type { TileSelection } from "../render/scene-types";
import {actionResultFeedback,emptySwingFeedback,nearbyValleyInteraction,rewardChanges,rewardSnapshot,selectionInRange} from "./interaction-feedback";
import {serviceDistance,serviceForObject,servicePanel} from "./services";
import {VALLEY_RECIPES} from "./content";
import {itemCount} from "../rpg/inventory";

let save:ValleySave,ready=false,running=false,storageOkay=true,canPersist=true,input=idleActionInput(),last=performance.now(),accumulator=0,worldLast=Date.now();
let saving=Promise.resolve();
let feedbackId=0,interfaceOpen=false;
const npcs=new ValleyNpcRoutines();
let conversationNpc:string|undefined;
let cancelledPointerSwing=false,pointerSwingTarget:string|undefined;
let pointerTask:(PointerActivity&{goal:Point;last:Point;stalled:number;replanFrame:number;revision:number})|undefined;
const pointerSnapshot=():PointerActivity|null=>pointerTask?{kind:pointerTask.kind,label:pointerTask.label,phase:pointerTask.phase,selection:pointerTask.selection,path:pointerTask.path}:null;
const send=(message:ValleyWorkerMessage)=>postMessage({...message,storageOkay,pointer:pointerSnapshot(),ambient:[...npcs.visitorPoses]});
const emit=(message="",feedback?:Omit<ValleyFeedback,"id">)=>send({save,message,...(feedback?{feedback:{...feedback,id:++feedbackId}}:{})});
const announce=(feedback:Omit<ValleyFeedback,"id">)=>send({message:feedback.title,feedback:{...feedback,id:++feedbackId}});
function persist():Promise<void>{
  if(!canPersist)return saving;
  captureLiveBackground();
  const now=Math.max(Date.now(),save.savedAt);save.savedAt=now;save.chapter.savedAt=now;save.chapter.calendar=calendarDate(now);
  const snapshot=structuredClone(save);
  saving=saving.then(()=>writeValleySave(snapshot)).then(()=>{storageOkay=true;}).catch(()=>{storageOkay=false;send({message:"Progress could not be saved. Export your chapter from the menu."});});
  return saving;
}
void(async()=>{
  let message="";
  try{save=await readValleySave();if(save.valley.message.startsWith("Recovered"))message=save.valley.message;}catch{save=createValleySave(Date.now());storageOkay=false;canPersist=false;message="Device storage could not be opened. Stored data is preserved; restore a valid chapter or export this session.";}
  ensureValleyResources(save);
  cancelledPointerSwing=save.action.player.swing>0;
  const summary=reconcileValley(save,Date.now());ready=true;worldLast=Date.now();
  emit(message||summary.message);send({action:save.action});
  if(storageOkay)await persist();
})();
function captureLiveBackground():boolean{
  if(!ready||!running)return false;
  const now=Date.now(),elapsed=Math.min(86400000,Math.max(0,now-worldLast));worldLast=Math.max(worldLast,now);
  const total=save.offlineRemainder+elapsed;let ticks=Math.floor(total/VALLEY_TICK_MS);save.offlineRemainder=total%VALLEY_TICK_MS;
  const changed=ticks>0;
  const npcTicks=Math.min(ticks,10);
  const before=changed?rewardSnapshot(save.chapter,save.valley.carpentryXp):null;
  const queue=save.valley.workQueue.length,cottage=save.valley.cottageTicks,forge=save.valley.forge.ticks,oldMessage=save.valley.message;
  const output=save.valley.workQueue[0]&&VALLEY_RECIPES[save.valley.workQueue[0].recipeId]?.output.itemId;
  const bankBefore=output?itemCount(save.chapter.bank,output):0;
  while(ticks>0){const batch=Math.min(36000,ticks);advanceSettlement(save,batch,Math.max(now,save.savedAt));ticks-=batch;}
  for(let i=0;i<npcTicks;i++){const current=world();npcs.step(save,current.layout,current.env,conversationNpc);}
  if(before){
    if(queue&&!save.valley.workQueue.length)announce({tone:"success",title:"Crafting complete",detail:[rewardChanges(before,save.chapter,save.valley.carpentryXp),output&&itemCount(save.chapter.bank,output)>bankBefore?"Delivered to connected storage.":"Ready in your backpack."].join(" · ")});
    if(cottage<COTTAGE_TICKS&&save.valley.cottageTicks>=COTTAGE_TICKS)announce({tone:"success",title:"Your cottage is ready",detail:"Your workbench, planning table and new furnishing recipes are unlocked."});
    if(forge<FORGE_TICKS&&save.valley.forge.ticks>=FORGE_TICKS)announce({tone:"success",title:"The public forge is ready",detail:"Bronze smelting is now faster."});
    if(save.valley.workQueue.length&&save.valley.workQueue[0].remainingTicks===0&&save.valley.message!==oldMessage)announce({tone:"warning",title:save.valley.message});
  }
  if(changed)syncActionRespawns(save.chapter,save.action);
  return changed;
}
function world(){
  const layout=createValleyWorld(save.valley,save.chapter);
  const env=rpgActionWorld(save.chapter,layout,actionSafe,(x,z)=>sampleValleyGround(save.valley,x,z));
  const occupy=env.canOccupy;
  env.canOccupy=(x,z,fromX,fromZ)=>occupy(x,z,fromX,fromZ)&&canTraverseValley(save.valley,fromX,fromZ,x,z,save.chapter);
  return {layout,env};
}
function cancelPointer(){const active=!!pointerTask;pointerTask=undefined;if(active){input=idleActionInput();if(save){cancelledPointerSwing=save.action.player.swing>0;save.action.strikeHeld=false;}}}
function npcFor(selection:TileSelection):string|undefined{return selection.kind==="actor"?`actor-${selection.id}`:selection.kind==="object"&&selection.id.startsWith("valley-visitor-")?selection.id:undefined;}
function point(selection:TileSelection,intent?:"walk"|"examine"){
  if(interfaceOpen||!running)return;
  const {layout,env}=world(),target=pointTarget(save,layout,selection);if(!target)return;
  if(intent==="examine"){announce({tone:"info",title:target.label,detail:target.description??"A place in your valley."});return;}
  cancelPointer();if(target.problem&&intent!=="walk"){announce({tone:"warning",title:target.problem});send({});return;}
  const kind=intent==="walk"?"walk":target.kind;
  const route=planPointerRoute(save.action.player,{x:target.x,z:target.z,range:kind==="walk"&&selection.kind==="tile"?0:Math.min(target.range-.1,1.25)},env,layout);
  if(!route){announce({tone:"warning",title:"You can’t reach that spot.",detail:"Choose connected ground or another side of the target."});return;}
  pointerTask={kind,label:intent==="walk"?"Walking":target.label,selection,phase:"walking",path:route,goal:{x:target.x,z:target.z},last:{x:save.action.player.x,z:save.action.player.z},stalled:0,replanFrame:save.action.frame,revision:save.valley.layoutRevision};send({});
}
function pointerInput(env:ReturnType<typeof world>["env"],layout:ReturnType<typeof world>["layout"]):ActionInput|null{
  const task=pointerTask;if(!task)return null;const p=save.action.player,target=pointTarget(save,layout,task.selection);
  if(task.stalled>=2){cancelPointer();announce({tone:"warning",title:"The way is blocked.",detail:"Choose another spot."});return idleActionInput();}
  if(!target||target.problem&&task.kind!=="walk"){const message=target?.problem,wasWalking=task.phase==="walking";cancelPointer();if(message&&wasWalking)announce({tone:"info",title:message});return null;}
  if(task.kind!=="walk"&&selectionInRange(save,save.action,layout,task.selection)){
    task.phase="acting";task.path=[];face(target.x,target.z);
    if(task.kind==="interact"){const selected=task.selection;pointerTask=undefined;openSelection(selected);return idleActionInput();}
    return {...idleActionInput(),tool:task.kind==="gather",strike:p.swing===0};
  }
  if((task.revision!==save.valley.layoutRevision||task.stalled>=1||task.kind!=="walk"&&Math.hypot(target.x-task.goal.x,target.z-task.goal.z)>.45)&&save.action.frame-task.replanFrame>=VALLEY_ACTION_QUANTA){
    const route=planPointerRoute(p,{x:target.x,z:target.z,range:task.kind==="walk"&&task.selection.kind==="tile"?0:Math.min(target.range-.1,1.25)},env,layout);
    if(!route){cancelPointer();announce({tone:"warning",title:"That target can’t be reached from here."});return null;}
    task.path=route;task.goal={x:target.x,z:target.z};task.revision=save.valley.layoutRevision;task.replanFrame=save.action.frame;
  }
  const next=followPointerRoute(p,task.path,3*VALLEY_TICK_MS/1000);task.path=next.remaining;task.phase="walking";
  env.movementPath=next.movementPath;
  if(!next.remaining.length&&!next.movementPath?.length){const walking=task.kind==="walk";cancelPointer();if(!walking)announce({tone:"info",title:"Move to the wilderness side to reach that target."});return idleActionInput();}
  const moved=Math.hypot(p.x-task.last.x,p.z-task.last.z);task.stalled=moved<.001?task.stalled+1:0;task.last={x:p.x,z:p.z};
  if(task.stalled>=2){cancelPointer();announce({tone:"warning",title:"The way is blocked.",detail:"Choose another spot."});return idleActionInput();}
  return {...idleActionInput(),moveX:next.moveX,moveZ:next.moveZ};
}
function openSelection(selection:TileSelection):void {
  const layout=createValleyWorld(save.valley,save.chapter);
  if(selection.kind==="actor"){
    const actor=save.chapter.npcs.find(npc=>npc.id===selection.id&&npc.health>0);if(!actor||!selectionInRange(save,save.action,layout,selection))return;
    conversationNpc=`actor-${actor.id}`;npcs.hold(save,conversationNpc);face(actor.position.x,actor.position.y);
    send({open:"visitor",service:{kind:"visitor",objectId:conversationNpc,name:actor.name,visitorId:conversationNpc,x:actor.position.x,z:actor.position.y,range:3}});return;
  }
  if(selection.kind==="object") {
    const object=layout.objects.find(value=>value.id===selection.id);if(!object)return;
    const distance=Math.hypot(object.position.x+(object.width-1)/2-save.action.player.x,object.position.y+(object.height-1)/2-save.action.player.z);
    if(object.resourceId){
      if(!selectionInRange(save,save.action,layout,selection)){announce({tone:"info",title:`Walk closer to ${object.name}`,detail:`Face the spot and tap your tool.`});return;}
      if(save.chapter.resources[object.id]?.available===false){announce({tone:"info",title:`${object.name} is resting`,detail:"Try another spot while it replenishes."});return;}
      face(object.position.x,object.position.y);input={...input,strike:true,tool:true};return;
    }
    const service=serviceForObject(save,object);
    if(service){const range=serviceDistance(save.action,service);if(range>service.range){announce({tone:"info",title:`Walk closer to ${object.name} to interact.`,detail:`${Math.ceil(range)} m away · stand within ${service.range} m.`});return;}conversationNpc=npcFor(selection);if(conversationNpc)npcs.hold(save,conversationNpc);face(service.x,service.z);send({action:save.action,open:servicePanel(service),service,visitorId:service.visitorId});return;}
    if(distance>5){announce({tone:"info",title:`Walk closer to ${object.name} to interact.`,detail:`${Math.ceil(distance)} m away`});return;}
    announce({tone:"info",title:object.name,detail:object.description});
  } else if(selection.kind==="enemy"){
    const enemy=save.action.enemies.find(value=>value.id===selection.id);if(enemy&&selectionInRange(save,save.action,layout,selection)){face(enemy.x,enemy.z);input={...input,strike:true,tool:false};}
  } else if(selection.kind==="grave"||selection.kind==="drop"){
    const position=selection.kind==="grave"?save.chapter.grave?.position:save.chapter.drops.find(drop=>drop.id===selection.id)?.position;
    if(!position){announce({tone:"info",title:"These belongings have already been collected."});return;}
    if(Math.hypot(position.x-save.action.player.x,position.y-save.action.player.z)>=2){announce({tone:"info",title:"Walk closer to your belongings",detail:"Stand beside the recovery marker, then collect what fits."});return;}
    const before=rewardSnapshot(save.chapter),message=actionInteract(save.chapter,save.action,selection.kind==="grave"?{kind:"grave"}:{kind:"drop",id:selection.id}),gains=rewardChanges(before,save.chapter);
    emit(message,{tone:gains?"success":"warning",title:message,detail:gains||"Make room in your backpack first. Anything left at the marker stays safe."});
  }
}
function face(x:number,z:number){const p=save.action.player,dx=x-p.x,dz=z-p.z,length=Math.hypot(dx,dz);if(length){p.facingX=dx/length;p.facingZ=dz/length;}}
function interact(){
  const target=nearbyValleyInteraction(save,save.action,createValleyWorld(save.valley,save.chapter));
  if(target)openSelection(target.selection);
  else announce({tone:"info",title:"Nothing nearby to open",detail:"Walk up to a helper or station. Use your tool to gather from trees, rocks or the pond."});
}
self.onmessage=async(event:MessageEvent<ValleyWorkerRequest>)=>{
  if(!ready)return;const request=event.data;
  if(request.type==="interface"){
    const changed=request.open!==interfaceOpen;
    if(request.open)cancelPointer();conversationNpc=request.open?request.npcId??conversationNpc:undefined;if(conversationNpc)npcs.hold(save,conversationNpc);
    interfaceOpen=request.open;input=idleActionInput();save.action.player.blocking=false;save.action.strikeHeld=false;if(changed){accumulator=0;last=performance.now();}send({action:save.action});
  }else if(request.type==="input"){
    const next=request.input;
    if(next&&Number.isFinite(next.moveX)&&Number.isFinite(next.moveZ)&&typeof next.strike==="boolean"&&typeof next.block==="boolean"&&typeof next.tool==="boolean")
      {if(next.moveX||next.moveZ||next.strike||next.block){const active=!!pointerTask;cancelPointer();if(active)send({});}input={moveX:Math.max(-1,Math.min(1,next.moveX)),moveZ:Math.max(-1,Math.min(1,next.moveZ)),block:next.block,strike:input.strike||next.strike,tool:next.strike?next.tool:input.strike?input.tool:next.tool};}
  }else if(request.type==="point"){point(request.selection,request.intent);}
  else if(request.type==="cancel"){cancelPointer();send({});
  }else if(request.type==="command"){
    captureLiveBackground();
    const before=rewardSnapshot(save.chapter,save.valley.carpentryXp);
    const result=applyValleyCommand(save,request.command,Date.now());
    save.chapter.action=save.action;ensureValleyResources(save);if(request.command.type==="talk-visitor"&&result.ok)emit();else emit(result.message,{tone:result.ok?"success":"warning",title:result.message,detail:result.ok?rewardChanges(before,save.chapter,save.valley.carpentryXp):undefined});send({receipt:{requestId:request.requestId,ok:result.ok}});if(result.ok)await persist();
  }else if(request.type==="focus"){if(!interfaceOpen)openSelection(request.selection);}
  else if(request.type==="interact"){if(!interfaceOpen)interact();await persist();}
  else if(request.type==="pause"){captureLiveBackground();cancelPointer();running=false;input=idleActionInput();save.action.player.blocking=false;save.action.strikeHeld=false;await persist();}
  else if(request.type==="resume"){
    if(running){if(captureLiveBackground())emit();return;}
    input=idleActionInput();save.action.strikeHeld=false;const summary=reconcileValley(save,Date.now());syncActionRespawns(save.chapter,save.action);
    last=performance.now();worldLast=Date.now();accumulator=0;running=true;emit(summary.message);await persist();
  }else if(request.type==="save"){await persist();const message=storageOkay?"Chapter saved on this device.":"Storage is unavailable. Export your chapter to keep progress.";emit(message,{tone:storageOkay?"success":"warning",title:message});}
  else if(request.type==="export")send({export:save});
  else if(request.type==="import"){
    const restored=validateValleySave(request.value);
    if(!restored){send({message:"That chapter is invalid or from an earlier game. Your current progress is safe.",receipt:{ok:false}});return;}
    cancelPointer();npcs.reset();conversationNpc=undefined;save=restored;cancelledPointerSwing=save.action.player.swing>0;pointerSwingTarget=undefined;canPersist=true;input=idleActionInput();ensureValleyResources(save);const summary=reconcileValley(save,Date.now());
    last=performance.now();worldLast=Date.now();accumulator=0;emit(`Chapter restored. ${summary.message}`);send({action:save.action});await persist();
  }else if(request.type==="reset"){
    cancelPointer();npcs.reset();conversationNpc=undefined;
    save=createValleySave(Date.now());cancelledPointerSwing=false;pointerSwingTarget=undefined;canPersist=true;ensureValleyResources(save);input=idleActionInput();last=performance.now();worldLast=Date.now();accumulator=0;
    emit("A new valley chapter begins. Earlier archives are unchanged.");send({action:save.action});await persist();
  }
};
setInterval(()=>{
  const now=performance.now();if(!ready||!running){last=now;return;}
  if(captureLiveBackground())emit();
  if(interfaceOpen){last=now;accumulator=0;return;}
  accumulator+=Math.min(VALLEY_TICK_MS,now-last);last=now;let advanced=false;
  while(accumulator>=VALLEY_TICK_MS){
    accumulator-=VALLEY_TICK_MS;const {layout,env}=world();
    if(save.action.player.swing===0){cancelledPointerSwing=false;pointerSwingTarget=undefined;}
    const automatic=pointerInput(env,layout),stepInput=automatic??input;
    if(automatic?.strike&&pointerTask&&(pointerTask.selection.kind==="object"||pointerTask.selection.kind==="enemy"))pointerSwingTarget=pointerTask.selection.id;
    if(cancelledPointerSwing)env.targetId="cancelled-pointer-swing";else if(pointerSwingTarget)env.targetId=pointerSwingTarget;
    const swing=save.action.player.swing,pressed=stepInput.strike&&!save.action.strikeHeld;
    if(pressed&&swing>0)announce({tone:"info",title:"Finishing this swing",detail:"Tap again when the recovery ring clears."});
    else if(pressed&&save.action.player.blocking)announce({tone:"info",title:"Lower your guard to strike",detail:"Release Block, then tap your tool or weapon."});
    const saveBucket=Math.floor(save.action.frame/(VALLEY_ACTION_QUANTA*8));
    const events=stepAction(save.action,stepInput,env,VALLEY_ACTION_QUANTA);input.strike=false;save.action.strikeHeld=false;
    if(events.some(event=>event.kind==="player-defeat"))cancelPointer();
    const before=events.length?rewardSnapshot(save.chapter,save.valley.carpentryXp):null;
    const footprint=homeFootprints(save.valley),home=(save.valley.home?.tentPacked?footprint?.approach:footprint?.tentApproach)??{x:52,z:141};
    const message=applyActionEvents(save.chapter,save.action,events,layout,tile(home.x,home.z));
    if(events.some(event=>event.kind==="resource-hit")&&!save.valley.flags.includes("first-strike"))save.valley.flags.push("first-strike");
    if(events.length){const feedback=actionResultFeedback(save,save.action,events,message,before?rewardChanges(before,save.chapter,save.valley.carpentryXp):"");emit(message,feedback??undefined);}
    else if(!cancelledPointerSwing&&(swing>SWING_CONTACT||save.action.swingStartedAt===save.action.frame)&&save.action.player.swing<=SWING_CONTACT)announce(emptySwingFeedback(save,save.action,layout,save.action.swingTool));
    advanced=true;
    if(Math.floor(save.action.frame/(VALLEY_ACTION_QUANTA*8))>saveBucket)void persist();
  }
  if(advanced)send({action:save.action});
},20);

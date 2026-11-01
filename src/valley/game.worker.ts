import { readValleySave,writeValleySave,validateValleySave,createValleySave } from "./save";
import { reconcileValley } from "./offline";
import { applyValleyCommand,advanceSettlement,ensureValleyResources } from "./settlement";
import { createValleyWorld,canTraverseValley,sampleValleyGround,homeFootprints } from "./world";
import type { ValleySave,ValleyWorkerMessage,ValleyWorkerRequest } from "./contracts";
import { stepAction,idleActionInput } from "../action/simulation";
import type { ActionInput } from "../action/contracts";
import { actionInteract,actionSafe,applyActionEvents,rpgActionWorld,syncActionRespawns } from "../action/rpg-adapter";
import { calendarDate,validateRpgSave } from "../rpg/engine";
import { tile } from "../rpg/world";
import type { TileSelection } from "../render/scene-types";

let save:ValleySave,ready=false,running=false,storageOkay=true,canPersist=true,input=idleActionInput(),last=performance.now(),accumulator=0,worldLast=Date.now();
let saving=Promise.resolve();
const send=(message:ValleyWorkerMessage)=>postMessage({...message,storageOkay});
const emit=(message="")=>send({save,message});
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
  const summary=reconcileValley(save,Date.now());ready=true;worldLast=Date.now();
  emit(message||summary.message);send({action:save.action});
  if(storageOkay)await persist();
})();
function captureLiveBackground():boolean{
  if(!ready||!running)return false;
  const now=Date.now(),elapsed=Math.min(86400000,Math.max(0,now-worldLast));worldLast=Math.max(worldLast,now);
  const total=save.offlineRemainder+elapsed;let ticks=Math.floor(total/600);save.offlineRemainder=total%600;
  const changed=ticks>0;
  while(ticks>0){const batch=Math.min(36000,ticks);advanceSettlement(save,batch,Math.max(now,save.savedAt));ticks-=batch;}
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
function openSelection(selection:TileSelection):void {
  const layout=createValleyWorld(save.valley,save.chapter);
  if(selection.kind==="object") {
    const object=layout.objects.find(value=>value.id===selection.id);if(!object)return;
    if(object.resourceId){face(object.position.x,object.position.y);input={...input,strike:true,tool:true};return;}
    const distance=Math.hypot(object.position.x+(object.width-1)/2-save.action.player.x,object.position.y+(object.height-1)/2-save.action.player.z);
    if(distance>5){send({message:`Walk closer to ${object.name} to interact.`});return;}
    if(object.id.startsWith("valley-visitor-")){send({open:"visitor",visitorId:object.id.slice("valley-visitor-".length)});return;}
    if(object.id==="valley-caravan"){send({open:"trade"});return;}
    if(object.id.includes("workbench")||object.kind==="furnace"||object.kind==="range"){send({open:"craft"});return;}
    if(object.serviceId==="valley-planning-table"){send({open:"projects"});return;}
    if(object.id.includes("forge")||object.id.includes("anvil")){send({open:"projects"});return;}
    if(object.id.includes("home")){send({open:"home"});return;}
    send({message:object.description||object.name});
  } else if(selection.kind==="enemy"){
    const enemy=save.action.enemies.find(value=>value.id===selection.id);if(enemy){face(enemy.x,enemy.z);input={...input,strike:true,tool:false};}
  } else if(selection.kind==="grave"||selection.kind==="drop")emit(actionInteract(save.chapter,save.action));
}
function face(x:number,z:number){const p=save.action.player,dx=x-p.x,dz=z-p.z,length=Math.hypot(dx,dz);if(length){p.facingX=dx/length;p.facingZ=dz/length;}}
function interact(){
  const p=save.action.player;
  if((save.chapter.grave&&Math.hypot(save.chapter.grave.position.x-p.x,save.chapter.grave.position.y-p.z)<2)||save.chapter.drops.some(drop=>Math.hypot(drop.position.x-p.x,drop.position.y-p.z)<2)){emit(actionInteract(save.chapter,save.action));return;}
  const objects=createValleyWorld(save.valley,save.chapter).objects.filter(object=>!object.resourceId&&["quest","shop","building","furnace","range","anvil","sign"].includes(object.kind)||!!object.serviceId);
  objects.sort((a,b)=>Math.hypot(a.position.x-p.x,a.position.y-p.z)-Math.hypot(b.position.x-p.x,b.position.y-p.z));
  if(objects[0]&&Math.hypot(objects[0].position.x-p.x,objects[0].position.y-p.z)<5)openSelection({kind:"object",id:objects[0].id});
  else send({message:"Walk to a helper, workbench, or home to interact. Press Tool for each gathering swing."});
}
self.onmessage=async(event:MessageEvent<ValleyWorkerRequest>)=>{
  if(!ready)return;const request=event.data;
  if(request.type==="input"){
    const next=request.input;
    if(next&&Number.isFinite(next.moveX)&&Number.isFinite(next.moveZ)&&typeof next.strike==="boolean"&&typeof next.block==="boolean"&&typeof next.tool==="boolean")
      input={moveX:Math.max(-1,Math.min(1,next.moveX)),moveZ:Math.max(-1,Math.min(1,next.moveZ)),block:next.block,strike:input.strike||next.strike,tool:next.strike?next.tool:input.strike?input.tool:next.tool};
  }else if(request.type==="command"){
    captureLiveBackground();
    const result=applyValleyCommand(save,request.command,Date.now());
    save.chapter.action=save.action;ensureValleyResources(save);emit(result.message);send({receipt:{requestId:request.requestId,ok:result.ok}});if(result.ok)await persist();
  }else if(request.type==="focus")openSelection(request.selection);
  else if(request.type==="interact"){interact();await persist();}
  else if(request.type==="pause"){captureLiveBackground();running=false;input=idleActionInput();save.action.player.blocking=false;save.action.strikeHeld=false;await persist();}
  else if(request.type==="resume"){
    if(running){if(captureLiveBackground())emit();return;}
    input=idleActionInput();save.action.strikeHeld=false;const summary=reconcileValley(save,Date.now());syncActionRespawns(save.chapter,save.action);
    last=performance.now();worldLast=Date.now();accumulator=0;running=true;emit(summary.message);await persist();
  }else if(request.type==="save"){await persist();emit(storageOkay?"Chapter saved on this device.":"Storage is unavailable. Export your chapter to keep progress.");}
  else if(request.type==="export")send({export:save});
  else if(request.type==="import"){
    let restored=validateValleySave(request.value);
    if(!restored){const old=validateRpgSave(request.value);if(old)restored=createValleySave(Date.now(),old.seed,old);}
    if(!restored){send({message:"That chapter is invalid. Your current progress is safe.",receipt:{ok:false}});return;}
    save=restored;canPersist=true;input=idleActionInput();ensureValleyResources(save);const summary=reconcileValley(save,Date.now());
    last=performance.now();worldLast=Date.now();accumulator=0;emit(`Chapter restored. ${summary.message}`);send({action:save.action});await persist();
  }else if(request.type==="reset"){
    save=createValleySave(Date.now());canPersist=true;ensureValleyResources(save);input=idleActionInput();last=performance.now();worldLast=Date.now();accumulator=0;
    emit("A new valley chapter begins. Earlier archives are unchanged.");send({action:save.action});await persist();
  }
};
setInterval(()=>{
  const now=performance.now();if(!ready||!running){last=now;return;}
  if(captureLiveBackground())emit();
  accumulator+=Math.min(200,now-last);last=now;let advanced=false;
  while(accumulator>=1000/60){
    accumulator-=1000/60;const {layout,env}=world();
    const events=stepAction(save.action,input,env);input.strike=false;
    const footprint=homeFootprints(save.valley),home=(save.valley.home?.tentPacked?footprint?.approach:footprint?.tentApproach)??{x:52,z:141};
    const message=applyActionEvents(save.chapter,save.action,events,layout,tile(home.x,home.z));
    if(events.some(event=>event.kind==="resource-hit")&&!save.valley.flags.includes("first-strike"))save.valley.flags.push("first-strike");
    if(events.length)emit(message);advanced=true;
    if(save.action.frame%300===0)void persist();
  }
  if(advanced)send({action:save.action});
},8);

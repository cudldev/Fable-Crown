import { createRpg, validateRpgSave, calendarDate, maxHealth } from "../rpg/engine";
import { ENEMIES } from "../rpg/content";
import { WORLD, tile, ENEMY_SPAWNS } from "../rpg/world";
import { createActionState } from "../action/simulation";
import type { ActionState } from "../action/contracts";
import type { RpgState } from "../rpg/types";
import type { ValleyData, ValleySave } from "./contracts";
import { registerValleyContent, VALLEY_RECIPES } from "./content";
import { createValleyWorld } from "./world";
registerValleyContent();

export function createValleyData(now:number):ValleyData {
  return {home:null,paid:0,cottageTicks:0,forge:{logs:0,bars:0,ticks:0},furniture:[],plants:[],ground:{},undo:[],layoutRevision:0,
    commissions:[],dailyCommissions:[],dailyHelp:[],introduced:["builder"],flags:[],carpentryXp:0,goal:"",startedAt:now,lastDate:calendarDate(now),message:"Welcome to your valley. Choose a place for your tent.",workQueue:[]};
}
export function createValleySave(now:number,seed=1234567):ValleySave {
  const chapter=createRpg(now,seed);
  const position=tile(52,141);
  chapter.player.position={...position};chapter.player.previousPosition={...position};chapter.player.path=[];chapter.player.movement=null;chapter.player.action=null;
  for(const npc of chapter.npcs){npc.previousPosition={...npc.position};npc.path=[];npc.movement=null;npc.action=null;}
  chapter.control.autoplay=false;chapter.control.waiting=true;chapter.control.active=null;chapter.control.source=null;chapter.control.thought=null;chapter.control.queue=[];chapter.dialogue=null;
  const action=createActionState(position.x,position.y,maxHealth(chapter.player));
  action.player.facingX=-1;action.player.facingZ=0;
  action.player.health=chapter.player.health;
  const first=chapter.enemies.find(enemy=>enemy.id==="rock-mite-0");
  if(first){first.position=tile(94,158);first.home={...first.position};}
  action.enemies=chapter.enemies.map(enemy=>({id:enemy.id,x:enemy.position.x,z:enemy.position.y,homeX:enemy.home.x,homeZ:enemy.home.y,
    health:enemy.health,maxHealth:ENEMIES[enemy.definitionId].health,cooldown:0,windup:0,damage:ENEMIES[enemy.definitionId].maxHit,
    aggressive:ENEMIES[enemy.definitionId].aggressive,defeated:enemy.health<=0}));
  chapter.action=action;
  const result:ValleySave={version:7,chapter,action,valley:createValleyData(now),savedAt:now,offlineRemainder:0};
  for(const object of createValleyWorld(result.valley,chapter).objects)if(object.resourceId&&!chapter.resources[object.id])chapter.resources[object.id]={objectId:object.id,available:true,respawnAt:0};
  chapter.journal=["The king's grant opens a new valley. Your first home begins with a tent."];
  return result;
}

const record=(v:unknown):v is Record<string,unknown>=>!!v && typeof v==="object" && !Array.isArray(v);
const integer=(v:unknown,max=Number.MAX_SAFE_INTEGER):v is number=>Number.isSafeInteger(v) && Number(v)>=0 && Number(v)<=max;
const finite=(v:unknown,min:number,max:number):v is number=>typeof v==="number" && Number.isFinite(v) && v>=min && v<=max;
const strings=(v:unknown,max=512):v is string[]=>Array.isArray(v)&&v.length<=max&&v.every(s=>typeof s==="string"&&s.length<=128)&&new Set(v).size===v.length;
const rotation=(v:unknown)=>integer(v,3);
export function validActionState(value:unknown,chapter:RpgState):value is ActionState {
  if(!record(value)||!integer(value.frame)||typeof value.strikeHeld!=="boolean"||typeof value.swingTool!=="boolean"||!record(value.player)||!Array.isArray(value.enemies)||value.enemies.length!==chapter.enemies.length)return false;
  const p=value.player;
  if(!finite(p.x,0,WORLD.width-1)||!finite(p.z,0,WORLD.height-1)||!finite(p.height,-1,8)||!finite(p.facingX,-1,1)||!finite(p.facingZ,-1,1)||
    !finite(p.moveRemainderX,-1,1)||!finite(p.moveRemainderZ,-1,1)||!finite(p.maxHealth,1,999)||!finite(p.health,0,Number(p.maxHealth))||
    !finite(p.guard,0,100)||!integer(p.guardDelay,45)||!integer(p.guardBroken,45)||!integer(p.swing,36)||typeof p.blocking!=="boolean")return false;
  const ids=new Set<string>();
  for(const e of value.enemies) {
    if(!record(e)||typeof e.id!=="string"||ids.has(e.id)||!chapter.enemies.some(old=>old.id===e.id)||
      !finite(e.x,0,WORLD.width-1)||!finite(e.z,0,WORLD.height-1)||!finite(e.homeX,0,WORLD.width-1)||!finite(e.homeZ,0,WORLD.height-1)||
      !finite(e.maxHealth,1,999)||!finite(e.health,0,Number(e.maxHealth))||!integer(e.cooldown,3600)||!integer(e.windup,3600)||
      !finite(e.damage,0,999)||typeof e.aggressive!=="boolean"||typeof e.defeated!=="boolean")return false;
    ids.add(e.id);
  }
  return true;
}
function validGround(value:unknown):boolean {
  return record(value)&&[-1,0,1].includes(Number(value.level))&&typeof value.path==="boolean"&&(value.stairs===undefined||rotation(value.stairs));
}
export function validateValleySave(value:unknown):ValleySave|null {
  try {
    if(!record(value)||value.version!==7||!record(value.chapter)||!record(value.valley)||!integer(value.savedAt,8.64e15)||!finite(value.offlineRemainder,0,599.999999))return null;
    const input=structuredClone(value),v=input.valley as unknown as ValleyData;
    v.workQueue??=[];
    if(!Array.isArray(v.workQueue)||v.workQueue.length>1||v.workQueue.some(job=>!record(job)||typeof job.recipeId!=="string"||!VALLEY_RECIPES[job.recipeId]||!integer(job.quantity,100)||job.quantity<1||!integer(job.remainingTicks,360000)))return null;
    if(!integer(v.paid,100)||!integer(v.cottageTicks,9000)||(v.cottageTicks>0&&v.paid!==100)||!record(v.forge)||
      !integer(v.forge.logs,12)||!integer(v.forge.bars,2)||!integer(v.forge.ticks,1800)||(v.forge.ticks>0&&(v.forge.logs!==12||v.forge.bars!==2||v.cottageTicks!==9000))||
      !integer(v.layoutRevision)||!integer(v.carpentryXp,2_000_000_000)||!integer(v.startedAt,8.64e15)||typeof v.lastDate!=="string"||v.lastDate.length!==10||
      typeof v.message!=="string"||v.message.length>1000||typeof v.goal!=="string"||v.goal.length>256||
      !strings(v.commissions,3)||!v.commissions.every(id=>["timber","furniture","fishing"].includes(id))||!strings(v.dailyCommissions)||!strings(v.dailyHelp)||!strings(v.introduced,8)||!strings(v.flags,64))return null;
    if(v.home!==null&&(!record(v.home)||!integer(v.home.x,79)||v.home.x<16||!integer(v.home.z,175)||v.home.z<144||!rotation(v.home.rotation)||typeof v.home.tentPacked!=="boolean"))return null;
    if(v.home&&(v.home.x+(v.home.rotation%2?8:10)-1>79||v.home.z+(v.home.rotation%2?10:8)-1>175))return null;
    if(v.paid>0&&!v.home)return null;
    if(!Array.isArray(v.furniture)||v.furniture.length>256||!Array.isArray(v.plants)||v.plants.length>256||!record(v.ground)||Object.keys(v.ground).length>2048||!Array.isArray(v.undo)||v.undo.length>32)return null;
    const ids=new Set<string>();
    for(const f of v.furniture) {
      if(!record(f)||typeof f.id!=="string"||f.id.length>80||ids.has(f.id)||!["stool","table","bed","shelf","chest","planter"].includes(String(f.itemId))||!integer(f.x,79)||f.x<16||!integer(f.z,175)||f.z<144||!rotation(f.rotation))return null;
      ids.add(f.id);
    }
    for(const plant of v.plants)if(!record(plant)||typeof plant.id!=="string"||plant.id.length>80||ids.has(plant.id)||!["flowers","sapling"].includes(String(plant.kind))||!integer(plant.x,79)||plant.x<16||!integer(plant.z,175)||plant.z<144)return null;else ids.add(plant.id);
    for(const [key,edit] of Object.entries(v.ground)) {
      if(!/^\d{1,3},\d{1,3}$/.test(key)||!validGround(edit))return null;
      const [x,z]=key.split(",").map(Number);if(x<16||x>79||z<144||z>175)return null;
    }
    for(const undo of v.undo)if(!record(undo)||typeof undo.key!=="string"||!/^\d{1,3},\d{1,3}$/.test(undo.key)||(undo.before!==null&&!validGround(undo.before))||(undo.after!==null&&!validGround(undo.after)))return null;
    const rawChapter=input.chapter as unknown as RpgState;
    const originalIds=new Set(WORLD.objects.filter(o=>o.resourceId).map(o=>o.id));
    const extra=Object.entries(rawChapter.resources??{}).filter(([id])=>!originalIds.has(id));
    if(extra.length>128||extra.some(([id,r])=>!id.startsWith("valley-")||!record(r)||r.objectId!==id||typeof r.available!=="boolean"||!integer(r.respawnAt)))return null;
    if(!Array.isArray(rawChapter.enemies)||rawChapter.enemies.length!==ENEMY_SPAWNS.length||rawChapter.enemies.some(enemy=>!record(enemy)||!integer(enemy.respawnAt)||(enemy.health===0&&enemy.respawnAt===0)))return null;
    const valleyIds=new Set(createValleyWorld(v,rawChapter).objects.filter(o=>o.id.startsWith("valley-")).map(o=>o.id));
    if(!Array.isArray(rawChapter.effects))return null;
    // The shared engine validator knows the original world's IDs. Also accept
    // actual valley targets, validating every remaining effect field unchanged.
    const effects=rawChapter.effects.map(effect=>record(effect)&&typeof effect.targetId==="string"&&valleyIds.has(effect.targetId)?{...effect,targetId:undefined}:effect);
    const clean={...rawChapter,action:undefined,effects,resources:Object.fromEntries(Object.entries(rawChapter.resources??{}).filter(([id])=>originalIds.has(id))),
      enemies:rawChapter.enemies.map((enemy,index)=>({...enemy,position:{...ENEMY_SPAWNS[index].position},home:{...ENEMY_SPAWNS[index].position},respawnAt:enemy.health===0?Math.max(enemy.respawnAt,rawChapter.tick+1):enemy.respawnAt}))};
    const chapter=validateRpgSave(clean);
    if(!chapter||!validActionState(input.action,chapter))return null;
    chapter.effects=rawChapter.effects;
    chapter.resources={...chapter.resources,...Object.fromEntries(extra)};
    for(const enemy of chapter.enemies){const actor=input.action.enemies.find(value=>value.id===enemy.id)!;enemy.position=tile(Math.round(actor.x),Math.round(actor.z));enemy.home=tile(Math.round(actor.homeX),Math.round(actor.homeZ));enemy.respawnAt=rawChapter.enemies.find(value=>value.id===enemy.id)!.respawnAt;}
    chapter.action=input.action;
    return {version:7,chapter,action:input.action,valley:v,savedAt:Number(input.savedAt),offlineRemainder:Number(input.offlineRemainder)};
  }catch{return null;}
}

let database:Promise<IDBDatabase>|undefined,lastWritten:ValleySave|undefined;
function db():Promise<IDBDatabase>{return database??=new Promise((resolve,reject)=>{
  const request=indexedDB.open("fable-crown",1);
  request.onupgradeneeded=()=>{if(!request.result.objectStoreNames.contains("saves"))request.result.createObjectStore("saves");};
  request.onsuccess=()=>resolve(request.result);request.onerror=()=>reject(request.error);
});}
async function read(key:string):Promise<unknown>{const database=await db();return new Promise((resolve,reject)=>{const request=database.transaction("saves").objectStore("saves").get(key);request.onsuccess=()=>resolve(request.result);request.onerror=()=>reject(request.error);});}
export async function readValleySave(now=Date.now()):Promise<ValleySave>{
  const raw=await read("valley-v1"),current=validateValleySave(raw);if(current){lastWritten=structuredClone(current);return current;}
  if(raw!==undefined&&raw!==null){
    const backup=validateValleySave(await read("valley-v1-backup"));
    if(backup){backup.valley.message="Recovered your previous valid valley checkpoint.";lastWritten=structuredClone(backup);return backup;}
    throw Error("The stored valley chapter is invalid; its data has been preserved.");
  }
  return createValleySave(now);
}
export async function writeValleySave(save:ValleySave):Promise<void>{
  if(!validateValleySave(save))throw Error("Refusing to overwrite a chapter with invalid state");
  const snapshot=structuredClone(save),database=await db();return new Promise((resolve,reject)=>{const transaction=database.transaction("saves","readwrite"),store=transaction.objectStore("saves");store.put(lastWritten??snapshot,"valley-v1-backup");store.put(snapshot,"valley-v1");transaction.oncomplete=()=>{lastWritten=snapshot;resolve();};transaction.onerror=()=>reject(transaction.error);});
}

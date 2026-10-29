import { describe, expect, it } from "vitest";
import { suggestIntentions } from "../src/planner";
import { applyCommand, createGame, step, validateSave } from "../src/simulation";
import type { GameState, Resource, SettlementId } from "../src/types";
import { SETTLEMENTS } from "../src/world";
const NOW = Date.UTC(2026,9,29);
function moveTo(s:GameState,id:SettlementId):void {
 const p=s.people[0]!, t=SETTLEMENTS.find(t=>t.id===id)!;
 if(p.carry){s.stores[id][p.carry.resource]+=p.carry.amount;p.carry=null;}
 Object.assign(p,{x:t.x,y:t.y,fromX:t.x,fromY:t.y,targetX:t.x,targetY:t.y,path:[],action:"Considering intentions",remaining:1,duration:1});delete p.taskResource;
 s.control.active=null;s.control.queue=[];s.control.thinkingUntil=s.tick+6;s.control.waiting=false;s.control.lastAutonomous="";s.control.visited=[];
}
function complete():GameState {const s=createGame(NOW);step(s,1200);expect(s.workshop.complete).toBe(true);moveTo(s,"oakrest");return s;}
function fill(s:GameState):void {for(const id of ["oakrest","briarford","stonehaven"] as SettlementId[])for(const r of ["timber","stone","iron"] as Resource[]){const goal=r==="timber"?64:r==="stone"?48:id==="oakrest"?24:12;const n=Math.max(0,goal-s.stores[id][r]);s.stores[id][r]+=n;s.gathered[r]+=n;}}
function pauseNPCs(s:GameState):void {for(const p of s.people.slice(1)){if(p.carry){s.stores[p.homeId][p.carry.resource]+=p.carry.amount;p.carry=null;}p.path=[];p.action="Resting by the square";p.duration=p.remaining=5000;delete p.taskResource;}}
function until(s:GameState,test:()=>boolean):void{for(let i=0;i<1000&&!test();i++)step(s);expect(test()).toBe(true);}
describe("deterministic forward planner",()=>{
 it("offers ranked legal pure suggestions in fresh, mid-build, complete and foreign states",()=>{
  const fresh=createGame(NOW), mid=createGame(NOW);step(mid,60);const done=complete(), foreign=structuredClone(done);moveTo(foreign,"briarford");
  for(const s of [fresh,mid,done,foreign]){const before=JSON.stringify(s),ideas=suggestIntentions(s);expect(ideas.length).toBeGreaterThanOrEqual(2);expect(ideas.length).toBeLessThanOrEqual(3);expect(JSON.stringify(s)).toBe(before);expect(ideas.map(i=>i.score)).toEqual(ideas.map(i=>i.score).sort((a,b)=>b-a));for(const idea of ideas){expect(idea.thought.length).toBeGreaterThan(25);expect(applyCommand(structuredClone(s),{type:"order",intent:idea.intent,mode:"now"}).ok).toBe(true);}}
 });
 it("bases workshop thoughts on actual material and labor shortages",()=>{const s=createGame(NOW);const idea=suggestIntentions(s)[0]!;expect(idea.intent.kind).toBe("build");expect(idea.thought).toContain("24 timber and 16 stone");});
 it("keeps purpose beyond twelve tools and remembers reached destinations",()=>{const s=complete();fill(s);expect(s.workshop.forged).toBeGreaterThanOrEqual(12);const completed=s.people[0]!.completed;step(s,800);expect(s.control.visited!.length).toBeGreaterThan(2);expect(s.people[0]!.completed).toBeGreaterThan(completed);expect(s.people[0]!.action).not.toBe("Resting by the square");expect(validateSave(s)).not.toBeNull();});
 it("helps the area after a remote arrival instead of immediately returning to Oakrest",()=>{const s=complete();moveTo(s,"briarford");s.gathered.iron-=s.stores.briarford.iron;s.stores.briarford.iron=0;step(s,6);expect(s.control.active?.kind).toBe("gather");expect(s.control.active?.targetId).toBe("briarford-mine");expect(s.control.reason).toContain("Briarford");});
 it("retains concrete autonomous reasoning and respects queued player work and wait",()=>{const s=createGame(NOW);step(s,6);const reason=s.control.reason;step(s,3);expect(s.control.reason).toBe(reason);expect(reason).toContain("workshop");applyCommand(s,{type:"order",intent:{kind:"move",targetId:"briarford"},mode:"now"});applyCommand(s,{type:"order",intent:{kind:"move",targetId:"stonehaven"},mode:"next"});const active=structuredClone(s.control.active);applyCommand(s,{type:"wait"});step(s,100);expect(s.control.active).toEqual(active);expect(s.control.queue[0]!.targetId).toBe("stonehaven");expect(s.control.waiting).toBe(true);});
 it("normalizes old V2 memory while rejecting malformed memories",()=>{const old=createGame(NOW);delete old.control.visited;delete old.control.lastAutonomous;const loaded=validateSave(old)!;expect(loaded.control.visited).toEqual([]);expect(loaded.control.lastAutonomous).toBe("");for(const patch of [{visited:["fake"]},{visited:["oakrest","oakrest"]},{visited:"oakrest"},{lastAutonomous:42},{lastAutonomous:"visit-fake"},{lastAutonomous:"paid-api"}]){const s=createGame(NOW);Object.assign(s.control,patch);expect(validateSave(s)).toBeNull();}});
 it("replays memory, selections and reasons across save boundaries",()=>{const a=complete();fill(a);step(a,171);const b=validateSave(a)!;expect(b).not.toBeNull();step(a,700);step(b,700);expect(b).toEqual(a);});
 it("gathers a ten-unit build load while NPC capacity stays two",()=>{const s=createGame(NOW);pauseNPCs(s);applyCommand(s,{type:"order",intent:{kind:"build"},mode:"now"});until(s,()=>s.people[0]!.carry?.amount===10&&s.people[0]!.action==="Traveling");expect(s.people[0]!.carry?.resource).toBe("timber");expect(s.gathered.timber).toBe(10);expect(s.workshop.timber).toBe(0);expect(validateSave(s)).not.toBeNull();});
 it("fetches iron in a full batch for five tools",()=>{const s=complete();pauseNPCs(s);const before=s.stores.oakrest.iron;expect(before).toBeGreaterThanOrEqual(10);applyCommand(s,{type:"order",intent:{kind:"forge",quantity:5},mode:"now"});until(s,()=>s.people[0]!.carry?.resource==="iron"&&s.people[0]!.carry.amount===10);expect(s.stores.oakrest.iron).toBe(before-10);expect(validateSave(s)).not.toBeNull();});
});

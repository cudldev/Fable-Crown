import { describe,expect,it } from "vitest";
import type { ActionEvent,ActionInput } from "../src/action/contracts";
import { actionSafe,applyActionEvents,rpgActionWorld,syncActionRespawns } from "../src/action/rpg-adapter";
import { idleActionInput,stepAction } from "../src/action/simulation";
import { calendarDate } from "../src/rpg/engine";
import { itemCount } from "../src/rpg/inventory";
import { findPath } from "../src/rpg/pathfinding";
import { tile } from "../src/rpg/world";
import { COTTAGE_TICKS } from "../src/valley/contracts";
import type { ValleyCommand } from "../src/valley/contracts";
import { getOnboarding,VALLEY_DIRECTIONS } from "../src/valley/onboarding";
import { reconcileValley } from "../src/valley/offline";
import { createValleySave,validateValleySave } from "../src/valley/save";
import { advanceSettlement,applyValleyCommand } from "../src/valley/settlement";
import { canTraverseValley,createValleyWorld,homeFootprints,sampleValleyGround } from "../src/valley/world";

const START=new Date(2026,10,1,12).getTime();
/** A reference client, using real input frames and commands. No fixture grants or actor teleports. */
class Journey {
  save=createValleySave(START);
  frames=0;
  paused=false;
  private awayMs=0;
  readonly events:ActionEvent[]=[];
  now(){return START+this.awayMs+Math.floor(this.frames*1000/60);}
  held(id:string){return itemCount(this.save.chapter.player.inventory,id);}
  frame(input:Partial<ActionInput>={}):ActionEvent[] {
    if(this.paused)throw Error("Action input cannot run while paused");
    if(++this.frames>12_000)throw Error("Reference journey exceeded its bounded 12000 live input frames");
    const s=this.save,layout=createValleyWorld(s.valley,s.chapter);
    const world=rpgActionWorld(s.chapter,layout,actionSafe,(x,z)=>sampleValleyGround(s.valley,x,z));
    const occupy=world.canOccupy;
    world.canOccupy=(x,z,fromX,fromZ)=>occupy(x,z,fromX,fromZ)&&canTraverseValley(s.valley,fromX,fromZ,x,z,s.chapter);
    const events=stepAction(s.action,{...idleActionInput(),...input},world);
    const fp=homeFootprints(s.valley),home=fp?.tentApproach??{x:52,z:141};
    applyActionEvents(s.chapter,s.action,events,layout,tile(home.x,home.z));
    this.events.push(...events);
    if(this.frames%36===0){advanceSettlement(s,1,this.now());syncActionRespawns(s.chapter,s.action);}
    return events;
  }
  idle(frames:number){for(let i=0;i<frames;i++)this.frame();}
  command(command:ValleyCommand){const reply=applyValleyCommand(this.save,command,this.now());expect(reply.ok,`${command.type}: ${reply.message}`).toBe(true);}
  walk(x:number,z:number){
    const s=this.save,from=tile(Math.round(s.action.player.x),Math.round(s.action.player.z));
    const path=findPath(from,tile(x,z),createValleyWorld(s.valley,s.chapter));
    if(!path)throw Error(`No reference route from ${from.x},${from.y} to ${x},${z}`);
    for(const next of [from,...path]) {
      let steps=0;
      while(Math.hypot(next.x-s.action.player.x,next.y-s.action.player.z)>.015){
        if(++steps>65)throw Error(`Continuous collision blocks route toward ${next.x},${next.y} at ${s.action.player.x},${s.action.player.z}`);
        // Fractional joystick magnitude lands on waypoint centres through the movement simulation.
        const dx=next.x-s.action.player.x,dz=next.y-s.action.player.z,scale=Math.min(20,1/Math.hypot(dx,dz));
        this.frame({moveX:dx*scale,moveZ:dz*scale});
      }
    }
    expect(Math.hypot(s.action.player.x-x,s.action.player.z-z)).toBeLessThan(.02);
  }
  face(x:number,z:number){const p=this.save.action.player;this.frame({moveX:(x-p.x)*.01,moveZ:(z-p.z)*.01});}
  gatherSevenLogs(){
    this.walk(25,140);this.face(25,139);
    const before=this.held("logs"),xp=this.save.chapter.player.skills.woodcutting;
    for(let attempts=0;this.held("logs")-before<7;attempts++) {
      if(attempts>=70)throw Error("Seven natural tree successes not reached within70 presses");
      while(!this.save.chapter.resources["valley-tree-1"].available)this.frame();
      this.frame({strike:true,tool:true});this.idle(35);
    }
    expect(this.held("logs")-before).toBe(7);
    expect(this.save.chapter.player.skills.woodcutting-xp).toBe(7*250);
    expect(this.events.filter(e=>e.kind==="resource-hit").length).toBeGreaterThanOrEqual(7);
  }
  finishBatch(){for(let frames=0;this.save.valley.workQueue.length;frames++){if(frames>1200)throw Error("Craft batch did not finish");this.frame();}}
  pauseSixHours(){
    this.paused=true;
    const action=structuredClone(this.save.action),enemies=structuredClone(this.save.chapter.enemies),health=this.save.chapter.player.health;
    const now=this.now();this.save.savedAt=now;this.save.chapter.savedAt=now;this.save.chapter.calendar=calendarDate(now);
    this.awayMs+=6*60*60*1000;
    const summary=reconcileValley(this.save,this.now());
    expect(summary.ticks).toBe(9000);expect(this.save.valley.cottageTicks).toBe(COTTAGE_TICKS);
    expect(this.save.action).toEqual(action);expect(this.save.chapter.enemies).toEqual(enemies);expect(this.save.chapter.player.health).toBe(health);
    expect(this.frames).toBe(this.save.action.frame);expect(summary.message).toContain("Your cottage is ready");
    const restored=validateValleySave(JSON.parse(JSON.stringify(this.save)));
    expect(restored,"The earned journey must remain export/import compatible").not.toBeNull();this.save=restored!;
    this.paused=false;
  }
  optionalEncounter(){
    const coins=this.held("coins");this.walk(94,159);
    const mite=this.save.action.enemies.find(e=>e.id==="rock-mite-0")!;
    expect(actionSafe(this.save.action.player.x,this.save.action.player.z)).toBe(false);
    this.face(mite.x,mite.z);this.frame({strike:true});this.idle(35);
    expect(this.events.some(e=>e.kind==="enemy-hit"&&e.targetId===mite.id)).toBe(true);
    for(let frame=0;!this.events.some(e=>e.kind==="block"&&e.targetId===mite.id);frame++){
      if(frame>90)throw Error("The optional mite encounter did not produce a real shield block");this.frame({block:true});
    }
    this.walk(86,159);expect(actionSafe(this.save.action.player.x,this.save.action.player.z)).toBe(true);
    expect(this.held("coins")).toBe(coins);expect(this.save.chapter.drops).toHaveLength(0);expect(this.save.chapter.grave).toBeNull();
    expect(this.events.some(e=>e.kind==="player-defeat")).toBe(false);
  }
  completeHomeJourney(){
    expect(this.save.version).toBe(7);expect(this.held("coins")).toBe(25);expect(this.save.valley.paid).toBe(0);
    this.walk(52,141);this.command({type:"talk-visitor",id:"builder"});this.command({type:"place-home",x:54,z:155,rotation:0});
    this.command({type:"daily-help"});expect(this.held("logs")).toBe(4);
    this.gatherSevenLogs();expect(this.held("logs")).toBe(11);
    this.walk(52,141);this.command({type:"commission",id:"timber"});expect(this.held("logs")).toBe(3);expect(this.held("coins")).toBe(65);
    this.walk(69,141);this.command({type:"craft",recipeId:"valley-plank",quantity:3});this.finishBatch();
    expect(this.held("logs")).toBe(0);expect(this.held("valley-plank")).toBe(6);
    this.command({type:"craft",recipeId:"valley-stool",quantity:3});this.finishBatch();
    expect(this.held("valley-plank")).toBe(0);expect(this.held("valley-stool")).toBe(3);
    this.walk(74,142);this.command({type:"commission",id:"furniture"});expect(this.held("valley-stool")).toBe(1);expect(this.held("coins")).toBe(105);
    this.command({type:"pay",amount:100});expect(this.held("coins")).toBe(5);expect(this.save.valley.cottageTicks).toBe(0);
    expect(getOnboarding(this.save,this.now()).day).toBe(2);
    this.pauseSixHours();expect(getOnboarding(this.save,this.now()).day).toBe(2);
    this.walk(57,168);this.command({type:"place-furniture",itemId:"stool",x:58,z:168,rotation:0});
    this.walk(75,142);this.command({type:"talk-visitor",id:"merchant"});expect(getOnboarding(this.save,this.now()).day).toBe(3);
    this.command({type:"pin-goal",goal:VALLEY_DIRECTIONS.find(d=>d.id==="garden")!.goal});
    expect(this.save.valley.goal).toBe("Lay a path, shape a terrace and plant my garden");
    expect(this.save.valley.commissions).toEqual(["timber","furniture"]);expect(this.save.valley.furniture).toHaveLength(1);
    expect(this.held("valley-stool")).toBe(0);expect(this.held("coins")).toBe(5);expect(this.save.valley.carpentryXp).toBe(900);
    expect(this.save.valley.forge).toEqual({logs:0,bars:0,ticks:0});expect(this.save.chapter.grave).toBeNull();
    expect(validateValleySave(JSON.parse(JSON.stringify(this.save)))).not.toBeNull();
  }
}

describe("fresh valley reference journeys without fixture grants",()=>{
  it("peacefully earns its cottage through real tool presses, offline building and furnishing",()=>{
    const journey=new Journey();journey.completeHomeJourney();
    expect(journey.events.some(e=>["enemy-hit","enemy-defeat","player-hit","player-defeat","block"].includes(e.kind))).toBe(false);
    expect(journey.frames).toBeLessThan(8000);
  },20_000);
  it("can add a real wilderness strike and shield block without needing combat rewards",()=>{
    const journey=new Journey();journey.optionalEncounter();journey.completeHomeJourney();
    expect(journey.events.some(e=>e.kind==="enemy-hit")).toBe(true);expect(journey.events.some(e=>e.kind==="block")).toBe(true);
    expect(journey.events.some(e=>e.kind==="enemy-defeat")).toBe(false);expect(journey.frames).toBeLessThan(12_000);
  },20_000);
});

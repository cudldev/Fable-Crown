import {describe,expect,it} from "vitest";
import type {ActionWorld} from "../src/action/contracts";
import {rpgActionWorld} from "../src/action/rpg-adapter";
import type {WorldDefinition} from "../src/rpg/types";
import {tile} from "../src/rpg/world";
import {createValleySave,validateValleySave} from "../src/valley/save";
import {createValleyWorld} from "../src/valley/world";
import {ValleyNpcRoutines} from "../src/valley/npc-routines";
import {COTTAGE_TICKS,type ValleySave} from "../src/valley/contracts";

const NOW=new Date(2026,10,1,12).getTime();
function fixture(){const save=createValleySave(NOW);save.valley.introduced.push("merchant","smith");return save;}
function step(save:ValleySave,routines:ValleyNpcRoutines,heldId?:string){
  save.chapter.tick++;const world=createValleyWorld(save.valley,save.chapter);return routines.step(save,world,rpgActionWorld(save.chapter,world),heldId);
}
function economy(save:ValleySave){return structuredClone({player:save.chapter.player,bank:save.chapter.bank,skills:save.action.player,seed:save.chapter.seed,
  npcs:save.chapter.npcs.map(({id,name,role,home,inventory,bank,skills,equipment,ammo,health,runEnergy,completed})=>({id,name,role,home,inventory,bank,skills,equipment,ammo,health,runEnergy,completed})),
  resources:save.chapter.resources,effects:save.chapter.effects,effectSequence:save.chapter.effectSequence,quests:save.chapter.quests,rewards:save.chapter.rewards,paid:save.valley.paid,carpentry:save.valley.carpentryXp});}

describe("live role-based NPC routines",()=>{
  it("is deterministic and keeps all original identities, items, XP and authoritative rewards unchanged",()=>{
    const a=fixture(),b=structuredClone(a),left=new ValleyNpcRoutines(),right=new ValleyNpcRoutines(),before=economy(a);
    for(let tick=0;tick<140;tick++){
      step(a,left);step(b,right);
      expect(a).toEqual(b);expect(left.visitorPoses).toEqual(right.visitorPoses);
    }
    expect(a.chapter.npcs).toHaveLength(23);expect(economy(a)).toEqual(before);
  });

  it("stages work, local walks, exploration and rest at staggered per-person times",()=>{
    const save=fixture(),routines=new ValleyNpcRoutines(),activities=new Set<string>(),roles=new Set<string>(),moving=new Set<number>(),firstWork=new Map<number,number>();
    for(let tick=0;tick<160;tick++){
      step(save,routines);
      for(const actor of save.chapter.npcs){
        activities.add(actor.activity);if(actor.movement)moving.add(actor.id);
        if(actor.activity.startsWith("Working:")){roles.add(actor.role);if(!firstWork.has(actor.id))firstWork.set(actor.id,tick);}
      }
    }
    expect([...roles].sort()).toEqual(["fisher","miner","smith","woodcutter"]);
    expect(moving.size).toBeGreaterThan(10);
    expect([...activities].some(value=>value.includes("Exploring"))).toBe(true);
    expect([...activities].some(value=>value.includes("Resting"))).toBe(true);
    expect(new Set(firstWork.values()).size).toBeGreaterThan(3);
  });

  it("keeps integer actor traces within one legal tile step and current saves valid",()=>{
    const save=fixture(),routines=new ValleyNpcRoutines(),starts=save.chapter.npcs.map(actor=>({...actor.position}));
    for(let tick=0;tick<100;tick++){
      const before=save.chapter.npcs.map(actor=>({...actor.position}));step(save,routines);
      const world=createValleyWorld(save.valley,save.chapter),env=rpgActionWorld(save.chapter,world);
      for(const [index,actor] of save.chapter.npcs.entries()){
        expect(Math.max(Math.abs(actor.position.x-before[index].x),Math.abs(actor.position.y-before[index].y))).toBeLessThanOrEqual(1);
        expect(Number.isInteger(actor.position.x)&&Number.isInteger(actor.position.y)).toBe(true);
        expect(Math.hypot(actor.position.x-starts[index].x,actor.position.y-starts[index].y)).toBeLessThanOrEqual(12.001);
        if(actor.movement){
          expect(actor.movement.tick).toBe(save.chapter.tick);expect(actor.movement.tiles).toEqual([actor.previousPosition,actor.position]);
          const count=Math.ceil(Math.hypot(actor.position.x-before[index].x,actor.position.y-before[index].y)/.1);let prior=before[index];
          for(let sample=1;sample<=count;sample++){
            const next=tile(before[index].x+(actor.position.x-before[index].x)*sample/count,before[index].y+(actor.position.y-before[index].y)*sample/count);
            expect(env.canOccupy(next.x,next.y,prior.x,prior.y)).toBe(true);prior=next;
          }
        }
      }
      if(tick%10===0)expect(validateValleySave(save)).not.toBeNull();
    }
  });

  it("holds an actor immediately at its authoritative position and resumes its routine after release",()=>{
    const save=fixture(),routines=new ValleyNpcRoutines();let moving=save.chapter.npcs[0];
    for(let tick=0;tick<50;tick++){step(save,routines);const found=save.chapter.npcs.find(actor=>actor.movement);if(found){moving=found;break;}}
    expect(moving.movement).not.toBeNull();const location={...moving.position},id=`actor-${moving.id}`;
    routines.hold(save,id);
    expect(moving.position).toEqual(location);expect(moving.previousPosition).toEqual(location);expect(moving.movement).toBeNull();expect(moving.action).toBeNull();expect(moving.path).toEqual([]);
    for(let tick=0;tick<16;tick++){step(save,routines,id);expect(moving.position).toEqual(location);expect(moving.activity).toBe("Talking with Alden");}
    step(save,routines);expect(moving.activity).not.toBe("Talking with Alden");
    let resumed=false;for(let tick=0;tick<80;tick++){step(save,routines);resumed ||= moving.position.x!==location.x||moving.position.y!==location.y;}
    expect(resumed).toBe(true);
  });

  it("does not run while merely reading poses and reset clears only ephemeral routines",()=>{
    const save=fixture(),routines=new ValleyNpcRoutines();for(let tick=0;tick<30;tick++)step(save,routines);
    const before=structuredClone(save),poses=routines.visitorPoses;
    for(let i=0;i<10;i++)expect(routines.visitorPoses).toEqual(poses);
    expect(save).toEqual(before);expect(Object.isFrozen(poses)&&Object.isFrozen(poses[0])).toBe(true);
    routines.reset();expect(routines.visitorPoses).toEqual([]);expect(save).toEqual(before);
    step(save,routines);expect(routines.visitorPoses).toHaveLength(3);
  });
});

describe("saved visitor circuits and conversations",()=>{
  const inForge=(x:number,z:number)=>x>69.3&&x<73.7&&z>177.3&&z<180.7;
  const depth=(x:number,z:number)=>Math.max(0,Math.min(x-69.3,73.7-x,z-177.3,180.7-z));

  it("keeps Garrick's actual forge-site routine outside the reserved building pad for100live ticks",()=>{
    const save=fixture(),routines=new ValleyNpcRoutines(),before=economy(save);let worked=false,moved=false;
    for(let tick=0;tick<100;tick++){
      step(save,routines);const smith=routines.visitorPoses.find(pose=>pose.id==="valley-visitor-smith")!;
      expect(inForge(smith.x,smith.z)).toBe(false);worked ||= smith.working;moved ||= smith.moving;
      const samples=Math.max(1,Math.ceil(Math.hypot(smith.x-smith.fromX,smith.z-smith.fromZ)/.05));
      for(let sample=0;sample<=samples;sample++)expect(inForge(smith.fromX+(smith.x-smith.fromX)*sample/samples,smith.fromZ+(smith.z-smith.fromZ)*sample/samples)).toBe(false);
    }
    expect(worked&&moved).toBe(true);expect(economy(save)).toEqual(before);
  });

  it("walks a restored visitor out of a still-free reserved pad without teleporting or re-entering",()=>{
    const save=fixture();save.valley.visitorPositions={smith:{x:71.5,z:179.4}};
    const routines=new ValleyNpcRoutines(),before=economy(save);let exited=false;
    for(let tick=0;tick<100;tick++){
      step(save,routines);const smith=routines.visitorPoses.find(pose=>pose.id==="valley-visitor-smith")!;
      expect(Math.hypot(smith.x-smith.fromX,smith.z-smith.fromZ)).toBeLessThanOrEqual(.800001);
      expect(depth(smith.x,smith.z)).toBeLessThanOrEqual(depth(smith.fromX,smith.fromZ)+1e-9);
      if(tick>=5)expect(inForge(smith.x,smith.z)).toBe(false);
      if(exited)expect(inForge(smith.x,smith.z)).toBe(false);
      exited ||= !inForge(smith.x,smith.z);
    }
    expect(exited).toBe(true);expect(economy(save)).toEqual(before);
  });

  it("waits in place when a restored visitor's reserved start is already blocked by actual forge construction",()=>{
    const save=fixture();save.valley.home={x:54,z:155,rotation:0,tentPacked:false};save.valley.paid=100;save.valley.cottageTicks=COTTAGE_TICKS;
    save.valley.forge={logs:12,bars:2,ticks:0};save.valley.visitorPositions={smith:{x:71.5,z:179.4}};
    const routines=new ValleyNpcRoutines(),before=economy(save),position={...save.valley.visitorPositions.smith!};
    const world=createValleyWorld(save.valley,save.chapter);expect(rpgActionWorld(save.chapter,world).canOccupy(position.x,position.z,position.x,position.z)).toBe(false);
    for(let tick=0;tick<10;tick++){
      step(save,routines);expect(save.valley.visitorPositions!.smith).toEqual(position);
      expect(routines.visitorPoses.find(pose=>pose.id==="valley-visitor-smith")).toMatchObject({...position,activity:"Waiting for the forge site to clear",working:false,moving:false});
    }
    expect(economy(save)).toEqual(before);
  });

  it("keeps Rowan at the greeting point for at least fourteen live ticks, then lets visitors work and wander",()=>{
    const save=fixture(),routines=new ValleyNpcRoutines();
    for(let tick=0;tick<14;tick++){step(save,routines);expect(save.valley.visitorPositions?.builder).toEqual({x:51,z:141});}
    const working=new Set<string>(),moving=new Set<string>();
    for(let tick=0;tick<180;tick++){
      step(save,routines);
      for(const pose of routines.visitorPoses){
        if(pose.working)working.add(pose.id);if(pose.moving)moving.add(pose.id);
        expect(Math.hypot(pose.x-pose.fromX,pose.z-pose.fromZ)).toBeLessThanOrEqual(.800001);
        expect(pose.x).toBeGreaterThanOrEqual(8);expect(pose.x).toBeLessThanOrEqual(87);expect(pose.z).toBeGreaterThanOrEqual(136);expect(pose.z).toBeLessThanOrEqual(183);
      }
    }
    expect([...working].sort()).toEqual(["valley-visitor-builder","valley-visitor-merchant","valley-visitor-smith"]);
    expect([...moving].sort()).toEqual([...working].sort());expect(validateValleySave(save)).not.toBeNull();
  });

  it("holds a moving visitor in place through repeated steps and releases the same saved position",()=>{
    const save=fixture(),routines=new ValleyNpcRoutines(),id="valley-visitor-builder";
    for(let tick=0;tick<30;tick++){step(save,routines);if(routines.visitorPoses.some(pose=>pose.id===id&&pose.moving))break;}
    expect(routines.visitorPoses.find(pose=>pose.id===id)?.moving).toBe(true);const point={...save.valley.visitorPositions!.builder!};
    routines.hold(save,id);expect(routines.visitorPoses.find(pose=>pose.id===id)).toMatchObject({...point,fromX:point.x,fromZ:point.z,moving:false,working:false,activity:"Talking with Alden"});
    for(let tick=0;tick<20;tick++){step(save,routines,id);expect(save.valley.visitorPositions!.builder).toEqual(point);expect(routines.visitorPoses.find(pose=>pose.id===id)?.moving).toBe(false);}
    step(save,routines);expect(routines.visitorPoses.find(pose=>pose.id===id)?.activity).not.toBe("Talking with Alden");
    for(let tick=0;tick<20;tick++)step(save,routines);
    expect(save.valley.visitorPositions!.builder).not.toEqual(point);
  });

  it("follows sampled collision-aware routes around a wall instead of popping through it",()=>{
    const save=fixture();save.chapter.npcs=[];const routines=new ValleyNpcRoutines();
    const base=createValleyWorld(save.valley,save.chapter),world:WorldDefinition={...base,objects:base.objects.filter(object=>["valley-visitor-builder","valley-workbench"].includes(object.id))};
    const env:ActionWorld={targets:[],isSafe:()=>true,groundHeight:()=>0,canOccupy:(x,z)=>x>=8&&x<=87&&z>=136&&z<=183&&!(Math.abs(x-60)<.3&&z<146)&&!(x>=68.8&&x<=70.2&&Math.abs(z-139)<.3)};
    let crossed=false,detoured=false;
    for(let tick=0;tick<100;tick++){
      save.chapter.tick++;routines.step(save,world,env);const pose=routines.visitorPoses[0];
      if(pose.moving){
        const samples=Math.max(1,Math.ceil(Math.hypot(pose.x-pose.fromX,pose.z-pose.fromZ)/.1));let prior={x:pose.fromX,z:pose.fromZ};
        for(let sample=1;sample<=samples;sample++){
          const next={x:pose.fromX+(pose.x-pose.fromX)*sample/samples,z:pose.fromZ+(pose.z-pose.fromZ)*sample/samples};
          expect(env.canOccupy(next.x,next.z,prior.x,prior.z)).toBe(true);prior=next;
        }
      }
      crossed ||= pose.x>60.5;detoured ||= pose.z>=146;
    }
    expect(crossed&&detoured).toBe(true);
  });

  it("resumes from saved fractional visitor positions and removes departed visitors from pose snapshots",()=>{
    const save=fixture();save.valley.visitorPositions={builder:{x:50.25,z:142.5}};
    const routines=new ValleyNpcRoutines();step(save,routines);
    expect(routines.visitorPoses.find(pose=>pose.id==="valley-visitor-builder")).toMatchObject({x:50.25,z:142.5,fromX:50.25,fromZ:142.5});
    const world=createValleyWorld(save.valley,save.chapter),withoutSmith={...world,objects:world.objects.filter(object=>object.id!=="valley-visitor-smith")};
    save.chapter.tick++;routines.step(save,withoutSmith,rpgActionWorld(save.chapter,withoutSmith));
    expect(routines.visitorPoses.map(pose=>pose.id)).not.toContain("valley-visitor-smith");
  });

  it("rechecks actual occupancy on every step when a route becomes blocked",()=>{
    const save=createValleySave(NOW);save.chapter.npcs=[];const routines=new ValleyNpcRoutines();
    for(let tick=0;tick<40;tick++){step(save,routines);if(routines.visitorPoses[0]?.moving)break;}
    expect(routines.visitorPoses[0].moving).toBe(true);const point={...save.valley.visitorPositions!.builder!};
    const env:ActionWorld={targets:[],isSafe:()=>true,groundHeight:()=>0,canOccupy:(x,z)=>Math.hypot(x-point.x,z-point.z)<1e-8};
    save.chapter.tick++;routines.step(save,createValleyWorld(save.valley,save.chapter),env);
    expect(save.valley.visitorPositions!.builder).toEqual(point);
    expect(routines.visitorPoses[0]).toMatchObject({x:point.x,z:point.z,moving:false,working:false});
  });
});

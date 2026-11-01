import {describe,expect,it} from "vitest";
import type {WorldObject} from "../src/rpg/types";
import {tile} from "../src/rpg/world";
import {createValleySave} from "../src/valley/save";
import {createValleyWorld} from "../src/valley/world";
import {nearbyValleyInteraction,selectionInRange,valleyInteractionCue} from "../src/valley/interaction-feedback";

const NOW=new Date(2026,10,1,12).getTime();
function fixture(objects:WorldObject[]=[]){
  const save=createValleySave(NOW);Object.assign(save.action.player,{x:50,z:150,facingX:1,facingZ:0});
  const world={...createValleyWorld(save.valley,save.chapter),objects};
  return {save,world};
}
const station=(id:string,x:number,z:number):WorldObject=>({id,name:id,kind:"building",position:tile(x,z),width:1,height:1,blocks:false});
function deepFreeze(value:unknown,seen=new WeakSet<object>()):void{
  if(!value||typeof value!=="object"||seen.has(value))return;
  seen.add(value);Object.values(value).forEach(child=>deepFreeze(child,seen));Object.freeze(value);
}

describe("facing interaction selection",()=>{
  it("selects the most aligned reachable target before a closer off-axis target",()=>{
    const {save,world}=fixture([station("straight-ahead",54,150),station("nearby-side",51,151),station("behind",49.5,150)]);
    expect(nearbyValleyInteraction(save,save.action,world)?.selection).toEqual({kind:"object",id:"straight-ahead"});
    save.action.player.facingX=-1;
    expect(nearbyValleyInteraction(save,save.action,world)?.selection).toEqual({kind:"object",id:"behind"});
  });

  it("breaks equal alignment by distance and then by stable id regardless of object order",()=>{
    const objects=[station("far",54,150),station("z-near",52,150),station("a-near",52,150)];
    const {save,world}=fixture(objects);
    for(const ordered of [objects,[...objects].reverse()]){
      expect(nearbyValleyInteraction(save,save.action,{...world,objects:ordered})?.selection).toEqual({kind:"object",id:"a-near"});
    }
  });

  it.each([
    {facingX:.49,visible:false},{facingX:.5,visible:true},{facingX:.51,visible:true},
  ])("uses the forward cone boundary at $facingX",({facingX,visible})=>{
    const {save,world}=fixture([station("station",52,150)]);
    Object.assign(save.action.player,{facingX,facingZ:Math.sqrt(1-facingX*facingX)});
    expect(!!nearbyValleyInteraction(save,save.action,world)).toBe(visible);
  });

  it("permits overlapping targets without a precise facing direction",()=>{
    const {save,world}=fixture([station("at-feet",49.75,150)]);
    expect(nearbyValleyInteraction(save,save.action,world)?.detail).toBe("at-feet");
    world.objects[0].position.x=49.749;
    expect(nearbyValleyInteraction(save,save.action,world)).toBeNull();
  });

  it("does not grab a recovery marker or dropped supplies behind the player",()=>{
    const {save,world}=fixture([station("ahead",52,150)]);
    save.chapter.grave={position:tile(49,150),items:[{itemId:"logs",quantity:1}],attempts:0,retryAt:0};
    save.chapter.drops=[{id:"drop",position:tile(49.5,150),items:[],expiresAt:100}];
    expect(nearbyValleyInteraction(save,save.action,world)?.detail).toBe("ahead");
    save.action.player.facingX=-1;
    expect(nearbyValleyInteraction(save,save.action,world)?.selection).toEqual({kind:"drop",id:"drop"});
  });

  it("uses a large service's actual entrance anchor for selection and the cue",()=>{
    const home={...station("valley-home-cottage",20,150),width:10,height:8,entrance:{x:29,z:157}};
    const {save,world}=fixture([home]);Object.assign(save.action.player,{x:31,z:157,facingX:-1});
    expect(nearbyValleyInteraction(save,save.action,world)).toMatchObject({x:29,z:157,selection:{id:home.id}});
    expect(valleyInteractionCue(save,save.action,world,true).target).toMatchObject({x:29,z:157,label:`Open · ${home.name}`});
    save.action.player.x=32.001;
    expect(nearbyValleyInteraction(save,save.action,world)).toBeNull();
  });
});

describe("ranged mouse activation",()=>{
  it("permits deliberate nearby mouse activation behind Alden without changing facing",()=>{
    const {save,world}=fixture([station("valley-workbench",48,150)]);
    const before=JSON.stringify(save);deepFreeze(save);deepFreeze(world);
    expect(nearbyValleyInteraction(save,save.action,world)).toBeNull();
    expect(selectionInRange(save,save.action,world,{kind:"object",id:"valley-workbench"})).toBe(true);
    expect(valleyInteractionCue(save,save.action,world,true).target).toBeUndefined();
    expect(JSON.stringify(save)).toBe(before);
  });

  it("uses service-specific range and rejects unsupported selection kinds",()=>{
    const {save,world}=fixture([station("valley-workbench",53,150)]);
    expect(selectionInRange(save,save.action,world,{kind:"object",id:"valley-workbench"})).toBe(true);
    world.objects[0].position.x=53.001;
    expect(selectionInRange(save,save.action,world,{kind:"object",id:"valley-workbench"})).toBe(false);
    expect(selectionInRange(save,save.action,world,{kind:"tile",position:tile(50,150)})).toBe(false);
    expect(selectionInRange(save,save.action,world,{kind:"actor",id:0})).toBe(false);
    expect(selectionInRange(save,save.action,world,{kind:"object",id:"missing"})).toBe(false);
  });

  it("keeps resources at the authoritative strike origin rather than a large footprint centre",()=>{
    const {save,world}=fixture();
    const tree=createValleyWorld(save.valley,save.chapter).objects.find(object=>object.id==="valley-tree-0")!;
    world.objects=[{...tree,position:tile(51,150),width:8,height:8}];
    expect(selectionInRange(save,save.action,world,{kind:"object",id:tree.id})).toBe(true);
    save.action.player.x=49.349;
    expect(selectionInRange(save,save.action,world,{kind:"object",id:tree.id})).toBe(false);
  });

  it("keeps recovery and drops strictly within two metres",()=>{
    const {save,world}=fixture();
    save.chapter.grave={position:tile(51.999,150),items:[],attempts:0,retryAt:0};
    save.chapter.drops=[{id:"drop",position:tile(52,150),items:[],expiresAt:100}];
    expect(selectionInRange(save,save.action,world,{kind:"grave"})).toBe(true);
    expect(selectionInRange(save,save.action,world,{kind:"drop",id:"drop"})).toBe(false);
    expect(selectionInRange(save,save.action,world,{kind:"drop",id:"missing"})).toBe(false);
  });

  it("requires a living reachable enemy and preserves the wilderness safe boundary",()=>{
    const {save,world}=fixture(),enemy=save.action.enemies[0];
    Object.assign(save.action.player,{x:93,z:158,facingX:-1,facingZ:0});
    Object.assign(enemy,{x:94,z:158,defeated:false,health:3});save.action.enemies=[enemy];
    const selection={kind:"enemy"as const,id:enemy.id};
    expect(selectionInRange(save,save.action,world,selection)).toBe(true);
    enemy.x=94.651;expect(selectionInRange(save,save.action,world,selection)).toBe(false);
    enemy.x=94;enemy.health=0;expect(selectionInRange(save,save.action,world,selection)).toBe(false);
    enemy.health=3;enemy.defeated=true;expect(selectionInRange(save,save.action,world,selection)).toBe(false);
    enemy.defeated=false;enemy.x=88;save.action.player.x=87;
    expect(selectionInRange(save,save.action,world,selection)).toBe(false);
  });
});

describe("live world interaction cue",()=>{
  it("shares the exact nearby-action target and exposes independent player direction values",()=>{
    const {save,world}=fixture([station("valley-visitor-builder",52,150)]),before=JSON.stringify(save);
    deepFreeze(save);deepFreeze(world);
    const nearby=nearbyValleyInteraction(save,save.action,world),cue=valleyInteractionCue(save,save.action,world,true);
    expect(cue.target).toEqual({x:nearby!.x,z:nearby!.z,label:`Talk · ${nearby!.detail}`});
    expect(cue.player).toEqual({x:50,z:150,facingX:1,facingZ:0});
    cue.player.x=99;expect(JSON.stringify(save)).toBe(before);
  });

  it("falls back only to an in-reach faced strike target and excludes depleted resources",()=>{
    const {save,world}=fixture();
    const tree=createValleyWorld(save.valley,save.chapter).objects.find(object=>object.id==="valley-tree-0")!;
    world.objects=[{...tree,position:tile(51,150)}];
    expect(valleyInteractionCue(save,save.action,world,true).target).toMatchObject({x:51,z:150,label:`Chop · ${tree.name}`});
    save.chapter.resources[tree.id].available=false;expect(valleyInteractionCue(save,save.action,world,true).target).toBeUndefined();
    save.chapter.resources[tree.id].available=true;save.action.player.facingX=-1;
    expect(valleyInteractionCue(save,save.action,world,true).target).toBeUndefined();
    save.action.player.facingX=1;save.action.player.x=49;
    expect(valleyInteractionCue(save,save.action,world,true).target).toBeUndefined();
  });

  it("gives a nearby interaction priority over a simultaneously strike-ready resource",()=>{
    const {save,world}=fixture([station("valley-workbench",52,150)]);
    const tree=createValleyWorld(save.valley,save.chapter).objects.find(object=>object.id==="valley-tree-0")!;
    world.objects.push({...tree,position:tile(51,150)});
    expect(valleyInteractionCue(save,save.action,world,true).target?.label).toBe("Open · valley-workbench");
  });

  it("shows an attack cue only for a faced live foe in wilderness reach",()=>{
    const {save,world}=fixture(),enemy=save.action.enemies[0];
    Object.assign(save.action.player,{x:93,z:158,facingX:1,facingZ:0});
    Object.assign(enemy,{x:94,z:158,health:3,defeated:false});save.action.enemies=[enemy];
    expect(valleyInteractionCue(save,save.action,world,false).target).toMatchObject({x:94,z:158,label:expect.stringMatching(/^Attack · /)});
    save.action.player.facingX=-1;
    expect(valleyInteractionCue(save,save.action,world,false).target).toBeUndefined();
    save.action.player.facingX=1;enemy.defeated=true;
    expect(valleyInteractionCue(save,save.action,world,false).target).toBeUndefined();
    enemy.defeated=false;enemy.x=88;save.action.player.x=87;
    expect(valleyInteractionCue(save,save.action,world,false).target).toBeUndefined();
  });
});

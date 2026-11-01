import {describe,expect,it} from "vitest";
import {addItems,itemCount} from "../src/rpg/inventory";
import type {WorldObject} from "../src/rpg/types";
import {tile} from "../src/rpg/world";
import {COTTAGE_TICKS,FIRST_BILL,FORGE_TICKS} from "../src/valley/contracts";
import type {ValleySave} from "../src/valley/contracts";
import {VALLEY_RECIPES} from "../src/valley/content";
import {createValleySave} from "../src/valley/save";
import {applyValleyCommand,advanceSettlement} from "../src/valley/settlement";
import {createValleyWorld,homeFootprints} from "../src/valley/world";
import {hasPlanningTable,serviceDistance,serviceForObject,servicePanel,serviceSections} from "../src/valley/services";
import {nearbyValleyInteraction} from "../src/valley/interaction-feedback";

const NOW=new Date(2026,10,1,12).getTime();
const fresh=()=>createValleySave(NOW,1234567);
function object(save:ValleySave,id:string):WorldObject {
  const found=createValleyWorld(save.valley,save.chapter).objects.find(value=>value.id===id);
  expect(found,`Expected physical object ${id}`).toBeDefined();return found!;
}
function at(save:ValleySave,x:number,z:number){Object.assign(save.action.player,{x,z});}
function cottage(rotation:0|1|2|3=0):ValleySave {
  const save=fresh();save.valley.home={x:54,z:155,rotation,tentPacked:false};
  save.valley.paid=FIRST_BILL;save.valley.cottageTicks=COTTAGE_TICKS;save.valley.layoutRevision++;
  return save;
}
function freeze(value:unknown,seen=new WeakSet<object>()):void {
  if(!value||typeof value!=="object"||seen.has(value))return;
  seen.add(value);for(const child of Object.values(value))freeze(child,seen);Object.freeze(value);
}

describe("physical station service contracts",()=>{
  it.each([
    {id:"valley-workbench",kind:"workbench",station:"workbench",label:"Carpentry",recipe:"valley-plank"},
    {id:"valley-brazier",kind:"furnace",station:"furnace",label:"Smelting",recipe:"bronze-bar"},
    {id:"valley-cooking-fire",kind:"range",station:"range",label:"Cooking",recipe:"cooked-shrimp"},
  ])("grants only the matching recipe station at $id",({id,kind,station,label,recipe})=>{
    const save=fresh(),source=object(save,id),before=JSON.stringify(save),objectBefore=structuredClone(source);
    freeze(save);const context=serviceForObject(save,source)!;
    expect(context).toMatchObject({objectId:id,kind,station,range:3});
    expect(serviceSections(context)).toEqual([{panel:"craft",label}]);expect(servicePanel(context)).toBe("craft");
    const recipes=Object.values(VALLEY_RECIPES).filter(value=>value.station===context.station);
    expect(recipes.some(value=>value.id===recipe)).toBe(true);
    expect(recipes.every(value=>value.station===station)).toBe(true);
    expect(recipes.some(value=>station==="workbench"?value.id==="bronze-bar"||value.id==="cooked-shrimp":value.id==="valley-plank")).toBe(false);
    expect(JSON.stringify(save)).toBe(before);expect(source).toEqual(objectBefore);
  });

  it("gives the caravan its canonical anchor, ordinary trade, starter carpentry and account routes",()=>{
    const save=fresh(),context=serviceForObject(save,object(save,"valley-caravan"))!;
    expect(context).toMatchObject({kind:"caravan",x:74,z:140,range:3,station:"workbench"});
    expect(servicePanel(context)).toBe("trade");
    expect(serviceSections(context).map(section=>section.panel)).toEqual(["trade","craft","inventory","projects","home"]);
    const starter=Object.values(VALLEY_RECIPES).filter(recipe=>recipe.station===context.station&&!recipe.requiresCottage);
    expect(starter.map(recipe=>recipe.id).sort()).toEqual(["valley-plank","valley-stool"]);
  });

  it("allows actual starter carpentry at the caravan but rejects cottage work there",()=>{
    const starter=fresh();at(starter,74,140);expect(addItems(starter.chapter.player.inventory,"logs",1)).toBe(true);
    expect(applyValleyCommand(starter,{type:"craft",recipeId:"valley-plank",quantity:1},NOW).ok).toBe(true);
    expect(starter.valley.workQueue[0].recipeId).toBe("valley-plank");
    const advanced=cottage();at(advanced,74,140);expect(addItems(advanced.chapter.player.inventory,"valley-plank",4)).toBe(true);
    const before=JSON.stringify(advanced),result=applyValleyCommand(advanced,{type:"craft",recipeId:"valley-table",quantity:1},NOW);
    expect(result.ok).toBe(false);expect(result.message).toMatch(/station|workbench/i);expect(JSON.stringify(advanced)).toBe(before);
  });

  it.each([0,1,2,3]as const)("anchors rotated home storage/account services to real entrances (%s)",rotation=>{
    const save=cottage(rotation),fp=homeFootprints(save.valley)!;
    for(const [id,entrance]of [["valley-home-tent",fp.tentDoor],["valley-home-cottage",fp.door]]as const){
      const context=serviceForObject(save,object(save,id))!;
      expect(context).toMatchObject({kind:"home",x:entrance.x,z:entrance.z,range:3});
      expect(serviceSections(context).map(section=>section.panel)).toEqual(["home","inventory"]);
      expect(context.station).toBeUndefined();expect(servicePanel(context)).toBe("home");
    }
    const bench=serviceForObject(save,object(save,"valley-home-workbench"))!;
    expect(bench).toMatchObject({kind:"workbench",station:"workbench",x:fp.workbench.x,z:fp.workbench.z});
  });

  it("offers Rowan orders/account without turning other visitors into global workshops",()=>{
    const save=cottage();save.valley.introduced.push("merchant","smith");save.valley.layoutRevision++;
    const builder=serviceForObject(save,object(save,"valley-visitor-builder"))!;
    expect(serviceSections(builder).map(section=>section.panel)).toEqual(["visitor","projects","home"]);
    for(const visitor of ["merchant","smith"]){
      const context=serviceForObject(save,object(save,`valley-visitor-${visitor}`))!;
      expect(context.visitorId).toBe(visitor);expect(context.station).toBeUndefined();
      expect(serviceSections(context).map(section=>section.panel)).toEqual(["visitor"]);
    }
  });

  it("grants planning orders only through the physical completed-cottage table",()=>{
    const save=fresh();expect(hasPlanningTable(save)).toBe(false);
    save.valley.home={x:54,z:155,rotation:0,tentPacked:false};save.valley.paid=FIRST_BILL;
    save.valley.cottageTicks=COTTAGE_TICKS-1;save.valley.layoutRevision++;
    expect(hasPlanningTable(save)).toBe(false);
    expect(createValleyWorld(save.valley,save.chapter).objects.some(value=>value.id==="valley-home-planning-table")).toBe(false);
    save.valley.cottageTicks=COTTAGE_TICKS;save.valley.layoutRevision++;
    expect(hasPlanningTable(save)).toBe(true);
    const context=serviceForObject(save,object(save,"valley-home-planning-table"))!;
    expect(context.kind).toBe("planning");expect(context.station).toBeUndefined();
    expect(serviceSections(context)).toEqual([{panel:"projects",label:"Planning & orders"}]);
  });

  it("keeps the forge project board present before funding and after completion",()=>{
    for(const save of [fresh(),cottage()]){
      for(const complete of [false,true]){
        save.valley.forge={logs:complete?12:0,bars:complete?2:0,ticks:complete?FORGE_TICKS:0};save.valley.layoutRevision++;
        const context=serviceForObject(save,object(save,"valley-forge-site"))!;
        expect(context).toMatchObject({kind:"forge",x:70,z:178,range:5});
        expect(serviceSections(context)).toEqual([{panel:"projects",label:"Forge project"}]);
        expect(context.station).toBeUndefined();
      }
    }
  });

  it("turns actual completed forge/anvil interactions into smelting while unfinished structures remain projects",()=>{
    const save=cottage();save.valley.forge.logs=1;save.valley.layoutRevision++;
    const unfinished=serviceForObject(save,object(save,"valley-public-forge"))!;
    expect(unfinished).toMatchObject({kind:"forge",range:5});expect(unfinished.station).toBeUndefined();
    save.valley.forge={logs:12,bars:2,ticks:FORGE_TICKS};save.valley.layoutRevision++;
    for(const id of ["valley-public-forge","valley-public-anvil"]){
      const complete=serviceForObject(save,object(save,id))!;
      expect(complete).toMatchObject({kind:"furnace",station:"furnace",range:3,x:72,z:180});
      expect(serviceSections(complete)).toEqual([{panel:"craft",label:"Smelting"}]);
    }
  });

  it("does not grant a service for unknown objects or untrusted service-like metadata",()=>{
    const save=fresh(),unknown:WorldObject={id:"unknown-furnace",name:"Unknown furnace",kind:"furnace",serviceId:"valley-carpentry",position:tile(69,139),width:1,height:1,blocks:false};
    expect(serviceForObject(save,unknown)).toBeNull();expect(serviceSections(null)).toEqual([]);
    expect(serviceForObject(save,object(save,"valley-tree-0"))).toBeNull();
  });

  it.each([{id:"valley-caravan",range:3},{id:"valley-forge-site",range:5}])("matches exact service range and anchor at $id",({id,range})=>{
    for(const excess of [0,.001]){
      const save=fresh(),source=object(save,id),context=serviceForObject(save,source)!;
      at(save,context.x+range+excess,context.z);const before=JSON.stringify(save);freeze(save);
      expect(serviceDistance(save.action,context)).toBeCloseTo(range+excess,8);
      const world={...createValleyWorld(save.valley,save.chapter),objects:[source]};
      const nearby=nearbyValleyInteraction(save,save.action,world);
      if(excess===0)expect(nearby?.selection).toEqual({kind:"object",id});else expect(nearby).toBeNull();
      expect(JSON.stringify(save)).toBe(before);
    }
  });
});

describe("planning-table orders use their physical proximity",()=>{
  function commissionedCottage(){
    const save=fresh();expect(applyValleyCommand(save,{type:"place-home",x:54,z:155,rotation:0},NOW).ok).toBe(true);
    expect(addItems(save.chapter.player.inventory,"coins",75)).toBe(true);
    expect(applyValleyCommand(save,{type:"pay",amount:100},NOW).ok).toBe(true);
    advanceSettlement(save,COTTAGE_TICKS,NOW);return save;
  }
  it("delivers a real timber commission from the planning table, beyond the home door radius",()=>{
    const save=commissionedCottage(),fp=homeFootprints(save.valley)!;at(save,fp.planningTable.x,fp.planningTable.z);
    expect(Math.hypot(save.action.player.x-fp.door.x,save.action.player.z-fp.door.z)).toBeGreaterThan(3);
    expect(Math.hypot(save.action.player.x-74,save.action.player.z-140)).toBeGreaterThan(3);
    expect(addItems(save.chapter.player.inventory,"logs",8)).toBe(true);
    const before=itemCount(save.chapter.player.inventory,"coins"),result=applyValleyCommand(save,{type:"commission",id:"timber"},NOW);
    expect(result.ok,result.message).toBe(true);expect(save.valley.commissions).toContain("timber");
    expect(itemCount(save.chapter.player.inventory,"logs")).toBe(0);expect(itemCount(save.chapter.player.inventory,"coins")).toBe(before+40);
  });
  it("accepts exactly three metres from the table and rejects farther orders atomically",()=>{
    for(const excess of [0,.001]){
      const save=commissionedCottage(),fp=homeFootprints(save.valley)!;at(save,fp.planningTable.x+3+excess,fp.planningTable.z);
      expect(addItems(save.chapter.player.inventory,"logs",8)).toBe(true);const before=JSON.stringify(save);
      const result=applyValleyCommand(save,{type:"commission",id:"timber"},NOW);
      expect(result.ok).toBe(excess===0);if(excess)expect(JSON.stringify(save)).toBe(before);
    }
  });
});

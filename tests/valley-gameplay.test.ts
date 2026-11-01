import { describe,expect,it } from "vitest";
import { ITEMS } from "../src/rpg/content";
import { addItems,itemCount } from "../src/rpg/inventory";
import { calendarDate } from "../src/rpg/engine";
import { COTTAGE_TICKS,FORGE_TICKS } from "../src/valley/contracts";
import type { ValleyCommand,ValleySave } from "../src/valley/contracts";
import { registerValleyContent,VALLEY_RECIPES } from "../src/valley/content";
import { createValleySave,validateValleySave } from "../src/valley/save";
import { applyValleyCommand,advanceSettlement,ensureValleyResources } from "../src/valley/settlement";
import { createValleyWorld,homeFootprints } from "../src/valley/world";

const NOW=new Date(2026,10,1,12).getTime();
const fresh=()=>createValleySave(NOW);
function at(s:ValleySave,x:number,z:number){s.action.player.x=x;s.action.player.z=z;}
function give(s:ValleySave,id:string,n:number){expect(addItems(s.chapter.player.inventory,id,n)).toBe(true);}
const count=(s:ValleySave,id:string)=>itemCount(s.chapter.player.inventory,id);
function run(s:ValleySave,c:ValleyCommand,now=NOW){const r=applyValleyCommand(s,c,now);expect(r.ok,r.message).toBe(true);return r;}
function fail(s:ValleySave,c:ValleyCommand){const before=JSON.stringify(s),r=applyValleyCommand(s,c,NOW);expect(r.ok).toBe(false);expect(JSON.stringify(s)).toBe(before);}
function home(s:ValleySave){run(s,{type:"place-home",x:54,z:155,rotation:0});}
function cottage(s:ValleySave){home(s);give(s,"coins",100-count(s,"coins"));run(s,{type:"pay",amount:100});advanceSettlement(s,COTTAGE_TICKS,NOW);}

describe("valley conservation and cottage account",()=>{
  it("registers additive content idempotently and preserves the 25-coin start",()=>{
    const def=ITEMS["valley-stool"],old=ITEMS["logs"];registerValleyContent();registerValleyContent();
    expect(ITEMS["valley-stool"]).toBe(def);expect(ITEMS["logs"]).toBe(old);expect(count(fresh(),"coins")).toBe(25);
    expect(Object.values(VALLEY_RECIPES).every(r=>r.level===1)).toBe(true);
  });
  it("grants four welcome seeds exactly once, never charges for the tent",()=>{
    const s=fresh();home(s);expect(count(s,"valley-flower-seeds")).toBe(4);expect(count(s,"coins")).toBe(25);
    fail(s,{type:"place-home",x:54,z:155,rotation:0});expect(count(s,"valley-flower-seeds")).toBe(4);
  });
  it("rejects invalid home pads atomically",()=>{const s=fresh();fail(s,{type:"place-home",x:8,z:136,rotation:0});});
  it("takes partial payments from carried coins before bank, starts only after full payment",()=>{
    const s=fresh();home(s);s.chapter.bank=[{itemId:"coins",quantity:100}];run(s,{type:"pay",amount:40});
    expect(count(s,"coins")).toBe(0);expect(itemCount(s.chapter.bank,"coins")).toBe(85);expect(s.valley.paid).toBe(40);
    advanceSettlement(s,9000,NOW);expect(s.valley.cottageTicks).toBe(0);
    run(s,{type:"pay",amount:60});expect(itemCount(s.chapter.bank,"coins")).toBe(25);
    advanceSettlement(s,8999,NOW);expect(s.valley.cottageTicks).toBe(8999);advanceSettlement(s,1,NOW);expect(s.valley.cottageTicks).toBe(9000);
    fail(s,{type:"pay",amount:1});
  });
  it("requires an affordable exact positive payment and placed home",()=>{
    const s=fresh();fail(s,{type:"pay",amount:1});home(s);
    for(const amount of [0,-1,1.5,101,NaN])fail(s,{type:"pay",amount});fail(s,{type:"pay",amount:26});
  });
  it("each one-off commission consumes exact carried materials and pays only once",()=>{
    const s=fresh();give(s,"logs",8);run(s,{type:"commission",id:"timber"});expect(count(s,"logs")).toBe(0);expect(count(s,"coins")).toBe(65);
    give(s,"valley-stool",2);run(s,{type:"commission",id:"furniture"});give(s,"raw-shrimp",6);run(s,{type:"commission",id:"fishing"});expect(count(s,"coins")).toBe(145);
    for(const id of ["timber","furniture","fishing"])fail(s,{type:"commission",id});
  });
  it("supports recurring local-date orders without day-gating the cottage",()=>{
    const s=fresh();give(s,"logs",12);run(s,{type:"commission",id:"daily-timber"});fail(s,{type:"commission",id:"daily-timber"});
    run(s,{type:"commission",id:"daily-timber"},new Date(2026,10,2,12).getTime());expect(count(s,"logs")).toBe(4);expect(count(s,"coins")).toBe(49);
    expect(s.valley.dailyCommissions).toContain(`${calendarDate(NOW)}:daily-timber`);
  });
});

describe("saved settlement production",()=>{
  it("enables the completed personal workbench in every home rotation",()=>{
    for(const rotation of [0,1,2,3] as const){
      const s=fresh();run(s,{type:"place-home",x:54,z:155,rotation});give(s,"coins",75);run(s,{type:"pay",amount:100});
      const fp=homeFootprints(s.valley)!;at(s,fp.workbench.x,fp.workbench.z);give(s,"logs",2);
      fail(s,{type:"craft",recipeId:"valley-plank",quantity:1});advanceSettlement(s,COTTAGE_TICKS,NOW);
      run(s,{type:"craft",recipeId:"valley-plank",quantity:1});advanceSettlement(s,3,NOW);expect(count(s,"valley-plank")).toBe(2);
      const world=createValleyWorld(s.valley);expect(world.objects.find(o=>o.serviceId==="valley-workbench")?.position).toMatchObject({x:fp.workbench.x,y:fp.workbench.z});
    }
  });
  it("reserves an explicit batch, delivers after its duration and awards tenths XP once",()=>{
    const s=fresh();at(s,69,141);give(s,"logs",2);run(s,{type:"craft",recipeId:"valley-plank",quantity:2});expect(count(s,"logs")).toBe(0);expect(count(s,"valley-plank")).toBe(0);
    advanceSettlement(s,5,NOW);expect(count(s,"valley-plank")).toBe(0);advanceSettlement(s,1,NOW);expect(count(s,"valley-plank")).toBe(4);expect(s.valley.carpentryXp).toBe(200);
    run(s,{type:"craft",recipeId:"valley-stool",quantity:2});advanceSettlement(s,10,NOW);expect(count(s,"valley-stool")).toBe(2);expect(count(s,"valley-plank")).toBe(0);expect(s.valley.carpentryXp).toBe(600);
    advanceSettlement(s,100,NOW);expect(count(s,"valley-stool")).toBe(2);expect(s.valley.carpentryXp).toBe(600);
  });
  it("round-trips a reserved craft with no item or XP duplication",()=>{
    const s=fresh();at(s,69,141);give(s,"logs",2);run(s,{type:"craft",recipeId:"valley-plank",quantity:2});advanceSettlement(s,2,NOW);
    const restored=validateValleySave(JSON.parse(JSON.stringify(s)));expect(restored).not.toBeNull();advanceSettlement(restored!,4,NOW);expect(count(restored!,"valley-plank")).toBe(4);expect(restored!.valley.carpentryXp).toBe(200);
    const again=validateValleySave(JSON.parse(JSON.stringify(restored)));expect(again).not.toBeNull();advanceSettlement(again!,1,NOW);expect(count(again!,"valley-plank")).toBe(4);
  });
  it("fails crafts atomically for wrong station, ingredients, batch bounds, and active work",()=>{
    const s=fresh();give(s,"logs",1);fail(s,{type:"craft",recipeId:"valley-plank",quantity:1});at(s,69,141);
    for(const q of [0,-1,101,1.5])fail(s,{type:"craft",recipeId:"valley-plank",quantity:q});
    fail(s,{type:"craft",recipeId:"valley-plank",quantity:2});run(s,{type:"craft",recipeId:"valley-plank",quantity:1});fail(s,{type:"craft",recipeId:"valley-plank",quantity:1});
  });
  it("gates advanced furnishings until completion but not the first stool",()=>{
    const s=fresh();at(s,69,141);give(s,"valley-plank",4);fail(s,{type:"craft",recipeId:"valley-table",quantity:1});run(s,{type:"craft",recipeId:"valley-stool",quantity:1});
    expect(VALLEY_RECIPES["valley-bed"].inputs).toEqual([{itemId:"valley-plank",quantity:6},{itemId:"valley-cloth",quantity:2}]);
    expect(VALLEY_RECIPES["valley-chest"].inputs).toEqual([{itemId:"valley-plank",quantity:4},{itemId:"bronze-bar",quantity:1}]);
  });
  it("uses exact copper and tin at the existing communal brazier before forge unlock",()=>{
    const s=fresh();at(s,78,141);give(s,"copper-ore",2);give(s,"tin-ore",2);run(s,{type:"craft",recipeId:"bronze-bar",quantity:2});
    expect(s.valley.workQueue[0].remainingTicks).toBe(10);expect(count(s,"copper-ore")).toBe(0);expect(count(s,"tin-ore")).toBe(0);advanceSettlement(s,10,NOW);expect(count(s,"bronze-bar")).toBe(2);expect(s.chapter.player.skills.smithing).toBe(124);
  });
  it("cooks exact shrimp without free resources or a required random failure",()=>{
    const s=fresh(),before=count(s,"cooked-shrimp");at(s,81,141);give(s,"raw-shrimp",2);run(s,{type:"craft",recipeId:"cooked-shrimp",quantity:2});advanceSettlement(s,8,NOW);expect(count(s,"raw-shrimp")).toBe(0);expect(count(s,"cooked-shrimp")).toBe(before+2);expect(s.chapter.player.skills.cooking).toBe(600);
  });
  it("delivers finished work to connected storage if the backpack fills while working",()=>{
    const s=fresh();s.chapter.player.inventory=[{itemId:"logs",quantity:1}];at(s,69,141);run(s,{type:"craft",recipeId:"valley-plank",quantity:1});s.chapter.player.inventory=[{itemId:"logs",quantity:28}];advanceSettlement(s,3,NOW);
    expect(itemCount(s.chapter.bank,"valley-plank")).toBe(2);expect(s.valley.workQueue).toEqual([]);expect(s.valley.message).toContain("connected storage");
  });
  it("keeps an undeliverable batch reserved rather than losing resources at the quantity ceiling",()=>{
    const s=fresh();s.chapter.player.inventory=[{itemId:"logs",quantity:1}];at(s,69,141);run(s,{type:"craft",recipeId:"valley-plank",quantity:1});s.chapter.player.inventory=[{itemId:"logs",quantity:28}];s.chapter.bank=[{itemId:"valley-plank",quantity:2_000_000_000}];advanceSettlement(s,3,NOW);
    expect(s.valley.workQueue).toHaveLength(1);expect(s.valley.carpentryXp).toBe(0);s.chapter.bank=[];advanceSettlement(s,1,NOW);expect(itemCount(s.chapter.bank,"valley-plank")).toBe(2);
  });
});

describe("home storage, decoration and public development",()=>{
  it("requires actual nearby caravan trading and preserves resources on failed transfers",()=>{
    const s=fresh();give(s,"logs",2);fail(s,{type:"sell",itemId:"logs",quantity:1});at(s,74,142);
    run(s,{type:"sell",itemId:"logs",quantity:2});expect(count(s,"coins")).toBe(29);run(s,{type:"buy",itemId:"valley-cloth",quantity:2});expect(count(s,"valley-cloth")).toBe(2);expect(count(s,"coins")).toBe(13);
    fail(s,{type:"buy",itemId:"valley-cloth",quantity:2});fail(s,{type:"buy",itemId:"coins",quantity:1});
    run(s,{type:"store",itemId:"valley-cloth",quantity:2});expect(itemCount(s.chapter.bank,"valley-cloth")).toBe(2);run(s,{type:"withdraw",itemId:"valley-cloth",quantity:1});expect(count(s,"valley-cloth")).toBe(1);
    fail(s,{type:"withdraw",itemId:"valley-cloth",quantity:2});at(s,40,170);fail(s,{type:"store",itemId:"coins",quantity:1});
  });
  it("shares tent and cottage storage with the original connected bank",()=>{
    const s=fresh();home(s);give(s,"logs",1);at(s,55,160);run(s,{type:"store",itemId:"logs",quantity:1});expect(itemCount(s.chapter.bank,"logs")).toBe(1);
    s.valley.paid=100;s.valley.cottageTicks=COTTAGE_TICKS;run(s,{type:"pack-tent"});at(s,61,161);run(s,{type:"withdraw",itemId:"logs",quantity:1});expect(count(s,"logs")).toBe(1);
  });
  it("places a carried stool once and moves the same furnishing without another item",()=>{
    const s=fresh();home(s);give(s,"valley-stool",1);at(s,58,168);run(s,{type:"place-furniture",itemId:"stool",x:58,z:168,rotation:0});expect(count(s,"valley-stool")).toBe(0);
    const id=s.valley.furniture[0].id;run(s,{type:"move-furniture",id,x:59,z:168,rotation:1});expect(s.valley.furniture).toHaveLength(1);expect(s.valley.furniture[0].id).toBe(id);expect(count(s,"valley-stool")).toBe(0);
    fail(s,{type:"place-furniture",itemId:"stool",x:60,z:168,rotation:0});
  });
  it("consumes seeds and seedlings and never awards XP for planting or paths",()=>{
    const s=fresh();home(s);at(s,58,168);give(s,"valley-sapling",1);const xp=structuredClone(s.chapter.player.skills);
    run(s,{type:"plant",kind:"flowers",x:58,z:168});run(s,{type:"plant",kind:"sapling",x:59,z:168});expect(count(s,"valley-flower-seeds")).toBe(3);expect(count(s,"valley-sapling")).toBe(0);expect(s.valley.plants).toHaveLength(2);
    run(s,{type:"terrain",x:60,z:168,operation:"path"});run(s,{type:"undo-terrain"});expect(s.valley.ground["60,168"]).toBeUndefined();expect(s.chapter.player.skills).toEqual(xp);expect(s.valley.carpentryXp).toBe(0);
    fail(s,{type:"terrain",x:60,z:168,operation:"raise"});fail(s,{type:"plant",kind:"flowers",x:58,z:168});
  });
  it("gives daily help exactly once per date and banks the whole parcel if the bag is full",()=>{
    const s=fresh();s.chapter.player.inventory=[{itemId:"logs",quantity:28}];run(s,{type:"daily-help"});expect(count(s,"logs")).toBe(28);expect(itemCount(s.chapter.bank,"logs")).toBe(4);fail(s,{type:"daily-help"});
    run(s,{type:"daily-help"},new Date(2026,10,2,12).getTime());expect(itemCount(s.chapter.bank,"logs")).toBe(8);expect(s.valley.cottageTicks).toBe(0);
    fail(s,{type:"daily-help"});
  });
  it("requires complete cottage, actual carried materials and exact optional forge build time",()=>{
    const s=fresh();at(s,70,178);give(s,"logs",12);give(s,"bronze-bar",2);fail(s,{type:"forge-deliver",itemId:"logs",quantity:12});s.chapter.player.inventory=[];at(s,52,141);cottage(s);at(s,70,178);s.chapter.bank.push({itemId:"logs",quantity:12});fail(s,{type:"forge-deliver",itemId:"logs",quantity:12});
    give(s,"logs",12);give(s,"bronze-bar",2);run(s,{type:"forge-deliver",itemId:"logs",quantity:12});advanceSettlement(s,1800,NOW);expect(s.valley.forge.ticks).toBe(0);
    run(s,{type:"forge-deliver",itemId:"bronze-bar",quantity:2});advanceSettlement(s,1799,NOW);expect(s.valley.forge.ticks).toBe(1799);advanceSettlement(s,1,NOW);expect(s.valley.forge.ticks).toBe(FORGE_TICKS);fail(s,{type:"forge-deliver",itemId:"logs",quantity:1});
    at(s,78,141);give(s,"copper-ore",1);give(s,"tin-ore",1);run(s,{type:"craft",recipeId:"bronze-bar",quantity:1});expect(s.valley.workQueue[0].remainingTicks).toBe(4);
  });
  it("does not change construction time when selling, gifting or delivering commissions",()=>{
    const s=fresh();home(s);give(s,"coins",75);run(s,{type:"pay",amount:100});give(s,"logs",8);run(s,{type:"commission",id:"timber"});run(s,{type:"daily-help"});expect(s.valley.cottageTicks).toBe(0);advanceSettlement(s,100,NOW);expect(s.valley.cottageTicks).toBe(100);
  });
});

describe("settlement-only clock",()=>{
  it("lifts owned vegetation without creating items or XP, including full-bag storage fallback",()=>{
    const s=fresh();home(s);at(s,58,168);run(s,{type:"plant",kind:"flowers",x:58,z:168});
    const id=s.valley.plants[0].id,xp=s.valley.carpentryXp;at(s,20,145);fail(s,{type:"lift-plant",id});at(s,58,168);
    run(s,{type:"lift-plant",id});expect(count(s,"valley-flower-seeds")).toBe(4);expect(s.valley.plants).toEqual([]);expect(s.valley.carpentryXp).toBe(xp);fail(s,{type:"lift-plant",id});
    run(s,{type:"plant",kind:"flowers",x:58,z:168});s.chapter.player.inventory=[{itemId:"logs",quantity:28}];run(s,{type:"lift-plant",id:s.valley.plants[0].id});expect(itemCount(s.chapter.bank,"valley-flower-seeds")).toBe(1);expect(s.valley.carpentryXp).toBe(xp);
  });
  it("initializes new resource flags once and refreshes depleted nodes by settlement tick",()=>{
    const s=fresh();ensureValleyResources(s);const nodes=createValleyWorld(s.valley).objects.filter(o=>o.id.startsWith("valley-")&&o.resourceId);expect(nodes).toHaveLength(19);
    const id=nodes[0].id;s.chapter.resources[id]={objectId:id,available:false,respawnAt:s.chapter.tick+3};ensureValleyResources(s);expect(s.chapter.resources[id].available).toBe(false);advanceSettlement(s,3,NOW);expect(s.chapter.resources[id].available).toBe(true);
  });
  it("never advances action, combat, actor movement, control, health, or original quests",()=>{
    const s=fresh(),action=JSON.stringify(s.action),player=JSON.stringify(s.chapter.player),enemies=JSON.stringify(s.chapter.enemies),quests=JSON.stringify(s.chapter.quests),control=JSON.stringify(s.chapter.control);
    advanceSettlement(s,36000,NOW);expect(JSON.stringify(s.action)).toBe(action);expect(JSON.stringify(s.chapter.player)).toBe(player);expect(JSON.stringify(s.chapter.enemies)).toBe(enemies);expect(JSON.stringify(s.chapter.quests)).toBe(quests);expect(JSON.stringify(s.chapter.control)).toBe(control);expect(s.chapter.tick).toBe(36000);
  });
  it("rejects invalid tick batches before any mutation",()=>{
    const s=fresh(),before=JSON.stringify(s);for(const ticks of [-1,1.2,36001,NaN,Infinity])expect(()=>advanceSettlement(s,ticks,NOW)).toThrow();expect(JSON.stringify(s)).toBe(before);
  });
});

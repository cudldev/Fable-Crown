import {describe,expect,it} from "vitest";
import {itemCount} from "../src/rpg/inventory";
import {ITEMS} from "../src/rpg/content";
import {COTTAGE_TICKS,FIRST_BILL,FORGE_TICKS} from "../src/valley/contracts";
import type {ValleySave,ValleyService} from "../src/valley/contracts";
import {VALLEY_RECIPES} from "../src/valley/content";
import {createValleySave} from "../src/valley/save";
import {applyValleyCommand,advanceSettlement} from "../src/valley/settlement";
import {createValleyWorld} from "../src/valley/world";
import {serviceForObject} from "../src/valley/services";
import {craftedReceipt,craftingQuantity,craftingTicks,craftingView,recipesForService} from "../src/valley/crafting-view";

const NOW=new Date(2026,10,1,12).getTime();
function fixture(id="valley-workbench"){
  const save=createValleySave(NOW),world=createValleyWorld(save.valley,save.chapter);
  const service=serviceForObject(save,world.objects.find(object=>object.id===id)!)!;
  Object.assign(save.action.player,{x:service.x,z:service.z});return {save,service};
}
function complete(save:ValleySave){save.valley.home={x:54,z:155,rotation:0,tentPacked:false};save.valley.paid=FIRST_BILL;save.valley.cottageTicks=COTTAGE_TICKS;}

describe("crafting presentation uses authoritative constraints",()=>{
  it.each([
    {id:"valley-workbench",station:"workbench",includes:"valley-bed",excludes:"bronze-bar"},
    {id:"valley-brazier",station:"furnace",includes:"bronze-bar",excludes:"valley-bed"},
    {id:"valley-cooking-fire",station:"range",includes:"cooked-shrimp",excludes:"bronze-bar"},
  ])("filters exact physical station recipes at $id",({id,station,includes,excludes})=>{
    const {service}=fixture(id),recipes=recipesForService(service);
    expect(recipes.some(recipe=>recipe.id===includes)).toBe(true);expect(recipes.some(recipe=>recipe.id===excludes)).toBe(false);
    expect(recipes.every(recipe=>recipe.station===station)).toBe(true);
  });
  it("retains caravan starter restrictions and grants no recipes to conversation contexts",()=>{
    const {service}=fixture("valley-caravan");expect(recipesForService(service)).toEqual([]);
    expect(recipesForService({...service,station:"workbench"}).map(recipe=>recipe.id).sort()).toEqual(["valley-plank","valley-stool"]);
    expect(recipesForService({...service,kind:"visitor"})).toEqual([]);
    expect(recipesForService({...service,kind:"planning",station:undefined})).toEqual([]);
  });
  it("bounds batch requests to safe integral quantities",()=>{
    expect([NaN,Infinity,-4,0,1,2.9,100,999].map(craftingQuantity)).toEqual([1,1,1,1,1,2,100,100]);
  });
  it("counts carried ingredients only and reports missing amounts without reading bank supplies",()=>{
    const {save,service}=fixture();save.chapter.player.inventory=[];save.chapter.bank=[{itemId:"logs",quantity:50}];
    const before=JSON.stringify(save),view=craftingView(save,service,VALLEY_RECIPES["valley-plank"],3);
    expect(view.canCraft).toBe(false);expect(view.reason).toBe(`Need 3 more ${ITEMS.logs.name.toLowerCase()}.`);
    expect(view.materials).toEqual([{itemId:"logs",name:ITEMS.logs.name,have:0,need:3}]);
    expect(JSON.stringify(save)).toBe(before);
  });
  it("matches actual batch ingredients, output, elapsed seconds and XP tenths",()=>{
    const {save,service}=fixture();save.chapter.player.inventory=[{itemId:"logs",quantity:2}];
    const view=craftingView(save,service,VALLEY_RECIPES["valley-plank"],2);
    expect(view).toMatchObject({canCraft:true,quantity:2,outputQuantity:4,xp:20});expect(view.seconds).toBeCloseTo(3.6);
    expect(view.materials[0]).toMatchObject({have:2,need:2});
    const result=applyValleyCommand(save,{type:"craft",recipeId:"valley-plank",quantity:view.quantity},NOW);
    expect(result.ok,result.message).toBe(true);expect(save.valley.workQueue[0].remainingTicks).toBe(6);
    expect(itemCount(save.chapter.player.inventory,"logs")).toBe(0);
  });
  it("shows cottage and level requirements before enabling the single craft action",()=>{
    const {save,service}=fixture();save.chapter.player.inventory=[{itemId:"valley-plank",quantity:4}];
    expect(craftingView(save,service,VALLEY_RECIPES["valley-table"],1).reason).toMatch(/cottage/i);
    complete(save);expect(craftingView(save,service,VALLEY_RECIPES["valley-table"],1).canCraft).toBe(true);
    const advanced={...VALLEY_RECIPES["valley-plank"],level:2};save.valley.carpentryXp=0;
    expect(craftingView(save,service,advanced,1).reason).toBe("Carpentry level 2 required.");
  });
  it("rejects a different station or movement outside its exact range",()=>{
    const {save,service}=fixture();save.chapter.player.inventory=[{itemId:"copper-ore",quantity:1},{itemId:"tin-ore",quantity:1}];
    expect(craftingView(save,service,VALLEY_RECIPES["bronze-bar"],1).canCraft).toBe(false);
    save.chapter.player.inventory=[{itemId:"logs",quantity:1}];save.action.player.x=service.x+service.range;
    expect(craftingView(save,service,VALLEY_RECIPES["valley-plank"],1).canCraft).toBe(true);
    save.action.player.x+=.001;expect(craftingView(save,service,VALLEY_RECIPES["valley-plank"],1).reason).toMatch(/Move closer/);
  });
  it("accounts for input slots being consumed before checking finished output space",()=>{
    for(const otherSlots of [26,27]){
      const {save,service}=fixture();save.chapter.player.inventory=[{itemId:"logs",quantity:1},{itemId:"cooked-shrimp",quantity:otherSlots}];
      const before=JSON.stringify(save),view=craftingView(save,service,VALLEY_RECIPES["valley-plank"],1);
      expect(view.canCraft).toBe(otherSlots===26);if(otherSlots===27)expect(view.reason).toMatch(/room.*backpack/i);
      expect(JSON.stringify(save)).toBe(before);
      expect(applyValleyCommand(save,{type:"craft",recipeId:"valley-plank",quantity:1},NOW).ok).toBe(view.canCraft);
    }
  });
  it("disables another batch while a job is queued and guards storage integer overflow",()=>{
    const {save,service}=fixture();save.chapter.player.inventory=[{itemId:"logs",quantity:1}];
    save.valley.workQueue=[{recipeId:"valley-stool",quantity:1,remainingTicks:5}];
    expect(craftingView(save,service,VALLEY_RECIPES["valley-plank"],1).reason).toMatch(/already being made/);
    save.valley.workQueue=[];save.chapter.bank=[{itemId:"valley-plank",quantity:2_000_000_000}];
    expect(craftingView(save,service,VALLEY_RECIPES["valley-plank"],1).reason).toMatch(/connected storage/);
    expect(applyValleyCommand(save,{type:"craft",recipeId:"valley-plank",quantity:1},NOW).ok).toBe(false);
  });
  it("uses the completed forge's actual four-tick bronze duration",()=>{
    const {save,service}=fixture("valley-brazier");save.chapter.player.inventory=[{itemId:"copper-ore",quantity:1},{itemId:"tin-ore",quantity:1}];
    expect(craftingTicks(save,VALLEY_RECIPES["bronze-bar"])).toBe(5);
    complete(save);save.valley.forge={logs:12,bars:2,ticks:FORGE_TICKS};
    const view=craftingView(save,service,VALLEY_RECIPES["bronze-bar"],1);expect(view.seconds).toBe(2.4);
    expect(applyValleyCommand(save,{type:"craft",recipeId:"bronze-bar",quantity:1},NOW).ok).toBe(true);
    expect(save.valley.workQueue[0].remainingTicks).toBe(4);
  });
  it.each([false,true])("reports completed background output only with actual item evidence (storage=%s)",storage=>{
    const {save}=fixture();save.chapter.player.inventory=[{itemId:"logs",quantity:2}];
    expect(applyValleyCommand(save,{type:"craft",recipeId:"valley-plank",quantity:2},NOW).ok).toBe(true);
    const previous={recipeId:"valley-plank",quantity:2,ownedBefore:0};
    advanceSettlement(save,2,NOW);expect(craftedReceipt(previous,save)).toBe("");
    if(storage)save.chapter.player.inventory=[{itemId:"cooked-shrimp",quantity:28}];
    advanceSettlement(save,4,NOW);expect(save.valley.workQueue).toHaveLength(0);
    expect(craftedReceipt(previous,save)).toBe("+4 Sawn plank · Backpack or storage");
    expect(itemCount(storage?save.chapter.bank:save.chapter.player.inventory,"valley-plank")).toBe(4);
    expect(save.valley.carpentryXp).toBe(200);
  });
  it("does not invent completion gains from a storage transfer or an empty queue",()=>{
    const {save}=fixture();save.chapter.player.inventory=[{itemId:"valley-plank",quantity:2}];save.chapter.bank=[{itemId:"valley-plank",quantity:2}];
    expect(craftedReceipt({recipeId:"valley-plank",quantity:2,ownedBefore:4},save)).toBe("");
  });
});

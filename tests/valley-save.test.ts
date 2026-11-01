import {describe,it,expect} from "vitest";
import {createValleySave,validateValleySave} from "../src/valley/save";
import {createRpg} from "../src/rpg/engine";
import {addItems} from "../src/rpg/inventory";
import {createValleyWorld} from "../src/valley/world";
import {applyActionEvents} from "../src/action/rpg-adapter";
describe("additive valley chapter",()=>{
  const now=Date.UTC(2026,10,1,8);
  it("persists actual valley gathering effects without weakening unknown target validation",()=>{
    const save=createValleySave(now,2),world=createValleyWorld(save.valley);
    for(const resource of ["tree","copper","shrimp"]){
      const object=world.objects.find(o=>o.id.startsWith("valley-")&&o.resourceId===resource)!;
      for(let attempt=0;attempt<20&&!save.chapter.effects.some(e=>e.targetId===object.id);attempt++)
        applyActionEvents(save.chapter,save.action,[{kind:"resource-hit",targetId:object.id}],world);
      expect(save.chapter.effects.some(e=>e.targetId===object.id)).toBe(true);
      expect(validateValleySave(JSON.parse(JSON.stringify(save)))).toEqual(save);
    }
    save.chapter.effects.at(-1)!.targetId="valley-made-up-target";expect(validateValleySave(save)).toBeNull();
  });
  it("roundtrips continuous state and the relocated beginner encounter",()=>{
    const save=createValleySave(now);save.action.player.x+=.125;save.chapter.player.position.x=52;
    expect(validateValleySave(JSON.parse(JSON.stringify(save)))).toEqual(save);
  });
  it("copies belongings,gear,experience and completed quest history without modifying V5",()=>{
    const old=createRpg(now,42);addItems(old.bank,"logs",12,Infinity);old.quests.forge.complete=true;old.quests.forge.accepted=true;old.quests.forge.stageId="complete";
    const before=JSON.stringify(old),save=createValleySave(now,old.seed,old);
    expect(JSON.stringify(old)).toBe(before);expect(save.chapter.bank).toEqual(old.bank);
    expect(save.chapter.player.equipment).toEqual(old.player.equipment);expect(save.chapter.player.skills).toEqual(old.player.skills);
    expect(save.action.player.x).toBe(52);expect(save.action.player.z).toBe(141);
    expect(save.chapter.quests.forge.complete).toBe(true);expect(save.valley.paid).toBe(0);
    expect(validateValleySave(JSON.parse(JSON.stringify(save)))).not.toBeNull();
  });
  it("preserves new resource states alongside the original world",()=>{
    const save=createValleySave(now),world=createValleyWorld(save.valley);
    for(const object of world.objects.filter(object=>object.resourceId))save.chapter.resources[object.id]??={objectId:object.id,available:true,respawnAt:0};
    save.chapter.resources["valley-tree-0"].available=false;save.chapter.resources["valley-tree-0"].respawnAt=10;
    expect(validateValleySave(JSON.parse(JSON.stringify(save)))?.chapter.resources["valley-tree-0"].available).toBe(false);
  });
  it("rejects corrupt finances,guard and terrain without mutating the input",()=>{
    const patches:((s:ReturnType<typeof createValleySave>)=>void)[]=[s=>{s.valley.paid=101;},s=>{s.action.player.guard=NaN;},s=>{s.valley.ground["52,150"]={level:2 as 1,path:false};}];
    for(const patch of patches){
      const save=createValleySave(now);patch(save);const before=structuredClone(save);
      expect(validateValleySave(save)).toBeNull();expect(save).toEqual(before);
    }
  });
});

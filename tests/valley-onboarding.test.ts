import { describe,expect,it } from "vitest";
import { createValleySave } from "../src/valley/save";
import { applyValleyCommand,advanceSettlement } from "../src/valley/settlement";
import { getOnboarding,getVisitors } from "../src/valley/onboarding";
import { COTTAGE_TICKS } from "../src/valley/contracts";
const NOW=new Date(2026,10,1,12).getTime();
describe("state-grounded three-part onboarding and visitors",()=>{
  it("uses actual progress rather than a mandatory calendar gate",()=>{
    const s=createValleySave(NOW);expect(getOnboarding(s,NOW+30*86400000).day).toBe(1);expect(getOnboarding(s,NOW).steps.every(x=>!x.complete)).toBe(true);
    s.valley.home={x:54,z:155,rotation:0,tentPacked:false};s.valley.paid=100;expect(getOnboarding(s,NOW).day).toBe(2);expect(getOnboarding(s,NOW).help).toContain("quarter speed");
    s.valley.cottageTicks=COTTAGE_TICKS;expect(getOnboarding(s,NOW).day).toBe(2);s.valley.furniture.push({id:"test",itemId:"stool",x:58,z:168,rotation:0});s.valley.flags.push("talked-merchant");expect(getOnboarding(s,NOW).day).toBe(3);expect(getOnboarding(s,NOW).steps.find(x=>x.id==="project")?.complete).toBe(false);
  });
  it("does not invent crafted furniture or visitor conversations",()=>{
    const s=createValleySave(NOW);s.valley.paid=100;expect(getOnboarding(s,NOW).steps.find(x=>x.id==="stool")?.complete).toBe(false);s.valley.flags.push("crafted-stool");expect(getOnboarding(s,NOW).steps.find(x=>x.id==="stool")?.complete).toBe(true);
    s.valley.cottageTicks=COTTAGE_TICKS;expect(getOnboarding(s,NOW).steps.find(x=>x.id==="visitors")?.complete).toBe(false);s.valley.flags.push("talked-merchant","talked-smith");expect(getOnboarding(s,NOW).steps.find(x=>x.id==="visitors")?.complete).toBe(true);
  });
  it("always offers Rowan and unlocks merchant and smith through cottage progress",()=>{
    const s=createValleySave(NOW);expect(getVisitors(s,NOW+864000000).map(x=>x.id)).toEqual(["builder"]);s.valley.home={x:54,z:155,rotation:0,tentPacked:false};s.valley.paid=100;
    const revision=s.valley.layoutRevision;advanceSettlement(s,COTTAGE_TICKS,NOW);expect(getVisitors(s,NOW).map(x=>x.id)).toEqual(["builder","merchant","smith"]);expect(s.valley.introduced).toEqual(["builder","merchant","smith"]);expect(s.valley.layoutRevision).toBeGreaterThan(revision);
    const after=s.valley.layoutRevision;advanceSettlement(s,1,NOW);expect(s.valley.layoutRevision).toBe(after);
  });
  it("tracks actual nearby conversation and gives grounded construction dialogue",()=>{
    const s=createValleySave(NOW);const r=applyValleyCommand(s,{type:"talk-visitor",id:"builder"},NOW);expect(r.ok).toBe(true);expect(r.message).toContain("free tent");expect(s.valley.flags).toContain("talked-builder");
    const before=JSON.stringify(s);expect(applyValleyCommand(s,{type:"talk-visitor",id:"smith"},NOW).ok).toBe(false);expect(JSON.stringify(s)).toBe(before);
    s.valley.home={x:54,z:155,rotation:0,tentPacked:false};s.valley.paid=50;expect(getVisitors(s,NOW)[0].dialogue).toContain("50/100");s.valley.paid=100;expect(getVisitors(s,NOW)[0].dialogue).toContain("under construction");
  });
  it("keys daily offers by local date and preserves all other available commissions",()=>{
    const s=createValleySave(NOW);s.chapter.player.inventory.push({itemId:"logs",quantity:4});expect(applyValleyCommand(s,{type:"commission",id:"daily-timber"},NOW).ok).toBe(true);
    expect(getVisitors(s,NOW)[0].offers.some(o=>o.id==="daily-timber")).toBe(false);expect(getVisitors(s,NOW+86400000)[0].offers.some(o=>o.id==="daily-timber")).toBe(true);expect(getVisitors(s,NOW)[0].offers.some(o=>o.id==="timber")).toBe(true);
  });
  it("reads guidance without mutating saves, includes supply prices, and accepts short pinned goals",()=>{
    const s=createValleySave(NOW);s.valley.cottageTicks=COTTAGE_TICKS;const before=JSON.stringify(s);getOnboarding(s,NOW);const pella=getVisitors(s,NOW).find(x=>x.id==="merchant")!;expect(pella.stock.find(x=>x.itemId==="valley-cloth")?.buy).toBe(8);expect(JSON.stringify(s)).toBe(before);
    expect(applyValleyCommand(s,{type:"pin-goal",goal:"Make a stool"},NOW).ok).toBe(true);expect(s.valley.goal).toBe("Make a stool");const after=JSON.stringify(s);expect(applyValleyCommand(s,{type:"pin-goal",goal:""},NOW).ok).toBe(false);expect(JSON.stringify(s)).toBe(after);
  });
});

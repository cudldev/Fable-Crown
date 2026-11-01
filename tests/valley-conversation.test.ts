import {describe,expect,it} from "vitest";
import {calendarDate} from "../src/rpg/engine";
import {COTTAGE_TICKS,FIRST_BILL} from "../src/valley/contracts";
import {conversationTurn} from "../src/valley/conversation";
import {createValleySave} from "../src/valley/save";
const NOW=new Date(2026,10,1,12).getTime();
describe("conversation turn contracts",()=>{
  it("separates NPC speech from player replies and ends terminal dialogue",()=>{
    const s=createValleySave(NOW),before=JSON.stringify(s);
    expect(conversationTurn(s,"builder","greeting",NOW)).toMatchObject({next:"topics"});
    const topics=conversationTurn(s,"builder","topics",NOW);expect("replies"in topics).toBe(true);
    if("replies"in topics){expect(topics.replies).toHaveLength(3);expect(topics.replies.map(r=>r.label).join(" ")).not.toMatch(/Leave|Back/);}
    expect(conversationTurn(s,"builder","farewell",NOW)).toMatchObject({next:"end"});expect(JSON.stringify(s)).toBe(before);
  });
  it("does not offer a payment before a tent or after full payment",()=>{
    const s=createValleySave(NOW);
    expect(conversationTurn(s,"builder","account",NOW)).toMatchObject({next:"end"});
    s.valley.home={x:32,z:154,rotation:0,tentPacked:false};s.valley.paid=25;
    expect(conversationTurn(s,"builder","account",NOW)).toEqual({line:expect.stringContaining("25 of 100"),next:"payment"});
    const reply=conversationTurn(s,"builder","payment",NOW);if("replies"in reply)expect(reply.replies[0].panel).toBe("home");
    s.valley.paid=FIRST_BILL;expect(conversationTurn(s,"builder","account",NOW)).toEqual({line:expect.stringContaining("builders"),next:"end"});
    s.valley.cottageTicks=COTTAGE_TICKS;expect(conversationTurn(s,"builder","account",NOW)).toEqual({line:expect.stringContaining("ready"),next:"end"});
  });
  it("offers the daily parcel only until its actual date is claimed",()=>{
    const s=createValleySave(NOW),work=conversationTurn(s,"builder","work",NOW);
    expect("replies"in work&&work.replies.some(r=>r.command?.type==="daily-help")).toBe(true);
    s.valley.dailyHelp.push(calendarDate(NOW));const claimed=conversationTurn(s,"builder","work",NOW);
    expect("replies"in claimed&&claimed.replies.every(r=>!r.command)).toBe(true);
  });
  it.each(["merchant","smith"])("limits %s topics to their own services",id=>{
    const s=createValleySave(NOW),turn=conversationTurn(s,id,"topics",NOW);
    expect("replies"in turn&&turn.replies.some(r=>r.panel==="home"||r.panel==="craft"||r.panel==="inventory")).toBe(false);
    if("replies"in turn)expect(turn.replies.some(r=>r.panel==="trade")).toBe(id==="merchant");
  });
  it("retains authoritative command failure text without advancing another transaction",()=>{
    const s=createValleySave(NOW);expect(conversationTurn(s,"builder","response",NOW,"Make room for the timber parcel.")).toEqual({line:"Make room for the timber parcel.",next:"end"});
  });
});

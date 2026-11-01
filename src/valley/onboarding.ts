import { calendarDate } from "../rpg/engine";
import { itemCount } from "../rpg/inventory";
import { COTTAGE_TICKS, FIRST_BILL, FORGE_TICKS } from "./contracts";
import type { ValleySave } from "./contracts";
import { VALLEY_COMMISSIONS, VALLEY_STOCK, visitorStock } from "./content";

export const VALLEY_DIRECTIONS = [
  {id:"furnish",label:"Furnish my home",goal:"Craft and place another furnishing in my valley"},
  {id:"garden",label:"Shape my garden",goal:"Lay a path, shape a terrace and plant my garden"},
  {id:"produce",label:"Produce goods",goal:"Make goods and fulfil a supply commission"},
  {id:"forge",label:"Build the optional forge",goal:"Contribute logs and bronze bars to the optional public forge"},
  {id:"wilderness",label:"Explore the wilderness",goal:"Prepare food and equipment, then explore beyond the safe valley"},
] as const;
export const FUTURE_GRANTS = [
  {id:"residence",title:"Larger residence",benefit:"More indoor room for furnishings and personal workshops."},
  {id:"land",title:"Adjacent land grant",benefit:"More building space for gardens and shared settlement projects."},
  {id:"residents",title:"Resident cottages",benefit:"Homes for permanent neighbours as the settlement grows."},
] as const;

export interface ValleyVisitor { id:string; name:string; role:string; x:number; z:number; dialogue:string; stock:typeof VALLEY_STOCK; offers:typeof VALLEY_COMMISSIONS }
export function getVisitors(save:ValleySave,now:number):ValleyVisitor[] {
  const v=save.valley,complete=v.cottageTicks>=COTTAGE_TICKS,date=calendarDate(now);
  const latestDate=v.dailyCommissions.map(key=>key.slice(0,10)).sort().at(-1);
  const offers=VALLEY_COMMISSIONS.filter(c=>(!c.requiresCottage||complete)&&!(c.daily?(v.dailyCommissions.includes(`${date}:${c.id}`)||(latestDate!==undefined&&date<latestDate)):v.commissions.includes(c.id)));
  return [
    {id:"builder",name:"Rowan",role:"Builder",x:51,z:141,
      dialogue:!v.home?"The king grants you this safe valley. Choose a clear place for your free tent; we reserve room for your cottage beside it. Pay the 100-coin royal account at your own pace. The marked trails beyond the valley lead to optional wilderness.":v.paid<FIRST_BILL?`Your cottage account is ${v.paid}/100 coins. Small payments are welcome; work starts at 100.`:!complete?"The cottage is under construction. Chores cannot hurry the build; explore or make yourself at home.":"Your cottage is ready. You can furnish it, shape terraces, or choose an optional public forge.",stock:[],offers},
    ...(complete?[{id:"merchant",name:"Pella",role:"Merchant",x:75,z:142,dialogue:"A finished home brings a regular visitor. The caravan still buys useful supplies; my two decoration slots rotate each local day, and today's small orders are available.",stock:visitorStock(now).filter(s=>!s.requiresCottage||complete).map(s=>({...s})),offers},
      {id:"smith",name:"Garrick",role:"Smith",x:76,z:178,dialogue:v.forge.ticks>=FORGE_TICKS?"The public forge is ready. Bronze smelting now takes four settlement ticks instead of five. I also pay for fresh bronze supplies each day.":"The public forge is optional. Bring twelve logs and two bronze bars to its site; the communal brazier can already smelt those bars. I also pay for fresh bronze supplies each day.",stock:[],offers:offers.filter(o=>o.id==="daily-smith")}]:[]),
  ].map(visitor=>({...visitor,...v.visitorPositions?.[visitor.id as "builder"|"merchant"|"smith"]}));
}
export interface Onboarding {day:1|2|3;title:string;body:string;help?:string;steps:{id:string;label:string;complete:boolean}[];nextGoal:string}
export function getOnboarding(save:ValleySave,_now:number):Onboarding {
  const v=save.valley;
  if(v.cottageTicks>=COTTAGE_TICKS&&v.furniture.length>0&&v.flags.includes("talked-merchant")) {
    const steps=[{id:"cottage",label:"Make the cottage your home",complete:true},
      {id:"furnish",label:"Place a handmade furnishing",complete:v.furniture.length>0},
      {id:"visitors",label:"Meet Pella and Garrick",complete:v.flags.includes("talked-merchant")&&v.flags.includes("talked-smith")},
      {id:"project",label:"Optional: build the public forge",complete:v.forge.ticks>=FORGE_TICKS}];
    return {day:3,title:"A home in the valley",body:"Furnish your home and choose your next project. The forge and wilderness are optional.",steps,nextGoal:steps.find(s=>!s.complete)?.label??"Enjoy your valley"};
  }
  if(v.cottageTicks>=COTTAGE_TICKS) {
    const steps=[{id:"cottage",label:"Make the cottage your home",complete:true},
      {id:"furnish",label:"Place a handmade furnishing",complete:v.furniture.length>0},
      {id:"visitors",label:"Meet Pella at the caravan",complete:v.flags.includes("talked-merchant")}];
    return {day:2,title:"Make yourself at home",body:"Your cottage is ready. Place a furnishing, meet Pella, and try the cottage planning table when you feel ready.",help:"Optional garden: use Ground & garden to raise one terrace, add matching steps, and plant flowers. Preview and undo keep your entrances and the pond safe.",steps,nextGoal:steps.find(s=>!s.complete)?.label??"Choose your next valley project"};
  }
  if(v.paid>=FIRST_BILL) return {day:2,title:"While your cottage grows",body:"Rowan is building your cottage. Explore, gather, or make a first stool while you wait.",help:"Construction takes 90 active minutes. Away time advances it at one quarter speed, for up to 24 hours. Gathering and chores never speed it up.",
    steps:[{id:"bill",label:"Pay the 100-coin account",complete:true},{id:"stool",label:"Make your first stool",complete:v.flags.includes("crafted-stool")||itemCount(save.chapter.player.inventory,"valley-stool")>0},
      {id:"cottage",label:"Let Rowan complete the cottage",complete:false}],nextGoal:v.flags.includes("crafted-stool")?"Explore, gather, or wait for your cottage":"Saw planks and make a stool at the communal workbench"};
  const steps=[{id:"tent",label:"Choose a clear place for your free tent",complete:!!v.home},
    {id:"timber",label:"Select a valley tree to walk over and gather timber",complete:v.flags.includes("first-strike")||v.commissions.length>0},
    {id:"stool",label:"Saw planks, craft a stool at the workbench (69, 139)",complete:v.flags.includes("crafted-stool")||v.furniture.length>0||v.commissions.includes("furniture")},
    {id:"place",label:"Place your stool near camp using Home",complete:v.furniture.length>0},
    {id:"order",label:"Complete a timber, stool, or fishing commission",complete:v.commissions.length>0},
    {id:"bill",label:`Pay the cottage account (${v.paid}/100 coins)`,complete:false}];
  return {day:1,title:"Your own quiet valley",body:"Your tent is free. Sell supplies or fulfil orders to earn your cottage; combat and calendar waits are optional.",steps,nextGoal:steps.find(s=>!s.complete)!.label};
}

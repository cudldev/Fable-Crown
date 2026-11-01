import { ITEMS, RECIPES } from "../rpg/content";
import type { ItemDefinition, ItemStack, SkillId } from "../rpg/types";
import type { FurnitureId } from "./contracts";

export interface ValleyRecipe {
  id:string; name:string; inputs:ItemStack[]; output:ItemStack; ticks:number; xp:number;
  skill:"carpentry"|SkillId; level:number; station:"workbench"|"furnace"|"range";
  requiresCottage:boolean;
}
const furnishing = (id:FurnitureId, name:string, planks:number, extra:ItemStack[]=[]):ValleyRecipe => ({
  id:`valley-${id}`,name:`Make ${name.toLowerCase()}`,inputs:[{itemId:"valley-plank",quantity:planks},...extra],
  output:{itemId:`valley-${id}`,quantity:1},ticks:5,xp:planks*100,skill:"carpentry",level:1,station:"workbench",requiresCottage:id!=="stool",
});
export const VALLEY_RECIPES:Record<string,ValleyRecipe> = Object.fromEntries([
  {id:"valley-plank",name:"Saw two planks",inputs:[{itemId:"logs",quantity:1}],output:{itemId:"valley-plank",quantity:2},ticks:3,xp:100,skill:"carpentry",level:1,station:"workbench",requiresCottage:false} as ValleyRecipe,
  furnishing("stool","Stool",2),furnishing("table","Table",4),furnishing("bed","Bed",6,[{itemId:"valley-cloth",quantity:2}]),
  furnishing("shelf","Shelf",3),furnishing("chest","Chest",4,[{itemId:"bronze-bar",quantity:1}]),furnishing("planter","Planter",2),
  ...["bronze-bar","cooked-shrimp"].map(id=>({...RECIPES[id],station:(id==="bronze-bar"?"furnace":"range") as "furnace"|"range",requiresCottage:false})),
].map(recipe=>[recipe.id,recipe]));
export interface ValleyCommission { id:string; name:string; inputs:ItemStack[]; coins:number; daily:boolean; requiresCottage:boolean }
export const VALLEY_COMMISSIONS:ValleyCommission[] = [
  {id:"timber",name:"Rowan's timber order",inputs:[{itemId:"logs",quantity:8}],coins:40,daily:false,requiresCottage:false},
  {id:"furniture",name:"Two seats for the caravan",inputs:[{itemId:"valley-stool",quantity:2}],coins:40,daily:false,requiresCottage:false},
  {id:"fishing",name:"Fresh pond catch",inputs:[{itemId:"raw-shrimp",quantity:6}],coins:40,daily:false,requiresCottage:false},
  {id:"daily-timber",name:"Daily timber parcel",inputs:[{itemId:"logs",quantity:4}],coins:12,daily:true,requiresCottage:false},
  {id:"daily-furniture",name:"Daily seat order",inputs:[{itemId:"valley-stool",quantity:1}],coins:16,daily:true,requiresCottage:false},
  {id:"daily-fishing",name:"Daily fresh fish",inputs:[{itemId:"raw-shrimp",quantity:3}],coins:12,daily:true,requiresCottage:false},
  {id:"daily-smith",name:"Garrick's bronze supplies",inputs:[{itemId:"bronze-bar",quantity:2}],coins:24,daily:true,requiresCottage:true},
];
export interface ValleyStock { itemId:string; name:string; buy:number; sell:number; quantity:number; requiresCottage:boolean }
/** Supply caravan is always available; no cost-free purchase/resale cycle. */
export const VALLEY_STOCK:ValleyStock[] = [
  ["logs",6,2],["copper-ore",10,4],["tin-ore",10,4],["bronze-bar",24,8],["raw-shrimp",7,2],["cooked-shrimp",14,5],
  ["valley-plank",5,2],["valley-cloth",8,3],["valley-flower-seeds",3,1],["valley-sapling",4,1],["small-net",5,2],["bronze-axe",16,8],["bronze-pickaxe",5,1],
  ["valley-stool",20,8],["valley-table",40,16],["valley-bed",80,32],["valley-shelf",30,12],["valley-chest",65,26],["valley-planter",20,8],
].map(([id,buy,sell])=>({itemId:String(id),name:String(id),buy:Number(buy),sell:Number(sell),quantity:2_000_000_000,requiresCottage:["valley-table","valley-bed","valley-shelf","valley-chest","valley-planter"].includes(String(id))}));

export function registerValleyContent():void {
  for(const [id,name,value,stackable] of [
    ["valley-plank","Sawn plank",4,false],["valley-cloth","Cloth",6,false],["valley-flower-seeds","Flower seeds",2,true],["valley-sapling","Young sapling",3,false],
    ["valley-stool","Handmade stool",16,false],["valley-table","Handmade table",32,false],["valley-bed","Handmade bed",64,false],
    ["valley-shelf","Handmade shelf",24,false],["valley-chest","Handmade chest",52,false],["valley-planter","Handmade planter",16,false],
  ] as const) {
    const definition:ItemDefinition={id,name,value,stackable,weight:1,kind:id==="valley-plank"?"resource":"supply"};
    if(!Object.hasOwn(ITEMS,id)) ITEMS[id]=definition;
  }
  for(const entry of VALLEY_STOCK) entry.name=ITEMS[entry.itemId]?.name??entry.itemId;
}
registerValleyContent();

/** Ordinary supplies stay available; two furnishing slots rotate by local date. */
export function visitorStock(now:number):ValleyStock[] {
  const d=new Date(now),day=`${d.getFullYear()}-${d.getMonth()+1}-${d.getDate()}`;
  const offset=[...day].reduce((n,c)=>(Math.imul(n,31)+c.charCodeAt(0))>>>0,0)%5;
  const decorations=["valley-table","valley-bed","valley-shelf","valley-chest","valley-planter"];
  return VALLEY_STOCK.filter(s=>!decorations.includes(s.itemId)||s.itemId===decorations[offset]||s.itemId===decorations[(offset+1)%5]);
}

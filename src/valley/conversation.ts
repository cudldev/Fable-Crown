import {calendarDate} from "../rpg/engine";
import {COTTAGE_TICKS,FIRST_BILL,FORGE_TICKS} from "./contracts";
import type {ValleyCommand,ValleySave,ValleyServicePanel} from "./contracts";

export type ConversationCursor="greeting"|"topics"|"account"|"payment"|"work"|"forge"|"response"|"farewell";
export interface ConversationReply {label:string;next?:ConversationCursor;panel?:ValleyServicePanel;command?:ValleyCommand;success?:string;disabled?:boolean}
export type ConversationTurn={line:string;next:ConversationCursor|"end"}|{replies:ConversationReply[]};
/** Presentation only. Worker commands validate proximity and exact-once gifts/deliveries. */
export function conversationTurn(save:ValleySave,visitorId:string,cursor:ConversationCursor,now:number,response=""):ConversationTurn {
  const v=save.valley,complete=v.cottageTicks>=COTTAGE_TICKS;
  if(visitorId.startsWith("actor-")){
    const actor=save.chapter.npcs.find(npc=>`actor-${npc.id}`===visitorId);
    const work=actor?.role==="woodcutter"?"the trees and timber supplies":actor?.role==="miner"?"the local ore and stone":actor?.role==="fisher"?"the fishing spots and nets":actor?.role==="smith"?"tools and work at the forge":"little jobs around the settlement";
    if(cursor==="greeting")return {line:`Hello, Alden! Taking a look around? What’s on your mind?`,next:"topics"};
    if(cursor==="work")return {line:`I look after ${work}. It’s good to take a moment and catch up. I’ll get back to it after our chat.`,next:"end"};
    if(cursor==="farewell")return {line:"Good to see you. Enjoy your walk!",next:"end"};
    return {replies:[{label:"How’s your work going?",next:"work"},{label:"Just saying hello.",next:"farewell"}]};
  }
  if(cursor==="response")return {line:response||"Thank you, Alden. Enjoy your afternoon.",next:"end"};
  if(cursor==="farewell")return {line:visitorId==="smith"?"Good to see you, Alden. Take care out there.":"I’m glad you stopped by. Enjoy the valley, Alden!",next:"end"};
  if(cursor==="greeting")return {line:visitorId==="builder"?(!v.home?"Welcome, Alden! A quiet valley, and room to make a home. How can I help?":complete?"There you are! How is your new cottage treating you?":"Hello, Alden! How are you settling into the valley?"):visitorId==="merchant"?"Hello, Alden! I brought a few things I thought you might like.":"Alden! Good to see you. What can I help you with?",next:"topics"};
  if(cursor==="account")return {line:!v.home?"Choose a clear spot for your free tent. We’ll leave room beside it for a cottage. You can start from Build & manage.":v.paid<FIRST_BILL?`Your cottage account is ${v.paid} of ${FIRST_BILL} coins. Small payments are welcome; there’s no hurry.`:complete?"Your cottage is ready! The workbench and planning table are yours to use.":"The builders are working on your cottage. Make yourself at home while they finish; chores won’t hurry them.",next:v.home&&v.paid<FIRST_BILL?"payment":"end"};
  if(cursor==="payment")return v.paid>=FIRST_BILL?{line:complete?"Your cottage is ready. Make yourself at home, Alden!":"Thank you! Your account is settled and the builders are on their way.",next:"end"}:{replies:[{label:"I’d like to make a payment.",panel:"home"},{label:"I’ll keep saving.",next:"farewell"}]};
  if(cursor==="forge")return {line:v.forge.ticks>=FORGE_TICKS?"The forge is ready! Bronze smelting is a little faster there now.":"The public forge is optional. Its board takes twelve logs and two bronze bars. The communal brazier can already smelt your bars.",next:"end"};
  if(cursor==="work"){
    const claimed=v.dailyHelp.includes(calendarDate(now))||v.dailyHelp.some(d=>d>calendarDate(now));
    return {replies:[{label:"Show me your orders.",panel:"projects"},...(visitorId==="builder"?[{label:claimed?"Thanks for today’s timber.":"Could you spare a few logs?",...(claimed?{next:"farewell"as const}:{command:{type:"daily-help"as const},success:"Here you are—four logs to get you started. I’m looking forward to seeing what you make."})}]:[]),{label:"I’ll see what I can do.",next:"farewell"}]};
  }
  return {replies:visitorId==="builder"?[{label:"About my home…",next:"account"},{label:"Need a hand with anything?",next:"work"},{label:"Just saying hello.",next:"farewell"}]:visitorId==="merchant"?[{label:"May I see what you brought?",panel:"trade"},{label:"Any orders I could help with?",panel:"projects"},{label:"Just saying hello.",next:"farewell"}]:[{label:"About the public forge…",next:"forge"},{label:"Need any supplies?",panel:"projects"},{label:"Just saying hello.",next:"farewell"}]};
}

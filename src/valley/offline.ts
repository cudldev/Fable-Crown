import type { ValleySave } from "./contracts";
import { COTTAGE_TICKS,FORGE_TICKS } from "./contracts";
import { advanceSettlement } from "./settlement";
import { calendarDate } from "../rpg/engine";
import { getVisitors } from "./onboarding";
/** Calendar reconciliation owns background work only; never advances action frames. */
export function reconcileValley(save:ValleySave,now:number):{ticks:number;message:string} {
  if(!Number.isSafeInteger(now)||now<0||now>8.64e15)throw Error("Invalid reconciliation time");
  const elapsed=Math.max(0,now-save.savedAt),effective=Math.min(elapsed,86400000)*.25+save.offlineRemainder;
  const ticks=Math.floor(effective/600),home=save.valley.cottageTicks,forge=save.valley.forge.ticks,queue=save.valley.workQueue.length;
  save.offlineRemainder=effective%600;
  advanceSettlement(save,ticks,Math.max(now,save.savedAt));
  save.savedAt=Math.max(now,save.savedAt);save.chapter.savedAt=save.savedAt;save.chapter.calendar=calendarDate(save.savedAt);
  const finished=[];
  if(home<COTTAGE_TICKS&&save.valley.cottageTicks>=COTTAGE_TICKS)finished.push("Your cottage is ready");
  if(forge<FORGE_TICKS&&save.valley.forge.ticks>=FORGE_TICKS)finished.push("The communal forge is ready");
  if(queue&&!save.valley.workQueue.length)finished.push("Your craft batch is complete");
  const progress:string[]=[];
  if(!save.valley.home)progress.push("Choose a place for your free tent");
  else if(save.valley.paid<100)progress.push(`Cottage account: ${save.valley.paid}/100 coins`);
  else if(save.valley.cottageTicks<COTTAGE_TICKS)progress.push(`Cottage: ${Math.ceil((COTTAGE_TICKS-save.valley.cottageTicks)*.6/60)} active minutes remaining`);
  else if(!finished.includes("Your cottage is ready"))progress.push("Your cottage is ready");
  if(save.valley.forge.logs===12&&save.valley.forge.bars===2&&save.valley.forge.ticks<FORGE_TICKS)
    progress.push(`Forge: ${Math.ceil((FORGE_TICKS-save.valley.forge.ticks)*.6/60)} active minutes remaining`);
  const visitors=getVisitors(save,save.savedAt).map(visitor=>visitor.name).join(", ");
  return {ticks,message:[ticks?"Welcome back":"Welcome to your valley",...finished,...progress,`Visiting today: ${visitors}`].join(". ")+"."};
}

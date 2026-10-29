import { BILL, type GameState, type IntentDraft, type Resource } from "./types";
import { nearestSettlement, TARGETS } from "./world";

export interface PlanSuggestion {
  id: string;
  title: string;
  thought: string;
  intent: IntentDraft;
  score: number;
}

/** Pure local utility planner. Suggestions describe real work; only the simulation executes it. */
export function suggestIntentions(state: GameState): PlanSuggestion[] {
  const prince = state.people[0]!;
  const town = nearestSettlement(prince);
  const visited = state.control.visited ?? [];
  const choices: PlanSuggestion[] = [];
  const add = (suggestion: PlanSuggestion): void => {
    if (suggestion.id === state.control.lastAutonomous) suggestion.score -= 18;
    choices.push(suggestion);
  };
  if (prince.carry) {
    add({ id: `bank-${town.id}`, title: `Deliver carried ${prince.carry.resource}`, thought: `I am carrying ${prince.carry.amount} ${prince.carry.resource}. I can leave it safely in ${town.name} before starting another job.`, intent: { kind: "deposit", targetId: `${town.id}-store`, resource: prince.carry.resource, quantity: prince.carry.amount }, score: 140 });
  }
  if (!state.workshop.complete) {
    const timber = BILL.timber - state.workshop.timber;
    const stone = BILL.stone - state.workshop.stone;
    add({ id: "finish-workshop", title: timber || stone ? "Supply the blacksmith workshop" : "Finish the workshop frame", thought: timber || stone ? `The workshop still needs ${timber} timber and ${stone} stone. I can fetch a full load and deliver it, then help with the frame.` : `All materials are delivered. The frame needs ${BILL.labor - state.workshop.labor} more labor; I can help finish it.`, intent: {kind:"build"}, score: 130 });
    for (const resource of ["timber", "stone"] as const) {
      const missing = Math.max(0, BILL[resource] - state.workshop[resource] - state.stores.oakrest[resource]);
      if (missing) add({ id: `workshop-${resource}`, title: `Gather ${resource} for Oakrest`, thought: `Oakrest storage is ${missing} ${resource} short of the undelivered workshop bill. A load of ${Math.min(10, missing)} will help the builders.`, intent: {kind:"gather",resource,targetId:`oakrest-${resource === "timber" ? "forest" : "mine"}`,quantity:Math.min(10,missing)},score:100 + missing });
    }
  } else {
    for (const resource of ["timber", "stone", "iron"] as Resource[]) {
      const goal = resource === "timber" ? 64 : resource === "stone" ? 48 : town.id === "oakrest" ? 24 : 12;
      const held = state.stores[town.id][resource] + state.people.filter(p => nearestSettlement(p).id === town.id).reduce((sum,p) => sum + (p.carry?.resource === resource ? p.carry.amount : 0),0);
      const missing = Math.max(0, goal - held);
      if (missing) add({ id:`supply-${town.id}-${resource}`,title:`Help ${town.name} with ${resource}`,thought:`${town.name} has ${state.stores[town.id][resource]} ${resource} in storage; its useful reserve is ${goal}. I can gather and bank ${Math.min(10,missing)} nearby.`,intent:{kind:"gather",resource,targetId:`${town.id}-${resource === "timber" ? "forest" : "mine"}`,quantity:Math.min(10,missing)},score:70+Math.floor(missing/goal*15) });
    }
    if (town.id === "oakrest") {
      const firstTools = state.workshop.forged < 12;
      add({id:"forge-tools",title:firstTools?"Forge a small tool batch":"Practice a short smithing batch",thought:firstTools?`The workshop is open and ${state.workshop.forged} tools are ready. I can turn four iron into two more useful tools.`:`The settlement already has ${state.workshop.forged} tools. A two-tool practice batch will improve my smithing before I inspect somewhere else.`,intent:{kind:"forge",quantity:2},score:firstTools?92:42});
    }
  }
  const destinations = TARGETS.filter(t => ["settlement","landmark","manor"].includes(t.kind));
  for (const destination of destinations) {
    const distance = Math.hypot(destination.x-prince.x,destination.y-prince.y);
    if (distance < 80) continue;
    const seen = visited.indexOf(destination.id);
    add({id:`visit-${destination.id}`,title:`${seen < 0 ? "Explore" : "Revisit"} ${destination.name}`,thought:seen < 0 ? `I have not reached ${destination.name} yet. I can follow the paths there, then look for useful work nearby.` : `The local reserves can wait while I inspect ${destination.name} again. On arrival I will consider that area's supplies.`,intent:{kind:"move",targetId:destination.id},score:(seen < 0 ? 64 : 35 + (visited.length-seen)*3)-Math.min(22,Math.floor(distance/160))});
  }
  return choices.sort((a,b)=>b.score-a.score || a.id.localeCompare(b.id)).slice(0,3);
}

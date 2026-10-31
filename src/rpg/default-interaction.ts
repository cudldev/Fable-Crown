import type { TileSelection } from "../render/scene-types";
import { ENEMIES } from "./content";
import { inventorySlots } from "./inventory";
import { objectById } from "./world";
import type { RpgOrder, RpgState } from "./types";

export interface DefaultInteraction { label: string; order?: RpgOrder; blocked?: string }

/** Pointer defaults are explicit orders; the deterministic engine validates them. */
export function defaultInteraction(state: RpgState, selection: TileSelection): DefaultInteraction {
  if (selection.kind === "tile") return { label: "Walk here", order: { type: "move", position: selection.position } };
  if (selection.kind === "enemy") {
    const enemy = state.enemies.find(value => value.id === selection.id);
    return { label: `Attack ${enemy ? ENEMIES[enemy.definitionId].name : "enemy"}`, order: { type: "attack", enemyId: selection.id } };
  }
  if (selection.kind === "drop") return { label: "Take loot", order: { type: "loot", dropId: selection.id } };
  if (selection.kind === "grave") return { label: "Recover backpack", order: { type: "recover" } };
  if (selection.kind === "actor") return selection.id === 0 ? { label: "Inspect Alden" }
    : { label: `Talk to ${state.npcs.find(actor => actor.id === selection.id)?.name ?? "villager"}`, order: { type: "talk-actor", actorId: selection.id } };
  const object = objectById(selection.id);
  if (!object) return { label: "Inspect" };
  if (object.resourceId) {
    const free = 28 - inventorySlots(state.player.inventory);
    return { label: `${object.kind === "tree" ? "Chop" : object.kind === "rock" ? "Mine" : "Fish"} ${object.name}`,
      ...(free > 0 ? { order: { type: "gather" as const, objectId: object.id, quantity: free } }
        : { blocked: "Your backpack is full. Bank or use some items first." }) };
  }
  if (object.kind === "gate") return { label: `${state.gates[object.id] === false ? "Open" : "Close"} ${object.name}`, order: { type: "gate", objectId: object.id, open: state.gates[object.id] === false } };
  if (object.kind === "ferry") return { label: `Use ${object.name}`, order: { type: "travel-service", objectId: object.id } };
  if (object.kind === "target") return { label: `Practise at ${object.name}`, order: { type: "interact", objectId: object.id, verb: "practice" } };
  if (object.questId) return { label: `Talk to ${object.name}`, order: { type: "interact", objectId: object.id, verb: "talk", once: true } };
  if (object.kind === "clue" || object.kind === "sign") return { label: `Read ${object.name}`, order: { type: "interact", objectId: object.id, verb: "inspect" } };
  return { label: `${object.kind === "bank" ? "Bank at" : object.kind === "shop" ? "Trade at" : ["anvil", "furnace", "range"].includes(object.kind) ? "Use" : "Inspect"} ${object.name}` };
}

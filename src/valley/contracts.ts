import type { RpgState } from "../rpg/types";
import type { ActionState } from "../action/contracts";
export type FurnitureId = "stool" | "table" | "bed" | "shelf" | "chest" | "planter";
export interface PlacedFurniture { id:string; itemId:FurnitureId; x:number; z:number; rotation:0|1|2|3 }
export interface GroundEdit { level:-1|0|1; path:boolean; stairs?:0|1|2|3 }
export interface GroundUndo { key:string; before:GroundEdit|null; after:GroundEdit|null }
export interface ValleyData {
  visitorPositions?:Partial<Record<"builder"|"merchant"|"smith",{x:number;z:number}>>;
  home:null|{x:number;z:number;rotation:0|1|2|3;tentPacked:boolean};
  paid:number; cottageTicks:number;
  forge:{logs:number;bars:number;ticks:number};
  furniture:PlacedFurniture[]; plants:{id:string;x:number;z:number;kind:"flowers"|"sapling"}[];
  ground:Record<string,GroundEdit>; undo:GroundUndo[]; layoutRevision:number;
  commissions:string[]; dailyCommissions:string[]; dailyHelp:string[];
  introduced:string[]; flags:string[]; carpentryXp:number; goal:string;
  startedAt:number; lastDate:string; message:string;
  workQueue:{recipeId:string;quantity:number;remainingTicks:number}[];
}
/** Fresh valley format. Earlier game archives are deliberately not migrated. */
export interface ValleySave { version:7; chapter:RpgState; action:ActionState; valley:ValleyData; savedAt:number; offlineRemainder:number }
export type ValleyCommand =
  | {type:"place-home";x:number;z:number;rotation:0|1|2|3}
  | {type:"pay";amount:number}
  | {type:"craft";recipeId:string;quantity:number}
  | {type:"sell"|"store"|"withdraw"|"buy";itemId:string;quantity:number}
  | {type:"commission";id:string}
  | {type:"place-furniture";itemId:FurnitureId;x:number;z:number;rotation:0|1|2|3}
  | {type:"move-furniture";id:string;x:number;z:number;rotation:0|1|2|3}
  | {type:"terrain";x:number;z:number;operation:"raise"|"lower"|"path"|"grass"|"stairs-north"|"stairs-east"|"stairs-south"|"stairs-west"}
  | {type:"undo-terrain"}
  | {type:"plant";x:number;z:number;kind:"flowers"|"sapling"}
  | {type:"lift-plant";id:string}
  | {type:"daily-help"}
  | {type:"forge-deliver";itemId:"logs"|"bronze-bar";quantity:number}
  | {type:"pin-goal";goal:string}
  | {type:"talk-visitor";id:string}
  | {type:"pack-tent"}
  | {type:"eat"|"equip";itemId:string}
  | {type:"unequip";slot:import("../rpg/types").EquipmentSlot};
export interface ValleyResult {ok:boolean;message:string}
/** Session-only interaction feedback; never part of the saved simulation. */
export interface ValleyFeedback {id:number;tone:"success"|"info"|"warning"|"danger";title:string;detail?:string}
export type ValleyServicePanel="visitor"|"inventory"|"craft"|"trade"|"home"|"projects";
/** Interaction context is granted by a nearby world object, never saved. */
export interface ValleyService {objectId:string;name:string;kind:"workbench"|"furnace"|"range"|"caravan"|"storage"|"home"|"planning"|"forge"|"visitor";x:number;z:number;range:number;station?:"workbench"|"furnace"|"range";visitorId?:string}
export const COTTAGE_TICKS=9000;
export const FORGE_TICKS=1800;
export const FIRST_BILL=100;
/** Authoritative live gameplay and settlement cadence. Rendering interpolates between commits. */
export const VALLEY_TICK_MS=600;
export const VALLEY_ACTION_QUANTA=36;
/** Explicit point-and-click task. Transient: never saved or advanced offline. */
export interface PointerActivity {kind:"walk"|"interact"|"gather"|"attack";label:string;phase:"walking"|"acting";selection:import("../render/scene-types").TileSelection;path:{x:number;z:number}[]}
export interface AmbientNpcPose {id:string;x:number;z:number;fromX:number;fromZ:number;activity:string;working:boolean;moving:boolean}
export type ValleyWorkerRequest =
  | {type:"interface";open:boolean;npcId?:string}
  | {type:"input";input:import("../action/contracts").ActionInput}
  | {type:"command";command:ValleyCommand;requestId?:number}
  | {type:"focus";selection:import("../render/scene-types").TileSelection}
  | {type:"point";selection:import("../render/scene-types").TileSelection;intent?:"walk"|"examine"}
  | {type:"import";value:unknown}
  | {type:"pause"|"resume"|"save"|"interact"|"export"|"reset"|"cancel"};
export interface ValleyWorkerMessage {
  save?:ValleySave; action?:ActionState; message?:string; storageOkay?:boolean;
  feedback?:ValleyFeedback;
  pointer?:PointerActivity|null;
  ambient?:AmbientNpcPose[];
  receipt?:{requestId?:number;ok:boolean}; export?:ValleySave;
  open?:ValleyServicePanel;
  service?:ValleyService;
  visitorId?:string;
}

import type { RpgState, TilePosition } from "../rpg/types";
import type { FeedbackFloater } from "./feedback";

export interface TileCamera {
  x: number;
  y: number;
  zoom: number;
  follow: boolean;
  overview: boolean;
  grid: boolean;
  /** Hands-on exploration stays anchored to the player, with a slight movement lead. */
  dynamicFollow?: boolean;
  reducedMotion?: boolean;
  /** Transient presentation framing; never saved or authoritative. */
  interaction?: import("./interaction-camera").InteractionCameraFocus;
}
export type TileSelection =
  | { kind: "object"; id: string }
  | { kind: "actor"; id: number }
  | { kind: "enemy" | "drop"; id: string }
  | { kind: "grave" }
  | { kind: "tile"; position: TilePosition };
export type PreparationStage = "chapter" | "assets" | "world" | "shaders" | "lighting" | "ready" | "unavailable";
export interface ScenePreparation { stage: PreparationStage; message?: string }
export interface TileSceneProps {
  /** Optional chapter-specific world and fast authoritative actor snapshots. */
  worldOverride?: import("../rpg/types").WorldDefinition;
  actionState?: import("../action/contracts").ActionState;
  readAction?: () => import("../action/contracts").ActionState | undefined;
  sampleGround?: (x: number, z: number) => number;
  /** Height edits change this key; pigment texture reuse follows terrain-array identity. */
  groundRevision?: string | number;
  directInput?: boolean;
  /** Point-and-click exploration; selection approaches targets through the worker. */
  pointControls?: boolean;
  ambientNpcs?:readonly import("../valley/contracts").AmbientNpcPose[];
  readInteractionCue?: () => {player:{x:number;z:number;facingX:number;facingZ:number};target?:{x:number;z:number;label:string}} | undefined;
  canInteractSelection?: (selection:TileSelection) => boolean;
  placementPreview?: readonly {x:number;z:number;width:number;height:number;color?:number}[];
  state: RpgState;
  camera: TileCamera;
  onCamera: (update: TileCamera | ((current: TileCamera) => TileCamera)) => void;
  /** Current rendered focus, without feeding presentation updates into React state. */
  onCameraTarget?: (x: number, z: number) => void;
  selection: TileSelection | null;
  onSelect: (s: TileSelection) => void;
  onInteract?: (s: TileSelection) => void;
  onContextMenu?: (s: TileSelection, point: { x: number; y: number }) => void;
  feedback?: FeedbackFloater[];
  previewRoute?: TilePosition[];
  presentationEpoch?: number;
  onWorkContact?: (kind: string) => void;
  onFootstep?: (mode: "walk" | "run") => void;
  onPreparation?: (preparation: ScenePreparation) => void;
}

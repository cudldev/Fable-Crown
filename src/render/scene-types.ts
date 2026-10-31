import type { RpgState, TilePosition } from "../rpg/types";
import type { FeedbackFloater } from "./feedback";

export interface TileCamera {
  x: number;
  y: number;
  zoom: number;
  follow: boolean;
  overview: boolean;
  grid: boolean;
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
  state: RpgState;
  camera: TileCamera;
  onCamera: (c: TileCamera) => void;
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

import type { TilePosition } from "../rpg/types";
export interface FeedbackFloater {
  id: string;
  text: string;
  tone: "item" | "xp" | "level";
  position: TilePosition;
  startedAt: number;
}

import type { TilePosition } from "../rpg/types";
export interface FeedbackFloater {
  id: string;
  text: string;
  tone: "item" | "xp" | "level" | "damage" | "player-damage" | "miss" | "heal";
  position: TilePosition;
  startedAt: number;
  /** Damage attaches to the victim's interpolated presentation, never the attacker. */
  targetId?: string;
}

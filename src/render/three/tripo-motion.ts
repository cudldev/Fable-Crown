import type { UnitTool } from "../pixel-units";
export const TRIPO_CLIPS = ["idle", "walk", "cut", "mine", "smith", "cook", "fish", "melee", "bow", "pickup", "bank", "talk", "hit", "defeat", "block", "rig-test"] as const;
export type TripoClip = typeof TRIPO_CLIPS[number];
export type TripoPreview = "gameplay" | "rest" | TripoClip;
export interface TripoMotionInput {
  time: number; frame: number; moving: boolean; swing: number; swingTool: boolean; blocking: boolean;
  health: number; hit?: boolean; facingX: number; facingZ: number; workClip?: TripoClip; tool: UnitTool;
  reducedMotion?: boolean;
}
/** The valley's committed 60Hz swing/guard state owns presentation; no simulated decisions here. */
export function tripoMotion(input: TripoMotionInput): { clip: TripoClip; phase?: number; tool: UnitTool } {
  if (input.health <= 0) return { clip: "defeat", tool: "none" };
  if (input.hit) return { clip: "hit", tool: input.tool };
  if (input.blocking) return { clip: "block", phase: .5, tool: "shield" };
  if (input.swing > 0) {
    const clip = input.swingTool ? input.workClip ?? "cut" : input.tool === "bow" ? "bow" : "melee";
    const progress = Math.max(0, Math.min(1, (36 - input.swing) / 36));
    // Work clips start raised; align their downstroke with the 24-remaining contact frame.
    const phase = ["cut", "mine", "smith"].includes(clip) ? (.5 + progress * 1.5) % 1 : progress;
    const tool = ({ cut: "axe", mine: "pickaxe", smith: "hammer", fish: "rod" } as Partial<Record<TripoClip, UnitTool>>)[clip] ?? input.tool;
    return { clip, phase, tool };
  }
  if (input.moving) return { clip: "walk", tool: input.tool };
  return { clip: input.workClip ?? "idle", tool: input.workClip === "cook" ? "none" : input.tool };
}

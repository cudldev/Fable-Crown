import { createHeldUnitSheet, createUnitSheet, type UnitKind, type UnitTool } from "./pixel-units";
import type { ActorState } from "../rpg/types";
import { unitCanvasHeight } from "./unit-scale";

export interface PixelUnitPoseInput {
  moving?: boolean;
  gaitDistance?: number;
  workPhase?: "prepare" | "contact" | "recover";
  reducedMotion?: boolean;
  hit?: boolean;
  defeated?: boolean;
}
export interface PixelUnitPose {
  frame: number;
  scaleX: number;
  scaleY: number;
  /** Reserved presentation offset; current hand-only style keeps this zero. */
  bob: number;
}

/** Discrete authored poses follow the existing action phase/trace clock. */
export function samplePixelUnitPose(input: PixelUnitPoseInput): PixelUnitPose {
  const still = { frame: 0, scaleX: 1, scaleY: 1, bob: 0 };
  if (input.defeated) return { ...still, frame: 9 };
  if (input.hit) return { ...still, frame: 8 };
  if (input.reducedMotion) return input.workPhase ? { ...still, frame: 6 } : still;
  if (input.moving) {
    const distance = Number.isFinite(input.gaitDistance) ? Math.max(0, input.gaitDistance!) : 0;
    return { ...still, frame: Math.floor(distance * 2) % 2 ? 3 : 1 };
  }
  return { ...still, frame: input.workPhase === "prepare" ? 5 : input.workPhase === "contact" ? 6 : input.workPhase === "recover" ? 7 : 0 };
}

/** The body's neutral pixels never step, breathe, bob or squash. */
export function pixelUnitRenderFrames(pose: PixelUnitPose) {
  return { body: pose.frame === 8 || pose.frame === 9 ? pose.frame : 0, held: pose.frame === 1 || pose.frame === 6 ? 1 : 0 };
}

/** Screen-horizontal travel under the Canvas isometric projection is dx - dy. */
export function pixelUnitFlipFromDelta(previous: boolean, dx: number, dy: number): boolean {
  const horizontal = dx - dy;
  return Math.abs(horizontal) < .000001 ? previous : horizontal < 0;
}

/** Presentation-only tool selection; never changes equipment or inventory. */
export function pixelActorTool(actor: Pick<ActorState, "id" | "role" | "equipment">, pose = "idle"): UnitTool {
  const working: Record<string, UnitTool> = { cut: "axe", mine: "pickaxe", smith: "hammer", cook: "hammer", fish: "rod", melee: "sword", bow: "bow" };
  if (working[pose]) return working[pose];
  if (actor.id === 0) {
    const weapon = actor.equipment.weapon ?? "";
    return weapon.includes("bow") ? "bow" : weapon.includes("sword") || weapon.includes("dagger") ? "sword" : "none";
  }
  const tools: Record<string, UnitTool> = { woodcutter: "axe", miner: "pickaxe", fisher: "rod", smith: "hammer", builder: "hammer", cook: "hammer" };
  return tools[actor.role] ?? "none";
}

export function pixelEnemyTool(kind: UnitKind): UnitTool {
  return kind === "ranged-outlaw" ? "bow" : ["bandit", "captain", "armoured-outlaw"].includes(kind) ? "sword" : "none";
}

type PixelSheet = ReturnType<typeof createUnitSheet>;

/** Both layers use BODY geometry, so tools cannot acquire a different pixel pitch. */
export function pixelUnitGeometry(sheet: Pick<PixelSheet, "frameSize" | "footX" | "footY" | "bodyHeight">, height: number, pose: PixelUnitPose) {
  const scale = Math.max(1, height) / Math.max(1, sheet.bodyHeight);
  return {
    left: -sheet.footX * scale * pose.scaleX,
    top: -sheet.footY * scale * pose.scaleY - pose.bob,
    width: sheet.frameSize * scale * pose.scaleX,
    height: sheet.frameSize * scale * pose.scaleY,
  };
}

export function createPixelCanvasRenderer() {
  const sheets = new Map<string, { sheet: PixelSheet; canvas: HTMLCanvasElement }>();
  function cachedSheet(key: string, create: () => PixelSheet) {
    let cached = sheets.get(key);
    if (!cached) {
      const sheet = create();
      const canvas = document.createElement("canvas"); canvas.width = sheet.width; canvas.height = sheet.height;
      const context = canvas.getContext("2d")!;
      const data = context.createImageData(sheet.width, sheet.height);
      data.data.set(sheet.rgba); context.putImageData(data, 0, 0);
      cached = { sheet, canvas };
      if (sheets.size >= 96) sheets.delete(sheets.keys().next().value!);
      sheets.set(key, cached);
    }
    return cached;
  }
  return {
    draw(ctx: CanvasRenderingContext2D, kind: UnitKind, variant: number, at: { x: number; y: number }, pose: PixelUnitPose, height: number | undefined = undefined, alpha = 1, tool: UnitTool = "none", flipX = false) {
      const normalized = Math.abs(Math.trunc(Number.isFinite(variant) ? variant : 0)) % 8;
      const { sheet, canvas } = cachedSheet(`body:${kind}:${normalized}`, () => createUnitSheet(kind, normalized));
      const held = cachedSheet(`held:${kind}:${normalized}:${tool}`, () => createHeldUnitSheet(kind, normalized, tool));
      const frames = pixelUnitRenderFrames(pose);
      const geometry = pixelUnitGeometry(sheet, height ?? unitCanvasHeight(sheet.bodyHeight), pose);
      ctx.save();
      ctx.imageSmoothingEnabled = false;
      ctx.globalAlpha *= Math.max(0, Math.min(1, alpha));
      ctx.translate(at.x, at.y);
      if (flipX) ctx.scale(-1, 1);
      ctx.drawImage(canvas, frames.body * sheet.frameSize, 0, sheet.frameSize, sheet.frameSize,
        geometry.left, geometry.top, geometry.width, geometry.height);
      if (pose.frame !== 9) ctx.drawImage(held.canvas, frames.held * sheet.frameSize, 0, sheet.frameSize, sheet.frameSize,
        geometry.left, geometry.top, geometry.width, geometry.height);
      ctx.restore();
    },
    clear() { sheets.clear(); },
  };
}

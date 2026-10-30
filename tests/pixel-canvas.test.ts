import { afterEach, describe, expect, it, vi } from "vitest";
import { createPixelCanvasRenderer, pixelActorTool, pixelEnemyTool, pixelUnitFlipFromDelta, pixelUnitGeometry, pixelUnitRenderFrames, samplePixelUnitPose } from "../src/render/pixel-canvas";
import { createUnitSheet } from "../src/render/pixel-units";

describe("camera-facing pixel presentation", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("moves only the held layer while travelled distance leaves the body and feet still", () => {
    const frames = [0, .25, .5, .75, 1].map(gaitDistance => samplePixelUnitPose({ moving: true, gaitDistance }).frame);
    expect(frames).toEqual([1, 1, 3, 3, 1]);
    expect(frames.map(frame => pixelUnitRenderFrames({ frame, scaleX: 1, scaleY: 1, bob: 0 }))).toEqual([
      { body: 0, held: 1 }, { body: 0, held: 1 }, { body: 0, held: 0 }, { body: 0, held: 0 }, { body: 0, held: 1 },
    ]);
    expect(samplePixelUnitPose({ moving: true, gaitDistance: NaN }).frame).toBe(1);
  });

  it("uses authoritative work phase and retains discrete hit/defeat cues in reduced motion", () => {
    expect(["prepare", "contact", "recover"].map(workPhase => samplePixelUnitPose({ workPhase: workPhase as "prepare" | "contact" | "recover" }).frame)).toEqual([5, 6, 7]);
    expect(samplePixelUnitPose({ moving: true, gaitDistance: .25, reducedMotion: true })).toEqual({ frame: 0, scaleX: 1, scaleY: 1, bob: 0 });
    for (const workPhase of ["prepare", "contact", "recover"] as const)
      expect(samplePixelUnitPose({ workPhase, reducedMotion: true })).toEqual({ frame: 6, scaleX: 1, scaleY: 1, bob: 0 });
    expect(samplePixelUnitPose({ hit: true, reducedMotion: true })).toEqual({ frame: 8, scaleX: 1, scaleY: 1, bob: 0 });
    expect(samplePixelUnitPose({ defeated: true, hit: true, reducedMotion: true }).frame).toBe(9);
  });

  it("keeps body scale and foot anchor identical across every normal action sample", () => {
    const sheet = { frameSize: 32, footX: 16, footY: 28, bodyHeight: 12 };
    for (const gaitDistance of [0, .125, .25, .375, .5, .75, 1]) {
      const pose = samplePixelUnitPose({ moving: true, gaitDistance });
      const geometry = pixelUnitGeometry(sheet, 80, pose);
      expect(geometry.left + sheet.footX / sheet.frameSize * geometry.width).toBeCloseTo(0);
      expect(geometry.top + sheet.footY / sheet.frameSize * geometry.height).toBeCloseTo(-pose.bob);
      expect(pose.scaleX).toBe(1);
      expect(pose.scaleY).toBe(1);
      expect(pose.bob).toBe(0);
    }
  });

  it("mirrors by projected horizontal travel and retains the last mirror on vertical/zero travel", () => {
    expect(pixelUnitFlipFromDelta(false, 0, 1)).toBe(true);
    expect(pixelUnitFlipFromDelta(true, 1, 0)).toBe(false);
    expect(pixelUnitFlipFromDelta(true, 1, 1)).toBe(true);
    expect(pixelUnitFlipFromDelta(false, -1, -1)).toBe(false);
    expect(pixelUnitFlipFromDelta(true, 0, 0)).toBe(true);
  });

  it("selects actual work/equipment tools without inventing an idle player weapon", () => {
    const player = { id: 0, role: "prince", equipment: {} };
    expect(pixelActorTool(player)).toBe("none");
    expect(pixelActorTool({ ...player, equipment: { weapon: "bronze-sword" } })).toBe("sword");
    expect(pixelActorTool({ ...player, equipment: { weapon: "shortbow" } })).toBe("bow");
    expect(pixelActorTool(player, "mine")).toBe("pickaxe");
    expect(pixelActorTool(player, "fish")).toBe("rod");
    expect(pixelActorTool({ id: 7, role: "woodcutter", equipment: {} })).toBe("axe");
    expect(pixelEnemyTool("ranged-outlaw")).toBe("bow");
    expect(pixelEnemyTool("rock-mite")).toBe("none");
  });

  it("draws body and held layer with identical pixel pitch and mirrors them around the same feet", () => {
    vi.stubGlobal("document", { createElement: () => ({ width: 0, height: 0, getContext: () => ({
      createImageData: (width: number, height: number) => ({ data: new Uint8ClampedArray(width * height * 4) }), putImageData: () => {},
    }) }) });
    const ctx = { globalAlpha: 1, imageSmoothingEnabled: true, save: vi.fn(), restore: vi.fn(),
      translate: vi.fn(), scale: vi.fn(), drawImage: vi.fn() };
    const renderer = createPixelCanvasRenderer();
    renderer.draw(ctx as unknown as CanvasRenderingContext2D, "prince", 0, { x: 40, y: 60 },
      samplePixelUnitPose({ workPhase: "contact" }), 80, 1, "pickaxe", true);
    expect(ctx.translate).toHaveBeenCalledWith(40, 60);
    expect(ctx.scale).toHaveBeenCalledWith(-1, 1);
    expect(ctx.drawImage).toHaveBeenCalledTimes(2);
    const [body, held] = ctx.drawImage.mock.calls;
    expect(body.slice(5)).toEqual(held.slice(5));
    expect(body[1]).toBe(0);
    expect(held[1]).toBe(32);
    const sheet = createUnitSheet("prince", 0);
    const [left, top, width, height] = body.slice(5) as number[];
    expect(left + width * sheet.footX / sheet.frameSize).toBeCloseTo(0);
    expect(top + height * sheet.footY / sheet.frameSize).toBeCloseTo(0);
    expect(width / sheet.frameSize).toBeCloseTo(80 / sheet.bodyHeight);
    expect(ctx.imageSmoothingEnabled).toBe(false);
  });
});

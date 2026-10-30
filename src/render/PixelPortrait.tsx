import { useEffect, useRef } from "react";
import { createUnitSheet, createHeldUnitSheet } from "./pixel-units";
/** The HUD uses the same native character art as the world, without a painted replacement. */
export default function PixelPortrait() {
  const canvas = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const body = createUnitSheet("prince", 0), hand = createHeldUnitSheet("prince", 0, "none");
    const pixels = new Uint8ClampedArray(32 * 32 * 4);
    let left = 32, top = 32, right = 0, bottom = 0;
    for (let y = 0; y < 32; y++) for (let x = 0; x < 32; x++) {
      const at = (y * body.width + x) * 4, source = hand.rgba[at + 3] ? hand.rgba : body.rgba;
      pixels.set(source.subarray(at, at + 4), (y * 32 + x) * 4);
      if (source[at + 3]) { left = Math.min(left, x); top = Math.min(top, y); right = Math.max(right, x + 1); bottom = Math.max(bottom, y + 1); }
    }
    const node = canvas.current; if (!node || right <= left) return;
    node.width = right - left; node.height = bottom - top;
    const context = node.getContext("2d"); if (!context) return;
    context.putImageData(new ImageData(pixels, 32, 32), -left, -top);
  }, []);
  return <canvas ref={canvas} className="unit-portrait" aria-hidden="true" style={{ imageRendering: "pixelated", objectFit: "contain" }} />;
}

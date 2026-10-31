import { Color, type Camera, type Vector3 } from "three";
import type { LightingRig } from "./lighting";

type VialLights = Pick<LightingRig, "sun" | "fill" | "slots">;

/** Cosmetic light tint, with a floor so health remains readable even in darkness.
 * Reuses the four selected scene lamps; no shadow queries, GI reads or captures. */
export function vialLightColor(target: Color, lights: VialLights, position: Readonly<Vector3>): Color {
  const sun = lights.sun, fill = lights.fill;
  let r = fill.color.r * fill.intensity * .32 + sun.color.r * sun.intensity * .12;
  let g = fill.color.g * fill.intensity * .32 + sun.color.g * sun.intensity * .12;
  let b = fill.color.b * fill.intensity * .32 + sun.color.b * sun.intensity * .12;
  for (const lamp of lights.slots) {
    if (lamp.intensity <= 0) continue;
    const d2 = lamp.position.distanceToSquared(position);
    const cutoff = lamp.distance > 0 ? Math.max(0, 1 - (d2 / (lamp.distance * lamp.distance)) ** 2) ** 2 : 1;
    const power = Math.min(1, lamp.intensity * cutoff / (1 + d2)) * .65;
    r += lamp.color.r * power; g += lamp.color.g * power; b += lamp.color.b * power;
  }
  return target.setRGB(Math.min(.9, .14 + r * .65), Math.min(.9, .14 + g * .65), Math.min(.9, .14 + b * .65));
}

/** Lighting changes at 10 Hz; unchanged rounded CSS colors never trigger a write. */
export class FloatingVials {
  private nextSample = -Infinity;
  private sampling = false;
  private colors = new WeakMap<HTMLElement, string>();
  private color = new Color();
  private angle = "";
  constructor(private root: HTMLElement) {}
  beginFrame(time: number, lights: VialLights, camera: Camera) {
    this.sampling = time >= this.nextSample;
    if (!this.sampling) return;
    this.nextSample = time + 100;
    const x = lights.sun.position.x - lights.sun.target.position.x;
    const y = lights.sun.position.y - lights.sun.target.position.y;
    const z = lights.sun.position.z - lights.sun.target.position.z;
    const basis = camera.matrixWorld.elements;
    const screenX = x * basis[0] + y * basis[1] + z * basis[2];
    const screenY = x * basis[4] + y * basis[5] + z * basis[6];
    const angle = `${Math.round(Math.atan2(screenX, screenY) * 180 / Math.PI / 5) * 5}deg`;
    if (angle !== this.angle) { this.root.style.setProperty("--vial-light-angle", angle); this.angle = angle; }
  }
  update(element: HTMLElement, position: Readonly<Vector3>, lights: VialLights) {
    const previous = this.colors.get(element);
    if (!this.sampling && previous !== undefined) return;
    const color = vialLightColor(this.color, lights, position).getStyle();
    if (color !== previous) { element.style.setProperty("--vial-light", color); this.colors.set(element, color); }
  }
}

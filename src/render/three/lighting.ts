import { Color, DirectionalLight, Fog, HemisphereLight, PointLight, type Scene, Vector3 } from "three";
import type { LightAnchor } from "./contracts";

export type LightingPreset = "day" | "dusk" | "night";
export const LOCAL_LIGHT_LIMIT = 4;
export const LIGHTING_PRESETS = {
  day: { sky: 0xb1bfba, fog: 0xb1bfba, sun: 0xffe7be, sunPower: 2.1, fill: 0xc4d3cf, ground: 0x666844, fillPower: 1.6, lamps: 0.55 },
  dusk: { sky: 0x8f9aa4, fog: 0x8f9aa4, sun: 0xffd1a0, sunPower: 1.7, fill: 0xa8bdcc, ground: 0x5b5b43, fillPower: 1.2, lamps: 1.8 },
  night: { sky: 0x303f52, fog: 0x303f52, sun: 0x9ebce2, sunPower: 0.5, fill: 0x8baccb, ground: 0x3b4243, fillPower: 0.72, lamps: 2.5 },
} as const;

export interface SceneLamp extends LightAnchor { id: string }
/** Explicit selection caps shader light count; radius alone does not cull a Three.js light. */
export function selectLocalLights<T extends { id: string; position: { x: number; z: number }; kind: string }>(
  candidates: readonly T[], x: number, z: number, previous: readonly string[] = [], limit = LOCAL_LIGHT_LIMIT,
): T[] {
  return candidates
    .map(lamp => ({ lamp, distance: Math.hypot(lamp.position.x - x, lamp.position.z - z) }))
    .filter(entry => entry.distance < 36)
    .sort((a, b) => {
      const score = (v: typeof a) => v.distance * (previous.includes(v.lamp.id) ? 0.8 : 1) - (v.lamp.kind === "forge" ? 2 : 0);
      return score(a) - score(b) || a.lamp.id.localeCompare(b.lamp.id);
    })
    .slice(0, Math.max(0, Math.min(LOCAL_LIGHT_LIMIT, Math.floor(limit))))
    .map(entry => entry.lamp);
}

export class LightingRig {
  readonly sun = new DirectionalLight();
  readonly fill = new HemisphereLight();
  readonly slots = Array.from({ length: LOCAL_LIGHT_LIMIT }, () => new PointLight(0xffb965, 0, 10, 2));
  private active: SceneLamp[] = [];
  private selectedIds: string[] = [];
  private preset: LightingPreset = "dusk";
  private shadows = true;
  private scene: Scene;
  private fog = new Fog(0x8f9aa4, 58, 135);
  private lastSelection = -Infinity;
  private shadowTarget = new Vector3();
  private shadowRight = new Vector3(16, 0, 28).normalize();
  private shadowUp = new Vector3(-28, 34, 16).normalize().cross(this.shadowRight).normalize();
  private sunOffset = new Vector3(-28, 34, 16);
  constructor(scene: Scene) {
    this.scene = scene;
    this.sun.castShadow = true;
    this.sun.shadow.mapSize.set(1024, 1024);
    Object.assign(this.sun.shadow.camera, { left: -24, right: 24, top: 24, bottom: -24, near: 1, far: 110 });
    this.sun.shadow.bias = -0.0007;
    this.sun.shadow.normalBias = 0.08;
    this.sun.shadow.radius = 2;
    scene.add(this.sun, this.sun.target, this.fill, ...this.slots);
    this.slots.forEach(light => { light.castShadow = false; });
    this.setPreset("dusk");
  }
  setPreset(preset: LightingPreset) {
    if (this.preset === preset && this.scene.background) return;
    this.preset = preset;
    const p = LIGHTING_PRESETS[preset];
    this.scene.background = new Color(p.sky);
    this.fog.color.setHex(p.fog);
    this.sun.color.setHex(p.sun);
    this.sun.intensity = p.sunPower;
    this.fill.color.setHex(p.fill);
    this.fill.groundColor.setHex(p.ground);
    this.fill.intensity = p.fillPower;
  }
  setShadows(enabled: boolean) { this.shadows = enabled; this.sun.castShadow = enabled; }
  get activeCount() { return this.active.length; }
  get shadowCount() { return this.shadows ? 1 : 0; }
  update(lamps: readonly SceneLamp[], target: Vector3, time: number, overview: boolean, cameraDistance = 66) {
    this.scene.fog = overview ? null : this.fog;
    this.fog.near = Math.max(1, cameraDistance - 8);
    this.fog.far = cameraDistance + 70;
    // Snap in light-camera space to whole shadow texels. World-axis snapping alone
    // still slides rotated shadow samples when the camera follows a walking actor.
    const texel = 48 / this.sun.shadow.mapSize.x;
    const u = target.dot(this.shadowRight), v = target.dot(this.shadowUp);
    this.shadowTarget.copy(target)
      .addScaledVector(this.shadowRight, Math.round(u / texel) * texel - u)
      .addScaledVector(this.shadowUp, Math.round(v / texel) * texel - v);
    this.sun.position.copy(this.shadowTarget).add(this.sunOffset);
    this.sun.target.position.copy(this.shadowTarget);
    this.sun.target.updateMatrixWorld();
    if (time - this.lastSelection > 450) {
      this.active = overview ? [] : selectLocalLights(lamps, target.x, target.z, this.selectedIds);
      this.selectedIds = this.active.map(l => l.id);
      this.lastSelection = time;
    }
    this.slots.forEach((light, index) => {
      const source = this.active[index];
      if (!source || overview) { light.intensity = 0; return; }
      light.position.copy(source.position);
      light.color.setHex(source.color);
      light.distance = source.distance;
      const flicker = source.kind === "forge" ? 0.92 + 0.05 * Math.sin(time * 0.013 + index) + 0.03 * Math.sin(time * 0.023) : 1;
      light.intensity = source.intensity * LIGHTING_PRESETS[this.preset].lamps * flicker;
    });
  }
  dispose() {
    this.sun.shadow.map?.dispose();
    this.sun.dispose();
    this.slots.forEach(light => light.dispose());
    this.scene.remove(this.sun, this.sun.target, this.fill, ...this.slots);
  }
}

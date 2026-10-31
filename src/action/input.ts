import type { ActionInput } from "./contracts";

export interface GroundVector { x: number; z: number }
export interface CameraAxes { right: GroundVector; forward: GroundVector }
export const DEFAULT_CAMERA_AXES: CameraAxes = {
  right: { x: Math.SQRT1_2, z: -Math.SQRT1_2 },
  forward: { x: -Math.SQRT1_2, z: -Math.SQRT1_2 },
};

/** Screen x is right, screen y is down. Magnitude never exceeds one. */
export function normalizeMovement(x: number, y: number): { x: number; y: number } {
  if (!Number.isFinite(x) || !Number.isFinite(y)) return { x: 0, y: 0 };
  const length = Math.hypot(x, y);
  const divisor = Math.max(1, length);
  return { x: x / divisor, y: y / divisor };
}

/** Radial deadzone with a continuous full-range remainder. */
export function applyStickDeadzone(x: number, y: number, deadzone = 0.18): { x: number; y: number } {
  const vector = normalizeMovement(x, y);
  const length = Math.hypot(vector.x, vector.y);
  const threshold = Math.max(0, Math.min(0.99, deadzone));
  if (length <= threshold) return { x: 0, y: 0 };
  const magnitude = (length - threshold) / (1 - threshold);
  return { x: vector.x / length * magnitude, y: vector.y / length * magnitude };
}

export function mapScreenMovement(x: number, y: number, axes: CameraAxes = DEFAULT_CAMERA_AXES): GroundVector {
  const screen = normalizeMovement(x, y);
  const world = normalizeMovement(
    axes.right.x * screen.x - axes.forward.x * screen.y,
    axes.right.z * screen.x - axes.forward.z * screen.y,
  );
  return { x: world.x, z: world.y };
}

export class ButtonEdgeTracker {
  private held = new Set<string>();
  update(button: string, pressed: boolean): boolean {
    const edge = pressed && !this.held.has(button);
    if (pressed) this.held.add(button); else this.held.delete(button);
    return edge;
  }
  clear(): void { this.held.clear(); }
}

/** Read once per action step. Strikes pulse once; held movement and guard persist. */
export class ActionInputBuffer {
  private keys = new Set<string>();
  private movement = new Map<string, { x: number; y: number }>();
  private strikes = new ButtonEdgeTracker();
  private pendingStrike: boolean | undefined;
  private blocks = new Set<string>();
  private axes: CameraAxes;

  constructor(axes: CameraAxes = DEFAULT_CAMERA_AXES) { this.axes = axes; }
  setCameraAxes(axes: CameraAxes): void { this.axes = axes; }
  setKey(code: string, held: boolean): void {
    if (held) this.keys.add(code); else this.keys.delete(code);
  }
  setMovement(source: string, x: number, y: number): void {
    this.movement.set(source, normalizeMovement(x, y));
  }
  setStrike(source: string, held: boolean, tool = true): void {
    if (this.strikes.update(source, held)) this.pendingStrike = tool;
  }
  setBlock(source: string, held: boolean): void {
    if (held) this.blocks.add(source); else this.blocks.delete(source);
  }
  read(): ActionInput {
    let x = Number(this.keys.has("KeyD") || this.keys.has("ArrowRight")) - Number(this.keys.has("KeyA") || this.keys.has("ArrowLeft"));
    let y = Number(this.keys.has("KeyS") || this.keys.has("ArrowDown")) - Number(this.keys.has("KeyW") || this.keys.has("ArrowUp"));
    for (const vector of this.movement.values()) { x += vector.x; y += vector.y; }
    const movement = mapScreenMovement(x, y, this.axes);
    const tool = this.pendingStrike;
    this.pendingStrike = undefined;
    return { moveX: movement.x, moveZ: movement.z, strike: tool !== undefined, block: this.blocks.size > 0, tool: tool ?? true };
  }
  clear(): void {
    this.keys.clear(); this.movement.clear(); this.strikes.clear();
    this.pendingStrike = undefined; this.blocks.clear();
  }
}

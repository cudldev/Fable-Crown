/** Authoritative fixed-step action simulation. Rendering never mutates these values. */
export const ACTION_HZ = 60;
export const ACTION_DT = 1 / ACTION_HZ;
export const SETTLEMENT_ACTION_STEPS = 36;
export interface ActionPlayer {
  x: number; z: number; height: number; facingX: number; facingZ: number;
  moveRemainderX: number; moveRemainderZ: number;
  health: number; maxHealth: number; guard: number;
  guardDelay: number; guardBroken: number; swing: number; blocking: boolean;
}
export interface ActionEnemy {
  id: string; x: number; z: number; homeX: number; homeZ: number;
  health: number; maxHealth: number; cooldown: number; windup: number;
  damage: number; aggressive: boolean; defeated: boolean;
}
export interface ActionState {
  /** Elapsed 1/60-second quanta; Valley commits 36 quanta per gameplay tick. */
  frame: number; player: ActionPlayer; enemies: ActionEnemy[]; strikeHeld: boolean; swingTool: boolean;
  stepMs?: number;
  /** Presentation marker for a swing committed at a coarse gameplay boundary. */
  swingStartedAt?: number;
}
export interface ActionInput { moveX: number; moveZ: number; strike: boolean; block: boolean; tool: boolean }
export interface ActionTarget { id: string; x: number; z: number; kind: "resource" | "enemy" }
export interface ActionWorld {
  /** Legal pointer-route segments to sweep within this commit's movement budget. */
  movementPath?: readonly {x:number;z:number}[];
  /** Relative route cost; roads are preferred without changing movement speed. */
  travelCost?(x:number,z:number):number;
  /** An explicitly selected pointer activity only contacts its selected target. */
  targetId?:string;
  canOccupy(x: number, z: number, fromX: number, fromZ: number): boolean;
  groundHeight(x: number, z: number): number;
  isSafe(x: number, z: number): boolean;
  targets: readonly ActionTarget[];
}
export type ActionEvent =
  | { kind: "resource-hit"; targetId: string }
  | { kind: "enemy-hit"; targetId: string; damage: number }
  | { kind: "enemy-defeat"; targetId: string }
  | { kind: "player-hit"; targetId: string; damage: number }
  | { kind: "block"; targetId: string }
  | { kind: "player-defeat" };

import type { Point } from "./types";
export interface CameraState extends Point {
  zoom: number;
  followId: number | null;
  overview: boolean;
}
export type WorldSelection =
  | { kind: "person"; id: number }
  | { kind: "target"; id: string }
  | { kind: "ground"; point: Point };

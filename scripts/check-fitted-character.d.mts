export interface FittedCharacterReport {
  valid: boolean; errors: string[]; warnings: string[]; bytes: number; triangles: number; vertices: number;
  meshes: number; meshInstances: number; skinnedMeshes: number; staticMeshes: number; primitives: number;
  materials: number; deformBones: number; maxWeightError: number; nodes: number;
  atlas: { width: number; height: number; bytes: number };
  bounds: { min: number[]; max: number[]; size: number[] };
  clips: { name: string; duration: number; channels: number; movingChannels: number; movingJointChannels: number }[];
  artAccepted: false; exclusions: string[];
}
export function inspectFittedCharacter(input: Uint8Array): FittedCharacterReport;

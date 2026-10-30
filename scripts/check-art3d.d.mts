export interface AssetMetrics {
  bytes: number; triangles: number; vertices: number; meshes: number; primitives: number; nodes: number; materials: number;
  bounds: { min: number[]; max: number[]; size: number[] }; atlas: { width: number; height: number };
}
export const ASSET_CATALOG: Record<string, { footprint: number[]; requiredNodes: string[]; maxTriangles: number; maxNodes: number; height: number[]; maxSpan: number }>;
export const INK_STUDY_SPEC: { footprint: number[]; requiredNodes: string[]; maxTriangles: number; maxNodes: number; height: number[]; maxSpan: number };
export function inspectGlb(input: Uint8Array, id: string): AssetMetrics;
export function inspectPng(input: Buffer, requiredSize?: number): { width: number; height: number; bytes: number };
export function checkArt3d(options?: { write?: boolean }): Promise<{ version: string; files: string[]; assets: (AssetMetrics & { id: string; url: string; source: string; footprint: number[]; requiredNodes: string[] })[]; bytes: number }>;

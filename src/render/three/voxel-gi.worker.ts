import type { GISolveConfig, GIWorldSource } from "./voxel-gi-core";
import { solveGISliced, type GIPhase } from "./voxel-gi-solve";

let world: GIWorldSource | undefined, generation = 0;

async function solve(source: GIWorldSource, config: GISolveConfig, version: number, epoch: number) {
  let phase: GIPhase | undefined, reportedAt = -Infinity;
  const result = await solveGISliced(source, config, progress => {
    const now = performance.now();
    if (progress.phase !== phase || now - reportedAt >= 50) {
      phase = progress.phase; reportedAt = now;
      postMessage({ type: "progress", version, ...progress });
    }
  }, { isCurrent: () => epoch === generation });
  if (result && epoch === generation) postMessage({ type: "ready", version, ...result }, { transfer: [result.data.buffer] });
}

self.onmessage = event => {
  if (event.data.type === "world") { world = event.data.world; generation++; return; }
  if (event.data.type === "solve" && world) {
    const epoch = ++generation;
    void solve(world, event.data.config, event.data.version, epoch).catch(error => {
      if (epoch === generation) postMessage({ type: "error", version: event.data.version, message: String(error) });
    });
  }
};

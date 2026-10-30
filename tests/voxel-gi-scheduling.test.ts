import { expect, test, vi } from "vitest";
import { Vector3 } from "three";
import { VoxelGI } from "../src/render/three/voxel-gi";
import type { GISolveConfig, GIWorldSource } from "../src/render/three/voxel-gi-core";
import { DEFAULT_VISUAL_SETTINGS, normalizeVisualSettings } from "../src/render/three/visual-settings";

class Transport {
  static latest: Transport;
  messages: { type: string; version?: number; config?: GISolveConfig }[] = [];
  onmessage?: (event: { data: unknown }) => void;
  onerror?: () => void;
  terminated = false;
  constructor() { Transport.latest = this; }
  postMessage(message: { type: string; version?: number; config?: GISolveConfig }) { this.messages.push(message); }
  ready(version: number) { this.onmessage?.({ data: { type: "ready", version, data: new Uint16Array(144), size: [1, 1, 1], origin: [0, 0, 0], pitch: .5, stats: { totalMs: 1 } } }); }
  terminate() { this.terminated = true; }
}

test("continuous resource updates cannot starve the active lighting solve; latest pending state wins", () => {
  vi.stubGlobal("Worker", Transport);
  const gi = new VoxelGI(), transport = Transport.latest;
  try {
    const empty = new Float32Array();
    const world: GIWorldSource = { width: 1, height: 1, ground: new Uint32Array(1), objects: ["a", "b"].map(id => ({ id, bounds: [0, 0, 0, 1, 1, 1], triangles: empty, availableTriangles: empty, depletedTriangles: empty })) };
    gi.setWorld(world);
    gi.update(new Vector3(), "day", [], [], true, true, false);
    gi.update(new Vector3(), "day", [], ["a"], true, true, false);
    gi.update(new Vector3(), "day", [], ["b"], true, true, false);
    expect(transport.messages.filter(m => m.type === "solve")).toHaveLength(1);
    transport.ready(1);
    expect(gi.stats.appliedVersion).toBe(1);
    const solves = transport.messages.filter(m => m.type === "solve");
    expect(solves).toHaveLength(2); expect(solves[1].config?.depleted).toEqual(["b"]);
    gi.update(new Vector3(), "night", [], ["b"], true, true, false);
    transport.ready(2); expect(gi.stats.appliedVersion).toBe(1);
    transport.ready(3); expect(gi.stats.appliedVersion).toBe(3); expect(gi.stats.appliedPreset).toBe("night");
  } finally { gi.dispose(); vi.unstubAllGlobals(); }
  expect(transport.terminated).toBe(true);
});

test("live source sliders debounce transport work and feed the same lighting into the solver", () => {
  vi.stubGlobal("Worker", Transport); let clock = 0; const time = vi.spyOn(performance, "now").mockImplementation(() => clock);
  const gi = new VoxelGI(), transport = Transport.latest;
  try {
    gi.setWorld({ width: 1, height: 1, ground: new Uint32Array(1), objects: [] });
    gi.update(new Vector3(), "day", [], [], true, true, false, DEFAULT_VISUAL_SETTINGS); transport.ready(1);
    clock = 10; gi.update(new Vector3(), "day", [], [], true, true, false, normalizeVisualSettings({ sunStrength: 2 }));
    const settings = normalizeVisualSettings({ sunStrength: 3, sunTint: "#ff0000" });
    clock = 100; gi.update(new Vector3(), "day", [], [], true, true, false, settings);
    clock = 250; gi.update(new Vector3(), "day", [], [], true, true, false, settings);
    expect(transport.messages.filter(m => m.type === "solve")).toHaveLength(1);
    clock = 281; gi.update(new Vector3(), "day", [], [], true, true, false, settings);
    const solves = transport.messages.filter(m => m.type === "solve"); expect(solves).toHaveLength(2);
    expect(solves[1].config?.sunPower).toBeCloseTo(6.3); expect(solves[1].config?.sunColor).toEqual([1, 0, 0]);
    gi.update(new Vector3(), "day", [], [], true, true, false, { ...settings, exposure: 2, giStrength: .2, aoStrength: .4, shadowResolution: 2048 });
    expect(transport.messages.filter(m => m.type === "solve")).toHaveLength(2);
  } finally { gi.dispose(); time.mockRestore(); vi.unstubAllGlobals(); }
});

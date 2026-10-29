import { describe, expect, it } from "vitest";
import {
  BLOCKERS,
  findPath,
  isWalkable,
  nearestSettlement,
  REGIONS,
  SETTLEMENTS,
  TARGETS,
  WORLD,
} from "../src/world";
import type { Point } from "../src/types";
function safePath(from: Point, to: Point): number {
  const path = findPath(from, to);
  expect(path).not.toBeNull();
  let last = from,
    total = 0;
  for (const p of path!) {
    const d = Math.hypot(p.x - last.x, p.y - last.y);
    total += d;
    for (let i = 0; i <= Math.ceil(d / 8); i++) {
      const n = Math.max(1, Math.ceil(d / 8));
      expect(
        isWalkable({
          x: last.x + ((p.x - last.x) * i) / n,
          y: last.y + ((p.y - last.y) * i) / n,
        }),
      ).toBe(true);
    }
    last = p;
  }
  expect(last).toEqual({ x: to.x, y: to.y });
  return total;
}
describe("expanded world navigation", () => {
  it("keeps cached waypoints independent of actors consuming their paths", () => {
    const from = SETTLEMENTS[0]!,
      to = SETTLEMENTS[1]!;
    const path = findPath(from, to)!,
      original = structuredClone(path);
    path[0]!.x = -1;
    path.shift();
    expect(findPath(from, to)).toEqual(original);
  });
  it("has a 36-area world, nine regions and selectable targets", () => {
    expect(WORLD).toEqual({ width: 6600, height: 4440 });
    expect(REGIONS).toHaveLength(9);
    expect(TARGETS.length).toBeGreaterThanOrEqual(12);
    REGIONS.forEach((r, i) => expect(r.image).toBe(`art/region-${i}.webp`));
  });
  it("routes every town pair through safe ground", () => {
    for (const a of SETTLEMENTS)
      for (const b of SETTLEMENTS) {
        safePath(a, b);
      }
    const seconds = (safePath(SETTLEMENTS[0]!, SETTLEMENTS[1]!) / 36) * 0.6;
    expect(seconds).toBeGreaterThanOrEqual(45);
    expect(seconds).toBeLessThanOrEqual(90);
  });
  it("routes from Oakrest to all targets", () => {
    for (const t of TARGETS) safePath(SETTLEMENTS[0]!, t);
  });
  it("blocks rivers, buildings and cliffs but permits bridges", () => {
    expect(isWalkable({ x: 3000, y: 2200 })).toBe(false);
    expect(isWalkable({ x: 3000, y: 1100 })).toBe(true);
    expect(isWalkable({ x: 3000, y: 3000 })).toBe(true);
    for (const b of BLOCKERS)
      expect(isWalkable({ x: b.x + b.width / 2, y: b.y + b.height / 2 })).toBe(
        false,
      );
    expect(findPath(SETTLEMENTS[0]!, { x: 3000, y: 2200 })).toBeNull();
    expect(findPath({ x: -1, y: 10 }, SETTLEMENTS[0]!)).toBeNull();
  });
  it("navigates arbitrary reachable ground and replays paths deterministically", () => {
    const a = { x: 800, y: 3200 },
      b = { x: 6300, y: 3900 };
    safePath(a, b);
    expect(findPath(a, b)).toEqual(findPath(a, b));
    expect(nearestSettlement({ x: 4000, y: 900 }).id).toBe("briarford");
  });
});

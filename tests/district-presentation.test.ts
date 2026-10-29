import { describe, expect, it } from "vitest";
import type { WorldObject } from "../src/rpg/types";
import { districtProp, objectHitTarget } from "../src/render/presentation";

const prop = (kind: WorldObject["kind"], extra: Partial<WorldObject> = {}): WorldObject => ({
  id: "test-gate", name: "Test prop", kind, position: { worldId: "frontier", plane: 0, x: 30, y: 70 },
  width: 1, height: 1, blocks: false, ...extra,
});

describe("authored district presentation", () => {
  it("matches gate art to the authoritative state and defaults missing gates open", () => {
    const gate = prop("gate");
    expect(districtProp(gate, {})?.art).toBe("prop-gate-open");
    expect(districtProp(gate, { "test-gate": true })?.art).toBe("prop-gate-open");
    expect(districtProp(gate, { "test-gate": false })?.art).toBe("prop-gate-closed");
    expect(gate.blocks).toBe(false);
  });

  it("mirrors the y fence axis while retaining equal ground geometry", () => {
    const x = districtProp(prop("fence", { orientation: "x" }), {})!;
    const y = districtProp(prop("fence", { orientation: "y" }), {})!;
    expect(x.flipX).toBe(false);
    expect(y).toEqual({ ...x, flipX: true });
    expect(districtProp(prop("gate", { orientation: "y" }), {})?.flipX).toBe(true);
    expect(districtProp(prop("decor", { art: "prop-crops" }), {})).toMatchObject({ art: "prop-crops", height: 55 });
  });

  it("keeps passive props out of pointer targets at every scale, including selection", () => {
    for (const kind of ["fence", "decor"] as const)
      for (const zoom of [0.1, 0.35, 1, 3])
        for (const overview of [false, true])
          expect(objectHitTarget(prop(kind), zoom, overview, true)).toBe(false);
  });

  it("offers gate/sign targets at close range and suppresses them in far and overview", () => {
    for (const kind of ["gate", "sign"] as const) {
      expect(objectHitTarget(prop(kind), 0.35, false, false)).toBe(true);
      expect(objectHitTarget(prop(kind), 0.34, false, true)).toBe(false);
      expect(objectHitTarget(prop(kind), 1, true, true)).toBe(false);
    }
    expect(objectHitTarget(prop("landmark", { id: "oakrest" }), 0.1, true, false)).toBe(true);
    expect(objectHitTarget(prop("tree"), 0.1, false, true)).toBe(true);
  });
});

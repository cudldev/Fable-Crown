import { describe, expect, it } from "vitest";
import { ActionInputBuffer, applyStickDeadzone, ButtonEdgeTracker, mapScreenMovement, normalizeMovement } from "../src/action/input";

const axes = { right: { x: 1, z: 0 }, forward: { x: 0, z: -1 } };
describe("continuous action input", () => {
  it("normalizes diagonal input without speeding up and preserves analog magnitude", () => {
    expect(normalizeMovement(3, 4)).toEqual({ x: 0.6, y: 0.8 });
    expect(normalizeMovement(0.25, 0)).toEqual({ x: 0.25, y: 0 });
    expect(normalizeMovement(NaN, 1)).toEqual({ x: 0, y: 0 });
    const diagonal = mapScreenMovement(1, -1, axes);
    expect(Math.hypot(diagonal.x, diagonal.z)).toBeCloseTo(1);
  });

  it("maps screen directions through the current isometric camera axes", () => {
    expect(mapScreenMovement(0, -1, axes)).toEqual({ x: 0, z: -1 });
    const north = mapScreenMovement(0, -1);
    expect(north.x).toBeCloseTo(-Math.SQRT1_2);
    expect(north.z).toBeCloseTo(-Math.SQRT1_2);
    const buffer = new ActionInputBuffer(axes);
    buffer.setKey("KeyW", true);
    buffer.setCameraAxes({ right: { x: 0, z: 1 }, forward: { x: 1, z: 0 } });
    expect(buffer.read().moveX).toBe(1);
  });

  it("removes stick drift with a radial deadzone and rescales the remaining range", () => {
    expect(applyStickDeadzone(0.1, 0.1)).toEqual({ x: 0, y: 0 });
    expect(applyStickDeadzone(0.59, 0).x).toBeCloseTo(0.5);
    expect(applyStickDeadzone(1, 1).x).toBeCloseTo(Math.SQRT1_2);
    expect(applyStickDeadzone(1, 1).y).toBeCloseTo(Math.SQRT1_2);
    expect(applyStickDeadzone(0, 0, 0)).toEqual({ x: 0, y: 0 });
  });

  it("keeps multiple movement keys held independently and cancels opposing directions", () => {
    const buffer = new ActionInputBuffer(axes);
    buffer.setKey("KeyW", true); buffer.setKey("KeyD", true);
    let input = buffer.read();
    expect(Math.hypot(input.moveX, input.moveZ)).toBeCloseTo(1);
    buffer.setKey("KeyS", true);
    expect(buffer.read()).toMatchObject({ moveX: 1, moveZ: 0 });
    buffer.setKey("KeyD", false); buffer.setKey("KeyS", false);
    input = buffer.read();
    expect(input.moveX).toBe(0); expect(input.moveZ).toBe(-1);
    expect(buffer.read().moveZ).toBe(-1);
  });

  it("consumes each press once while block and movement remain held", () => {
    const buffer = new ActionInputBuffer(axes);
    buffer.setMovement("virtual", 0.3, 0); buffer.setBlock("virtual", true);
    buffer.setStrike("virtual", true); buffer.setStrike("virtual", true);
    expect(buffer.read()).toMatchObject({ moveX: 0.3, block: true, strike: true });
    expect(buffer.read()).toMatchObject({ moveX: 0.3, block: true, strike: false });
    buffer.setStrike("virtual", false); buffer.setStrike("virtual", true, false);
    expect(buffer.read()).toMatchObject({ strike: true, tool: false });
  });

  it("collapses sub-frame rapid presses without queuing delayed strikes", () => {
    const buffer = new ActionInputBuffer();
    buffer.setStrike("mouse", true); buffer.setStrike("mouse", false);
    buffer.setStrike("mouse", true); buffer.setStrike("mouse", false);
    expect(buffer.read().strike).toBe(true);
    expect(buffer.read().strike).toBe(false);
    expect(buffer.read().strike).toBe(false);
  });

  it("combines input sources safely and releases guard independently", () => {
    const buffer = new ActionInputBuffer(axes);
    buffer.setKey("KeyD", true); buffer.setMovement("gamepad", 1, 0);
    buffer.setBlock("mouse", true); buffer.setBlock("gamepad", true);
    buffer.setBlock("mouse", false);
    expect(buffer.read()).toMatchObject({ moveX: 1, block: true });
    buffer.setBlock("gamepad", false);
    expect(buffer.read().block).toBe(false);
  });

  it("clears held keys, stick, guard, and pending strikes on focus/device loss", () => {
    const buffer = new ActionInputBuffer(axes);
    buffer.setKey("KeyW", true); buffer.setMovement("gamepad", 1, 1);
    buffer.setBlock("mouse", true); buffer.setStrike("mouse", true);
    buffer.clear();
    expect(buffer.read()).toEqual({ moveX: 0, moveZ: 0, block: false, strike: false, tool: true });
    buffer.setStrike("mouse", true);
    expect(buffer.read().strike).toBe(true);
  });

  it("triggers gamepad callbacks only on button edges and resets on disconnect", () => {
    const edges = new ButtonEdgeTracker();
    expect(edges.update("A", true)).toBe(true);
    expect(edges.update("A", true)).toBe(false);
    expect(edges.update("B", true)).toBe(true);
    expect(edges.update("A", false)).toBe(false);
    expect(edges.update("A", true)).toBe(true);
    edges.clear();
    expect(edges.update("A", true)).toBe(true);
  });
});

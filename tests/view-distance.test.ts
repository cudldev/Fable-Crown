import { expect, test } from "vitest";
import { Box3, PerspectiveCamera, Vector3 } from "three";
import { ViewDistance } from "../src/render/three/view-distance";
import { WorldCurve } from "../src/render/three/world-curve";

function fixture(span = 12) {
  const camera = new PerspectiveCamera(20, 1.6, .1, 650);
  camera.position.set(17, 17, 24); camera.lookAt(0, .4, 0); camera.updateMatrixWorld();
  const view = new ViewDistance(); view.update(camera, new Vector3(), span, 60, false);
  return { camera, view };
}

test("low-angle local horizon ends after the fog and disables nearly invisible click targets", () => {
  const { view } = fixture();
  expect(view.range.toArray()).toEqual([10.8, 24]);
  expect(view.pickable(new Vector3(0, 0, 0))).toBe(true);
  expect(view.contains(new Vector3(0, 0, -23))).toBe(true);
  expect(view.pickable(new Vector3(0, 0, -23))).toBe(false);
  expect(view.contains(new Vector3(0, 0, -25))).toBe(false);
});

test("a bent onscreen point outside the local horizon never becomes clickable", () => {
  const { camera, view } = fixture(), curve = new WorldCurve();
  curve.update(new Vector3(), 2, 2, true);
  const logical = new Vector3(-17, 1, -24), projected = curve.bend(logical.clone()).project(camera);
  expect(Math.abs(projected.x)).toBeLessThan(1); expect(Math.abs(projected.y)).toBeLessThan(1.12);
  expect(projected.z).toBeGreaterThan(-1); expect(projected.z).toBeLessThan(1);
  expect(view.pickable(logical)).toBe(false);
  const behind = camera.position.clone().addScaledVector(view.forward, -3);
  expect(view.contains(behind)).toBe(false);
});

test("bounds crossing the fog edge stay until fully hidden; overview bypasses the local horizon", () => {
  const { view, camera } = fixture();
  const crossing = new Box3(new Vector3(-1, 0, -27), new Vector3(1, 4, -22));
  const outside = new Box3(new Vector3(-1, 0, -30), new Vector3(1, 4, -26));
  expect(view.intersects(crossing)).toBe(true); expect(view.intersects(outside)).toBe(false);
  view.update(camera, new Vector3(), 300, 60, true);
  expect(view.intersects(outside)).toBe(true); expect(view.pickable(new Vector3(100, 0, 100))).toBe(true);
});

test("reach is bounded before the camera, tracks zoom/pan and respects a shorter fog setting", () => {
  const { camera, view } = fixture();
  view.update(camera, new Vector3(), 100, 160, false);
  expect(view.range.y).toBeLessThan(Math.hypot(camera.position.x, camera.position.z));
  view.update(camera, new Vector3(), 12, 20, false); expect(view.range.y).toBe(20);
  camera.position.add(new Vector3(100, 0, 100)); camera.updateMatrixWorld();
  view.update(camera, new Vector3(100, 0, 100), 12, 60, false);
  expect(view.pickable(new Vector3(100, 0, 100))).toBe(true); expect(view.pickable(new Vector3())).toBe(false);
});

import { expect, test } from "vitest";
import { Camera, Color, DirectionalLight, HemisphereLight, PointLight, Vector3 } from "three";
import { FloatingVials, vialLightColor } from "../src/render/three/floating-vials";

function lights() {
  const sun = new DirectionalLight(0xffffff, 0), fill = new HemisphereLight(0xffffff, 0xffffff, 0);
  return { sun, fill, slots: [new PointLight(0xff8811, 0, 5)] };
}
test("vial light retains a readable floor in darkness and bounds extreme brightness", () => {
  const rig = lights(), color = new Color(), point = new Vector3();
  vialLightColor(color, rig, point);
  expect(color.toArray()).toEqual([.14, .14, .14]);
  rig.sun.intensity = 1e6; rig.fill.intensity = 1e6;
  vialLightColor(color, rig, point);
  expect(color.toArray()).toEqual([.9, .9, .9]);
});
test("local lamps tint nearby vials and contribute nothing beyond their range", () => {
  const rig = lights(), near = new Color(), far = new Color();
  rig.slots[0].intensity = 20;
  vialLightColor(near, rig, new Vector3(1, 0, 0));
  vialLightColor(far, rig, new Vector3(6, 0, 0));
  expect(near.r).toBeGreaterThan(near.g); expect(near.g).toBeGreaterThan(near.b);
  expect(far.toArray()).toEqual([.14, .14, .14]);
});
test("lighting writes are throttled, unchanged colors are skipped, and newly visible bars initialize", () => {
  const calls: string[] = [], fakeElement = () => ({ style: { setProperty: (key: string, value: string) => calls.push(`${key}:${value}`) } }) as unknown as HTMLElement;
  const rig = lights(), vials = new FloatingVials(fakeElement()), label = fakeElement(), camera = new Camera(), point = new Vector3();
  vials.beginFrame(0, rig, camera); vials.update(label, point, rig);
  const initialized = calls.length;
  rig.sun.intensity = 2;
  vials.beginFrame(50, rig, camera); vials.update(label, point, rig);
  expect(calls).toHaveLength(initialized);
  vials.update(fakeElement(), point, rig); expect(calls).toHaveLength(initialized + 1);
  vials.beginFrame(100, rig, camera); vials.update(label, point, rig);
  expect(calls).toHaveLength(initialized + 2);
  vials.beginFrame(200, rig, camera); vials.update(label, point, rig);
  expect(calls).toHaveLength(initialized + 2);
});

import { expect, test } from "vitest";
import { FrameMeter } from "../src/render/three/performance";

test("FPS and frame time describe real frame cadence and recent stutters", () => {
  const meter = new FrameMeter(); for (let i = 1; i <= 101; i++) meter.sample(i * 20);
  expect(meter.read().fps).toBeCloseTo(50); expect(meter.read().meanMs).toBe(20);
  for (let i = 1; i <= 10; i++) meter.sample(2020 + i * 100);
  expect(meter.read().fps).toBeLessThan(50); expect(meter.read().p95Ms).toBe(100);
});

test("visibility reset ignores a paused tab while long visible-frame stalls remain measurable", () => {
  const meter = new FrameMeter(); meter.sample(10); meter.sample(30); meter.sample(1230);
  expect(meter.read().p95Ms).toBe(1200);
  meter.reset(); meter.sample(5030); expect(meter.read().samples).toBe(0); meter.sample(5050); expect(meter.read().fps).toBe(50);
});

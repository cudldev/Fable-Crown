import { afterEach, expect, test, vi } from "vitest";
import { HitDimensions } from "../src/render/three/hit-dimensions";

afterEach(() => vi.unstubAllGlobals());
function element(width: number, height: number, reads: string[], id: string) {
  return { get offsetWidth() { reads.push(id + ":width"); return width; }, get offsetHeight() { reads.push(id + ":height"); return height; } } as HTMLElement;
}
function observed() {
  let notify!: ResizeObserverCallback;
  const observer = { observe: vi.fn(), unobserve: vi.fn(), disconnect: vi.fn() };
  vi.stubGlobal("ResizeObserver", class { constructor(callback: ResizeObserverCallback) { notify = callback; } observe = observer.observe; unobserve = observer.unobserve; disconnect = observer.disconnect; });
  return { observer, resize: (target: HTMLElement, width: number, height: number) => notify([{ target, borderBoxSize: [{ inlineSize: width, blockSize: height }] } as unknown as ResizeObserverEntry], observer as unknown as ResizeObserver) };
}

test("camera movement reuses measured label sizes; content resizes update without synchronous frame reads", () => {
  const events: string[] = [], { observer, resize } = observed(), dimensions = new HitDimensions();
  const node = element(84, 31, events, "label");
  dimensions.prepare([node]); expect(dimensions.get(node)).toEqual({ width: 84, height: 31 });
  for (let frame = 0; frame < 120; frame++) dimensions.prepare([node]);
  expect(events).toEqual(["label:width", "label:height"]); expect(dimensions.reads).toBe(1);
  resize(node, 109.6, 42.2); expect(dimensions.get(node)).toEqual({ width: 110, height: 42 });
  expect(events).toHaveLength(2); expect(observer.observe).toHaveBeenCalledOnce();
  dimensions.dispose(); expect(observer.disconnect).toHaveBeenCalledOnce();
});

test("hidden labels retain their intrinsic size for re-entry; removed labels release observers", () => {
  const { observer, resize } = observed(), dimensions = new HitDimensions(), a = element(90, 24, [], "a"), b = element(45, 20, [], "b");
  dimensions.prepare([a, b]); resize(a, 0, 0);
  expect(dimensions.get(a)).toEqual({ width: 90, height: 24 });
  dimensions.prepare([b]); expect(observer.unobserve).toHaveBeenCalledWith(a); expect(dimensions.count).toBe(1);
  resize(a, 200, 200); expect(dimensions.get(a)).toEqual({ width: 0, height: 0 });
  dimensions.dispose(); expect(dimensions.count).toBe(0);
});

test("new hidden labels acquire sizes after reveal, while the observer-less fallback refreshes all reads together", () => {
  const { resize } = observed(), dimensions = new HitDimensions(), hidden = element(0, 0, [], "hidden");
  dimensions.prepare([hidden]); expect(dimensions.get(hidden)).toEqual({ width: 0, height: 0 });
  resize(hidden, 70, 25); expect(dimensions.get(hidden)).toEqual({ width: 70, height: 25 }); dimensions.dispose();
  vi.stubGlobal("ResizeObserver", undefined);
  const reads: string[] = [], fallback = new HitDimensions(), a = element(90, 24, reads, "a"), b = element(45, 20, reads, "b");
  fallback.prepare([a, b]); reads.push("frame writes"); fallback.prepare([a, b]); reads.push("frame writes");
  expect(reads).toEqual(["a:width", "a:height", "b:width", "b:height", "frame writes", "a:width", "a:height", "b:width", "b:height", "frame writes"]);
  fallback.dispose();
});

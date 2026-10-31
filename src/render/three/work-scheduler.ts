export interface SliceTiming { maxSliceMs: number; yields: number }
export interface SliceOptions {
  budgetMs?: number;
  isCurrent?: () => boolean;
  now?: () => number;
  pause?: () => Promise<void>;
}

/** Message tasks avoid the nested-timer clamp while allowing worker messages to run. */
function taskPause() {
  if (typeof MessageChannel === "undefined") return { pause: () => new Promise<void>(resolve => setTimeout(resolve, 0)), close: () => {} };
  const channel = new MessageChannel();
  let resolve: (() => void) | undefined;
  channel.port1.onmessage = () => { const next = resolve; resolve = undefined; next?.(); };
  return { pause: () => new Promise<void>(next => { resolve = next; channel.port2.postMessage(0); }), close: () => { channel.port1.close(); channel.port2.close(); } };
}

/** The generator's units bound overshoot; no partial result escapes on cancellation. */
export async function runSliced<T>(steps: Generator<void, T>, options: SliceOptions = {}): Promise<{ value: T; timing: SliceTiming } | undefined> {
  const now = options.now ?? (() => performance.now());
  const tasks = options.pause ? undefined : taskPause(), pause = options.pause ?? tasks!.pause;
  const isCurrent = options.isCurrent ?? (() => true);
  const budget = Math.max(.1, options.budgetMs ?? 4);
  const timing: SliceTiming = { maxSliceMs: 0, yields: 0 };
  try {
    while (isCurrent()) {
      const start = now();
      let result = steps.next();
      while (!result.done && isCurrent() && now() - start < budget) result = steps.next();
      timing.maxSliceMs = Math.max(timing.maxSliceMs, now() - start);
      if (!isCurrent()) return;
      if (result.done) return { value: result.value, timing };
      timing.yields++;
      await pause();
    }
  } finally { steps.return(undefined as T); tasks?.close(); }
}

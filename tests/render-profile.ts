// Software runs exercise drawing and controls without long hardware warm-ups.
// All visual/state assertions and time-based measurements remain enabled.
export const renderFrameCount = (count: number) =>
  process.env.CI || process.env.FABLE_SOFTWARE_RENDERING ? Math.min(count, 3) : count;

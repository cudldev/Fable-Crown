// Software-only hosted runners can stall DOM observations while submitting a GPU frame.
// This does not alter simulation ticks or the state assertions.
export const uiTimeout = (milliseconds: number) =>
  process.env.CI ? Math.max(milliseconds, 60_000) : milliseconds;

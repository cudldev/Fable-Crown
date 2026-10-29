import type { GameMessage, RpgState, SimulationEffect } from "./types";

/** Bounded historical facts; presentation consumes these snapshots without changing outcomes. */
export function appendSimulationEffect(state: RpgState, effect: Omit<SimulationEffect, "id" | "tick">): SimulationEffect {
  const entry: SimulationEffect = {
    ...effect,
    id: ++state.effectSequence,
    tick: state.tick,
    position: { ...effect.position },
    ...(effect.targetPosition ? { targetPosition: { ...effect.targetPosition } } : {}),
  };
  state.effects.push(entry);
  if (state.effects.length > 64) state.effects.splice(0, state.effects.length - 64);
  return entry;
}

/** Merge only the consecutive identical prominent message, keeping its stable ID. */
export function appendGameMessage(
  state: RpgState,
  category: GameMessage["category"],
  key: string,
  text: string,
): GameMessage {
  const last = state.messages.at(-1);
  if (last && last.category === category && last.key === key && last.text === text && state.tick - last.tick <= 50) {
    last.count = Math.min(2_000_000_000, last.count + 1);
    last.tick = state.tick;
    return last;
  }
  const entry: GameMessage = { id: ++state.messageSequence, tick: state.tick, category, key, text, count: 1 };
  state.messages.push(entry);
  if (state.messages.length > 100) state.messages.splice(0, state.messages.length - 100);
  return entry;
}

import type { Page } from "@playwright/test";
import type { RpgState } from "../src/rpg/types";

type Position = RpgState["player"]["position"];
type Sample = { tick: number; position: Position };

// Arrival can last only one tick before autonomy resumes. Observe actual worker
// snapshots, including messages queued while the main thread submits a GPU frame.
export async function trackPlayerPositions(page: Page) {
  await page.addInitScript(() => {
    const samples: Sample[] = [];
    (window as Window & { travelSamples?: Sample[] }).travelSamples = samples;
    const GameWorker = window.Worker;
    window.Worker = class extends GameWorker {
      constructor(...args: ConstructorParameters<typeof Worker>) {
        super(...args);
        this.addEventListener("message", event => {
          const state = event.data?.state as RpgState | undefined;
          if (!state?.player) return;
          samples.push({ tick: state.tick, position: state.player.position });
          if (samples.length > 300) samples.shift();
        });
      }
    };
  });
}

export async function arrivalTick(page: Page, target: Position) {
  return page.evaluate(position => {
    const samples = (window as Window & { travelSamples?: Sample[] }).travelSamples;
    return samples?.find(sample => sample.position.x === position.x &&
      sample.position.y === position.y && sample.position.plane === position.plane &&
      sample.position.worldId === position.worldId)?.tick ?? null;
  }, target);
}

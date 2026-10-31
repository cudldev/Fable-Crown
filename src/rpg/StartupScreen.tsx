import type { PreparationStage } from "../render/scene-types";
import "./startup-screen.css";

const stageText: Record<PreparationStage, string> = {
  chapter: "Opening your chapter",
  assets: "Loading scenery and characters",
  world: "Preparing the world",
  shaders: "Finishing preparations",
  lighting: "Preparing lighting",
  ready: "Finishing preparations",
  unavailable: "Finishing preparations",
};

export function StartupScreen({ stage, error }: { stage: PreparationStage; error?: string }) {
  return (
    <section className="startup-screen" data-testid="startup-screen" data-stage={stage} aria-label="Game preparation" role={error ? "alert" : undefined}>
      <div className="startup-content">
        <img src={`${import.meta.env.BASE_URL}crown.svg`} width="68" height="68" alt="" />
        <p className="startup-brand">Fable Crown</p>
        {error ? (
          <>
            <div><h1>Your chapter could not open</h1><p className="startup-detail">{error}</p></div>
            <button onClick={() => location.reload()}>Retry</button>
          </>
        ) : (
          <>
            <div role="status" aria-live="polite" aria-atomic="true">
              <h1>Preparing your game</h1>
              <p className="startup-detail">{stageText[stage]}</p>
            </div>
            <div className="startup-progress" role="progressbar" aria-label="Game preparation" aria-valuetext={stageText[stage]}><span /></div>
          </>
        )}
      </div>
    </section>
  );
}

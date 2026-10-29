import { useEffect, useState } from "react";
import type { PlannerProfile, RpgState } from "./types";
import { evaluateGoals } from "./planning";
import {
  getPlannerProfile,
  PLANNER_PRESETS,
  PLANNER_TRAITS,
} from "./planner-profile";
import { inventorySlots, itemCount } from "./inventory";
import { levelForXp } from "./skills";
import "./planner-panel.css";

interface Props {
  state: RpgState;
  onApply: (profile: PlannerProfile) => void;
  onChoose: () => void;
}
export function PlannerPanel({ state, onApply, onChoose }: Props) {
  const applied = JSON.stringify(getPlannerProfile(state));
  const [draft, setDraft] = useState<PlannerProfile>(() =>
    getPlannerProfile(state),
  );
  useEffect(() => {
    setDraft(JSON.parse(applied) as PlannerProfile);
  }, [applied]);
  const dirty = JSON.stringify(draft) !== applied;
  const options = evaluateGoals({
    ...state,
    control: { ...state.control, profile: draft },
  }).slice(0, 4);
  return (
    <>
      <span className="eyebrow">WHAT MATTERS TO ALDEN</span>
      <h2>Personality & priorities</h2>
      <p>
        Traits influence which ambition Alden chooses next. Your current
        ambition and queued orders stay in place when you apply changes.
      </p>
      <div className="planner-facts" aria-label="Current planning facts">
        HP {state.player.health}/{levelForXp(state.player.skills.hitpoints)} ·
        Bag {inventorySlots(state.player.inventory)}/28 · Coins{" "}
        {itemCount(state.player.inventory, "coins") +
          itemCount(state.bank, "coins")}
      </div>
      <div className="planner-presets" aria-label="Personality presets">
        {PLANNER_PRESETS.map((preset) => (
          <button
            key={preset.id}
            aria-label={`Personality preset: ${preset.name}`}
            title={preset.description}
            onClick={() => setDraft({ ...preset.profile })}
          >
            {preset.name}
          </button>
        ))}
      </div>
      <div className="planner-preview" aria-label="First goal preview">
        <small>
          {dirty
            ? "PREVIEW — CHANGES NOT APPLIED"
            : "FIRST CHOICE WITH ACTIVE TRAITS"}
        </small>
        <strong>{options[0]?.goal.title ?? "No new ambition is needed"}</strong>
        {options[0] && <small>{options[0].reasons[0]}</small>}
        <button
          className="primary full"
          disabled={!options.length}
          onClick={() => (dirty ? onApply(draft) : onChoose())}
        >
          {dirty ? "Apply personality" : "Let Alden choose a new ambition"}
        </button>
        <small>
          {dirty
            ? "Applying keeps the current ambition and orders."
            : "Choosing replaces the ambition; pending orders remain queued."}
        </small>
      </div>
      <div className="planner-traits">
        {PLANNER_TRAITS.map((trait) => (
          <label key={trait.key}>
            <span>
              {trait.label}
              <b className="trait-value" aria-hidden="true">
                {draft[trait.key]}
              </b>
            </span>
            <input
              type="range"
              aria-label={trait.label}
              min="0"
              max="100"
              step="5"
              value={draft[trait.key]}
              onChange={(event) =>
                setDraft({ ...draft, [trait.key]: Number(event.target.value) })
              }
            />
            <small>{trait.description}</small>
          </label>
        ))}
      </div>
      <p className="planner-note">
        Caution also changes when Alden eats or retreats during autonomous play.
        Skills and XP are earned through actions.
      </p>
      <small>
        {dirty
          ? "Preview only — apply these changes to use them."
          : "These traits are active and save with this character."}
      </small>
      <h3>{dirty ? "Preview of possible goals" : "Possible next goals"}</h3>
      <p className="planner-note">
        Alden compares unfinished stories, useful upgrades, skill milestones and
        new places. His traits, supplies and readiness affect the order.
        Priority scores compare these preferences and preparation; they are not
        success chances.
      </p>
      <ol className="planner-candidates" aria-label="Compared goals">
        {options.map((option, index) => (
          <li key={option.goal.id} data-goal-id={option.goal.id}>
            <strong>
              {index === 0 ? "First choice: " : "Alternative: "}
              {option.goal.title}
            </strong>
            <small>Priority {option.score}</small>
            <ul>
              {option.reasons.map((reason, i) => (
                <li key={i}>{reason}</li>
              ))}
            </ul>
          </li>
        ))}
      </ol>
    </>
  );
}

export function LastDeliberation({ state }: { state: RpgState }) {
  const choice = state.control.deliberation;
  if (state.control.goalSource === "player")
    return (
      <p className="planner-note">
        You chose this ambition. Alden decides the steps needed to fulfill it.
      </p>
    );
  if (!choice || choice.chosenId !== state.control.goal?.id) return null;
  return (
    <details className="rpg-decision-history" aria-label="Last goal comparison">
      <summary>Why this ambition?</summary>
      <ol className="planner-candidates">
        {choice.options.map((option) => (
          <li key={option.goal.id}>
            <strong>
              {option.goal.id === choice.chosenId ? "Chosen: " : "Considered: "}
              {option.goal.title}
            </strong>
            <small>Priority {option.score} at the time of the choice</small>
            <ul>
              {option.reasons.map((reason, i) => (
                <li key={i}>{reason}</li>
              ))}
            </ul>
          </li>
        ))}
      </ol>
    </details>
  );
}

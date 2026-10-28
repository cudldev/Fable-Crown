# Codex usage budget and one weekly reset checkpoint

## Planning assumption
The development run MAY cross one normal scheduled weekly Codex allowance reset, allowing work in two successive weekly usage windows. This is a scheduling assumption, NOT a guarantee of a bonus allowance, a particular reset time, or continuous autonomous execution. Before beginning, the lead must ask the operator to check the account's actual remaining usage and next reset time in Settings > Usage (or Codex CLI status). Do not infer it from the subscription or the project start date.

A separately available banked promotional reset is optional and must be explicitly confirmed and redeemed by the account owner; do not assume one exists. A paid instant reset must NOT be purchased or initiated under the zero-extra-cost project constraint. Never initiate purchases or redeem resets without explicit authorization. A reset may shift the subsequent weekly schedule; verify it after any reset.

## Two-window execution plan
**Window A (before scheduled reset):** M0 foundation and GitHub Pages, core simulation interfaces and 600 ms tick tests, initial mobile UI, smallest autonomous gameplay vertical slice if budget permits. Allocate approximately 60% to implementation, 20% to architecture/integration and 20% to verification/contingency. Prioritize a deployed runnable artifact over unfinished features.

**Reset checkpoint:** Stop assigning new subagent tasks before the allowance is exhausted. Commit or checkpoint all work, integrate completed branches, run tests/build, update docs/PROGRESS.md with milestone status, test evidence, remaining tasks, outstanding decisions and a precise next prompt. Preserve a clean recovery path; do not assume subagents or sessions survive a usage reset.

**Window B (after actual reset):** Recheck available usage, resume from docs/PROGRESS.md and the repository state, complete the current milestone before proceeding, then prioritize Thought & Intention controls, gathering/banking/crafting, offline/calendar behavior, local narrative LLM experiments and mobile testing in dependency order. Reduce scope if budget proves insufficient.

## Orchestrator guardrails
- Recheck remaining allowance at major milestones and when a reset occurs. Model usage and subagents share relevant plan limits; parallelism does not create free capacity.
- At approximately 70% consumption of the current window, reassess scope and stop starting speculative features. Reserve approximately the final 20% for integration, tests and documentation.
- If usage runs out, stop cleanly and give the operator a resumable handover; wait for the actual reset. Do not claim background continuation while Codex is unavailable.
- Model assignments in MODEL_SELECTION.md are preferences subject to actual model availability. Use faster/lower-cost choices for bounded tasks, strong reasoning for difficult integration and architecture.
- Never enable API billing, purchase credits, or buy a usage reset as part of this workflow.
- The goal is a playable mobile browser vertical slice across up to two weekly windows, NOT a promise to complete all M0–M8 milestones.

## Recovery checklist
1. Verify git status and most recent integrated commit.
2. Read AGENTS.md, docs/ORCHESTRATION.md, docs/PROGRESS.md, tasks/MILESTONES.md and this file.
3. Check actual allowance and reset date.
4. Run install, typecheck, tests and production build as supported.
5. Resume only the first incomplete milestone, delegate non-overlapping tasks and update PROGRESS.md.

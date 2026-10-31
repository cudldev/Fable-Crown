# Codex Handover — Lead Orchestrator and Specialist Subagents

> Art update (2026-10-30): [warm storybook voxel fantasy](ART_DIRECTION.md) is current. Earlier painterly/illustrated presentation wording below is historical; gameplay and simulation contracts remain in force. See [voxel migration](VOXEL_ASSET_MIGRATION.md).

## Objective
Use one lead Codex agent to coordinate the autonomous HD-2D RPG implementation, delegating bounded tasks to specialist subagents when the installed Codex environment supports them. The lead remains responsible for design consistency, integration, verification, and milestone acceptance. This is a **development-time** arrangement; it is unrelated to the browser-local Qwen narrative model used by the game at runtime.

## Lead orchestrator
Preferred: GPT-6 with High reasoning, **if available in the operator's Codex environment**. Otherwise use the strongest available model. Read `AGENTS.md`, all `docs/`, and `tasks/MILESTONES.md` before delegating. Maintain a dependency-aware task board, identify interfaces and file ownership, review subagent outputs, run end-to-end checks, and update `docs/PROGRESS.md`. The lead alone approves completion and integration of milestones. Do not bypass user authorization for repository creation, pushes, deployment settings, or other external actions.

## Specialist roles and preferred models
These are preferences, not guarantees of automatic model selection. Use supported per-agent model configuration only after checking the installed Codex version's documentation. Do not invent model identifiers or configuration keys.

| Specialist | Preferred model / effort | Ownership and deliverables |
|---|---|---|
| Simulation | GPT-6 High | 600 ms tick, event queue, seeded RNG, deterministic replay, saves, offline reconciliation and invariants |
| Agent AI | GPT-6 High | GOAP/utility planning, valid intentions, personality state, decision timeouts and fallback policies |
| Rendering & UX | GPT-6 Medium | Three.js HD-2D, mobile portrait/landscape, touch interactions, responsive thought cards, rendering benchmarks |
| Gameplay | GPT-6 Medium | Skills, XP, inventories, resource nodes, recipes, crafting, banking and action definitions |
| Infrastructure | GPT-6 Medium | Vite/PWA, IndexedDB integration, GitHub Actions Pages deployment, build/typecheck/test tooling |
| QA & Documentation | GPT-6 Instant if supported; otherwise Medium | Acceptance tests, regression tests, performance measurements, docs and progress reporting; escalate difficult failures |

Use High reasoning for concurrency, save corruption, determinism, planning bugs, complex performance problems and final architecture review. Avoid subagent delegation for trivial tasks when coordination would cost more than execution.

## Execution protocol
1. **Plan:** Lead selects the current milestone only, enumerates deliverables, acceptance criteria, dependencies and public interfaces. Never start the next milestone before the current one passes.
2. **Partition:** Give each subagent a specific objective, owned files/directories, relevant documents, test command, and acceptance criteria. Identify shared contracts before parallel work.
3. **Isolate:** Prefer separate worktrees/branches if available. Do not allow concurrent edits to the same file. For shared interfaces, the lead writes/approves the contract before delegation.
4. **Implement:** Specialists keep their work scoped, test locally, and return a summary of changed files, tests run, limitations and integration needs. No unapproved paid APIs or backend services.
5. **Integrate:** Lead reviews diffs, resolves conflicts, runs typecheck, tests, production build and milestone-specific smoke tests. Verify deterministic replay and mobile portrait/landscape where applicable.
6. **Record:** Lead updates `docs/PROGRESS.md` with completed work, test evidence, performance measurements, blockers and next tasks. Do not report a milestone done if a gate fails.

## Required task handoff template
- Milestone / task ID and goal
- Relevant specs and prerequisite contracts
- Owned paths and forbidden/shared paths
- Concrete implementation requirements
- Tests and measurable acceptance criteria
- Required handback: changed files, commands/results, known issues, questions

## Model and tooling fallback
If Codex supports subagents but not per-agent model routing, use its available model for all specialist roles. If subagents are unavailable, the lead executes the same tasks sequentially using the role boundaries. If a model name/effort is unavailable, choose a supported alternative without blocking work. Do not assume `AGENTS.md` or a `.toml` file can change the running model automatically. Only use Codex-native agent configuration after verifying its actual schema; no speculative `.codex/config.toml` is shipped.

## Parallelism rules
- Parallelize independent tasks (e.g., renderer prototype and simulation core **after** shared state/message schemas are fixed).
- Serialize dependent tasks (e.g., action definitions before crafting planner integration; save schema before offline resolver).
- One integrator owns changes to `AGENTS.md`, milestone gates, shared interfaces, deployment workflow and `docs/PROGRESS.md`.
- Cap concurrency based on available context, budget and test capacity; parallelism is not a goal by itself.

## Example: M0 delegation
- **Infrastructure:** Vite/React/TypeScript, tests, PWA shell, GitHub Pages Actions workflow and base-path configuration.
- **Rendering & UX:** Portrait/landscape responsive shell and touch-safe layout using agreed app interfaces.
- **Simulation:** Minimal worker protocol, tick constant and deterministic test scaffold; no full gameplay before M1.
- **QA:** Validate build, tests, static deployment asset paths, orientation and zero-cost/no-secret constraints.
- **Lead:** Define message contracts first, integrate branches, review workflow, verify the live URL only when a repository has actually been configured, and update progress.

## Non-negotiable project constraints
Mobile-first portrait and landscape; HD-2D world; 600 ms authoritative simulation tick; cooperative autonomous adventurer; thought-and-intention choices with automatic resolution; local deterministic planning; opt-in browser-local narrative LLM only; zero paid APIs; GitHub Pages for V1; calendar + 25%-speed offline progression up to 24 hours; performance measured rather than assumed. See canonical design documents for details.

## Suggested first Codex prompt
"Act as the lead orchestrator for this repository. Read AGENTS.md, docs/ORCHESTRATION.md, all other docs, and tasks/MILESTONES.md. Verify which subagent and per-agent model-selection features this Codex environment actually supports. Delegate M0 tasks to specialists where supported, with isolated file ownership and explicit acceptance tests; otherwise execute sequentially. Use the preferred model/effort settings only when available. Integrate and test M0, configure GitHub Pages only with authorization, and update docs/PROGRESS.md. Stop before M1 and report results and blockers."

## Two-window usage scheduling
See docs/USAGE_BUDGET.md. Plan for at most one verified scheduled weekly allowance reset during the development run. The lead owns a pre-reset integration/checkpoint and a post-reset recovery/verification step. A reset is a scheduling boundary, not an instruction to spend money or a guarantee of capacity. No automatic redemption or purchase of resets.

## Current scope priority
Lead orchestrator should delegate a bounded painterly prince-and-village vertical slice first, not the older generic pixel-art adventurer demo. Assign a dedicated art/renderer specialist to readable illustrated placeholder assets. Verify `docs/ART_DIRECTION.md` and `docs/GAME_DESIGN.md` before task delegation.

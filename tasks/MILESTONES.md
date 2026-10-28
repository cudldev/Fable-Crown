# Codex Milestones and Acceptance Criteria

M0 — Vite/React/TypeScript strict setup; Three.js, Vitest, Playwright, PWA, mobile portrait/landscape shell, IndexedDB and worker stubs. Include GitHub Pages deployment via GitHub Actions, configurable Vite base path, valid PWA manifest/service-worker scope, and setup instructions. Build/test/typecheck pass; deployment workflow and built asset paths validated (live deployment requires repository configuration).

M1 — Seeded RNG, stable event queue, authoritative 600ms tick, action scheduler, versioned save/load. Replay deterministic after save/reload, test simultaneous events.

M2 — Autonomous woodcutting: pathfind, gather, gain XP, fill inventory, bank, repeat; resource contention/depletion handled. No player input needed.

M3 — Thought & Intention UI and policy: 2–3 valid ideas, timeout default, no blocking, interruption rules, event history, orientation persistence. <=3 taps to guide.

M4 — Mining, Smithing, tool acquisition and crafting dependency planner. Agent can gather copper/tin, smelt bronze, forge/equip sword with prerequisites and banking; no free items.

M5 — Three.js HD-2D-inspired original village: low-poly 3D, pixel sprite billboards, tap selection, pan/zoom, adaptive camera, responsive performance; dashboard loads without renderer.

M6 — Real-world calendar and offline catch-up: 25% speed capped 24h, analytical player cycles, aggregate NPC budgets, transactional idempotent save, resume summary. Test 0h/1h/24h/72h and time-boundary calendar events. Benchmark latency, no invented guarantee.

M7 — 20–30 personality NPCs, basic memory/social interactions, optional LLM adapter with strict schema and deterministic fallback; offline never invokes LLM.

M8 — Simulation LOD, scale benchmarks 100–50k logical NPCs, rendering benchmark up to 1k visible, mobile optimization and accessibility. Report measured results and limitations.

After EACH milestone: runnable demo, tests, build, typecheck, progress log, known issues. Do not skip milestone gates.

ZERO-COST GATE (ALL MILESTONES): Follow docs/ZERO_COST.md. Every playable build must function without API keys, hosted inference, or paid services. M0 validates static deployment and no-secret build; M3 validates procedural thought cards without an LLM; M7 may only add opt-in browser-local LLM with fallback and no remote API. Add offline/network inspection tests before release.

M7 LOCAL LLM GATE: Follow docs/LOCAL_LLM.md. Implement local narrative adapter, consent-driven model download, bounded event context, output validation, async generation, graceful fallback, and mobile performance tests. Record model compatibility and licensing. No inference during offline catch-up.

M0 ADDITIONAL GATE: Use docs/DEPLOYMENT.md and supplied .github/workflows/deploy.yml. Provide automated GitHub Pages publishing with project-site path support, and test the first browser shell. Deployment requires a repository and GitHub Pages enabled by an authorized user.

MODEL ROUTING GATE: Follow docs/MODEL_SELECTION.md. Coding model assignments are advisory; no paid model API calls. Local Qwen2.5 0.5B/1.5B are benchmark candidates for M7 narrative only, with WebGPU fallback and explicit download consent.

ORCHESTRATION GATE: Follow docs/ORCHESTRATION.md. The lead orchestrator assigns bounded work to specialists when supported, owns shared contracts and integration, verifies tests and builds, and updates docs/PROGRESS.md. Model selection is advisory and must gracefully fall back to supported Codex capabilities.

## CURRENT EXECUTION PRIORITY — DEMO FIRST
Before advancing the full roadmap, complete the smaller vertical slice described in `docs/DEMO_SCOPE_AND_ART.md`, using `docs/RESET_AND_BUDGET_POLICY.md` for the authorized single weekly reset and strict 110%-maximum planning envelope. Deliver readable original placeholder art, one autonomous gather/bank loop, thought choices, mobile portrait/landscape and a verified GitHub Pages preview. Defer scaling and advanced LLM work. Stop when the demo is playable and report unused usage; do not spend budget just to complete the roadmap.


## LATEST VERTICAL SLICE OVERRIDE — FABLE CROWN
For the current run, prioritize a cohesive painterly prince-led village builder rather than finishing M0–M8 or the former woodcutting-only demo. Minimal end-to-end acceptance: 600ms tick; prince and 12–20 villagers; forest/mine/storage; valid resource-gathering and delivery; timed construction of a blacksmith workshop; 2–3 thought choices with timeout; responsive portrait/landscape; save/resume; GitHub Pages; original painterly assets. Follow `docs/ART_DIRECTION.md` and `docs/DEMO_SCOPE_AND_ART.md`. The original HD-2D pixel sprite specification is obsolete. Stop after playable verified demo, preserving budget.

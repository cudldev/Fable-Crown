# Technical Architecture

## Stack
Vite + React + strict TypeScript; Three.js/WebGL2 for low-poly 3D environments and billboard pixel sprites; Web Worker for simulation; IndexedDB versioned saves; Vitest unit tests, Playwright browser tests; PWA for installable mobile experience. Host static build on GitHub Pages initially. No backend required.

## Boundaries
- core: deterministic tick scheduler, event queue, seeded RNG, rules and state transitions, no DOM.
- content: stable IDs for items, skills, recipes, locations and actions, with data-driven prerequisites.
- agents: goal hierarchy, prerequisite graph, utility plan ranking, commitment/hysteresis, personality, memories and explanations.
- worker: command input, immutable snapshots and event output, performance metrics.
- offline: calendar ledger, capped effective ticks, analytical action-cycle resolution, regional resource budgets, atomic reconciliation.
- render: Three.js world, instanced sprites, selection, camera, animation interpolation independent of ticks.
- ui: portrait/landscape dashboard, thought card, inspector, progress journal.
- llm: optional schema-validated proposals for dialogue/reflection/intent; cannot mutate game state; deterministic fallback always works.

## Critical invariants
All gameplay action durations integer ticks; deterministic stable event ordering; seeded RNG; skill and crafting prerequisites; inventory conservation; no duplicated resources; idempotent offline catch-up; calendar and tick systems own disjoint mechanics. No per-tick LLM calls. Planner replans on events, not every tick. Explicit hard constraints vs soft preferences.

## Offline algorithm
Persist last committed state, wall timestamp, RNG and scheduled events. On return, compute elapsed wall time and apply calendar events chronologically (including beyond 24h). Effective gameplay ticks = floor(min(elapsed,24h)*0.25/600ms), preserving fractional remainder. Use action-cycle math for player safe activities, conservative bounded resolution for risky activities, and regional aggregate production for distant NPCs. Reconcile shared resource budgets and transactions. Show last snapshot immediately marked 'reconciling'; block conflicting mutations until worker commits a new snapshot atomically. Retry safely on crash. Single-player device clock manipulation is accepted for MVP.

## Planning
Typed goal -> prerequisites derived from content -> candidate strategies -> hard validation -> utility score for duration/risk/cost/preferences -> plan -> atomic scheduled actions. Recover from missing tools, inventory full, blocked path, depleted resources and contention. No thrashing: switching costs and plan commitment. Decision explanations must cite observed game-state factors, not fabricated private model reasoning.

## Performance
Benchmark 100, 1k, 5k, 10k, 50k logical NPCs, and up to 1k visible sprites. Record hardware, p50/p95 tick duration, memory, draw calls, FPS, resume latency. Mobile rendering defaults to baked light, reduced effects, adaptive resolution; depth of field disabled. No performance promises without measurement.


## Initial hosting: GitHub Pages
- Ship the first version as a static Vite-built PWA hosted on GitHub Pages; no backend or API key required.
- Include `.github/workflows/deploy.yml` using GitHub Actions, with `npm ci`, typecheck, tests, build, artifact upload, and Pages deployment. Use least-privilege workflow permissions (`contents: read`, `pages: write`, `id-token: write`) and concurrency to prevent overlapping deployments.
- Support both project Pages (`https://<owner>.github.io/<repo>/`) and custom domain/root hosting through a configurable Vite `base`. Asset URLs, router paths (if any), manifest `start_url`, `scope`, and service-worker scope must honor the deployment base path. Prefer hash routing or explicit static-friendly fallback for client routes.
- Document repository setup: push to GitHub, Settings > Pages > Build and deployment > GitHub Actions, run workflow, verify HTTPS URL and installable PWA on Android/iOS browsers where supported.
- Use relative/base-aware asset loading. Verify direct refresh and cached/offline loading where applicable. Cache versioned static assets safely; do not cache save data as application assets. IndexedDB stores per-origin/per-browser and does not automatically sync across devices.
- The application must load its progress dashboard without initializing the 3D scene; test portrait and landscape on mobile.
- Do not put LLM credentials in frontend code. Optional cloud LLM, multiplayer, notifications, and account sync require separate infrastructure later.

## Zero-cost architecture contract
See `docs/ZERO_COST.md`. No required API, backend, hosted inference, or secrets. The `llm` module exposes a no-network procedural implementation as the default; an optional opt-in browser-local WebGPU provider can be added later. It cannot be a dependency of NPC decisions or progression. Test with WebGPU unavailable and network disabled.

## Lightweight local LLM narrative layer
See docs/LOCAL_LLM.md. Narrative inference is optional, on-device, event-triggered and asynchronous. Deterministic systems own intentions, decisions and all state changes. No remote inference or paid APIs.

## Current painterly city-builder override
Rendering remains decoupled from simulation. The current presentation is painterly 2D/2.5D cutouts, watercolor/ink textures and layered environments, not pixel-art sprites. Use Three.js selectively; no requirement for pixel shaders. Gameplay now includes autonomous construction plans and resource/labor prerequisites for the prince-led settlement. See `docs/GAME_DESIGN.md` and `docs/ART_DIRECTION.md`.

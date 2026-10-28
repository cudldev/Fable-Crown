# Model Selection — Development and Runtime

## A. Codex development task routing (recommendations, not executable model switches)

The model used to write the game is separate from the local model shipped to players. Codex must never assume it can change its own model, reasoning effort, subscription tier, or quota through a file. The operator chooses among models available in their Codex environment. No model choice is required for the application to run.

| Work | Preferred coding model / effort | Escalation condition |
|---|---|---|
| Architecture, deterministic simulation, LOD invariants, offline reconciliation | GPT-6 High | Use highest available reasoning for correctness-critical work |
| Standard TypeScript gameplay, planner, tests, CI and persistence | GPT-6 Medium | Escalate when tests expose architectural ambiguity |
| Mobile UI, responsive portrait/landscape, Three.js HD-2D renderer | GPT-6 Medium | High for GPU or state synchronization bugs |
| Test generation, docs, repetitive content definitions | GPT-6 Instant if available | Medium for failures or nontrivial code changes |
| Code review, security, save migrations, concurrency failures | GPT-6 High | Require tests and independent verification |

If Codex only exposes one model, use that model for all tasks; prioritize correctness and tests over speed. Model availability and pricing are controlled by the user's plan and tool environment. Do not automatically invoke paid APIs or external coding-model endpoints.

## B. Runtime decision and dialogue routing

| Game task | Runtime technology | LLM? |
|---|---|---|
| 600ms tick, movement, combat, crafting, economy | Deterministic TypeScript | Never |
| Goal decomposition and plan selection | GOAP/dependency planner + utility scores | Never required |
| NPC personality and relationship state | Structured traits and memories | Never required |
| Thought-card intention choices and deadlines | Deterministic validated planner | Never |
| Brief expressive thoughts / NPC dialogue | Local WebLLM/WebGPU | Optional enhancement |
| Unsupported GPU or model absent | Grounded procedural narrative templates | No |
| Offline catch-up | Deterministic/aggregate analytical resolver | Never |

### Local narrative model candidates

- **Low-end candidate:** `Qwen2.5-0.5B-Instruct-q4f16_1-MLC` (WebLLM model ID candidate).
- **Quality candidate:** `Qwen2.5-1.5B-Instruct-q4f16_1-MLC` (WebLLM model ID candidate).
- **Optional high-end evaluation:** `Qwen2.5-3B-Instruct-q4f16_1-MLC` (not a default; evaluate memory, heat, load time and latency).

These IDs appear in WebLLM's model listing, but must be checked against the installed WebLLM version's `prebuiltAppConfig.model_list` before shipping. Verify weights, licenses, model provenance, distribution terms, download sizes and device compatibility; pin exact versions and record results. Model downloads require explicit consent and should use supported remote static model hosting only for downloading weights, NEVER remote inference. Disclose that weights may be downloaded from a third-party CDN and cached on-device; GitHub Pages is not a backend. A device with no supported WebGPU runs the deterministic narrative fallback.

The model can only rephrase verified event facts into short text. It cannot create options, issue commands, alter authoritative state or stall a thought-card deadline. Provide an asynchronous, bounded request queue with cancellation and no offline-catch-up inference. Do not download weights during initial page load.

### Runtime benchmark gates

Test both candidates on at least one representative Android and one iOS browser, plus desktop; log first download size/time, cold/warm load, time to first token, tokens/sec, peak memory, battery/thermal behavior, text grounding, and fallback correctness. Choose the 0.5B model as provisional evaluation baseline, not a mandatory default. A failed or slow model must not block play.

## Sources to verify at implementation time
- https://webllm.io/playground/
- https://github.com/mlc-ai/web-llm
- https://docs.github.com/en/pages/getting-started-with-github-pages/using-custom-workflows-with-github-pages
- https://vite.dev/guide/static-deploy

## C. Multi-agent execution

See `docs/ORCHESTRATION.md` for the lead-orchestrator workflow, specialist responsibilities, task handoff template, parallelism constraints, model-routing fallback, and M0 delegation example. This development-time multi-agent setup must not be confused with in-game autonomous NPC agents or the local narrative LLM.

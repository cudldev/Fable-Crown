# Local Lightweight LLM — Narrative Layer (V1)

## Goal
Deliver short, meaningful, personality-consistent thoughts and NPC dialogue in a mobile-first browser PWA, without paid APIs or remote inference. The LLM is a local narrative enhancement, not the simulation authority. The player selects 2–3 designer/engine-validated intentions and never needs to type a prompt.

## Runtime
- Start by evaluating WebLLM and compatible quantized instruction-tuned models through WebGPU; benchmark on real Android and iOS browsers. Do not assume WebGPU or model compatibility on every device.
- Candidate parameter classes: 0.5–0.8B low-memory, 1–1.5B preferred if measured practical, 2–3B optional high-end. Select exact model/version/license only after verifying compatibility, quality, download size, first-token latency, sustained generation speed, peak memory, storage, and battery/thermal behavior.
- No API calls for inference, no paid endpoint, no cloud fallback, no API key. Optional model download must be explicitly opted into, with download size/storage disclosure and cache deletion controls. Do not prefetch model weights or bundle them with the base PWA.
- Keep simulation and renderer responsive; isolate inference from simulation in a worker when supported. Cap concurrency, output tokens, queue length, context size, and generation frequency. Cancel obsolete requests and prioritize selected/visible character interactions.
- Browser cache eviction or unsupported hardware must not break the game. Use a local template/grammar fallback.

## Separation of responsibility
1. Simulation produces authoritative structured event (e.g. inventory full, resource shortage, relationship improved).
2. Deterministic planner produces 2–3 valid intention IDs, ranks them, and selects automatically on timeout.
3. Narrative adapter receives a minimal context package: event facts, persona traits, relationship tags, recent bounded memories, and valid intention display labels.
4. Local model returns short narrative text only (thought or dialogue). It cannot add/remove options, issue actions, modify inventory/XP, create facts or determine game outcomes.
5. Validator checks output length, schema, prohibited invented claims and grounding where possible; fallback text is used if invalid, late or unavailable.

## Suggested narrative payload
```ts
interface NarrativeRequest {
  eventId: string;
  speakerId: string;
  eventType: string;
  facts: Record<string, string | number | boolean>;
  personality: Record<string, number>;
  relationshipTags: string[];
  recentMemorySummaries: string[];
  validIntentions: Array<{ id: string; label: string }>;
  maxWords: number;
}
interface NarrativeResponse { text: string; }
```

## UX
- Narrative is displayed as character thoughts or conversational reactions in portrait bottom sheets and landscape contextual panels.
- Text generation never delays an actionable choice: display the deterministic thought template and options immediately; replace or enrich narrative asynchronously if the decision is still relevant.
- Do not generate every tick or for every NPC. Generate only for meaningful events and prioritized interactions. Offline catch-up never invokes the LLM; optionally summarize after return.
- Default 20–60 words per response; avoid repetitive or ungrounded dialogue. Allow user to disable local inference at any time.

## Evaluation and release gates
- Compare candidate models on groundedness, personality differentiation, response usefulness, latency, memory, and battery impact on representative mobile devices.
- Test no WebGPU, failed download, model unavailable, network offline after model cache, cache eviction, invalid JSON, hallucinated game facts, slow generation, and rapid repeated events.
- Test that a pending model response cannot alter or delay deterministic choices or their deadlines.
- Record benchmark results and model licenses in docs/PROGRESS.md before choosing a default.
- V1 zero-cost gate from docs/ZERO_COST.md always applies.

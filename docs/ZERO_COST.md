# Zero-Cost / No-API-Billing Requirement (V1)

## Hard release gate
V1 must run without any paid API, metered API, required subscription, paid hosting, external backend, or API key. The game must remain fully functional when the device is offline after initial asset installation. Do not silently introduce a free-tier dependency that could incur billing later. No credit-card setup should be required to play or deploy the baseline project.

## Architecture
- Host static Vite PWA on GitHub Pages (subject to GitHub's published limits and terms).
- Run gameplay, 600 ms tick simulation, deterministic goal planning, personality-driven NPC decisions, thoughts, and offline reconciliation entirely on-device.
- Persist with IndexedDB; provide save export/import. Do not promise cross-device sync.
- Generate thought options from validated world state using local templates/grammar and deterministic planner, with personality-specific expression. Never require LLM inference to select an intention or advance the simulation.
- Optional LLM enhancement may use a browser-local model (e.g. WebLLM/WebGPU) only after explicit user opt-in, hardware capability check, and disclosure of download size, memory/storage and battery implications. The optional model may be unavailable on some mobile browsers/devices. No remote inference fallback or API calls.
- Never bundle large model weights in the default initial download. Cache optional model assets only with user consent and allow clearing them.
- LLM output is non-authoritative, schema validated and constrained to dialogue, reflection, and proposed goals; deterministic systems own the world state.
- Do not use paid telemetry, analytics, authentication, push services, external asset APIs, voice transcription, or cloud LLMs. Browser-native capabilities are allowed, with feature detection and fallback.
- Use original or appropriately licensed assets and dependencies; document licenses.

## Acceptance tests
1. Build and deploy without environment secrets or API keys.
2. Load and play core loop with network disabled after PWA assets are cached; test save/reload and offline catch-up.
3. NPC decisions, thought cards, and timed automatic selections work with optional LLM disabled and with WebGPU unavailable.
4. Confirm no required third-party runtime requests in the network inspector. Optional model downloads must occur only after explicit opt-in.
5. Document that static hosting is free within provider limits, and device-local inference still costs device resources, not API fees.

## Future services
Cloud sync, hosted AI, shared multiplayer, or server-authoritative economies are explicitly out of V1 scope. Propose them separately only if the user authorizes a change to the zero-cost constraint.

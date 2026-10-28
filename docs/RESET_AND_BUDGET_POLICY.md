# Authorized one-reset, 110%-ceiling orchestration policy

The user reports ~10% of their current weekly Codex allowance remaining, and expects one normal weekly allowance reset to restore up to 100%. Thus the **maximum planning envelope is 110% of one full weekly allowance**, NOT two full allowances. The user authorizes planning across and using that ONE scheduled reset. This does not authorize buying credits, buying an instant reset, changing plans, or redeeming a separate banked/promotional reset. Confirm exact status and timing in the Codex environment; percentages are user-reported estimates.

## Budget-aware run
- **Before reset (~10% maximum):** Audit specs, scaffold project, make a static GitHub Pages deployable mobile shell, implement a minimal visual village/character if possible, write tests and checkpoint. Prefer a runnable commit over extensive orchestration. Do not start multiple expensive parallel subagents.
- **Reset checkpoint:** Integrate and commit, capture CI/build status, update `docs/PROGRESS.md` with completed tasks, known issues, usage estimate and next command. If the limit is reached, stop. No promise of autonomous continuation during the wait.
- **After reset (up to 100%):** Resume after verifying actual allowance. Prioritize the vertical slice in `docs/DEMO_SCOPE_AND_ART.md`: autonomous woodcutting/banking, 600 ms ticks, thought choices, mobile UI, deploy and tests. Add optional systems only if demo is stable and budget allows.
- **Spending discipline:** Reserve at least ~20% of the refreshed allowance for integration, device testing, regressions and deployment. If remaining usage becomes uncertain, pause speculative tasks. Do not use all allowance merely because it exists.
- **Completion:** Stop at a verified playable demo, report features deferred and approximate remaining usage. Further expansion requires operator confirmation.

The orchestrator may delegate to specialized Codex subagents where supported, but shared usage limits apply. Prefer small bounded tasks, minimal concurrency, and no repeated broad context rereads. The model matrix is advisory and may not be automatically routable.

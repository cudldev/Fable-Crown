# Valley onboarding implementation

Approved 2026-11-01: continuous 60Hz action; 600ms settlement ticks; empty safe valley with freely placed tent,100-coin cottage commission,90-minute construction,Carpentry/six furnishings,optional forge,three-day progress-driven onboarding,visitors,limited0.5m terrace editing and wilderness-only combat. Hands-on tool/weapon strikes are per press; aim assistance and guard stamina. Construction has no speed-up chores. Offline construction remains25% for up to24h; combat never catches up offline. Preserve old saves and zero-cost/PWA contracts.

Worktree: tmp/valley-onboarding, branch codex/valley-onboarding, base665e597. Original authoring and release workspaces are untouched. Actual initial allowance24%used/~76%remaining; no reset or credit consumed.

## Ownership and gates

Lead: shared contracts,worker,storage,migration,integration,release/docs. Motion:src/action simulation modules/tests. UI:input,ValleyApp/renderer integration. World:valley/layout modules. Gameplay:valley economy/content/onboarding modules. Art:assigned assets,QA:assigned tests/reports. At most lead+two specialists. Serialize builds/GPU runs; lead owns shared Blender.

- T0 Foundation: isolated checkout,baseline537units/type/build passed; contracts andownership defined.
- T1–T3 Action gate:569units/type/build/dist and3localWebGLcases pass. Actualdesktop/portrait/landscape/guard reviewed. Prototype at? actionPrototype=1 (no productiondefaultswitch). Per-press tools,guard,real touchcancel,menu release,graveconservation andworkerpause covered. Presentation remainsdraft until T5/T12.
- T4–T5 Valley/art gate: pending authoritative surface,placement,terrain and actual asset review.
- T6–T9 Home gate: pending economy,commission,cottage,saves/UI.
- T10–T12 Onboarding gate: pending visitors,guidance,independent QA.
- T13 Release gate: pending all checks and actual public verification.

No milestone or art acceptance is implied by this task board. Preserve the prior release until gates pass. Keep release CI non-GPU; visual tests run locally.

Action probe:12synthetickeydown→changedrenderedpose samples,localChrome156/1280×720:median31.6ms,first/cold161.1ms,remaining22.2–33.3ms. Includesfirstspike; not aphysicalphone orscreen-to-photon claim. Raw metrics:performance/action-onboarding/metrics.json. First-input latency remains aT12 check. Nativeworldbuttons briefly gainedprototypeCSS backgrounds; actualreviewcaughtandfixedthescope.

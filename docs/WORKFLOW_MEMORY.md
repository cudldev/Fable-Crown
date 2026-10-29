# Working notes

- Latest GAME_DESIGN/ART_DIRECTION override old pixel specs; stop at one verified playable slice.
- Simulation owns state; worker owns clock/saves; renderer interpolates snapshots. Keep file ownership separate when delegating.
- Run typecheck, tests, build, check:dist, browser checks; verify Pages URL after CI succeeds.
- Windows npm certificate fix: `NODE_USE_SYSTEM_CA=1`, retain TLS verification. Local browser preview may require unsandboxed server.
- Origin: cudldev/Fable-Crown; Pages uses Actions. No paid services or reset redemption.
- Expanded release: full-browser camera and contextual intentions; 3 towns / 24 actors / 9 generated regions. Sol High simulation, Sol Medium renderer, Luna Medium QA; one specialist at a time.
- When checking the Pages subpath locally, restart preview with GITHUB_REPOSITORY set; its base is resolved at startup. Cache static paths as cloned waypoints.

- Art acceptance: compare actual gameplay-scale output to the primary Town Life reference. Watercolor keywords alone are insufficient; reject miniature-diorama texture and full-proportioned presentation-pose actors. Match one composed sample before generating a batch.
- User approved gameplay-style-proof-v2.png with slightly simpler treatment. Runtime assets now come from assets/generated/v2/; exact prompts are recorded. Use overlapping feathered terrain and alpha-derived feet/base anchors.

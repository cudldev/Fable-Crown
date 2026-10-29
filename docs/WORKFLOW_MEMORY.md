# Working notes

- Latest GAME_DESIGN/ART_DIRECTION override old pixel specs; stop at one verified playable slice.
- Simulation owns state; worker owns clock/saves; renderer interpolates snapshots. Keep file ownership separate when delegating.
- Run typecheck, tests, build, check:dist, browser checks; verify Pages URL after CI succeeds.
- Windows npm certificate fix: `NODE_USE_SYSTEM_CA=1`, retain TLS verification. Local browser preview may require unsandboxed server.
- Origin: cudldev/Fable-Crown; Pages uses Actions. No paid services or reset redemption.

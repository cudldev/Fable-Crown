# Working notes

- Latest scope: TILE_RPG_PLAN.md; stop after verified Pages. Painterly Town Life proof approved with slightly simpler treatment; compare actual gameplay scale, not just watercolor keywords.
- Pure tile simulation → worker clock/saves → isometric Canvas. Lead owns contracts/integration; specialists own separate files. Sol High core, Sol Medium renderer, Luna Medium browser QA.
- Gate each stage: unit tests, strict build, check:dist, browser. Serialize builds: another build can replace dist with a different base during browser tests.
- Pages: cudldev/Fable-Crown. Build GITHUB_REPOSITORY=cudldev/Fable-Crown; Playwright DEMO_URL=http://127.0.0.1:4174/Fable-Crown/. Preview inherits base from URL. Verify actual public release after CI.
- Windows npm certificate fix: NODE_USE_SYSTEM_CA=1; retain TLS. Localhost/git/network may need sandbox escalation. No paid services or reset redemption.
- V3 key is separate from archived v1 key. Keep old saves untouched/exportable. Sources/prompts in assets/generated/v2,v3; alpha frames merge across versions. Offline query-string reload uses cached index fallback.

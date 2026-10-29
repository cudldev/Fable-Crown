# Working notes

- Latest scope: EARLY_GAME_JOURNEY.md; stop after verified Pages. Simplified painterly Town Life,2:1buildings/single trees; compare gameplay scale.
- Pure tile simulation → worker clock/saves → isometric Canvas. Lead owns contracts/integration; specialists own separate files. Sol High core, Sol Medium renderer, Luna Medium browser QA.
- Gate each stage: unit tests, strict build, check:dist, browser. Serialize builds: another build can replace dist with a different base during browser tests.
- Pages: cudldev/Fable-Crown. Build GITHUB_REPOSITORY=cudldev/Fable-Crown; Playwright DEMO_URL=http://127.0.0.1:4174/Fable-Crown/. Preview inherits base from URL. Verify actual public release after CI.
- Windows npm certificate fix: NODE_USE_SYSTEM_CA=1; retain TLS. Localhost/git/network may need sandbox escalation. No paid services or reset redemption.
- Current key v4 copies V3 once; never overwrite archived v3/v1. Test migration with fixtures/rpg-v3-original.json. Sources/prompts in assets/generated/v2,v3,v4; metadata merges across versions. Offline query reload uses cached index fallback.
- Zoom regression: visible terrain must fit cache or use the far composite; benchmark close/far/overview. Ore quantities aggregate in saves/bank but occupy separate backpack slots. Replay no historical reward floaters after import/offline resume.
- Bottom log planned for prominent dialogue/quests/discoveries/level-ups/blockers; routine XP/items remain world feedback.

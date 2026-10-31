# Foreground panel rendering — 2026-10-31

Removed the renderer's explicit 250ms/4FPS cap whenever an object inspector or drawer opened. The visible world now renders on every foreground animation frame. Simulation and saves are unchanged.

Production Chrome156, Windows10.0.26200, i9-10850K/20logical CPUs, DPR1, default visuals. Two-second samples count actual WebGL drawing per RAF, rather than RAF alone. Same waiting-player fixture; NPCs continue. Phone dimensions are viewport emulation.

| View | Before rendered FPS | After rendered FPS |
| --- | ---: | ---: |
| Desktop closed,1280×800 |120.0|115.3|
| Desktop tree inspector |4.0|98.4|
| Desktop menu |4.0|98.2|
| Desktop closed again |118.5|115.2|
| Portrait tree,390×844 |4.0|118.3|
| Landscape tree,844×390 |4.0|119.7|

All fixed samples drew on100%of available RAFs, versus about3.3%with panels open before. Raw [before](before.json)/[after](after.json) include browser, sample counts and durations. These are host observations, not physical-phone or isolated GPU-cost guarantees. Zero WebGL/page errors or external runtime requests.

Regression: build at `/Fable-Crown/`, then run `DEMO_URL=http://127.0.0.1:4174/Fable-Crown/ npx playwright test tests/rpg-panel-performance.spec.ts`. Set `PANEL_BENCH_LABEL` to save another report. The regression failed on the original code and passed with the fix.

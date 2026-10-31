# UX Specification

Startup: a full-screen preparation view appears in the initial HTML and remains through chapter/assets, world construction, normal/overview shader warmup and initial lighting. Hide and block the entire HUD/world until the first prepared frame. Use honest stage text and indeterminate progress. Retry chapter failures; unavailable graphics exits preparation with the saved chapter controls still usable.

Floating world labels use transparent backgrounds and restrained text shadows. Health/work tubes have a thin glass edge and softly luminous fill, tinted by existing daylight and nearby scene lights; full panels remain reserved for opened UI.

Portrait: character/world preview, current activity and progress, one thought card near thumb zone, contextual bottom sheets. Landscape: expanded world view with contextual side panel. Support foldables/tablets, safe areas, reduced motion, scalable text, >=44px touch targets. No virtual joystick, hotbar or mandatory typing. Tap to inspect, drag to pan, pinch to zoom; world renderer lazy-loaded so progress dashboard opens quickly.

Thoughts: 2–3 short actionable ideas, unobtrusive countdown and visible default. If ignored, autonomous choice resolves. Decision may be collapsed without pausing. Preserve open thought, selected NPC, camera and timer through orientation change. Journal stores meaningful decisions and offline outcomes. Player should influence an intention in <=3 taps.

## Current game UX direction
Prince-led Thought & Intention interface for autonomous settlement growth. Portrait uses a world preview with bottom sheet; landscape uses side inspector. No mandatory text, joystick or dense controls. Compact parchment/ink or navy/gold UI accompanies readable voxel characters and terrain. See `docs/GAME_DESIGN.md` and `docs/ART_DIRECTION.md`.

Mobile HUD: compact health/bag/skills/journal dock, one-line Thoughts with Autoplay, and collapsed Messages. Tools reveals map, camera and visual settings; diagnostics stay hidden. Why/Next and Pause/Destination remain in Thoughts. Drawers replace the intention preview; rotation preserves the open panel. Local visual regression: `tests/rpg-mobile-hud.spec.ts` (four phone sizes, ≥44px controls, <25% default HUD coverage).

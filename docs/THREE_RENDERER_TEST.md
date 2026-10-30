# Optional 3D renderer test

User-authorized experiment, 2026-10-30: chunky RuneScape-inspired 3D shapes, coarse pixel textures, compact JRPG characters, muted colours and atmospheric realtime lighting. The existing painterly renderer remains the default. This is a presentation experiment on the current RPG, not a new progression chapter.

## Open the test

Run `npm run dev`, then open `http://127.0.0.1:5173/?renderer=3d`. Alternatively, open the game menu and choose **Use 3D test renderer**. **Use painterly renderer** switches back without restarting the simulation. The renderer choice lives in the URL, not the saved RPG chapter. A production preview uses the same query under its configured repository subpath.

The views share the current worker, 600ms ticks, V5 saves, map coordinates, actions, inventory, progression and offline reconciliation. This experiment does not change collision or award items/XP. Use normal chronicle export if you want a separate copy of your journey.

## Rendering contract

- Three.js/WebGL2 is lazy-loaded. React owns the interface; a renderer loop owns models, camera and interpolation. The simulation stays independent of Three.js.
- One logical tile is one world unit. Logical x/y map to 3D x/z. Models are centred in their existing object footprints and characters stand at their actual tile positions.
- The same legal movement traces and action phases drive presentation. Lighting, model animation, atmosphere and camera controls cannot issue gameplay outcomes.
- Terrain is batched; geometry, pixel textures and materials are shared. Renderer cleanup must remove listeners, stop animation and release GPU resources.
- One sun shadow map and four reusable unshadowed local light slots are the initial budget. Windows use an emissive surface plus local light; illumination does not require a shadow map. Light selection is managed explicitly, not inferred solely from light radius.
- Day, Dusk and Night are visual test presets. They do not advance the gameplay calendar. Sun shadows can be toggled for comparison.
- All code and art load from the static application origin. No API keys, inference, telemetry, external runtime assets or paid services are introduced. The PWA caches the renderer chunks under the existing base URL.

## Original placeholder art and authoring

Seven original Blender-authored samples now replace the initial bank, forge, tree, Alden and selected prop placeholders. Editable sources are in `assets/source/3d/`; local checked GLBs and a pixel atlas are in `public/art3d/`. The importer merges compatible static geometry while preserving roofs, the bank facade, light markers and articulated character pivots. The remaining NPC/building/resource variants use the original procedural fallback in `src/render/three/art.ts`.

See [the Blender MCP workflow](ART_PIPELINE.md) and `skills/fable-3d-art/SKILL.md`. A standalone read-only workbench at `?renderer=3d&assetReview=1` supports model selection, rotation, walking, cutaways, day/dusk/night and camera comparison without touching game saves. Default game camera is20°perspective with orthographic comparison; the overview stays orthographic. A placement editor, complete skinned animation library and full-world art conversion remain outside this test.

The reviewed samples are usable drafts in shape and basic integration. Texture/face/foliage craft remains below the concept target; passing export and browser checks does not constitute user art approval. Sources, earlier drafts and the existing painterly artwork are retained.

## Verification gate

Run unit tests, strict typecheck, production build and `npm run check:dist`. Browser checks must cover actual WebGL drawing, gameplay transactions, mode switching, selection and camera controls, portrait/landscape, unavailable WebGL, bounded lights and offline reload at the Pages subpath. Inspect screenshots as well as functional assertions. Benchmark results must name hardware/browser/viewport and distinguish desktop measurements from physical-phone testing.

Known tradeoff: unshadowed local lights can spill through nearby walls. Limit placement/range and use directional window placement rather than promising local occlusion. The art and lighting are a playable proof, not a claim of exact concept-image fidelity.

Results are recorded in `docs/PROGRESS.md`. Publication was authorized on 2026-10-30. Public entry points after the Pages workflow succeeds:

- [3D game test](https://cudldev.github.io/Fable-Crown/?renderer=3d)
- [Asset viewer](https://cudldev.github.io/Fable-Crown/?renderer=3d&assetReview=1)

The unqualified site URL retains the painterly default. Deployment verification is recorded separately in the progress log.

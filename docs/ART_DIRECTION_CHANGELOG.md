# Design change record

## Current — 2026-10-30: lush foliage cards

User requested flat 2D plant cards to support denser vegetation. Original grass, fern, flower and reed cutouts use crossed upright cards, shared wind and native-grid placement. Earlier solid foliage VOX clumps are archived sources; other environment families retain their voxel direction.

> Current renderer update — 2026-10-30: 2026-10-30: user requested voxel rendering as the live default and removal of other rendering styles. Runtime switching, painterly Canvas scenes and ink/fitted character routes are removed; release packaging excludes their assets. Source studies remain archived.

## Current — 2026-10-30: normal rendering only

User removed the screen pixelation effect to focus on normal rendering. Use display resolution with antialiasing and a 2× density cap; remove the style selector and ignore old Pixelated preferences/presets. Pixel characters and voxel environments keep their approved artwork.

## Current — 2026-10-30: full pixel billboard cast approved

User approved swapping all characters and enemies to the squat pixel style after the class-sheet study. Voxel terrain/buildings/props remain; upright feet-anchored sprites always face the camera. Natural skin/dark eyes, no dark outlines, broad flat pixel clusters and short nearly-square proportions. Mostly authored frame animation plus small squash/stretch; optional shallow authored normal maps may respond to world lighting. [Cast implementation](PIXEL_CAST.md) and [generation skill](../skills/fable-pixel-characters/SKILL.md). Earlier voxel-character direction below is historical for actors.

## Historical — 2026-10-30: simpler voxel characters and hybrid animation

User requested simpler true voxel characters, with mixed squash/stretch tweening and mostly frame-by-frame voxel animation. Use coarse cubic forms, fewer material groups and minimal face/clothing detail. Authored voxel poses carry most motion; selective tweening adds weight and anticipation while preserving cubic cells and foot/tool contacts. This refines the voxel direction below; it does not establish an implemented animation system. See [ART_DIRECTION.md](ART_DIRECTION.md#character-animation-direction-- 2026-10-30).

## Current — 2026-10-30: voxel direction

User confirmed voxel as the current direction for the whole game, including characters. Warm storybook terrain A (soft color transitions, olive grass, pale paving, crisp block terraces) and the accepted oak VOX are the active references. See [ART_DIRECTION.md](ART_DIRECTION.md), [VOXEL_PIPELINE.md](VOXEL_PIPELINE.md) and [VOXEL_ASSET_MIGRATION.md](VOXEL_ASSET_MIGRATION.md). Native VOX, shared cubic pitch and animated modular actors replace the earlier painted-cutout target. Trees are migrated; other asset families and world elevation remain pending. Documentation changes do not change runtime defaults or imply a deployment.

## Historical — 2026-10-29: painterly direction

Latest user direction supersedes the previous autonomous-adventurer-only, pixel-art demo. Project working title: **Fable Crown** (commercial name clearance not finalized). The game centers on a young prince autonomously growing a frontier settlement through individual villagers, RPG skills and player-influenced Thought & Intention choices. The visual direction is fully painterly, traditional Japanese fantasy illustration with watercolor/ink texture and simpler painted in-game characters. Pixel art and obligatory HD-2D pixel sprites are dropped. Keep mobile portrait/landscape, 600ms tick, hybrid calendar and 25%-speed capped offline progress, local narrative LLM with no API costs, GitHub Pages, orchestrator/subagent workflow, and the strict remaining 10% + one normal weekly reset planning budget. Prioritize a small workshop-construction vertical slice; defer large NPC stress tests, advanced combat and elaborate town systems. See GAME_DESIGN, ART_DIRECTION, DEMO_SCOPE_AND_ART.

Expanded-world implementation: original generated raster terrain and transparent cutouts now provide runtime artwork. Full-browser camera, contextual overlays, close follow, three settlements and nine regions follow the approved expansion in EXPANDED_WORLD.md.

Tile RPG iteration: logical square tiles projected isometrically; four quiet original material swatches plus separate painterly props/characters. Simplified approved Town Life proof remains authoritative. Added transparent fisher, boar, rock mite, outlaw, anvil and cooking range; exact prompts/PNGs in assets/generated/v3/. Removed unused region backdrops from runtime while preserving sources. No pixel art.

- 2026-10-30: User approved measured Alden proportions for all units. Full cast now shares the scenery 0.0625m voxel pitch; separate hand/tool, still body, full billboards and horizontal mirror.

-2026-10-31: Sprite bodies/hands/tools use environment lighting only, with zero emission and broader authored form normals; proportions and albedo retained.

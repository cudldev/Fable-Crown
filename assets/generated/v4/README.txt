Original Alden directional atlases, built-in ImageGen mode, 2026-10-29.
No API key, paid API, external runtime dependency or existing game art used.

Sources: prince-locomotion-original.png (1254x1254), prince-actions-original.png (1659x948).
Exact generation instructions: prince-locomotion.prompt.txt and prince-actions.prompt.txt.
Style inputs: approved docs/art-audit/gameplay-style-proof-v2.png and original assets/generated/v2/prince.png.
Actions additionally reference the approved locomotion output for identity.
Lead approved both source samples before integration. No additional generation calls used.

Runtime: public/art/prince-locomotion.webp (1352x1352, 338x338 cells),
public/art/prince-actions.webp (2212x1148, 316x287 cells).
Four direction rows: ne, se, sw, nw. Pose columns are recorded in prompts/atlas-metadata.json.
build-atlas.cjs performs ordinary atlas processing through bundled sharp: locomotion grid slicing,
action alpha-component isolation (28 distinct figures), regular cell repacking and WebP encoding.
Original character pixels are not rescaled. Each figure has transparent cell padding.
Alpha component flood preserves attached antialiasing; only isolated tiny speckles are excluded.
Source action grid was irregular, so naive uniform slicing would clip boots/tools.

src/render/actor-atlas.ts and atlas-metadata.json contain cell origins, cell-local alpha-foot pivots,
alpha bounds and bodyHeight. bodyHeight is 292 source pixels for locomotion, 205 for actions,
visually checked head-to-boots without raised tools. Scale from bodyHeight, not tool-inclusive bounds.
The southeast mining pivot excludes the pickaxe tip below his boots.
actions-preview.png composites the final transparent action sheet on parchment for visual QA only.

Limits: one authored action pose per action/direction, intended to alternate with idle in renderer;
three walk poses support walking/running via cadence, not a separate authored running sheet.
Individual tool hands remain simplified at gameplay scale. No claim of full skeletal animation.

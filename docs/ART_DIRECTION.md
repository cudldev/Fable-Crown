# Fable Crown — Painterly Fantasy Art Direction (CURRENT)

2026-10-30: the user authorized a separate optional [3D pixel-art renderer test](THREE_RENDERER_TEST.md), using chunky RuneScape-inspired shapes, JRPG characters and atmospheric realtime lighting. Its explicit test scope overrides the painterly rules below only when `?renderer=3d` is selected; the painterly renderer remains the default.

## Authoritative decision
The game's visual style is **fully painterly, hand-illustrated traditional Japanese fantasy**, inspired by the *illustrative qualities* of classic fantasy RPG cover art, expressive watercolor-and-ink linework, and richly staged medieval fantasy. **Pixel art is no longer a requirement.** Earlier pixel/HD-2D references are superseded by this document. Do not apply pixelation, sprite-resolution limits, pixel-art shaders, nearest-neighbor scaling, or pixel textures merely to match older documents.

## Visual language
- Loose, expressive ink contours, variable line weight, translucent watercolor/gouache washes, visible brushwork and subtle paper texture; original art only.
- Readable, painterly 2D characters and environments. Characters can be simpler in gameplay than in portraits and promotional illustrations; preserve silhouettes and distinctive colors.
- Traditional fantasy: blue-and-gold prince, knights, mages, merchants, craftspeople; stone bridges, timber-framed shops, warm forges, lush forests, cliffs, banners and castles.
- Palette: parchment cream, muted ochre, ultramarine and slate blue, moss/forest green, terracotta red, warm gold. Avoid glossy plastic, hyperrealistic PBR, harsh neon and excessive bloom.
- Use restrained 2.5D layering and parallax with simple geometry where helpful; painterly texture and readability take precedence over true 3D detail.
- UI: compact parchment/ink or dark navy/gold surfaces, generous touch targets, high-contrast text, sparse ornament. Portrait and landscape are equally supported.
- Hero art/portraits may be detailed paintings; in-world actors use simplified painted cutouts or billboard sprites with limited animation. Do not rely on tiny pixel sprites.

## References
- `assets/reference/fable_crown_painterly_latest.png` is the **primary current art direction** (illustration, in-game town, character designs, world map, city growth and intention dialogue).
- `assets/reference/fable_crown_watercolor_ink.png` is a secondary watercolor/ink reference.
- `assets/reference/hd2d_demo_concept.png` is historical and superseded; it may inform landmark placement only, not the final rendering style.
- These are concept collages, NOT production-ready sprite sheets or tile atlases. Do not crop UI labels or character composites as finished assets. Create original clean, separate placeholders with consistent perspective and transparency.

## Implementation approach
1. Build a small layered painterly scene from independently authored assets: background terrain, walkable paths, landmark buildings, trees, ore, forge, bank, prince and villagers. Simple geometric stand-ins are permitted only temporarily during engine development.
2. Use Three.js/WebGL2 if it benefits camera, depth and selection; prefer textured planes, parallax and inexpensive lighting. No need for a physically detailed 3D town.
3. Make a distinct prince cutout with blue cape and gold trim; villagers need readable professions and selection/working indicators.
4. At phone scale, players must distinguish the bank, forest, mine, workshop site and prince at a glance. Visual clarity takes priority over ornamental density.
5. Provide screenshots at narrow portrait and landscape sizes; compare them to the painterly references and iterate.

## Asset generation and IP
Use generated or original illustrations as temporary assets only when licensing and rights permit. Do not use existing game art, extracted assets, or reproduce specific copyrighted characters. If consistent painted sprites cannot be produced automatically, use hand-authored SVG shapes/painted placeholders and clearly record the limitation. Avoid blocking gameplay on perfect art.

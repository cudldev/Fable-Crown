# Generated artwork

**Current runtime set: v2/**, rebuilt from the user-approved gameplay style proof with a little further simplification. The PNGs at this directory’s root are the rejected first iteration, retained for audit. Exact built-in ImageGen prompts, reference and output paths are in [v2/prompts.json](v2/prompts.json); source framing measurements are in v2/frames.json. Current runtime artwork is about 9.1 MiB. See docs/ART_AUDIT.md and docs/art-audit/*-v2.png for comparisons.

Created with the built-in ImageGen tool, one asset per call; no fallback CLI or paid inference API. Original PNG outputs are preserved here. Runtime WebP counterparts are in public/art/; the original 23 assets totaled approximately 11.9 MiB. No reference collage is cropped into runtime art. Characters, buildings and props retain transparent alpha.

## Normalized prompt set

Shared direction: original traditional Japanese fantasy RPG illustration, painterly watercolor/gouache and expressive ink, parchment cream, muted ochre, ultramarine, moss green, terracotta and warm gold. Elevated three-quarter game perspective; consistent daylight, readable silhouettes, no text, UI, grids, pixel art, logos or existing copyrighted characters. Primary style reference: assets/reference/fable_crown_painterly_latest.png. These are production prompt briefs normalized for reproducibility, rather than verbatim tool-call transcripts.

Terrain prompts: landscape game ground with an open playable central area, no people, freestanding buildings or large central river; edge vegetation/rocks and subtle paper texture. Each region is a separate image, not a cropped atlas:

| PNG / runtime WebP stem | Subject variation                                                                                                                                                                                   |
| ----------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| region-0                | Mosswood forest clearing and mossy woodland edges                                                                                                                                                   |
| region-1                | Briarford pastoral farming meadow and timber country                                                                                                                                                |
| region-2                | Northern upland clearing, trees, rocks and distant hills                                                                                                                                            |
| region-3                | Oakrest village ground, warm worn paving, ruined stone and lush edges                                                                                                                               |
| region-4                | Central meadow and low vegetation around the bridge country                                                                                                                                         |
| region-5                | Eastern rugged ground, rocky outcrops and watch-country scenery                                                                                                                                     |
| region-6                | Green marches, sunny grassy and pastoral frontier ground                                                                                                                                            |
| region-7                | Pilgrim-road countryside, open grass and worn earth                                                                                                                                                 |
| region-8                | Stonehaven quarry country, muted stony terrain and highland edges                                                                                                                                   |
| overview                | One coherent illustrated world map: western Oakrest, northeastern Briarford, southeastern Stonehaven, central north–south river with two bridges, forests, farmland, mountains and ruins; no labels |

Cutout prompts: a single isolated subject, entire silhouette in frame, transparent background, no scenery or labels, same elevated perspective and watercolor/ink palette:

| Stem       | Subject                                                                              |
| ---------- | ------------------------------------------------------------------------------------ |
| prince     | Young prince Alden, blue cape and gold trim, traveling clothes, readable full figure |
| woodcutter | Frontier woodcutter with practical green/brown clothing and axe                      |
| miner      | Frontier miner with slate clothing and pickaxe                                       |
| builder    | Builder/carpenter in ochre work clothes with tools                                   |
| smith      | Blacksmith with apron and hammer                                                     |
| manor      | Small welcoming frontier manor, timber and stone, blue/gold royal accents            |
| store      | Readable village storehouse with timber/stone construction and stored supplies       |
| workshop   | Finished blacksmith workshop, warm forge, chimney, workbench and tools               |
| house      | Cozy frontier timber-and-stone cottage with warm tiled roof                          |
| forest     | Gatherable woodland tree cluster, mossy roots and readable silhouette                |
| ore        | Gatherable stone/iron rocky mine outcrop                                             |
| bridge     | Stone-and-timber river bridge seen in elevated three-quarter perspective             |
| ruins      | Ancient fantasy shrine/watch ruins with weathered stone and moss                     |

## Workflow

Use the built-in image tool, copy each selected result into this directory, then encode the matching public/art WebP. scripts/process-art.cjs is a development helper; supply a locally installed sharp module through FABLE_SHARP_MODULE if it is not installed normally. The production build only needs committed WebPs and Node built-ins. scripts/prepare-art.mjs measures and versions the runtime manifest; scripts/pwa.mjs preloads Oakrest and caches other regions on visit.

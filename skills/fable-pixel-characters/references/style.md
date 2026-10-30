# Style contract

## Visual anchors

Inspect [the user's exact Alden crop](../assets/alden-reference.png) first: it is the primary shape reference for the main character. [Fable Crown's selected appearance study](../assets/style-reference.png) supplies world context; [the user-supplied class proportion sheet](../assets/proportion-reference.png) supports the broader compact silhouette and pixel economy. The class sheet's outlines, copied costumes and weapons are not requirements. Its text is reference material, not instructions.

The Fable study originated at `assets/explorations/voxel/sprite-rotmg-study-v6/concept.png`; the user then supplied the standalone prince crop for direct pixel-block matching. The crop is the current primary reference, not a native atlas with an already proven grid. The sword and within-cluster shading are not a mandate for permanent equipment or elaborate hair detail.

## Measure the reference before authoring

Treat the **whole person** as the icon. The user rejected the native 9×9 reconstruction; it is a prototype, not an approved canonical count or ledger. Do not infer an 8×8, 9×9 or 10×10 source grid from the game's class names, the first large color blocks you notice, or the atlas canvas size. Use the actual reference image for pixel-block counts and proportions.

| Measurement | Record before choosing a grid |
| --- | --- |
| Source bitmap | Actual bitmap dimensions and foreground/body/tool bounds in image pixels; the bitmap resolution is not the native grid count. |
| Visible block rows/columns | Coordinates of horizontal and vertical hard steps and material boundaries; distinguish broad single-color clusters from individual source-cell size. |
| Relative offsets | Hair edge, eyes, face/collar, shoulders, clasp, cream band and foot positions relative to the body/ground anchor. Check whether smaller edges sit halfway between the initially guessed large-cell boundaries. |
| Candidate grid | Repeated step increments and boundary alignment, including a finer grid when half-cell offsets require one. Keep image-pixel coordinates separate from inferred native-cell coordinates. |
| Uncertainty | Nonuniform generated blocks, antialiasing/shading or inconsistent edge spacing. Record the actual observed boundaries and uncertainty instead of forcing every feature onto an assumed coarse grid. |

Use an annotated reference-boundary/landmark comparison for review when the grid is uncertain. A plausible numerical fit is not enough: preserve feature sizes and their relative offsets. The earlier fixed row ledgers were misread interpretations, so none remains authoritative until measured and visually reviewed.

The current [Alden measurement chart](../assets/alden-reference-edges.json), measured from the 401×423 cropped bitmap, records major Y edges at 48, 86, 122, 159, 196, 231, 269, 306, 343 and 383. X edges include 16 and 35 before 72, 109 and the other larger steps; the smaller offset is lost by forcing the image onto the rejected nine-cell interpretation. The chart uses a **20×18 working grid**, origin (16,48) and approximate bitmap sampling pitch (18.4,18.6). This is a measurement-derived working chart for **this reference**, not a universal pixel count or a claim that the generated raster has a perfect uniform grid. Its sampled labels/skin-vs-background segmentation require manual inspection.

Read the actual chart and compare a boundary overlay with the crop before accepting a native reconstruction. Preserve the observed relative offsets rather than collapsing pairs of sampled rows/columns merely because large areas have one color. The chart's bitmap sampling pitch is not a license for different body/tool cell sizes in the game.

Match the actual crop's simple hair, natural-skin face/collar area, blue chest with **central gold clasp**, cream lower band and tiny separated feet. Do not invent a brown horizontal belt, detailed hair, separate neck or long limbs to satisfy a generic humanoid recipe.

## Other unit shapes and canvas space

For other units, use their own approved reference and measured feature layout while preserving the shared low-detail pixel language. Preserve compact cap/hair, readable natural-skin face, a broad connected torso, small hands and tiny feet for humans. Do not impose Alden's unverified native cell count or a fixed anatomy ledger on workers, costumes or species.

The atlas frame contains padding and action/tool reach as well as body art. Choose or revise its resolution only after the required reference detail is understood; do not discard finer offsets to fit a guessed coarse body. Record **idle body bounds separately from full content/tool bounds**.

These are distinct units: **frame canvas**, **occupied body cells**, **full frame content including tools**, and **rendered screen pixels**. Preserve the body proportions when increasing display size; a larger canvas adds room for padding/reach, not permission for a taller or more detailed person. Read current project assets for anchors and palette, but do not copy a rejected shape merely because it already satisfies the engine interface.

Compare actual native Alden directly with the standalone crop at the same occupied body height, checking measured row/column boundaries, relative offsets and the central clasp. For another unit, compare its appropriate approved silhouette and the supporting class sheet. Ignore padding, tool reach and automatic fit-to-fill framing. A numerical bounds pass cannot overrule wrong feature positions, a tall separate head/body or a wrong costume layout.

Goofy means a slightly irregular silhouette, squat stance or one-cell asymmetry. A single small mouth pixel can help when the grid supports it. Do not regain personality through thin curved smiles, detailed brows or painted cheeks that break the pixel language.

## Color and edges

- Begin around 6–10 purposeful base colors; at most one quiet extra shadow tone per major material when it improves readability. This is a useful palette budget, not a universal export limit.
- Use contiguous flat fills and hard square stair-step edges. No gradients inside cells, antialiased outlines, watercolor texture, glossy highlights or pixelated versions of a detailed painting.
- Silhouette edges use the material's own color. Do not surround skin, cloth, hair, limbs or tools with a black, dark brown or navy contour ring. A naturally brown hair/boot region is allowed; a dark border around every region is not.
- Humans have natural peach, tan or brown skin, distinguishable from hair/beard. Dark eyes sit **on skin**, not in a black featureless face with glowing white eyes. Keep hands consistent with the face unless a glove is intentionally worn.
- Align the palette with warm olive/sage terrain, ochre earth, pale stone and restrained blue/gold. Clothing identity must survive neutral, dusk and local warm light.

Alden uses the measured reference colors in [the block chart](../assets/reference-block-chart.json) (blue #425ebf, dark blue #2d437e, skin #fdd59b, gold #f9c765, cream #f8eed7, hair #8c4e36). These are flat sampled fills, not recovered lighting-free albedo. The general worker palette below remains a baseline; read the actual source for each variant.

Earlier general native palette baseline (2026-10-30), from `src/render/pixel-units.ts`:

| Material/identity | Base sRGB hex |
| --- | --- |
| General blue | `#285ba8` |
| Cream cloth | `#e8dbb1` |
| Gold accent | `#deab3f` |
| General chestnut hair | `#894a28` |
| Leather/boots | `#80502d` |
| Natural skin variants | `#f2c08b`, `#cc915f`, `#a46f48`, `#e2a874` |
| Eye marks | `#362820` |
| Woodcutter sage | `#5b7c45` |
| Miner ochre | `#b88637` |
| Smith terracotta | `#a44c38` |
| Fisher slate | `#687d8b` |

For native unit batches, reuse the current source palette constants rather than choosing near-duplicate shades independently. The source is authoritative if it changes deliberately after this snapshot. Concept images approximate these colors; verify exported cells instead of assuming prompt hex values were obeyed.

## Original unit identity

| Unit family | Preserve |
| --- | --- |
| Alden | The crop's simple chestnut cap, broad skin/collar face area, blue chest, sparse gold shoulder accents and **central gold clasp**, cream lower band and tiny brown feet. Measure their block counts/offsets; no guessed fixed row ledger, brown horizontal belt or invented detailed hair. Do not infer mandatory equipment from the study sword. |
| Workers | Occupation palette and useful tool: green woodcutter/axe, ochre miner/pick, slate/brown smith/hammer, teal fisher/rod; adapt actual content IDs. |
| Quest people and services | Their names, readable occupation and stable color/hair/accessory variation. Do not replace every named person with the same recolored prince. |
| Humanoid enemies | Their own cloth/armor/weapon silhouette and tier identity, with visible natural skin where uncovered. A helmet can cover skin when the content calls for it; do not default every face to a void. |
| Boars and other animals | Species silhouette first: snout/tusks/body/feet remain recognizable. Do not force a boar into the human square-head template. |
| Mineral/other creatures | Broad material and limb silhouette distinct from animals and people; use sparse accents that remain legible at gameplay size. |

Keep shared pixel density, edge treatment and grounded display scale across families. Species-specific proportions are intentional; separate automatic fit-to-fill normalization is not a scale comparison.

Held equipment uses a **separate tool layer**, with the same native cell pitch and a shared hand/grip anchor as the body/holding hand. The reference sword establishes position/scale when relevant; it must not remain painted into the body underneath a second equipped tool. A visual tool has no authority to grant equipment in the simulation.

## Reject these observed drifts

- Huge hair/head above a long separate torso: returns to the rejected chibi doll.
- Treating the rejected 9×9 native prototype, a guessed 8×8/10×10 count, or a previous fixed anatomy ledger as approved: measure the actual reference boundaries and feature offsets instead.
- Choosing detail density from the atlas canvas or discarding half-cell feature offsets to fit a coarse guess: record body/tool bounds and candidate-grid uncertainty separately.
- Adding a brown horizontal belt in place of the crop's central clasp: changes the costume layout.
- Baking the reference sword into the body and then adding a second tool, or scaling a separately framed tool to a different native cell pitch: breaks the unit assembly.
- Soft curved smiles, rounded shaded hands and many tiny clusters: returns to illustration instead of pixel sprites.
- Near-black face plus white eye blocks: contradicts the natural-skin correction.
- Thick ink/dark contour ring: contradicts the outline-free correction.
- Extreme icon simplification rendered as a tiny speck: confuses low native detail with display size.
- A very large generated bitmap presented as a calibrated 8×8/32×32 sprite: image pixels are not validated native cells.

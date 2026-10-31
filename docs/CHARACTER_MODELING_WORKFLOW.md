# Game-character modeling workflow

Researched 2026-10-30. Applies to the compact ink/watercolor Alden study. This is a synthesis of production practices from primary documentation, followed by explicit Fable Crown review rules. It is not a universal polygon-count standard.

## The production sequence

**Concept → blockout sculpt → resolved sculpt → low-poly retopology → UVs → bake/paint → final rig/animation → engine validation and LODs.**

An early deformation test belongs immediately after retopology, before expensive texture work. Rigging and texturing can then proceed in parallel once the mesh is stable. Sculpt-first is the selected approach for Alden; not every game asset requires a high-resolution sculpt. Autodesk describes retopology as separating detailed shape creation from a subsequent optimized, animation-ready surface. [Autodesk: retopology](https://www.autodesk.com/solutions/retopology)

| Stage | Work | Small preview and review gate |
|---|---|---|
| 1. Reference and use | Identify silhouette, head/body balance, face planes, costume masses, intended camera sizes and required actions. Separate appearance requirements from runtime limits. | Concept beside the planned neutral view; record unresolved proportions. |
| 2. Blockout sculpt | Establish head, rib cage, pelvis, limbs, hands and feet at low resolution. Sculpt their relationships and negative spaces. Temporary primitives are construction aids. | Actual Blender clay front/side/three-quarter views, equal framing. User reviews proportions before more work. |
| 3. Resolved sculpt | Refine cheek/jaw/nose, shoulder transitions, swept hair masses and the main cloth/cape folds. Increase resolution only as needed for those forms. Preserve a separate sculpt source. | Clay turntable and face crop; approve shape before retopology. No pores, decorative seams or dense folds to disguise a wrong silhouette. |
| 4. Retopology | Build a new, lower-density mesh over the approved sculpt. Use symmetry where useful, snapped vertices, Poly Build/extrusion, bridges, loop cuts and edge sliding. Preserve shape and plan bends. | Source wireframe over clay, then an initial rigged bend test. |
| 5. UV and transfer | Unwrap the stable low-poly mesh; inspect stretching and density with a checker. Transfer useful sculpt information through baking where it helps the style. | UV sheet, checker and a bake inspection at seams, hands, ears and cloth overlaps. |
| 6. Ink and paint | Author broad watercolor values, selective fine ink and readable material groups. Use the sculpt as the form reference. | Neutral-lit painted view plus actual gameplay-sized crops. |
| 7. Rig and animation | Refine skin weights and test intended walking, working and equipment poses. The rig must deform the surface rather than merely rotate rigid shells. | Shoulder raise, elbow/knee bends, hip movement, wrist/ankle poses and a short walk. |
| 8. Runtime asset | Export a triangulated copy with the intended normals, UVs, skin and clips. Validate import, materials, pivots, actual draw calls and camera-dependent LOD needs. Keep the editable source. | Actual browser close/game views and phone orientations; benchmark before performance claims. |

Manual retopology means deliberately placing and refining vertices/faces against the reference surface; Maya's Quad Draw workflow illustrates this directly. An automatic remesh or decimation pass can assist, but does not itself demonstrate deformation-ready edge flow. [Maya: Quad Draw](https://help.autodesk.com/cloudhelp/2024/ENU/Maya-Modeling/files/GUID-03933C1F-1BA7-4E7E-AAB5-31FB0E6A77B2.htm), [Blender: retopology/remeshing](https://docs.blender.org/manual/de/5.1/modeling/meshes/retopology.html)

## What usable topology means

Use mostly quads in the editable deformation cage because their loops are convenient for shaping, subdivision and skinning. Engines render triangles; preserve control over export triangulation. Triangles and poles are legitimate when placed deliberately. Avoid n-gons and abrupt density changes in bending or subdividing regions; a planar rigid cap is a different case. Loops should follow anatomical contours and deformation, with more support near shoulders and knees. A high quad percentage alone proves little. [Blender: mesh structure and loops](https://docs.blender.org/manual/en/5.2/modeling/meshes/structure.html)

For this character, continuous skin or garment regions must have coherent edge flow through their joints. Joining object names is not welding or retopology. Eyes, hair, clothes, belts and boots may remain separate when their construction and animation justify it. Open cuffs/hems can be intentional; loose vertices, accidental internal faces, inverted normals and unintended non-manifold junctions require inspection. Validate skinning with simple animations and refine it after import. [Unity: models for animation](https://docs.unity.com/en-us/engine/6000.3/manual/assets-and-media/asset-types/models/creating-dccassets/using-humanoid-chars)

**Fable Crown test convention:** begin elbow/knee planning with a bend loop and supporting loops on both sides, then test the intended range. This is a starting sketch, not a rule that every joint needs exactly three loops. Inspect compression, stretching, volume loss, intersections and silhouette; add or redirect edges only when a visible failure calls for them. Facial expression loops are required if we choose facial deformation; a static face need not carry an unused facial rig.

## Detail density: where the geometry belongs

Polygon density is vertices/faces allocated to shape and deformation. Texel density is texture resolution allocated through UVs. They are separate decisions: subdividing a sleeve does not improve its painted ink resolution. UV density should reflect visibility and viewing distance, with intentional exceptions for face/detail regions. [Maya: UV mapping tips](https://help.autodesk.com/cloudhelp/2026/ENU/Maya-Modeling/files/GUID-1CEF8A5B-1051-40F1-ACFE-F29AD066F56F.htm)

| Region | Geometry should describe | Detail usually better painted or shaded |
|---|---|---|
| Head/face | Skull, cheek, jaw, nose, ear and required expression shape | Fine brows, skin wash, subtle lip/eyelid accents |
| Hair | A few shaped swept clumps and their silhouette | Most strand lines and color strokes |
| Shoulder/elbow/hip/knee | Bending, twisting, attachment and volume | Small skin/cloth marks |
| Broad torso/limb surfaces | Taper and important curvature; smooth density transitions | Weave, brush grain, minor folds and seams |
| Hands/boots | Grip, thumb separation, knuckles/toe/ankle silhouette as visible | Tiny stitching, scratches and edge wear |
| Cape | Outline, broad folds and required motion | Most fine ink folds, pigment variation and gold wear |

This table is our art/animation allocation policy, not a prescribed industry percentage. Similar local face sizes help avoid abrupt transitions, but uniform density over the whole character wastes geometry. Add an edge when it improves the visible contour, shading or a tested deformation; remove it if those remain unchanged.

Google's mobile guidance prioritizes visible silhouette over tiny geometry and warns about microtriangles. Its roughly 10-pixel-area recommendation is a platform optimization guideline, not a universal acceptance threshold. Polygon needs vary with camera size, device and the number of visible objects. [Android: geometry](https://developer.android.com/games/optimize/geometry)

**Illustrative sizing calculation, not a measurement or budget:** a circular cross-section projected with radius `r` has polygon outline error `e = r × (1 − cos(π/n))` for `n` regular sides. At radius 6 pixels, 8 sides give about 0.46 pixels error; at radius 24 pixels, 16 sides give the same error. This only estimates a static circular silhouette. Anatomy, bending, oblique views, shadows and shading may need different placement or more edges. It explains why one fixed ring count for every body part is inappropriate.

Review density at the closest allowed camera and at normal gameplay scale. Compare coarser and denser variants in the same pose/light. A screen-space density inspection must distinguish visible/front-facing triangles from hidden geometry; raw triangle totals or world-space edge lengths alone cannot establish efficiency.

## Baking, export cost and budgets

High-to-low baking transfers surface information; it cannot repair a wrong low-poly outline. Match high/low surfaces, inspect the projection cage and check for intersections and missed areas. For the ink direction, normal/AO/curvature maps are optional aids; painted diffuse values remain an artistic choice. These sources describe techniques, not a requirement to purchase Substance or adopt a PBR look. [Adobe: mesh-map baking](https://experienceleague.adobe.com/en/docs/substance-3d-painter/using/baking/how-to-bake-mesh-maps)

Count **exported triangles and runtime vertices**, not just Blender vertices or quads. UV seams and normal/color discontinuities can split a source vertex into multiple runtime vertices; materials and render passes also matter. There is no single correct character polygon count independent of the scene and target platform. [Unity: optimized models](https://docs.unity.com/en-us/engine/6000.0/manual/assets-and-media/asset-types/models/creating-dccassets/modeling-optimized-characters)

Record source cage counts, evaluated/export counts, skin/bone influences, materials, textures, outline cost and actual renderer counters separately. LOD reduction should preserve silhouette and important deformation regions, and be assessed at its intended screen size. [Epic: skeletal mesh LODs](https://dev.epicgames.com/documentation/en-us/unreal-engine/skeletal-mesh-lods-in-unreal-engine)

The existing 32k-triangle ink-study validator ceiling is a technical guardrail, **not an approved asset budget or quality target**. Set a provisional budget after sculpt approval and camera-size review, then revise it using measured target-device performance. Keep all work local and original, with no paid generators, services or runtime keys.

## Actual blockout audit and correction priorities

Read-only audit of saved `assets/source/3d/alden-ink.blend`; [raw per-object results](art-audit/ink-study/topology-audit.json). Evaluated counts include source modifiers, but exclude renderer-generated contour geometry and extra passes.

| Region | Evaluated triangles |
|---|---:|
| Ink-stroke tubes | 6,720 |
| Eyes | 936 |
| Head, neck and ears | 1,690 |
| Hair | 818 |
| Torso, collar and accessories | 538 |
| Arms and hands | 1,672 |
| Legs and boots | 1,696 |
| Cape and clasps | 1,512 |
| **Total** | **15,582** |

Ink tubes consume **43.1%** of exported triangles. This is a candidate for paint/line-rendering replacement, subject to same-size visual comparison. The eyes exceed the torso group's count, which is a review prompt rather than proof that eye density is wrong. Source surfaces contain 3,545 quads, 90 n-gons and no armature. The raw report includes boundaries and edge lengths; it does not measure UV stretching, visible screen-space density, self-intersections or deformation quality.

The current model fails the concept's proportions and shape. First sculpt and approve the lean compact silhouette. Then retopologize the approved form, allocate density around visible contours and bends, and demonstrate deformation. Do not refine or subdivide the rejected blockout to manufacture a claim of usable topology.

## Optional learned shape generation — Tripo research check

2026-10-30: studied official research, paper and inference code. Public research does not establish the exact internals of the current commercial Tripo service.

TripoSG uses image-conditioned rectified flow in a learned 3D latent space; its shape decoder uses signed distance fields trained with surface-normal and eikonal supervision. The paper reports 2 million curated training samples and a 4B research model; the released model card describes a smaller 1.5B/2048-token model. These learned shape priors are the central distinction from our hand-specified procedural forms. Reading the method cannot transfer its trained capability into the assistant. [Paper](https://arxiv.org/html/2502.06608v3), [released weights/model card](https://huggingface.co/VAST-AI/TripoSG)

TripoSF/SparseFlex concentrates computation near surfaces and supports open geometry. Its released VAE example reconstructs an existing mesh; it is not a drop-in replacement for TripoSG's image-to-mesh entry point. Its use of “arbitrary topology” does not certify animation-ready edge flow. [Official TripoSF repository](https://github.com/VAST-AI-Research/TripoSF)

A sensible optional experiment would use one isolated full-character image → locally pretrained shape model → actual multi-view review → Blender correction/retopology/UV/rig. Do not feed the whole multi-character turnaround collage to the single-image inference entry point. The official script generates a mesh and offers quadric face reduction, not a character deformation rig. [Inference code](https://raw.githubusercontent.com/VAST-AI-Research/TripoSG/main/scripts/inference_triposg.py)

Initial research found RTX5070Ti, 16,303MiB VRAM; the TripoSG README lists at least 8GB CUDA VRAM. The user subsequently approved local installation and actual inference passed (~42s per tested image). Current environment, model revision, outputs and limitations are recorded in [CHARACTER_GENERATION.md](CHARACTER_GENERATION.md). The stock background-removal download was bypassed using explicit alpha masks. No paid endpoint or inference dependency belongs in the shipped game. [Official TripoSG instructions](https://github.com/VAST-AI-Research/TripoSG)

## Review cadence

Show one small actual Blender stage at a time and wait for the user's feedback before advancing: blockout sculpt, resolved sculpt, retopology/bend test, then paint/runtime. Include solid plus source wireframe when topology is being judged; generated concept art and GLB triangulation are not substitutes for the editable source cage. Keep the `.blend` as the source of truth and preserve prior drafts. Scripts may assist setup/auditing/export; automation does not prove modeling quality.

To reproduce this read-only audit after loading the saved study:

```powershell
.tools/blender-mcp-env/Scripts/python.exe scripts/blender-mcp-client.py run scripts/audit-character-topology.py
```

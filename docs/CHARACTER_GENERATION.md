# Character generation implementation — current checkpoint

2026-10-30. User authorized the full character workflow, then explicitly authorized all modeling stages without waiting for overnight approvals. Final art review remains human-owned. The current scripted full-character shape was rejected; technical success is not acceptance.

## Current route

Latest baseline: **`alden-triposg-highpoly-v3-mask-fixed.blend`** and raw job `triposg-alden-v3-mask-fixed/`. The old mask erroneously included enclosed background between the boots. An explicit corrected mask preserves RGB and removes18,186 background pixels; same-seed regeneration eliminates the plate. User confirms the between-leg gap is sorted. Evidence: `docs/art-audit/triposg-mask-fixed-v3/`. Earlier v1/cage/remesh files below are historical comparisons.

User subsequently selected **local TripoSG**, replacing the earlier strictly non-neural shape requirement. Generate a detailed neural shape, review/correct it, then build usable low-poly topology, bake/paint, rig and verify actual gameplay. Automatic reduction is a preview aid, not deformation topology certification. Preserve every prior source.

- Official source: `.tools/triposg`, revision recorded in each generation job.
- Weights: `.tools/models/TripoSG`, model revision `2c1c516d22d58db486a058d98d31bb6177344e06`, 7,946,494,238 bytes; public MIT model. No RMBG weights or paid service.
- Environment: `.tools/triposg-env`; CUDA verification passed RTX5070Ti/sm120 with PyTorch2.14.1+cu130. NumPy/SciPy fitting environment remains separate in `.tools/sculpt-v2-env`.
- Adapter: `tools/sculpt-lab/triposg/run_local.py`; offline local weights only. Keeps official flash SDF decoder, substitutes CPU marching cubes for the optional compiled diso extractor. Records compatibility changes, hashes, seed, runtime and VRAM. This is TripoSG, not commercial P1.
- Inputs: isolated RGBA under `assets/reference/character-style/triposg-inputs/`; image preparation records manual/background assumptions. Prefer clean A-pose front for the first shape test; original concept three-quarter also prepared for comparison.

```powershell
.tools/triposg-env/Scripts/python.exe tools/sculpt-lab/triposg/run_local.py --image assets/reference/character-style/triposg-inputs/alden-front.png --mask assets/reference/character-style/triposg-inputs/alden-front-mask-v2.png --weights .tools/models/TripoSG --output-dir assets/source/3d/triposg-alden-next --seed 42 --steps 50 --resolution 512 --device cuda --model-revision 2c1c516d22d58db486a058d98d31bb6177344e06
.tools/blender-mcp-env/Scripts/python.exe scripts/blender-mcp-client.py run tools/sculpt-lab/triposg/blender_review.py
```

## Work retained from non-neural attempt

- Versioned project/annotation/fitting/job API and CLI under `tools/sculpt-lab/v2`; original head/bare-body guides and manual landmark project under `assets/reference/character-style/fitting-v2`.
- Controlled exact-camera solver benchmark passed its proposed numeric gate. Actual-image independent validation failed; all-view fitting experiments are explicitly labeled, not a substitute for held-out validation. Template symmetry is an explicit prior. No accepted head fit.
- Original full character source `assets/source/3d/alden-fitted-v1.blend`, body rig and four clips exist, but the shape is user-rejected. `assets/source/3d/fitted/correct_shapes.py` is a focused correction recipe; do not claim its results without execution/review.
- Runtime supports an opt-in `character=fitted` skinned Alden, independent skeletons/mixers, four clips and explicit missing-asset fallback. Default and ink paths remain separate. A dedicated GLB validator checks actual weights/binds/clips; no art acceptance inferred.

## Remaining completion gates

Correct stray costume sheets/spurs and projection artifacts → improve garment deformation/intersections → repeat source/browser visual review → human art acceptance. Current candidate is an experimental full-character review draft, not an accepted game asset. No publication or default replacement.

## Actual neural shape checkpoint

- Front A-pose job completed: 616,978 vertices / 1,234,630 triangles, 41.968 seconds inference, peak CUDA allocated 5.94GB. Source `alden-triposg-highpoly-v1.blend`; actual clay views under `docs/art-audit/triposg-alden-v1-front/`.
- Original concept-view comparison also completed: 694,784 vertices / 1,390,443 triangles, 42.173 seconds inference. More detached cloth/floor artifacts; retained as comparison, not selected for retopology.
- Deterministic front/side/back RGB projection gives a reviewable ink/watercolor appearance on the actual first sculpt (`projected-paint-three-quarter.png`). This is reference projection, not a TripoSG texture model or completed unique-UV bake.
- First regional ring-cage retopology failed the visual gate: open neck gap, lost collar/shoulder/cuff structure and uneven cape edges. Head QuadriFlow also refused the fragmented input. Raw geometry is preserved; corrective retopology remains in progress. No neural runtime export yet.

## Full review candidate checkpoint

- Editable painted source: `assets/source/3d/alden-triposg-painted-v1.blend`. Candidate: `assets/source/3d/triposg-alden-painted-v1/alden-triposg-candidate.glb` (SHA256 `eb32fead2d6dbba2bc61ba8d4d878895296708c5ec5dc316c841b97aa5148f96`).
- Actual export: **18,183 triangles / 28,097 runtime vertices / 46 bones / 3 primitives / one 2048 atlas / 6,589,584 bytes**, four animated clips. Dedicated binary validator passes. No performance claim.
- Hybrid geometry: structured body/joint cages; source-reduced rigid costume details and static head/hair. QuadriFlow cancelled; the head is explicitly triangle-reduced, **not facial retopology**. Cape outline corrected against supporting back drawing; depth from sculpt. Colour is deterministic RGB projection baked into UVs; no learned texture model or normal-map bake.
- Actual painted/source-wire views: `docs/art-audit/triposg-alden-painted-v3/`. Bend/clip source images: `triposg-alden-retopo-v2/` (earlier colour bake). Browser views/report: `triposg-alden-browser-v1/`; all four clips, both phone orientations and actual game controller load with no page errors or external requests.
- Browser candidate was injected by an isolated Playwright route; **public fixture/default art unchanged**. Candidate offline loading was not tested; existing fixture offline/subpath checks pass. Reproduce against the existing subpath preview: `node scripts/capture-triposg-candidate.mjs`.
- Independent review: acceptable for experimental workbench comparison only. Remaining defects: stray hip/shoulder sheets, boot-cuff spurs, projected hand marks on cloth, side hair/face patches and deformation polish. No human art acceptance.

Runtime gate: **292 unit tests**, strict root/subpath builds and PWA checks pass; six fixture browser scenarios pass. Source recipes assist reconstruction; edit the saved `.blend` as source of truth rather than regenerating over manual changes.

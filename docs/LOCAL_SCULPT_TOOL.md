# Local image-to-sculpt tool — proposed design

2026-10-30. A first computational head-envelope prototype now exists in [tools/sculpt-lab](../tools/sculpt-lab/README.md). It produces actual meshes/maps without trained models. No generator weights or new packages installed. **User rejected its shape; actual review agrees.** Whole-head row fitting produces strong ridges and no internal facial detail; it is not a useful sculpt starting point. See [failure review](art-audit/local-sculpt-v1/review.md). The broader design below remains staged. Keep the tool separate from the shipped game.

**Next-method decision:** follow the [multi-image reconstruction study and input brief](CHARACTER_RECONSTRUCTION_STUDY.md). Replace rounded height sections with assisted template/feature-curve fitting, starting from consistent bare-head views and separately represented hair. This is a researched proposal, not an implemented solver.

## What we build

An image preparation panel, computational reconstruction, geometry processing, reference comparisons and Blender handoff. Following the user's preference, test reconstruction without trained models first. A pretrained shape adapter is optional; training a general image-to-3D foundation model is a separate research/data/compute project.

```text
Aligned front/side drawings + optional back/three-quarter references
    → masks, landmarks, part labels and view assumptions
    → visual hull + fitted profiles + explicit thickness controls
    → actual mesh turntable + depth/normals + reference overlay
    → review and targeted shape corrections
    → editable Blender sculpt draft
    → approved form → retopology/UV/paint/rig in the existing art workflow
```

First input: `assets/reference/character-style/alden-compact-ink-3d-v4.png`. The generated turnaround sheets are supporting interpretations; they are not calibrated observations or an override of the original concept. Never feed the entire multi-character sheet into a single-image generator.

## Two reconstruction routes

| Route | Implementation | Intended role |
|---|---|---|
| Our multiview reconstruction | Aligned masks → visual hull; profiles/landmarks/thickness constraints → optimized surface/volume → extracted mesh | First feasibility test; explicit shape assumptions and small assisted corrections, no trained model required |
| Learned shape draft | Optional local TripoSG adapter; image-conditioned shape generation and mesh output | Later comparison if missing shape information makes the computational route too laborious |

TripoSG's released implementation generates meshes from an image and lists an 8GB CUDA VRAM minimum. Our previously checked RTX5070Ti has about 16GB, but Windows, GPU architecture and compiled-extension compatibility remain untested. Benchmark actual time and peak memory before selecting defaults. Its stock pipeline does not accept our arbitrary depth maps as extra conditioning; that would require a different adapter or later geometric refinement. [Official implementation](https://github.com/VAST-AI-Research/TripoSG)

For our reconstruction route, silhouette intersection supplies an initial visual hull, not concavities or anatomical understanding. Optimize an SDF or mesh against silhouette and landmark reprojection, surface regularity and optional depth/normal constraints. Known orthographic view labels can initialize drawings; expose scale and alignment controls. Synthetic camera assignments are assumptions, not recovered camera measurements. Use downweighted or disabled constraints where views disagree; retain a recoverable draft instead of forcing all drawings to match.

### Original prototype direction — rejected, retained for context

1. Prepare separate front and side drawings in the same pose; align ground, head, shoulders, hips and limb joints. User/lead corrects masks and part labels. Our existing generated sheets need this consistency check before use.
2. Back-project silhouettes into a shared voxel volume and intersect them. This produces a visual hull: an envelope consistent with the outlines, not a unique recovery of the intended object. [Visual-hull research](https://cgvg.polito.it/Projects/VisualHull/)
3. Fit smooth profiles to traced head/torso/limb contours. Front outlines constrain width and side outlines constrain depth. Rounded cross-sections, symmetry and smoothness are explicit adjustable assumptions; preserve intentional asymmetry. A silhouette intersection alone can leave boxy sections, so do not promise finished anatomy from it.
4. Keep cape, hair and body constraints separate where occlusion would merge them. Give sheet-like cloth explicit thickness; provide local profile/crease edits for concavities absent from silhouettes. These are assisted modeling operations, not automatic semantic understanding.
5. Extract and inspect one clay mesh; render consistent depth and normal maps from that geometry. Optional supplied depth/normal maps can constrain refinement, but no trained depth estimator is required for this path.

Sketch-based systems such as Teddy demonstrate geometric construction of rounded forms from drawn contours without requiring a trained generator. They do not establish that our detailed character can be recovered automatically from one illustration. [Authors' project](https://www-ui.is.s.u-tokyo.ac.jp/~takeo/teddy/teddy.htm)

Classical multiview stereo can estimate depth from overlapping images of the same fixed surface, using feature correspondences and camera geometry. Separate stylized drawings are not automatically valid stereo data: painted details, pose and proportions may change. Our initial drawing workflow therefore uses traced constraints rather than assuming photogrammetry will solve it. [COLMAP reconstruction workflow](https://colmap.github.io/tutorial)

Unique3D is a relevant reference for the later view/normal-assisted approach: its released assets include image-to-multiview and image-to-normal models and a reconstruction pipeline. Its documented dependencies and Windows instructions require a compatibility check on this machine; do not copy old CUDA package pins blindly. [Official implementation](https://github.com/AiuniAI/Unique3D)

## Depth data: useful, but not a complete character

A single depth map describes the visible surface. It cannot determine the back of the head, hidden limbs or thickness under clothing. Independent estimated maps can disagree in scale, viewpoint and geometry. Simply stitching their point clouds is not a reliable character reconstruction method.

Optional Depth Anything V2 Small can provide relative-depth hints for inspection, subject to an actual stylized-character test. The project distinguishes relative-depth models from metric-depth variants and licenses Small under Apache-2.0; larger listed models have different terms. Relative predictions are not measured distances. [Official models and terms](https://github.com/DepthAnything/Depth-Anything-V2)

Keep two outputs visibly distinct:

- **Predicted input depth:** an independent estimate with unknown scale and possible drawing/shading errors.
- **Rendered mesh depth/normals:** diagnostics of our proposed geometry. These are internally consistent but do not independently prove that geometry matches the concept.

Save float depth arrays, validity masks, camera projection/transforms, coordinate conventions and scale assumptions alongside readable PNG previews. Label normal space and depth convention. Do not invent calibrated confidence scores or call unseen surfaces observed.

## Minimal local architecture

Proposed location: `tools/sculpt-lab/`. Python worker with a CLI first; add a small localhost interface after shape feasibility passes. Begin with CPU-capable mask/volume/profile operations; measure memory/time before choosing voxel resolution or GPU acceleration. If a learned backend is added, run one GPU job at a time with cancellation and clear failures. Keep dependencies isolated from the game and existing Blender environment.

Each versioned job stores input images/masks, view labels, model revision and weight hashes, seed/settings, intermediate geometry, maps, previews and final mesh. Blender MCP imports a copy into a new `.blend`, preserving existing sources. Mesh repair must preserve silhouette and open cloth surfaces; a watertight remesh or automatic decimation is not automatic retopology.

Use local inference only. Explicit setup/download step with sizes and model/auxiliary terms recorded; no silent model downloads during generation. Prefer supplied alpha/manual masking initially to avoid an unnecessary background-removal model. Pin tested dependencies, keep weights/cache out of Git, and verify a cached run with network unavailable. No keys, paid services, remote inference or game-runtime dependency.

## Small milestones and review gates

1. **Backend proof:** aligned Alden front/side masks and one computational reconstruction without trained models; record assumptions, elapsed time, memory and manual corrections required. Save an actual mesh, not a placeholder success response. If a learned comparison is later needed, separately record compatibility, download size and peak VRAM.
2. **Shape review:** actual front/side/back/three-quarter clay images, depth/normals and same-scale concept overlay. Judge silhouette, compact lean proportions, face/hair masses, hand/boot shape, cape thickness and limb separation. Show this before building the full interface or adding detail.
3. **Controlled iteration:** masks, alignment, landmarks, profiles and targeted corrections; preserve versions. Assess whether missing information can be supplied through a few useful controls before adding any learned backend.
4. **Blender handoff:** editable sculpt draft, scale/orientation and source provenance verified. Retopology and bend tests remain separate work after form approval.

Success means a visibly useful sculpt starting point that improves on the rejected clay. Valid exports, dense geometry and visually plausible generated reference sheets do not establish that success. No promise to match the current commercial Tripo service.

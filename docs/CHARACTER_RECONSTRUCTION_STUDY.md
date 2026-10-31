# Multi-image character reconstruction study

2026-10-30. Primary-source study following rejection of the computational head test. Research/design only: no packages, model weights or new character geometry created during this study.

## Finding

For our illustrated character, the most defensible next experiment without pretrained weights is **assisted fitting of a reviewed face mesh to anatomical landmarks, feature curves and multiple silhouettes**, with separate hair geometry. Alternatively, use richer construction curves to define local surface patches. Both supply shape information missing from outer silhouettes. Neither has been implemented or validated for Alden yet.

More views help only when they provide consistent, usable constraints. More independently generated images, higher voxel resolution or smoothing the rejected envelope will not by themselves supply a faithful face. No trained neural model is necessary for numerical fitting, but a starting mesh, surface construction rules or additional user annotations still provide a shape prior.

## Evidence and method selection

| Method | Expected input | What it contributes | Fit to this task |
|---|---|---|---|
| Structure from motion + multiview stereo | Overlapping photos of one fixed object, with repeatable surface detail and compatible lighting | Cameras, triangulated points, estimated depth/normals, fused surface | Strong when a physical/3D subject already exists; arbitrary model-sheet drawings do not satisfy the correspondence assumptions |
| Silhouette intersection | Foreground masks and camera/view assignments | Outer visual hull | Initialization/coverage constraint only; cannot define internal facial relief |
| Landmark/template fitting | Several views, matching visible anatomical landmarks, facial curves and an authored face mesh | Localized facial geometry and a coherent surface between observations | Recommended non-neural experiment; depends on template quality and input consistency |
| Curve-constrained surface construction | Descriptive curves, cross-sections, constraints on their 3D relationship | Local form and smooth surfaces between curves | Useful complementary controls; more annotation work, not automatic character recognition |
| Calibrated depth fusion | Consistent depth frames, intrinsics and camera poses | Direct geometric surface observations | Good if reliable depth really exists; rendered depth from our own draft is not new target evidence |
| Learned shape initialization + refinement | Prepared views and pretrained weights, followed by camera/geometry/appearance fitting | Priors for unseen shape plus refinement | Optional comparison; does not establish a model-free solution |

COLMAP documents the photographic route: overlapping views of the same surface, camera recovery, then depth/normal estimation and fusion. Its capture guidance emphasizes texture, similar illumination and multiple observations of each region. Its classic SIFT route need not use a learned feature extractor. [Official COLMAP tutorial](https://colmap.github.io/tutorial)

Pighin and colleagues provide a directly relevant non-neural precedent: a generic face mesh fitted to four or five simultaneous views using annotated feature points and polylines, recovering cameras and sparse 3D feature positions, then deforming the mesh. Their starting geometry carries facial structure between sparse observations. This supports template fitting, not detailed template-free recovery from outlines. [Authors' modeling description](https://grail.cs.washington.edu/projects/realface/modeling.html)

FiberMesh constructs smooth surfaces controlled by editable 3D curves. True2Form lifts descriptive sketches into curve networks using geometric regularities. CrossShade derives normal fields from artist-drawn cross-sections; it demonstrates sketch shading, not a complete closed character mesh. These support explicit local shape annotations rather than interpreting every ink line as geometry. [FiberMesh](https://www-ui.is.s.u-tokyo.ac.jp/~takeo/research/fibermesh/index.html), [True2Form](https://www.cs.ubc.ca/labs/imager/tr/2014/True2Form/index.htm), [CrossShade](https://www-sop.inria.fr/reves/Basilic/2012/SBSS12/)

PyTorch3D demonstrates direct vertex optimization against multiple rendered silhouettes, with edge, normal-consistency and Laplacian regularization. This is numerical optimization of a mesh, not training an image-to-3D foundation model. Silhouette losses still do not supply unobserved facial relief. A differentiable renderer provides useful gradients; it does not understand anatomy. [Official fitting tutorial](https://pytorch3d.org/tutorials/fit_textured_mesh), [NVIDIA nvdiffrast](https://nvlabs.github.io/nvdiffrast/)

The April2026 paper *3D Character Reconstruction from Hand-drawn Model Sheets* directly studies inconsistent drawings and view-dependent lines. It refines geometry and separates appearance layers, while its released pipeline uses TRELLIS for the base mesh. Per-pixel ray deformation also helps appearance alignment: that should not be mistaken for one ordinary camera/mesh matching every drawing exactly in our game. It is useful research, not proof that sparse model sheets alone determine faithful geometry without a prior. [Paper](https://onlinelibrary.wiley.com/doi/10.1111/cgf.70323), [Official preparation/inference instructions](https://github.com/hjyoon02/ModelSheetTo3D)

## Recommended image inputs for Alden

The following counts and pixel sizes are **our proposed engineering brief**, not a published sufficiency guarantee. The rejected sheet is a design interpretation, not certified camera-consistent geometry. The original compact ink v4 concept remains authoritative for identity and proportions.

### First face-fitting experiment

Prepare neutral **front, profile and front three-quarter** head drawings, plus annotations. Use front/profile for initial fitting and hold the three-quarter view out for an early visual check. This is a minimum test of a template-assisted fitter, not enough data to recover all head surfaces uniquely. Add the held-out view to fitting only after recording the first result; reserve another view for later evaluation.

Show the underlying head with hair removed or pulled clear, exposing brows, ears and jaw. Hidden scalp/head shape must be deliberately designed as an interpretation; it is not recovered from the hairstyle. Match expression, jaw position and eye direction. Do not include a hand, collar or cape obscuring the head.

### Preferred working pack

| File | View/content | Main use |
|---|---|---|
| `head/front.png` | Straight front, neutral bare head | Facial widths, symmetry/asymmetry, eye/mouth positions |
| `head/right-profile.png` | True right profile | Forehead, nose, lips, chin and skull depth |
| `head/left-profile.png` | True left profile | Opposite-side form and asymmetry check |
| `head/back.png` | Back of bare head | Skull outline and ears; no hidden facial relief inferred |
| `head/front-right-045.png` | Approximately45° front view | Cheek, eye-socket and nose transition constraints |
| `head/front-left-045.png` | Opposite front three-quarter | Initially withheld validation view |
| `head/top.png` | Optional top view | Skull width/depth and top curvature |
| `hair/front.png`, `hair/side.png`, `hair/back.png` | Same head wearing the approved hair | Separate hair cap and dominant clump silhouette |
| `hair/top.png` | Helpful top view | Parting, sweep direction and clump arrangement |

Use separate PNGs, preferably1024–2048pixels per view, with the head filling roughly70–85% of the image height. Larger pixels do not compensate for contradictory geometry. Keep a plain background or alpha mask, comfortable margins, no labels/ground shadows crossing the subject, and the same canvas scale and centre for orthographic views. Do not resize each view independently just to fill its frame.

Use orthographic views for the first drawing experiment. Keep camera elevation and head pitch/roll fixed across the horizontal orbit. If perspective is intended, record it rather than labeling the image orthographic. Rendered inputs should include exact camera transforms and projection parameters. Hand-drawn/generated view angles are approximate initial guesses; permit limited camera fitting and expose residual inconsistency.

The geometry set should use clear construction lines or quiet flat colors, without watercolor texture, dramatic lighting, cast shadows or baked ink hatching. Retain a separate painted set for final appearance. This is a proposed separation for reconstruction; it does not change the approved ink/watercolor art direction.

### Required annotations

- Separate masks for visible skin/head, hair, ears and any clothing; mark occlusion rather than forcing one outer silhouette to represent everything. Boundaries hidden by hair are assumptions unless explicitly supplied by a bare-head drawing.
- Matching anatomical landmark IDs across views: visible eye corners, nose root/tip/alar points, mouth corners/lip centres, chin and ear attachments. Store visibility and uncertainty. Do not force a match for a point that is hidden.
- Feature curves: upper/lower eyelids, nose profile/alar outline, upper/lower lip boundaries, jaw and hairline. Label surface curves, creases and occlusion boundaries separately from decorative ink strokes.
- A few cheek/brow/skull cross-sections or local depth handles where the views leave shape ambiguous. An optional normal constraint needs an explicit source and coordinate convention.

An apparent silhouette point changes with viewpoint; arbitrary points on front and side outer boundaries are not generally observations of the same 3D point. Triangulate genuine anatomical correspondences, not matched polygon point numbers.

### Later full-body pack

Use front, back, left/right side and front three-quarter views of the same neutral A-pose, with matching joint positions, costume construction and proportions. Separate fingers/arms from the torso and feet from each other where the design permits. Provide a costume breakdown: body, tunic, trousers/boots, cape and hair. Thin/open cloth needs its own surface and thickness assumption; it should not be forced into one solid watertight body volume.

For actual photographs instead, keep the object/expression rigid, use sharp overlapping views around it at several heights, avoid strong highlights/shadows and retain repeatable texture. Apple recommends70% or more neighboring overlap for Object Capture; this is a useful capture reference, not a requirement that we use Apple's software. Image count depends on coverage and complexity. [Apple capture guidance](https://developer.apple.com/documentation/realitykit/capturing-photographs-for-realitykit-object-capture)

## Where usable depth can come from

| Source | What it means | Use |
|---|---|---|
| Classical stereo on consistent overlapping photos | Correspondence-based geometric estimate | Fuse after calibration, visibility and cross-view consistency checks |
| Sensor depth or renders of a known reference mesh | Independent geometric observations/test ground truth | Useful with projection, poses and units recorded |
| Artist-supplied depth anchors/cross-sections | Explicit design decisions | Constrain a local fitted surface |
| Learned depth/normal prediction | Model-based estimate | Optional prior, not measured truth; outside a strictly non-neural route |
| Depth rendered from our generated mesh | Description of that current guess | Diagnostics/visibility only; feeding it back supplies no missing target information |

Open3D's TSDF integration takes depth frames with camera intrinsics and poses; it does not recover depth from unrelated drawings. Perspective back-projection typically uses `X=(u-cx)Z/fx`, `Y=(v-cy)Z/fy`, then transforms into the shared frame. Orthographic projection uses a different mapping. Store linear depth as float arrays/EXR with a validity mask, common units and a declared camera-Z versus ray-distance convention. [Official RGBD integration example](https://open3d.org/html/tutorial/pipelines/rgbd_integration.html)

Brightness is not depth. Even controlled shape-from-shading has ambiguities when illumination and reflectance are unknown; our watercolor/ink marks add artistic decisions to that problem. Do not convert dark paint or ink lines directly into recesses. [Belhumeur, Kriegman and Yuille: The Bas-Relief Ambiguity](https://www.cs.jhu.edu/~ayuille/PubsJournal/J52BelhumeurKriegmanYuille99.pdf)

## Replacement reconstruction pipeline

This is a proposed synthesis of the reviewed approaches, not a claimed implementation of any paper.

1. **Input gate:** inspect views/pose/projection, masks and feature correspondence. Report contradictory landmark locations before meshing. Fit limited camera parameters if necessary; do not silently warp images until an impossible character appears consistent.
2. **Original starting geometry:** use a reviewed neutral facial cage with localized eyes/nose/mouth and suitable deformation structure, plus a separate skull and hair representation as appropriate. This is an authored geometric template, not pretrained weights. Its quality is a real dependency; vertex fitting cannot create missing topology or replace an inadequate template.
3. **Coarse fit:** estimate camera alignment and recover/fix sparse landmark positions. Fit scale, head proportions, jaw and nose profile before increasing local freedom. Keep silhouette constraints per part and per view.
4. **Local surface fit:** optimize mesh vertices or a deformation cage against visible landmarks, feature-curve reprojection and silhouettes. Add valid target depth/normals only when independently supplied. Use bounded deformation/smoothness/edge regularity and feature preservation to prevent ripples, collapse and arbitrary inflation.
5. **Objective:** combine silhouette error, robust landmark reprojection, semantic feature-curve error, optional target depth/normal agreement, and regularity/deformation penalties. Weights are experimentally tuned; there is no universal recipe. A generic all-dark-line image loss would confuse decorative ink with geometry.
6. **Hair and clothing separately:** fit cap/clump curves and their attachment/occlusion relationships. Do not extend a hair-tip extremum around the whole head. Retain deliberately thin/open cloth where needed.
7. **Geometry review:** compare fixed-camera clay views, landmark/curve overlays, a withheld three-quarter view and a turntable. Check internal facial relief, not just silhouette IoU. Only then add localized detail and carry approved geometry into the existing retopology/paint/rig workflow.

## Expected results and the next gate

Our expectation is a better **controlled starting shape**, not automatic finished production art. Sparse drawings plus annotations still leave unseen anatomy and stylistic interpretation to an authored prior. No accuracy percentage, speed, or Tripo-equivalence claim is justified without testing.

First validate the solver using multiple rendered views of one known original test mesh, with exact cameras and an unused evaluation view. This separates algorithm errors from inconsistent drawings; it is an algorithm benchmark, not a solution for creating the target. Then run the bare-head study and compare against the original concept. Reject a result with the wrong eye sockets, cheek transition, nose width/projection or jaw even if masks overlap well. Stop for the user's visual review before hair detailing/full-body work.

The existing contour tool can supply annotation and review UI, but its rowwise rounded backend should be replaced rather than polished. This study does not change the rejected status of `alden-computational-head-v1.blend`.

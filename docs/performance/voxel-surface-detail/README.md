# Quiet voxel surface detail — host measurements

Captured2026-11-02 in local Chrome, RTX5070Ti/ANGLE D3D11,DPR1. Desktop1280×720 and touch emulation390×844 use the same GPU. Sequential1.5second off/on/off trials use fixed light and camera; on uses depth0.2/variation1.0. These refresh-capped requestAnimationFrame intervals include the whole scene, not isolated shader cost or physical-phone performance.

| View | Mean off / on / off (ms) | P95 off / on / off (ms) |
|---|---|---|
| desktop | 8.342 / 8.342 / 8.531 | 8.400 / 8.500 / 8.500 |
| mobile | 8.629 / 8.629 / 8.780 | 8.500 / 8.500 / 16.500 |

All trials report GL_NO_ERROR and unchanged geometry/cache/upload counts. The isolated6.25cm-grid lab verifies exact depth0/repeat pixels, flat cell interiors, instance covariance,18minification/offset samples and one shared4KiB R8 texture. All five real GPU mip levels are complete. Near diffuse differences span one output level; unresolved samples retain gentle mean tint with peak difference one level. Double material disposal is safe; the last lease releases the texture exactly once. Source VOX and geometry stay unchanged.

Raw evidence: [lab](shader-lab.json), [desktop](desktop.json), [touch emulation](mobile.json). Captures: [scene](../../screenshots/voxel-surface-detail/desktop-on.png), [cottage](../../screenshots/voxel-surface-detail/cottage-relief.png), [close-up](../../screenshots/voxel-surface-detail/lab-varied.png). Controls/defaults are recorded in adjacent preset files. No physical-device or FPS guarantee.

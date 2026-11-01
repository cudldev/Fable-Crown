# Voxel surface detail — host measurements

Captured on 2026-11-02 using local Chrome, NVIDIA RTX5070Ti/ANGLE D3D11, DPR1. Desktop1280×720; touch emulation390×844 on the same GPU. These are requestAnimationFrame intervals at the host refresh cap, not isolated shader GPU cost or physical-phone results. Each trial lasts1.5seconds after settling; fixed camera/light, sequential off/on/off.

| View | Mean off / on / off (ms) | P95 off / on / off (ms) |
|---|---|---|
| desktop | 8.342 / 8.342 / 8.579 | 8.400 / 8.500 / 8.500 |
| mobile | 8.629 / 8.679 / 8.341 | 8.500 / 8.600 / 8.400 |

All final samples report GL_NO_ERROR. Geometry, instance allocation, source-template builds, static batches, terrain bakes and upload counts remain unchanged across tuning. The isolated native-cell face uses zero textures and reports exact depth0/repeat pixels; translated and quarter-turned instances preserve the pattern, with negligible scale rasterization differences. The refreshed profile increases cell-to-cell depth and slope variation after close-up review.

Raw evidence: [shader lab](shader-lab.json), [desktop](desktop.json), [touch emulation](mobile.json); copied/reset presets are adjacent JSON files. Captures: [actual scene](../../screenshots/voxel-surface-detail/desktop-on.png), [cottage](../../screenshots/voxel-surface-detail/cottage-relief.png), [normal detail](../../screenshots/voxel-surface-detail/lab-varied.png). No unmeasured phone/FPS guarantee is implied.

Initial testing exposed a reflection pass using the sun shadow before its comparison texture had been allocated. Runtime now waits for the main shadow pass; final browser cases check graphics warnings from startup as well as steady-state GL status.

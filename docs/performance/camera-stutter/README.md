# Camera-motion stutter pass

Real held-pointer pans cross8m/16m world boundaries in the actual game. Forest anchor42,90; open grassland222,72 has zero visible tree targets and at least11.4m observed clearance beyond a conservative horizon+5m bound. Open loaded-plant medians remain9343phone/9485–9690desktop versus9343baseline, so the comparison retains meaningful ground foliage. All trials keep37native templates, native terrain, zero new motion shader links and zero GL errors.

Chrome/headless on i9-10850K/RTX5070Ti, CPU4×, DPR1,1280×800 and390×844. Two180-frame trials per route/profile; table shows first / repeat. No builds/tests/other browsers run concurrently with timing. NPCs continue600ms ticks; different wall durations can change their positions. This is host emulation, not physical-mobile measurement.

| Route / viewport | Initial baseline mean ms | Return baseline mean ms | Final mean ms | Return baseline p99 ms | Final p99 ms |
| --- | --- | --- | --- | --- | --- |
| forest / 1280 | 140.7 / 91.0 | 76.1 / 70.7 | 47.9 / 54.1 | 208.7 / 200.2 | 75.1 / 91.9 |
| open / 1280 | 85.9 / 66.8 | 54.8 / 61.4 | 36.4 / 38.8 | 192.0 / 225.2 | 58.4 / 50.1 |
| forest / 390 | 62.4 / 68.1 | 78.3 / 75.3 | 49.8 / 52.5 | 216.9 / 242.0 | 83.3 / 75.1 |
| open / 390 | 66.1 / 69.9 | 64.9 / 64.7 | 29.8 / 28.0 | 208.7 / 216.9 | 50.1 / 41.8 |

Final`769d378dd7f6` follows initial baseline`a8342481e32d`, an intermediate candidate and return baseline. Return controls retain much larger observed long-frame tails despite host/first-trial drift. These are observations of the combined pass, not isolated speedups for each change or a universal FPS/latency guarantee. [Comparison and limits](comparison.json); raw RAF samples: [initial](before-clean.json), [return](before-return.json), [final](after-v2.json).

## Mechanism evidence

Separate open-route traced diagnostics: updateHitPositions sampled self time2569→257ms over180frames. UpdateLayoutTree totals2094→137ms/max15.3→2.47ms; Layout132→12.4ms. Traced timings are excluded from frame-rate comparisons; timeline totals may overlap. The intermediate material-accessor approach increased sampled updateMatrixWorld self942→1546ms. Plain-property polling restores it to944ms in the final candidate, avoiding that measured regression. Matrix updates remain a large residual cost. Native getBoundingClientRect samples total67ms in the final diagnostic; groundAt itself was not sampled. Recorded GL-upload calls stay≤1.9ms; this is not full asynchronous GPU cost.

Final foliage whole-update lifetime maxima were10.1msdesktop/13.3msphone underCPU4×, including bounded diagnostics. The2ms work target is soft; atomic chunks and GC can exceed it.

The local functional GPU case uses native pointer moves with650ms endpoint holds (avoiding500ms camera-counter aliasing). It verifies zero recurring label offset reads, stable1initial cached size read, nonzero plant fronts throughout pan, queue completion, exact returned-window counts, bounded kind commits, label projection and real actor hit targeting. [Report](runtime-review.json), [settled forest](settled-forest.png), [settled open](settled-open.png). Settled images and loaded counts do not prove every moving-edge pixel.

## Reproduce

Set`BENCH_DIST` to a frozen Vite dist and run`node scripts/benchmark-camera-stutter.mjs LABEL`. Default two180-frame trials, CPU4×;`BENCH_TRACE=0` omits the separate diagnostic. Setup waits750ms then foliageQueued0 if present. Motion hash`2666ae4c6e02` matches all brackets. The first baseline predates setup-only readiness/content guards; captured data satisfies them and its queue field is absent.

Compressed raw traces/CPU profiles are linked from comparison.json. Do not use/stage before.json/probe traces (layout-forcing visibility assertion), partial files or after.json/intermediate traces as final performance evidence.

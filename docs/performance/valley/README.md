# Valley production input probe

Local Windows Chrome156, deviceScaleFactor1; no physical phone. `metrics.json` records12 keyboard presses at1280×720, six actual CDP touch presses at390×844 and six at844×390. Event dispatch/pointerdown→first changed rendered DOM pose is a proxy before drawing, not screen-to-photon latency.

Keyboard median32.7ms/p9548.9ms; first33.2ms. Emulated portrait median32ms/p9533ms; landscape median34ms/p9541.6ms. No timeout or page error. These small samples establish neither a device frame-rate guarantee nor a comparative speedup. Run `node scripts/measure-valley.mjs` against `DEMO_URL` with other GPU work idle. Hardware and final renderer counters are in the raw record.

Physical controller/phone testing and hour-long balance playtests remain human follow-up. No balance defaults were changed from historical performance figures.

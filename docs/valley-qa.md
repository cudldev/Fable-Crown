# Valley QA

Public release c56f611 verified: format7 starts fresh with25coins; V3–V6 keys untouched. Continuous movement, native tent, current saving, both mobile orientations, correct Pages/PWA scope and offline WebGL/all11 asset entries pass. No page errors or external requests. See release/valley-public.json; deployed cache141aac213cf0.

Current format: **7**, keys `valley-v1` / `valley-v1-backup`. Every player starts fresh with 25 coins. Old v3–v6 storage stays untouched; old files are rejected. No major-version migration.

Verified against production `http://127.0.0.1:5398/Fable-Crown/`:

- Fresh storage CPU: **6/6**.
- GPU functional cases: **8 pass across latest runs**. One obsolete exact-message assertion was corrected and its case rerun.
- Non-GPU release/PWA: **2/2**. Repository scope, offline assets and zero external requests passed.

Coverage: tent/payment, crafting/trading, offline construction, progress-based onboarding, current-format import/backup recovery, old-key isolation, legacy-file rejection, keyboard/emulated controller/touch, both mobile orientations, repeated defeat/graves, partial recovery, per-press gathering and reload persistence. No page errors.

Use valid current-format fixtures and the real UI/worker/IndexedDB. Keep GPU checks local; release CI remains two non-GPU cases. Run `tests/valley-fresh-save.test.ts`, `tests/rpg-valley*.spec.ts`, then `npm run test:release` against a production build.

Block/strike screenshots are review references. Art acceptance, physical-device performance and actual public deployment verification remain lead-owned.

# GitHub Pages — Automatic Browser Test Deployment (M0)

## Objective
Deploy every successful push to `main` to a GitHub Pages URL with no API keys, server, or paid hosting. Include a working, minimal browser-testable PWA shell in M0; do not wait for gameplay milestones.

## Repository prerequisites
- Create a GitHub repository (public for GitHub Free Pages, subject to GitHub terms/limits).
- Push this project to `main`.
- Under **Settings → Pages → Build and deployment → Source**, select **GitHub Actions**. Codex may attempt this through authenticated `gh api` only when the user has authorized it; otherwise report the exact manual step. Do not claim deployment until verified.
- GitHub Actions must be enabled; ensure permissions permit Pages deployment. No personal access token stored in source.

## Required implementation
1. Scaffold Vite + React + strict TypeScript, npm scripts `dev`, `build`, `test`, `typecheck`, `preview`; commit `package-lock.json` for `npm ci`.
2. Include `.github/workflows/deploy.yml` (provided in this package) and keep it passing. Workflow typechecks, tests, builds, uploads `dist/`, and deploys automatically on `main`; manual dispatch enabled.
3. Vite `base` MUST be derived from `GITHUB_REPOSITORY` in CI: `/<repo>/` for a project site; `/` for `<owner>.github.io` root site or explicit custom domain. Support `VITE_BASE_PATH` override and local `/` default. Never hardcode username or repo.
4. PWA manifest `start_url`, `scope`, service worker and cached asset URLs must honor the Vite base. Use `import.meta.env.BASE_URL` and relative URLs where appropriate. Ensure reload and routing work under `/repo/` (hash routing or proper static fallback).
5. Verify `dist/index.html` and manifest asset URLs; no accidental root-absolute `/assets/` URLs for project sites. Test 404s, app launch, portrait and landscape, touch inputs, IndexedDB persistence, installability where supported, and offline cached shell.
6. Keep the optional local model OUT of the initial bundle. Opt-in weights may come from a publicly accessible static model host after consent; no remote inference.
7. Document how to inspect GitHub Actions and find the Pages URL. After deployment, smoke-test the real HTTPS URL and note any failures in `docs/PROGRESS.md`.

## Automated GitHub Pages enablement (best effort)
When `gh` is installed, the operator is authenticated, and the repository exists, Codex should attempt:

```bash
gh auth status
gh repo view --json nameWithOwner,url
# GitHub REST endpoint; may require repository admin permission:
gh api --method POST repos/{owner}/{repo}/pages -f 'build_type=workflow'
```

If Pages is already enabled, treat the conflict as nonfatal and verify configuration; otherwise fall back to the documented Settings → Pages step. Codex MUST NOT create a repo, push to remote, change repo visibility, or enable Pages without the user's explicit authorization. It may generate scripts and workflow files automatically. Do not commit credentials.

## Example URL
`https://OWNER.github.io/REPO/` for project sites; `https://OWNER.github.io/` for a root site.

## Troubleshooting checklist
- 404 on JS/CSS: incorrect Vite base path.
- Blank screen on refresh: routing or PWA scope misconfigured.
- Worker/manifest missing: paths not relative to base.
- Deployment blocked: Pages source not GitHub Actions, permissions/environment restrictions, or Actions disabled.
- WebGPU unsupported: show procedural thought fallback, not an error that blocks gameplay.
- Saves missing across devices: IndexedDB is origin/device-local; no sync in V1.

## References
https://vite.dev/guide/static-deploy
https://docs.github.com/en/pages/getting-started-with-github-pages/using-custom-workflows-with-github-pages

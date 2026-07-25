# AGENTS.md

## Cursor Cloud specific instructions

This repo is a **static website** (personal portal + many self-contained mini-tools) served
directly from the repo root by GitHub Pages / Vercel. There is **no build system, no bundler,
no package.json, and no lockfiles** — pages are plain HTML/CSS/vanilla JS. Deployment is simply
"push to base branch → served as-is".

### Running the app (development)

Serve the repo root over HTTP (not `file://`, so the PWA service worker, manifest, and relative
`fetch()` of committed JSON behave correctly):

```
python3 -m http.server 8000
```

Then open `http://localhost:8000/`. Each top-level directory is its own product, e.g.
`http://localhost:8000/quote-maker/`, `http://localhost:8000/exchange-rate/`, etc.
Runtimes present: Python 3.12 and Node 22.

### Lint / test / build

There is **no lint, test, or build tooling** in this repo (no test files, no linters, no CI
test/lint steps, no build scripts). The GitHub Actions workflows in `.github/workflows/` only
run data-fetch scripts and commit updated JSON. The only "build" is the optional Android TWA app
under `app/` (Bubblewrap; git-ignored artifacts) — not part of web dev/testing.

### Data regeneration scripts (optional)

Dashboards ship with committed JSON (plus JS fallbacks), so the site renders fully **without any
backend**. Regenerating data is optional and only needed to refresh numbers:

- Python fetchers (`trade/`, `exchange-rate/`, `korea-tourism/`, `dart-top100/`, `inflearn/`,
  `court-auction/`): mostly stdlib. The only third-party deps are `openpyxl` and `requests`,
  installed by the update script. Some fetchers need API keys via env vars (e.g. `BOK_API_KEY`,
  `CUSTOMS_API_KEY`); without keys they fall back to committed/seed data.
- Node scripts (`api/weolbu.js`, `scripts/update-consumer-spending.mjs`): rely only on Node 22
  built-ins (global `fetch`) — no `npm install`.

### Optional external backends

- **Supabase (hosted)** powers the reading CMS (`reading/`, `admin/`) and visitor analytics
  (`admin/visitors/`). Project ref + anon key are hardcoded in the pages; schema in
  `supabase/reading.sql`. Optional — public pages degrade to empty/cached data if unreachable.
- **Vercel serverless proxies** (`api/customs.js`, `api/weolbu.js`, Seoul `icn1` region) are only
  used for live data refresh from IP-restricted Korea gov APIs; not needed to view the site.

### Gotchas

- `quote-maker/` loads `html2pdf.js` from a CDN; PDF export requires outbound internet access.
- `.nojekyll` is intentional (lets GitHub Pages serve `.well-known/`); do not remove it.

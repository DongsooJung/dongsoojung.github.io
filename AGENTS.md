# AGENTS.md

## Cursor Cloud specific instructions

This repo (`DongsooJung.github.io`, aka "Stargate" / `stargateedu.co.kr`) is a **static website**
served straight from the repo root — there is **no build step, no bundler, and no
`package.json`/`requirements.txt`/lockfiles**. Deployment is GitHub Pages (`CNAME`, `.nojekyll`) /
Vercel (`vercel.json`). The "product" is `index.html` (portal landing) plus many self-contained
dashboards, each in its own directory with an `index.html` (e.g. `exchange-rate/`, `trade/`,
`korea-tourism/`, `reading/`, and localized portals `en/`, `ja/`, `zh/`).

### Run / develop the site
- Serve the repo root with any static server and open in a browser:
  `python3 -m http.server 8000` (then http://localhost:8000/). The README's `Start-Process "index.html"`
  is Windows-only; use the http server here. Use a server (not `file://`) so the service worker
  (`sw.js`) and relative fetches of `data.json` work.
- There is **nothing to lint or build** and no automated test suite in this repo. "Testing" = serve
  the files and verify pages/dashboards render in the browser.

### Data-refresh scripts (optional, not needed to view the site)
- Dashboards read pre-generated static JSON (e.g. `exchange-rate/data.json`) that is refreshed by
  GitHub Actions cron jobs (`.github/workflows/*.yml`), which run the fetch scripts and commit results.
- Python fetchers use **stdlib only** except `exchange-rate/fetch_markets.py`, which needs `openpyxl`
  (the update script installs it). Examples: `python3 exchange-rate/fetch_data.py`,
  `python3 trade/fetch_data.py`, `python3 korea-tourism/fetch_data.py`.
- Node fetchers (Node 22, built-in `fetch`, no npm deps): `node api/weolbu.js`,
  `node scripts/update-consumer-spending.mjs`.
- These scripts hit live external APIs and **rewrite committed JSON in place**. If you run one only to
  verify it works, `git checkout -- .` afterward so you don't accidentally commit refreshed data.

### Notes
- Serverless proxies in `api/` (`customs.js`, `weolbu.js`) and the Supabase-backed dashboards
  (`reading/`, `weolbu/`) rely on remote/hosted services and hardcoded public keys; they are not
  required for local viewing and degrade gracefully.
- The Android TWA under `app/` (Bubblewrap) is only for the Play Store build, not web E2E.

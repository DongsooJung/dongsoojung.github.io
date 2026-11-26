# AGENTS.md

## STARGATE public portal source

This repository is the canonical source for the public portal at `stargateedu.co.kr` and `www.stargateedu.co.kr`. See `SOURCE_OF_TRUTH.md`. Edit `main` here for the portal homepage and the `/research/`, `/strategy/`, and `/aphorisms.html` pages.

- `DongsooJung/-stargate/portal-sync/dongsoojung.github.io/` is a distribution snapshot. Do not use it as the source for public portal changes or copy it over this repository.
- The static portal is published by GitHub Pages from this repository. Verify the Pages build/deploy for the exact commit, then check the public domain and the changed route. A successful commit or an unrelated Vercel deployment does not establish that the public route is current.
- Vercel projects and `api/` functions serve separate backend capabilities. Confirm a project's linked repository and domains before changing its deployment settings.
- Keep the existing `CNAME` and `.nojekyll` files. Preserve static routes and public URLs when editing dashboards.
- If the public domain differs from the GitHub Pages result, investigate DNS and serving origin before changing DNS or deploying another repository.

## Update-loop health reporting

`update-log.md` and any other health summary must judge the data-refresh loops by outcome, not by workflow conclusions.

- Before writing a health line, run `node scripts/check-data-freshness.mjs` or read the latest `Verify published data freshness` run. A local checkout needs about three weeks of history first: `git fetch --shallow-since="21 days ago" origin main`.
- If any row is `STALE` or `MISSING`, list those paths and do not describe the loops as healthy, even when every workflow run ended in `success`. From 2026-11-17 to 2026-11-26, 18 data workflows reported success while publishing nothing.
- When a published snapshot is added, retired, or changes cadence, update `ops/data-freshness.json` in the same change.

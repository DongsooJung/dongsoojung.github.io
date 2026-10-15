# Cloudflare production deployment

The Stargate site deploy that previously went to the Vercel project `portfolio` (`portfolio-stargate2.vercel.app`, team `stargate2`) now publishes as the Cloudflare Worker `stargate`.

## What moves

- Public files are still staged by `scripts/build-vercel-static.mjs` into `.site-public`. Server code, tests, Worker source, Wrangler config, environment files, and the two live JSON snapshots stay out of that directory.
- `worker/index.js` serves `/api/*` by calling the existing Vercel-style handlers. Public paths, response bodies, and CORS stay on those handlers.
- `/viz-dashboard` and nested paths return HTTP 301 to `/choropleth/`.
- The airport and Naver Cafe `latest.json` paths are proxied to the public `main` files on GitHub, same destinations as the old rewrites.
- The daily collect schedule remains `10 21 * * *` UTC. Cloudflare invokes `scheduled()`, which calls `/api/cron/daily-collect` with `Authorization: Bearer $CRON_SECRET`.
- Static assets are served from the nearest Cloudflare location. API requests run near Seoul (`placement.region = aws:ap-northeast-2`), replacing the Vercel `icn1` pin used by the customs proxy.
- `vercel.json` keeps `git.deploymentEnabled: false` so a leftover Vercel project link does not deploy on push. This workflow no longer calls the Vercel Deploy Hook.

Satellite Vercel projects (`stargate-bid-api`, `stargate-real-estate-api`, `stargate-kakao-send`, `stargate-onbid-api`, `stargate-private-gateway`, and the other standalone apps) are separate projects and are not part of this Worker.

## Secrets

Store these only as GitHub Actions secrets. Never commit them.

- `CLOUDFLARE_API_TOKEN`: Cloudflare API token with Workers Scripts edit on the Stargate account.
- `CLOUDFLARE_ACCOUNT_ID`: the account id from the Workers overview.

Copy the runtime values the handlers already read (`CRON_SECRET`, `SUPABASE_URL`, `SUPABASE_SERVICE_KEY`, `SUPABASE_ANON_KEY`, `DATA_GO_KR_API_KEY`, `NOTION_API_KEY` or `NOTION_TOKEN`, `SOLAPI_API_KEY`, `SOLAPI_API_SECRET`, `SOLAPI_SENDER_NUMBER`, `SMS_ADMIN_TOKEN`, and the other keys those handlers use) into Worker secrets or vars. Wrangler with compatibility date `2026-10-15` exposes string bindings on `process.env`.

Workers Paid is the practical target. The free plan allows 10 ms of CPU and 50 subrequests per invocation; daily collection and the HTML API handlers need the paid limits.

## Deploy

`.github/workflows/cloudflare-production.yml` tests, stages public files, then runs `npx wrangler@4 deploy` on pushes to `main`, manual dispatch, and the daily schedule. A missing token fails the job before upload.

```sh
gh workflow run cloudflare-production.yml --repo DongsooJung/dongsoojung.github.io --ref main
```

Local check, without publishing:

```sh
node --test tests/cloudflare-deploy.test.mjs tests/vercel-static.test.mjs tests/vercel-deploy.test.mjs
node scripts/build-vercel-static.mjs
npx --yes wrangler@4 deploy --dry-run --outdir /tmp/stargate-worker
```

## Domain cutover

`stargateedu.co.kr` still points at GitHub Pages. Do not move that DNS until the Pages routes are audited. Pages and the custom domain that cannot run a Worker continue to call the previous host `https://portfolio-stargate2.vercel.app` for:

- `portfolio/blog/index.html`
- `research/gimpo-airport-congestion/index.html`
- `gh-sale-info/app.js`
- `scripts/verify-gh-sale-info-live.mjs`
- `scripts/update-gimpo-airport-congestion.mjs`

After the first successful Worker deploy, replace those absolute API origins with the printed `*.workers.dev` hostname (or a dedicated API hostname). Same-origin `/api/*` already works when the page itself is served by this Worker. Opening the Naver Cafe page on `*.workers.dev` uses that same-origin API.

This deploy does not finish the separate urban-map acceptance work. Shared renderers, metrics alignment, boundary migration, and production-domain SEO checks remain separate.

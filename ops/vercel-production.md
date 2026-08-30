# Vercel production deployment

## Scope and ownership

- Project: `portfolio` in `stargate2` (existing linked public GitHub repository).
- Production branch: `main`; existing Git identities and deployment protections remain unchanged.
- Six read APIs share `api/[resource].js`. Their implementations live in `server/api/`; public URLs, response bodies and CORS policies are preserved.
- Compiled function count is 11, below the Hobby limit of 12. SMS, cron and data-writing handlers are not part of this consolidation.
- `scripts/build-vercel-static.mjs` stages public files in `.site-public` without publishing server code, environment files, tests or migrations. Source archives without Git metadata are supported.

## Deployment entry point

The project owner created a `main` Deploy Hook named `github-main-verified`. Its URL is a credential stored only in the repository Actions secret `VERCEL_DEPLOY_HOOK_URL`. Never commit or log it. Rotate the hook if it is exposed.

`.github/workflows/vercel-production.yml` runs tests and public staging, then requests deployment. It runs on source pushes to main, manual dispatch, and once daily for generated snapshots. `git.deploymentEnabled: false` disables duplicate automatic Git-push deployments; do not set `github.enabled: false`, which also disables hooks.

To request an authorized deployment after checking the branch:

```sh
gh workflow run vercel-production.yml --repo DongsooJung/dongsoojung.github.io --ref main
```

Hook acceptance (`PENDING`) is **not** release success. Check the matching Vercel deployment reaches `READY`, verify its commit/alias and run live checks. Do not automatically retry an ambiguous hook timeout: a build may already exist. A hook targets the latest branch head, not a pinned commit, so compare the deployed SHA to the intended main revision.

## High-frequency data

Airport and Naver Cafe snapshot-only pushes are excluded from this deployment workflow. Their two JSON paths are explicitly proxied to the public repository's `main` files, so they continue updating independently of Vercel builds. The fixed raw GitHub origin avoids a loop if the custom domain is moved later. GitHub raw may cache responses for about five minutes; the airport live API remains the first choice.

Other generated data is refreshed by the daily deployment request. GitHub Actions commits made with `GITHUB_TOKEN` do not themselves trigger another Actions workflow.

## Verification

```sh
node --test tests/*.test.js tests/*.test.mjs tests/*.test.cjs
npx --yes vercel@59.10.0 build --prod
node scripts/verify-vercel-output.mjs
```

On Windows, Vercel CLI 59.10.0 can lose `Path` when launching a custom build. If `spawn cmd.exe ENOENT` occurs despite `cmd.exe` existing, normalize the **child process environment** to a single uppercase `PATH` key before invoking the CLI. Do not change global PATH or credentials. The cloud builder runs Linux.

Live checks must cover all six original `/api/<name>` URLs (including `OPTIONS`, CORS and a query-spoof check), 404 for unknown names, both JSON proxies, retained research hubs, and private server paths returning 404. Check `/viz-dashboard`, `/viz-dashboard/` and a nested path without following redirects: each must be HTTP **301**, not 200 or 308, with `/choropleth/` as the destination.

## Domain and remaining urban-map work

`stargateedu.co.kr` currently points to GitHub Pages, not this Vercel project. A Vercel 301 does not change the response on that domain. Do not move DNS without auditing the separate GitHub Pages project routes: those assets are not necessarily present in this repository. No custom-domain change is included in this deployment repair.

This is deployment infrastructure work, not completion of the full map integration plan. Shared-renderer adoption across all intended maps, metrics ingestion/period alignment, complete boundary migration and production-domain redirect/SEO verification remain separate acceptance items. GSC retention cannot be validated from a build or immediate smoke test.

## Recovery

Use the existing project's deployment history to roll back to a verified ready production deployment if smoke tests reveal a regression. Do not restore the old 16-function configuration or re-enable unfiltered Git auto-deploys as a quota workaround. Preserve GitHub Pages and its snapshot workflows during recovery.

Official references: [Deploy Hooks](https://vercel.com/docs/deploy-hooks), [Git configuration](https://vercel.com/docs/project-configuration/git-configuration), [project settings and quotas](https://vercel.com/docs/project-configuration/project-settings).

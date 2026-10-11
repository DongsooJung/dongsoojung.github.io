# STARGATE Supabase Project Registry

## Canonical production

- Project ref: `inftexpcnfinglwlrvsj`
- Base URL: `https://inftexpcnfinglwlrvsj.supabase.co`
- Role: primary STARGATE production backend for shop payments, visitor analytics, reading/public-data pipelines, and future Supabase-backed features.
- Rule: all new production integrations must use this project through environment variables or the canonical public project URL.
- Management caveat: as of 2026-10-11, this project is referenced by production code but is not visible through the currently connected Supabase management account. Ownership/organization access must be recovered before changing secrets, RLS, Edge Functions, or production schema.
- Data API note: from 2026-10-30, new Data API tables/functions should use explicit role grants instead of relying on automatic exposure.

## Retired runtime dependency: flxntafmvcdhpagzrvii

- Historical role: Execution KPI + cardnews CMS.
- 2026-09-13 audit found 0 rows in both `public.cardnews_posts` and `public.execution_kpi_metrics`.
- Execution OS dependency was removed on 2026-09-13.
- Cardnews runtime dependency was removed on 2026-10-11 and replaced with repository-based publishing via `cardnews/data/posts.json`.
- Current management status observed on 2026-10-11: INACTIVE.
- Policy: do not restore this project for normal operation. Keep it inactive unless a one-off recovery/audit is explicitly required.

## Dormant / unreferenced project: sclpygpcsgeudezcklqg

- Historical name from Supabase email: `jds068888-coder's Project`.
- Supabase pause notification received on 2026-09-02 after inactivity.
- Repository audit found no production reference.
- Policy: do not reactivate or adopt this project for production unless an external dependency is later proven.

## Runtime rule

No application/runtime file may reference `flxntafmvcdhpagzrvii`. The only permitted mentions are this registry and the CI guard that blocks reintroduction.

## Remaining exit criteria

1. Recover management access to canonical production `inftexpcnfinglwlrvsj`.
2. Audit `shop_orders`, `toss-confirm`, Edge Function secrets, RLS/grants, and production health.
3. Verify cardnews repository JSON publishing in production.
4. Verify no runtime reference to retired/dormant Supabase projects.
5. Keep one canonical Supabase production project for all new features.

## Secret policy

- Browser-safe publishable identifiers may be public only when grants/RLS are correct.
- `service_role`, payment secret keys, private API keys, and database passwords must never be committed.
- Prefer deployment secrets for server credentials and Supabase Edge Function Secrets for function-only credentials.

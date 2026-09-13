# STARGATE Supabase Project Registry

## Canonical production

- Project ref: `inftexpcnfinglwlrvsj`
- Base URL: `https://inftexpcnfinglwlrvsj.supabase.co`
- Role: primary STARGATE production backend for shop payments, visitor analytics, reading/public-data pipelines, and new Supabase-backed features.
- Rule: all new production integrations must use this project through environment variables or the canonical public project URL. Do not introduce a new hard-coded Supabase project ref without updating this registry.

## Legacy project

- Project ref: `flxntafmvcdhpagzrvii`
- Base URL: `https://flxntafmvcdhpagzrvii.supabase.co`
- Role: temporary legacy backend while the remaining cardnews CMS dependency is retired.
- Restored on 2026-09-13 from INACTIVE to ACTIVE_HEALTHY for audit/migration work.
- Security hardening applied on 2026-09-13: anonymous `cardnews_posts` SELECT removed; legacy Execution KPI table/RPC public access removed.
- Current allowlist:
  - `cardnews/index.html`
  - `cardnews/admin/index.html`

Execution OS no longer depends on this project. Its local execution-board storage is authoritative until KPI synchronization is rebuilt against canonical production.

No new feature may depend on the legacy project. Remove each allowlisted path after the cardnews publishing path has been migrated or replaced and verified on canonical production.

## Dormant / unreferenced project

- Project ref: `sclpygpcsgeudezcklqg`
- Historical name from Supabase email: `jds068888-coder's Project`
- Status evidence: Supabase pause notification received on 2026-09-02 after inactivity.
- Repository audit on 2026-09-13 found no reference in the main portal or shop repositories.
- Policy: do not reactivate or adopt this project for production. Treat it as a retirement candidate unless an external dependency is later proven.

## Current legacy data state

Audit on 2026-09-13 found 0 rows in both `public.cardnews_posts` and `public.execution_kpi_metrics`. This substantially lowers migration risk: the remaining task is schema/auth workflow replacement rather than production-data transfer.

## Migration exit criteria

The legacy project can be retired only when all of the following are true:

1. `cardnews_posts` publishing/admin workflow has been migrated to canonical production or replaced with a repository-based publishing workflow.
2. A repository scan finds no `flxntafmvcdhpagzrvii` reference outside this registry.
3. Production smoke tests pass for cardnews public view and the chosen publishing/admin workflow.
4. The legacy project has no unique production data/function remaining.

## Secret policy

- Browser-safe publishable/anon identifiers may be public only when RLS/policies are correct.
- `service_role`, payment secret keys, API private keys, and database passwords must never be committed.
- Prefer repository/deployment secrets for server keys and Supabase Edge Function Secrets for function-only secrets.

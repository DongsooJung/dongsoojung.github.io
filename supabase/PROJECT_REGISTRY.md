# STARGATE Supabase Project Registry

## Canonical production

- Project ref: `inftexpcnfinglwlrvsj`
- Base URL: `https://inftexpcnfinglwlrvsj.supabase.co`
- Role: primary STARGATE production backend for shop payments, visitor analytics, reading/public-data pipelines, and new Supabase-backed features.
- Rule: all new production integrations must use this project through environment variables or the canonical public project URL. Do not introduce a new hard-coded Supabase project ref without updating this registry.

## Legacy project

- Project ref: `flxntafmvcdhpagzrvii`
- Base URL: `https://flxntafmvcdhpagzrvii.supabase.co`
- Role: temporary legacy backend while remaining data/functions are migrated.
- Current allowlist:
  - `execution/kpi-sync.js`
  - `cardnews/index.html`
  - `cardnews/admin/index.html`

No new feature may depend on the legacy project. Remove each allowlisted path after its table/RPC data has been migrated and verified on canonical production.

## Migration exit criteria

The legacy project can be retired only when all of the following are true:

1. `get_execution_kpis` and its underlying KPI data have been migrated and verified on canonical production.
2. `cardnews_posts` schema, data, Auth/RLS policies, and admin CRUD have been migrated and verified.
3. A repository scan finds no `flxntafmvcdhpagzrvii` reference outside this registry.
4. Production smoke tests pass for Execution OS, cardnews public view, and cardnews admin.
5. The legacy project has no unique production data/function remaining.

## Secret policy

- Browser-safe publishable/anon identifiers may be public only when RLS/policies are correct.
- `service_role`, payment secret keys, API private keys, and database passwords must never be committed.
- Prefer repository/deployment secrets for server keys and Supabase Edge Function Secrets for function-only secrets.

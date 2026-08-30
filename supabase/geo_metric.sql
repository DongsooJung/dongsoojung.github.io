-- 도시공간 경계집계 지표의 공통 저장 계약. 배포 전 Supabase SQL editor에서 적용합니다.
create table if not exists public.geo_metric (
  region_code text not null,
  boundary_level text not null check (boundary_level in ('emd','sigungu','gu')),
  metric_key text not null,
  period date not null,
  value numeric not null,
  source text not null,
  updated_at timestamptz not null default now(),
  primary key (region_code, boundary_level, metric_key, period)
);

create index if not exists geo_metric_lookup_idx
  on public.geo_metric (metric_key, boundary_level, period desc);

comment on table public.geo_metric is '행정표준코드 기반 도시공간 경계집계 지표. 서로 다른 period는 합산하지 않는다.';

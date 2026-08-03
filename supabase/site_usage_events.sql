-- Page-view and click analytics for the public STARGATE portal.
-- Apply in the Supabase SQL editor for project inftexpcnfinglwlrvsj.

begin;

create table if not exists public.site_usage_events (
  event_id uuid primary key,
  visitor_id uuid not null,
  session_id uuid not null,
  event_type text not null,
  page_path text not null,
  page_title text,
  element_label text,
  element_kind text,
  target_url text,
  device_type text,
  created_at timestamptz not null default now(),
  constraint site_usage_events_type_check check (event_type in ('page_view', 'click')),
  constraint site_usage_events_page_path_length check (char_length(page_path) between 1 and 512),
  constraint site_usage_events_page_title_length check (page_title is null or char_length(page_title) <= 240),
  constraint site_usage_events_element_label_length check (element_label is null or char_length(element_label) <= 160),
  constraint site_usage_events_element_kind_length check (element_kind is null or char_length(element_kind) <= 48),
  constraint site_usage_events_target_url_length check (target_url is null or char_length(target_url) <= 1024),
  constraint site_usage_events_device_type_check check (device_type is null or device_type in ('mobile', 'tablet', 'desktop'))
);

create index if not exists site_usage_events_created_at_idx
  on public.site_usage_events (created_at desc);

create index if not exists site_usage_events_page_type_idx
  on public.site_usage_events (page_path, event_type, created_at desc);

create index if not exists site_usage_events_button_idx
  on public.site_usage_events (page_path, element_label, created_at desc)
  where event_type = 'click';

alter table public.site_usage_events enable row level security;
revoke all on table public.site_usage_events from anon, authenticated;

create or replace function public.record_site_usage_event(
  p_event_id uuid,
  p_visitor_id uuid,
  p_session_id uuid,
  p_event_type text,
  p_page_path text,
  p_page_title text default null,
  p_element_label text default null,
  p_element_kind text default null,
  p_target_url text default null,
  p_device_type text default null
)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  affected_rows integer;
  normalized_type text := lower(trim(coalesce(p_event_type, '')));
begin
  if p_event_id is null or p_visitor_id is null or p_session_id is null then
    raise exception 'event_id, visitor_id, and session_id are required';
  end if;

  if normalized_type not in ('page_view', 'click') then
    raise exception 'unsupported event_type';
  end if;

  insert into public.site_usage_events (
    event_id,
    visitor_id,
    session_id,
    event_type,
    page_path,
    page_title,
    element_label,
    element_kind,
    target_url,
    device_type
  )
  values (
    p_event_id,
    p_visitor_id,
    p_session_id,
    normalized_type,
    left(coalesce(nullif(trim(p_page_path), ''), '/'), 512),
    nullif(left(trim(coalesce(p_page_title, '')), 240), ''),
    nullif(left(trim(coalesce(p_element_label, '')), 160), ''),
    nullif(left(trim(coalesce(p_element_kind, '')), 48), ''),
    nullif(left(trim(coalesce(p_target_url, '')), 1024), ''),
    case when p_device_type in ('mobile', 'tablet', 'desktop') then p_device_type else null end
  )
  on conflict (event_id) do nothing;

  get diagnostics affected_rows = row_count;
  return affected_rows > 0;
end;
$$;

create or replace function public.get_site_usage_stats(p_days integer default 30)
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  with params as (
    select
      (timezone('Asia/Seoul', now()))::date as today,
      greatest(1, least(coalesce(p_days, 30), 90)) as days
  ),
  period_events as (
    select
      event_id,
      visitor_id,
      session_id,
      event_type,
      page_path,
      element_label,
      target_url,
      (timezone('Asia/Seoul', created_at))::date as event_date
    from public.site_usage_events, params
    where created_at >= ((params.today - (params.days - 1))::timestamp at time zone 'Asia/Seoul')
      and created_at < ((params.today + 1)::timestamp at time zone 'Asia/Seoul')
  ),
  dates as (
    select generate_series(
      params.today - (params.days - 1),
      params.today,
      interval '1 day'
    )::date as event_date
    from params
  ),
  daily as (
    select
      dates.event_date,
      count(period_events.event_id) filter (where period_events.event_type = 'page_view')::bigint as page_views,
      count(period_events.event_id) filter (where period_events.event_type = 'click')::bigint as clicks,
      count(distinct period_events.visitor_id) filter (where period_events.event_type = 'page_view')::bigint as visitors,
      count(distinct period_events.visitor_id) filter (where period_events.event_type = 'click')::bigint as clicking_visitors
    from dates
    left join period_events using (event_date)
    group by dates.event_date
    order by dates.event_date
  ),
  page_rollup as (
    select
      page_path,
      count(*) filter (where event_type = 'page_view')::bigint as page_views,
      count(*) filter (where event_type = 'click')::bigint as clicks,
      count(distinct visitor_id) filter (where event_type = 'page_view')::bigint as visitors,
      count(distinct visitor_id) filter (where event_type = 'click')::bigint as clicking_visitors
    from period_events
    group by page_path
  ),
  button_rollup as (
    select
      page_path,
      coalesce(element_label, '(이름 없는 버튼)') as element_label,
      target_url,
      count(*)::bigint as clicks,
      count(distinct visitor_id)::bigint as clicking_visitors
    from period_events
    where event_type = 'click'
    group by page_path, coalesce(element_label, '(이름 없는 버튼)'), target_url
  ),
  totals as (
    select
      count(*) filter (where event_type = 'page_view')::bigint as page_views,
      count(*) filter (where event_type = 'click')::bigint as clicks,
      count(distinct visitor_id) filter (where event_type = 'page_view')::bigint as visitors,
      count(distinct visitor_id) filter (where event_type = 'click')::bigint as clicking_visitors,
      count(distinct session_id)::bigint as sessions
    from period_events
  )
  select jsonb_build_object(
    'days', (select days from params),
    'page_views', totals.page_views,
    'clicks', totals.clicks,
    'visitors', totals.visitors,
    'clicking_visitors', totals.clicking_visitors,
    'sessions', totals.sessions,
    'engagement_rate', case
      when totals.visitors = 0 then 0
      else round((totals.clicking_visitors::numeric / totals.visitors::numeric) * 100, 1)
    end,
    'daily', (
      select coalesce(jsonb_agg(jsonb_build_object(
        'date', event_date,
        'page_views', page_views,
        'clicks', clicks,
        'visitors', visitors,
        'clicking_visitors', clicking_visitors,
        'engagement_rate', case when visitors = 0 then 0 else round((clicking_visitors::numeric / visitors::numeric) * 100, 1) end
      ) order by event_date), '[]'::jsonb)
      from daily
    ),
    'pages', (
      select coalesce(jsonb_agg(jsonb_build_object(
        'page_path', page_path,
        'page_views', page_views,
        'clicks', clicks,
        'visitors', visitors,
        'clicking_visitors', clicking_visitors,
        'engagement_rate', case when visitors = 0 then 0 else round((clicking_visitors::numeric / visitors::numeric) * 100, 1) end
      ) order by clicks desc, page_views desc, page_path), '[]'::jsonb)
      from page_rollup
    ),
    'buttons', (
      select coalesce(jsonb_agg(jsonb_build_object(
        'page_path', page_path,
        'element_label', element_label,
        'target_url', target_url,
        'clicks', clicks,
        'clicking_visitors', clicking_visitors
      ) order by clicks desc, page_path, element_label), '[]'::jsonb)
      from (select * from button_rollup order by clicks desc, page_path, element_label limit 100) ranked_buttons
    )
  )
  from totals;
$$;

revoke all on function public.record_site_usage_event(uuid, uuid, uuid, text, text, text, text, text, text, text) from public;
revoke all on function public.get_site_usage_stats(integer) from public;
grant execute on function public.record_site_usage_event(uuid, uuid, uuid, text, text, text, text, text, text, text) to anon, authenticated;
grant execute on function public.get_site_usage_stats(integer) to anon, authenticated;

commit;

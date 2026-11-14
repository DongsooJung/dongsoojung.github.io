-- Lead inquiry registry and 24-hour follow-up alert system.
-- Apply in the Supabase SQL editor for project inftexpcnfinglwlrvsj.
-- Source: stargateedu.co.kr/consult

-- ============================================================
-- 1. leads table
-- ============================================================
create table if not exists public.leads (
  id            uuid primary key default gen_random_uuid(),
  name          text not null,
  phone         text not null,
  consent       text not null default 'Y',
  provider      text not null default 'direct',
  social_id     text not null default '',
  source        text not null default 'stargateedu.co.kr/consult',
  submitted_at  timestamptz not null,
  created_at    timestamptz not null default now(),
  status        text not null default 'new',
  follow_up_at  timestamptz,
  alerted_at    timestamptz,
  note          text,
  constraint leads_status_check check (status in ('new', 'contacted', 'closed')),
  constraint leads_phone_length  check (char_length(phone) <= 20),
  constraint leads_name_length   check (char_length(name)  <= 40)
);

-- Add columns to existing table if they don't exist yet
-- (safe to run if table was already created without these columns)
do $$
begin
  if not exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'leads' and column_name = 'status'
  ) then
    alter table public.leads add column status text not null default 'new';
    alter table public.leads add constraint leads_status_check check (status in ('new', 'contacted', 'closed'));
  end if;

  if not exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'leads' and column_name = 'follow_up_at'
  ) then
    alter table public.leads add column follow_up_at timestamptz;
  end if;

  if not exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'leads' and column_name = 'alerted_at'
  ) then
    alter table public.leads add column alerted_at timestamptz;
  end if;

  if not exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'leads' and column_name = 'note'
  ) then
    alter table public.leads add column note text;
  end if;
end;
$$;

create index if not exists leads_status_submitted_idx
  on public.leads (status, submitted_at desc);

create index if not exists leads_created_at_idx
  on public.leads (created_at desc);

-- ============================================================
-- 2. lead_events log table
-- ============================================================
create table if not exists public.lead_events (
  id         uuid primary key default gen_random_uuid(),
  lead_id    uuid references public.leads(id) on delete cascade,
  event      text not null,
  detail     jsonb,
  created_at timestamptz not null default now(),
  constraint lead_events_event_check check (
    event in (
      'received',
      'sms_sent',
      'sms_failed',
      'alerted_24h',
      'contacted',
      'closed',
      'redacted',
      'cron_ok'
    )
  )
);

create index if not exists lead_events_lead_id_idx
  on public.lead_events (lead_id, created_at desc);

create index if not exists lead_events_event_created_idx
  on public.lead_events (event, created_at desc);

-- ============================================================
-- 3. Row Level Security
-- ============================================================
alter table public.leads       enable row level security;
alter table public.lead_events enable row level security;

-- Revoke default grants
revoke all on table public.leads       from anon, authenticated;
revoke all on table public.lead_events from anon, authenticated;

-- anon: INSERT only on leads (consult form)
-- phone and personal data are not selectable via anon key
drop policy if exists "anon_insert_leads" on public.leads;
create policy "anon_insert_leads" on public.leads
  for insert to anon
  with check (
    consent = 'Y'
    and char_length(name)  >= 2
    and char_length(phone) >= 9
    and status = 'new'
  );

-- anon: INSERT only on lead_events (received / sms_sent / sms_failed)
drop policy if exists "anon_insert_lead_events" on public.lead_events;
create policy "anon_insert_lead_events" on public.lead_events
  for insert to anon
  with check (event in ('received', 'sms_sent', 'sms_failed'));

-- service_role: full access (used by server-side cron and admin API)
drop policy if exists "service_role_all_leads" on public.leads;
create policy "service_role_all_leads" on public.leads
  for all to service_role
  using (true)
  with check (true);

drop policy if exists "service_role_all_lead_events" on public.lead_events;
create policy "service_role_all_lead_events" on public.lead_events
  for all to service_role
  using (true)
  with check (true);

-- ============================================================
-- 4. RPC: duplicate phone check (callable by anon)
-- ============================================================
create or replace function public.check_duplicate_lead(p_phone text)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.leads
    where phone = p_phone
      and status = 'new'
  );
$$;

revoke all on function public.check_duplicate_lead(text) from public;
grant execute on function public.check_duplicate_lead(text) to anon, authenticated;

-- ============================================================
-- 5. RPC: mark lead as contacted (called by server-side admin API)
-- ============================================================
create or replace function public.mark_lead_contacted(p_lead_id uuid)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  affected integer;
begin
  update public.leads
  set status = 'contacted', follow_up_at = now()
  where id = p_lead_id and status = 'new';

  get diagnostics affected = row_count;

  if affected > 0 then
    insert into public.lead_events (lead_id, event, detail)
    values (p_lead_id, 'contacted', jsonb_build_object('updated_at', now()));
  end if;

  return affected > 0;
end;
$$;

revoke all on function public.mark_lead_contacted(uuid) from public, anon, authenticated;
grant execute on function public.mark_lead_contacted(uuid) to service_role;

-- ============================================================
-- 6. pg_cron: 1-year phone redaction
-- (requires pg_cron extension enabled in Supabase dashboard)
-- Run: select cron.schedule(
--        'redact-old-leads',
--        '0 3 * * *',
--        $$ ... $$
--      );
-- This block is provided as a reference; enable it manually
-- via the Supabase dashboard Cron Jobs UI or SQL editor.
-- ============================================================
-- select cron.schedule(
--   'redact-old-leads',
--   '0 3 * * *',
--   $$
--     with targets as (
--       select id from public.leads
--       where status = 'closed'
--         and follow_up_at < now() - interval '1 year'
--         and phone <> 'REDACTED'
--     )
--     update public.leads
--     set phone = 'REDACTED'
--     where id in (select id from targets);
--
--     insert into public.lead_events (lead_id, event, detail)
--     select l.id, 'redacted', jsonb_build_object('redacted_at', now())
--     from public.leads l
--     where l.status = 'closed'
--       and l.follow_up_at < now() - interval '1 year'
--       and l.phone = 'REDACTED';
--   $$
-- );

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

-- Revoke default grants, then give anon back only what the consult form needs.
-- RLS policies filter rows; they do not grant SQL privileges, so without the
-- explicit column-scoped INSERT below every form submission is rejected.
revoke all on table public.leads       from anon, authenticated;
revoke all on table public.lead_events from anon, authenticated;

grant insert (name, phone, consent, provider, social_id, source, submitted_at, status)
  on table public.leads to anon;

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

-- lead_events is written only by the server (service_role). The browser has
-- no privilege on it, so an earlier anon insert policy is removed.
drop policy if exists "anon_insert_lead_events" on public.lead_events;

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
-- 4. Duplicate open leads are skipped at insert time
-- ============================================================
-- An anon-callable "is this phone already registered?" RPC would let anyone
-- holding the public anon key probe arbitrary phone numbers. Instead, a
-- repeat submission for a phone that already has an open ('new') lead is
-- dropped silently: the insert succeeds with zero rows, so the response is the
-- same whether or not the phone was already on file. Phones are compared by
-- digits only so "010-1234-5678" and "01012345678" match.
drop function if exists public.check_duplicate_lead(text);

create or replace function public.skip_duplicate_open_lead()
returns trigger
language plpgsql
security definer
set search_path = public
as $
begin
  if exists (
    select 1 from public.leads
    where status = 'new'
      and regexp_replace(phone, '[^0-9]', '', 'g') = regexp_replace(new.phone, '[^0-9]', '', 'g')
  ) then
    return null;
  end if;
  return new;
end;
$;

revoke all on function public.skip_duplicate_open_lead() from public, anon, authenticated;

drop trigger if exists leads_skip_duplicate_open on public.leads;
create trigger leads_skip_duplicate_open
  before insert on public.leads
  for each row execute function public.skip_duplicate_open_lead();

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

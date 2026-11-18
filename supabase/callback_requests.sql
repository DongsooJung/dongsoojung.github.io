-- Phone callback requests (전화 상담 예약).
-- Apply in the Supabase SQL editor for project inftexpcnfinglwlrvsj.
-- Source: stargateedu.co.kr/callback/
-- The browser holds only the public anon key, so anon gets INSERT on a fixed
-- column set and nothing else. Reading and status changes go through
-- service_role (operator CRM / server code).

create table if not exists public.callback_requests (
  id             uuid primary key default gen_random_uuid(),
  name           text not null,
  phone          text not null,
  preferred_date date not null,
  time_slot      text not null,
  topic          text not null default '기타',
  memo           text not null default '',
  consent        text not null default 'Y',
  source         text not null default 'stargateedu.co.kr/callback',
  status         text not null default 'new',
  submitted_at   timestamptz not null default now(),
  created_at     timestamptz not null default now(),
  called_at      timestamptz,
  note           text,
  constraint callback_status_check check (status in ('new', 'called', 'no_answer', 'closed')),
  constraint callback_slot_check check (time_slot in (
    '10:00-12:00', '12:00-14:00', '14:00-16:00', '16:00-18:00', '18:00-20:00', '아무 때나'
  )),
  constraint callback_topic_check check (topic in (
    '수업·수강 상담', 'KOI·정보올림피아드', '영재학교·수학', 'AI·개발 용역', '교재·도서', '기타'
  )),
  constraint callback_name_length check (char_length(name) between 2 and 40),
  constraint callback_phone_format check (phone ~ '^01[016789]-?[0-9]{3,4}-?[0-9]{4}$'),
  constraint callback_memo_length check (char_length(memo) <= 300),
  constraint callback_source_length check (char_length(source) <= 300)
);

create index if not exists callback_requests_status_date_idx
  on public.callback_requests (status, preferred_date, time_slot);

alter table public.callback_requests enable row level security;

revoke all on table public.callback_requests from anon, authenticated;
grant insert (name, phone, preferred_date, time_slot, topic, memo, consent, source)
  on table public.callback_requests to anon;

drop policy if exists "anon_insert_callback" on public.callback_requests;
create policy "anon_insert_callback" on public.callback_requests
  for insert to anon
  with check (
    consent = 'Y'
    and status = 'new'
    and preferred_date between (now() at time zone 'Asia/Seoul')::date
                           and (now() at time zone 'Asia/Seoul')::date + 14
  );

drop policy if exists "service_role_all_callback" on public.callback_requests;
create policy "service_role_all_callback" on public.callback_requests
  for all to service_role using (true) with check (true);

-- A phone that already has an open ('new') request is skipped silently, so the
-- response never reveals whether a number is already on file.
create or replace function public.skip_duplicate_open_callback()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if exists (
    select 1 from public.callback_requests
    where status = 'new'
      and regexp_replace(phone, '[^0-9]', '', 'g') = regexp_replace(new.phone, '[^0-9]', '', 'g')
  ) then
    return null;
  end if;
  return new;
end;
$$;

revoke all on function public.skip_duplicate_open_callback() from public, anon, authenticated;

drop trigger if exists callback_skip_duplicate_open on public.callback_requests;
create trigger callback_skip_duplicate_open
  before insert on public.callback_requests
  for each row execute function public.skip_duplicate_open_callback();

-- Operator view: today's and upcoming calls in time order (service_role only).
create or replace view public.callback_queue
with (security_invoker = true) as
select id, preferred_date, time_slot, name, phone, topic, memo, status, submitted_at
from public.callback_requests
where status in ('new', 'no_answer')
order by preferred_date, time_slot, submitted_at;

revoke all on public.callback_queue from anon, authenticated;

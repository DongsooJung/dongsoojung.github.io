-- 별의문 사고력 수학: 사용자별 진도 (TASKS.md 3단계에서 사용)
-- 클라이언트 직접 접근은 막고, Edge Function(service role)만 읽고 쓴다.

create table if not exists public.math_progress (
  user_hash   text primary key,          -- User.getAnonymousKey()의 hash (서버에서 검증된 값만 저장)
  state       jsonb not null default '{}'::jsonb,
  updated_at  timestamptz not null default now()
);

alter table public.math_progress enable row level security;

-- anon/authenticated 역할에는 정책을 만들지 않는다 → 클라이언트 직접 접근 불가.
revoke all on public.math_progress from anon, authenticated;

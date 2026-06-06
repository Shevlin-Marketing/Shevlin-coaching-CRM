-- ============================================================
-- Shevlin CRM — v2 migration
-- Run once in Supabase (SQL Editor → New query → paste → Run).
-- Adds: activity logging (leading indicators) + accurate close timestamps.
-- ============================================================

-- accurate "closed in period" reporting
alter table public.deals add column if not exists closed_at timestamptz;

-- backfill existing closed-won deals so reports aren't empty
update public.deals set closed_at = updated_at where stage = 'closed_won' and closed_at is null;

-- ---------- ACTIVITIES (leading indicators) ----------
create table if not exists public.activities (
  id            uuid primary key default gen_random_uuid(),
  owner_id      uuid references public.profiles(id) default auth.uid(),
  activity_date date not null default current_date,
  outreach      integer not null default 0,
  replies       integer not null default 0,
  notes         text,
  created_at    timestamptz not null default now()
);

alter table public.activities enable row level security;

drop policy if exists activities_select on public.activities;
create policy activities_select on public.activities
  for select to authenticated
  using (owner_id = auth.uid() or public.auth_role() in ('coach','admin'));

drop policy if exists activities_insert on public.activities;
create policy activities_insert on public.activities
  for insert to authenticated
  with check (owner_id = auth.uid() or public.auth_role() = 'admin');

drop policy if exists activities_update on public.activities;
create policy activities_update on public.activities
  for update to authenticated
  using (owner_id = auth.uid() or public.auth_role() = 'admin');

drop policy if exists activities_delete on public.activities;
create policy activities_delete on public.activities
  for delete to authenticated
  using (owner_id = auth.uid() or public.auth_role() = 'admin');

-- ============================================================
-- Shevlin Coaching CRM — Supabase schema
-- Run this in your Supabase project: SQL Editor → New query → paste → Run
-- ============================================================

-- ---------- PROFILES ----------
-- One row per user. Role drives what they can see and do.
create table if not exists public.profiles (
  id          uuid primary key references auth.users on delete cascade,
  full_name   text,
  role        text not null default 'setter'
              check (role in ('setter','closer','coach','admin')),
  team        text,
  created_at  timestamptz not null default now()
);

-- Helper: returns the current user's role WITHOUT triggering RLS recursion.
create or replace function public.auth_role()
returns text
language sql
stable
security definer
set search_path = public
as $$
  select role from public.profiles where id = auth.uid();
$$;

-- Auto-create a profile when a new auth user signs up (defaults to 'setter').
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, full_name)
  values (new.id, coalesce(new.raw_user_meta_data->>'full_name', new.email));
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- Stop non-admins from promoting themselves.
create or replace function public.prevent_role_escalation()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.role is distinct from old.role and public.auth_role() <> 'admin' then
    raise exception 'Only admins can change roles';
  end if;
  return new;
end;
$$;

drop trigger if exists guard_role on public.profiles;
create trigger guard_role
  before update on public.profiles
  for each row execute function public.prevent_role_escalation();

-- ---------- LEADS (setter pipeline) ----------
create table if not exists public.leads (
  id              uuid primary key default gen_random_uuid(),
  name            text not null,
  platform        text check (platform in
                    ('LinkedIn','Instagram','Facebook','Email','Referral','Application Form')),
  contact_link    text,
  tier            text check (tier in ('tier_1','tier_2','tier_3')),
  status          text not null default 'new'
                  check (status in
                    ('new','contacted','responding','details_shared',
                     'form_submitted','not_interested','dormant')),
  owner_id        uuid references public.profiles(id) default auth.uid(),
  next_action     text,
  last_contact    date,
  notes           text,
  affordability_ok boolean not null default false,
  converted       boolean not null default false,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

-- ---------- DEALS (closer pipeline) ----------
create table if not exists public.deals (
  id              uuid primary key default gen_random_uuid(),
  contact_name    text not null,
  tier            text check (tier in ('tier_1','tier_2','tier_3')),
  amount          numeric(10,2),
  stage           text not null default 'call_booked'
                  check (stage in
                    ('call_booked','no_show_followup','no_show_dormant','pending',
                     'closed_won','not_interested','cancelled_14day','dormant')),
  owner_id        uuid references public.profiles(id),  -- the closer / Ayden
  sourcing_setter uuid references public.profiles(id),  -- setter who sourced it
  lead_id         uuid references public.leads(id),
  stripe_sent     boolean not null default false,
  ayden_notified  boolean not null default false,
  notes           text,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

-- keep updated_at fresh
create or replace function public.touch_updated_at()
returns trigger language plpgsql as $$
begin new.updated_at = now(); return new; end; $$;

drop trigger if exists touch_leads on public.leads;
create trigger touch_leads before update on public.leads
  for each row execute function public.touch_updated_at();

drop trigger if exists touch_deals on public.deals;
create trigger touch_deals before update on public.deals
  for each row execute function public.touch_updated_at();

-- ============================================================
-- ROW LEVEL SECURITY
-- ============================================================
alter table public.profiles enable row level security;
alter table public.leads    enable row level security;
alter table public.deals    enable row level security;

-- PROFILES: everyone signed in can read the team list (needed for owner dropdowns);
-- you can only edit your own row; admins can edit anyone (role changes guarded above).
drop policy if exists profiles_select on public.profiles;
create policy profiles_select on public.profiles
  for select to authenticated using (true);

drop policy if exists profiles_update_self on public.profiles;
create policy profiles_update_self on public.profiles
  for update to authenticated
  using (id = auth.uid() or public.auth_role() = 'admin')
  with check (id = auth.uid() or public.auth_role() = 'admin');

-- LEADS: a setter owns their leads; closers/coaches/admin can see all;
-- coaches/admin can edit; only owner or admin can delete.
drop policy if exists leads_select on public.leads;
create policy leads_select on public.leads
  for select to authenticated
  using (owner_id = auth.uid() or public.auth_role() in ('closer','coach','admin'));

drop policy if exists leads_insert on public.leads;
create policy leads_insert on public.leads
  for insert to authenticated
  with check (owner_id = auth.uid() or public.auth_role() = 'admin');

drop policy if exists leads_update on public.leads;
create policy leads_update on public.leads
  for update to authenticated
  using (owner_id = auth.uid() or public.auth_role() in ('coach','admin'));

drop policy if exists leads_delete on public.leads;
create policy leads_delete on public.leads
  for delete to authenticated
  using (owner_id = auth.uid() or public.auth_role() = 'admin');

-- DEALS: closer owns their deals; the sourcing setter can see (not edit) their sourced deals;
-- coaches/admin see and edit all. Anyone signed in can create (e.g. a setter converting a lead).
drop policy if exists deals_select on public.deals;
create policy deals_select on public.deals
  for select to authenticated
  using (owner_id = auth.uid()
         or sourcing_setter = auth.uid()
         or public.auth_role() in ('coach','admin'));

drop policy if exists deals_insert on public.deals;
create policy deals_insert on public.deals
  for insert to authenticated
  with check (auth.uid() is not null);

drop policy if exists deals_update on public.deals;
create policy deals_update on public.deals
  for update to authenticated
  using (owner_id = auth.uid() or public.auth_role() in ('coach','admin'));

drop policy if exists deals_delete on public.deals;
create policy deals_delete on public.deals
  for delete to authenticated
  using (public.auth_role() = 'admin');

-- ============================================================
-- AFTER YOUR FIRST LOGIN: make yourself admin (Ayden).
-- Replace the email, then run just this statement:
--
--   update public.profiles set role = 'admin'
--   where id = (select id from auth.users where email = 'you@example.com');
-- ============================================================

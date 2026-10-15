-- ============================================================
-- Psychiatry Companion — access-control hardening
-- Run once in Supabase Dashboard → SQL Editor, AFTER supabase_setup.sql.
-- Safe to re-run. It replaces every existing policy on allowed_users,
-- pending_requests and checklist_progress, so review your current policies first if you have
-- customised them.
--
-- Why: the website talks to Supabase directly with the public anon key,
-- so the ONLY thing stopping a signed-in user from approving themselves,
-- making themselves admin, or reading everyone's email address is
-- Row Level Security. Client-side checks in app.js can be bypassed from
-- the browser console in seconds.
-- ============================================================

-- 1. Tables (no-ops if they already exist)
create table if not exists public.allowed_users (
  email     text primary key,
  is_admin  boolean not null default false,
  added_at  timestamptz not null default now()
);
create table if not exists public.pending_requests (
  email         text primary key,
  requested_at  timestamptz not null default now()
);

alter table public.allowed_users    enable row level security;
alter table public.pending_requests enable row level security;

-- 2. Helper functions. SECURITY DEFINER so policies can consult
--    allowed_users without recursing into its own RLS.
--    The email comes from the verified JWT, never from client input.
create or replace function public.current_email()
returns text language sql stable as $$
  select lower(coalesce(auth.jwt() ->> 'email', ''))
$$;

create or replace function public.is_admin()
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.allowed_users
                 where lower(email) = public.current_email() and is_admin)
$$;

create or replace function public.is_approved()
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.allowed_users
                 where lower(email) = public.current_email())
$$;

revoke all on function public.is_admin()    from public, anon;
revoke all on function public.is_approved() from public, anon;
grant execute on function public.is_admin()    to authenticated;
grant execute on function public.is_approved() to authenticated;

-- 3. Drop whatever policies exist today on these tables
do $$
declare r record;
begin
  for r in select policyname, tablename from pg_policies
           where schemaname = 'public' and tablename in ('allowed_users','pending_requests','checklist_progress')
  loop
    execute format('drop policy %I on public.%I', r.policyname, r.tablename);
  end loop;
end $$;

-- Anonymous (signed-out) visitors get nothing at all.
revoke all on public.allowed_users    from anon;
revoke all on public.pending_requests from anon;

-- 4. allowed_users
--    * a user can see only their own row; admins see everyone
--    * only admins can add users, and never as admin (promote admins
--      manually in the Table Editor) — this blocks self-escalation
--    * no UPDATE policy at all, so is_admin can't be flipped via the API
--    * admins can revoke others, but not themselves
create policy "read own row or admin reads all" on public.allowed_users
  for select to authenticated
  using (lower(email) = public.current_email() or public.is_admin());

create policy "admins add non-admin users" on public.allowed_users
  for insert to authenticated
  with check (public.is_admin() and is_admin = false);

create policy "admins revoke other users" on public.allowed_users
  for delete to authenticated
  using (public.is_admin() and lower(email) <> public.current_email());

-- 5. pending_requests
--    * a user can only request access for their OWN verified email
--      (stops spamming the admin list with arbitrary / malicious strings)
create policy "read own request or admin reads all" on public.pending_requests
  for select to authenticated
  using (lower(email) = public.current_email() or public.is_admin());

create policy "request access for own email" on public.pending_requests
  for insert to authenticated
  with check (lower(email) = public.current_email());

create policy "refresh own request" on public.pending_requests
  for update to authenticated
  using (lower(email) = public.current_email())
  with check (lower(email) = public.current_email());

create policy "admin or self removes request" on public.pending_requests
  for delete to authenticated
  using (public.is_admin() or lower(email) = public.current_email());

-- 6. checklist_progress: additionally require the user to be approved,
--    and bound the values a client can write.
--    (its old policies were dropped in step 3)
revoke all on public.checklist_progress from anon;

create policy "approved users read own progress" on public.checklist_progress
  for select to authenticated using (auth.uid() = user_id and public.is_approved());
create policy "approved users insert own progress" on public.checklist_progress
  for insert to authenticated with check (auth.uid() = user_id and public.is_approved());
create policy "approved users update own progress" on public.checklist_progress
  for update to authenticated
  using (auth.uid() = user_id and public.is_approved())
  with check (auth.uid() = user_id and public.is_approved());
create policy "users delete own progress" on public.checklist_progress
  for delete to authenticated using (auth.uid() = user_id);

do $$ begin
  alter table public.checklist_progress
    add constraint checklist_paper_valid check (paper in ('p1','p2','p3','fy-neuro','fy-psych'));
exception when duplicate_object then null; end $$;
do $$ begin
  alter table public.checklist_progress
    add constraint checklist_uid_len check (char_length(uid) between 1 and 120);
exception when duplicate_object then null; end $$;

-- 7. Quick self-test (run separately, signed-in as a NON-admin via the app):
--    insert into allowed_users(email,is_admin) values ('me@x.com', true);  -- must fail
--    select * from allowed_users;                                         -- must return only your row

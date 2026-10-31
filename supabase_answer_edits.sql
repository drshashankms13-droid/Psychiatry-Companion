-- ============================================================
-- Psychiatry Companion — admin edits to answers
-- Run once in Supabase Dashboard → SQL Editor, AFTER supabase_security.sql
-- (it uses the is_admin() / is_approved() / current_email() functions
-- defined there). Safe to re-run.
--
-- The original answers stay in the site's files. An admin's correction is
-- stored here and shown instead of the original; deleting the row restores
-- the original. Only admins can write; approved users can read.
-- ============================================================

create table if not exists public.answer_edits (
  key         text primary key,            -- 'final:<answer-id>' or 'fy:<question-uid>'
  content     jsonb not null,              -- {"exam","depth","refs"} or {"body"}: cleaned HTML
  updated_by  text not null default public.current_email(),
  updated_at  timestamptz not null default now(),
  constraint answer_edits_key_format check (key ~ '^(final|fy):[A-Za-z0-9._-]{1,200}$'),
  constraint answer_edits_size check (octet_length(content::text) <= 400000)
);

alter table public.answer_edits enable row level security;
revoke all on public.answer_edits from anon;

-- keep updated_by / updated_at honest, whatever the client sends
create or replace function public.answer_edits_stamp()
returns trigger language plpgsql as $$
begin
  new.updated_by := public.current_email();
  new.updated_at := now();
  return new;
end $$;

drop trigger if exists answer_edits_stamp on public.answer_edits;
create trigger answer_edits_stamp before insert or update on public.answer_edits
  for each row execute function public.answer_edits_stamp();

-- replace any existing policies
do $$
declare r record;
begin
  for r in select policyname from pg_policies where schemaname = 'public' and tablename = 'answer_edits'
  loop
    execute format('drop policy %I on public.answer_edits', r.policyname);
  end loop;
end $$;

create policy "approved users read edits" on public.answer_edits
  for select to authenticated using (public.is_approved());
create policy "admins add edits" on public.answer_edits
  for insert to authenticated with check (public.is_admin());
create policy "admins change edits" on public.answer_edits
  for update to authenticated using (public.is_admin()) with check (public.is_admin());
create policy "admins remove edits" on public.answer_edits
  for delete to authenticated using (public.is_admin());

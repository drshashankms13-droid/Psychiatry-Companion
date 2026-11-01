-- ============================================================
-- Psychiatry Companion — READ-ONLY security check
-- Changes nothing. Run in Supabase → SQL Editor and copy the result table.
-- Every row should say OK.
-- ============================================================
with t as (
  select c.relname as tbl, c.relrowsecurity as rls,
         (select count(*) from pg_policies p where p.schemaname='public' and p.tablename=c.relname) as policies,
         has_table_privilege('anon', c.oid, 'select') as anon_can_read
  from pg_class c join pg_namespace n on n.oid=c.relnamespace
  where n.nspname='public' and c.relkind='r'
    and c.relname in ('allowed_users','pending_requests','checklist_progress','answer_edits')
)
select 'table ' || tbl as item,
       case when rls and policies > 0 and not anon_can_read then 'OK'
            else 'PROBLEM: rls=' || rls || ', policies=' || policies || ', signed-out visitors can read=' || anon_can_read end as result
from t
union all
select 'missing table ' || x, 'PROBLEM: not created yet'
from unnest(array['allowed_users','pending_requests','checklist_progress','answer_edits']) x
where x not in (select tbl from t)
union all
select 'security functions',
       case when (select count(*) from pg_proc where proname in ('is_admin','is_approved','current_email')) >= 3
            then 'OK' else 'PROBLEM: run supabase_security.sql' end
union all
select 'number of admins', (select count(*) from public.allowed_users where is_admin)::text || ' (should be just you)'
union all
select 'number of approved users', (select count(*) from public.allowed_users)::text
order by 1;

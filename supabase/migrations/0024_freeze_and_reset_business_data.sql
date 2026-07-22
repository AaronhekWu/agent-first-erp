-- 0024 — Freeze the existing business dataset before manual re-entry.
--
-- This migration is deliberately guarded by the archive schema itself. Some
-- deployments replay SQL files without a migration ledger; a replay must never
-- clear newly entered data after the first reset.

do $reset$
declare
  v_table text;
  v_count bigint;
begin
  if exists (
    select 1 from pg_namespace where nspname = 'archive_20260722_reentry'
  ) then
    raise notice 'archive_20260722_reentry already exists; reset skipped';
    return;
  end if;

  execute 'create schema archive_20260722_reentry authorization postgres';
  execute 'revoke all on schema archive_20260722_reentry from public';
  execute 'revoke all on schema archive_20260722_reentry from anon';
  execute 'revoke all on schema archive_20260722_reentry from authenticated';

  execute $manifest$
    create table archive_20260722_reentry.snapshot_manifest (
      table_name text primary key,
      row_count bigint not null,
      archived_at timestamptz not null default now()
    )
  $manifest$;

  foreach v_table in array array[
    'ai_embeddings',
    'ai_knowledge_docs',
    'aud_agent_call_logs',
    'aud_approvals',
    'aud_operation_logs',
    'crs_attendance',
    'crs_course_prices',
    'crs_courses',
    'crs_enrollment_price_history',
    'crs_enrollments',
    'fin_accounts',
    'fin_consumption_logs',
    'fin_recharges',
    'fin_transactions',
    'fin_transfers',
    'flup_records',
    'promo_campaigns',
    'promo_referrals',
    'stu_parents',
    'stu_student_tags',
    'stu_students',
    'stu_tags'
  ]
  loop
    execute format(
      'create table archive_20260722_reentry.%I as table public.%I',
      v_table,
      v_table
    );
    execute format('select count(*) from archive_20260722_reentry.%I', v_table)
      into v_count;
    insert into archive_20260722_reentry.snapshot_manifest(table_name, row_count)
    values (v_table, v_count);
  end loop;

  execute 'revoke all on all tables in schema archive_20260722_reentry from public';
  execute 'revoke all on all tables in schema archive_20260722_reentry from anon';
  execute 'revoke all on all tables in schema archive_20260722_reentry from authenticated';

  execute $truncate$
    truncate table
      public.ai_embeddings,
      public.ai_knowledge_docs,
      public.aud_agent_call_logs,
      public.aud_approvals,
      public.aud_operation_logs,
      public.crs_attendance,
      public.crs_course_prices,
      public.crs_courses,
      public.crs_enrollment_price_history,
      public.crs_enrollments,
      public.fin_accounts,
      public.fin_consumption_logs,
      public.fin_recharges,
      public.fin_transactions,
      public.fin_transfers,
      public.flup_records,
      public.promo_campaigns,
      public.promo_referrals,
      public.stu_parents,
      public.stu_student_tags,
      public.stu_students,
      public.stu_tags
    restart identity
  $truncate$;

  perform pg_notify('pgrst', 'reload schema');
end
$reset$;

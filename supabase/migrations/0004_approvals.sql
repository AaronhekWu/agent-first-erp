-- 0004 — Approval workflow backbone
--
-- Creates a durable approval queue for destructive/high-risk operations.
-- UI actions submit requests through rpc_create_approval_request instead of
-- calling destructive RPCs directly. Execution-after-approval should be wired
-- per operation once the production RPC contracts are confirmed.

create table if not exists public.aud_approvals (
  id uuid primary key default gen_random_uuid(),
  type text not null,
  title text not null,
  reason text,
  target_id uuid,
  target_label text,
  amount numeric(12,2),
  payload jsonb not null default '{}'::jsonb,
  status text not null default 'pending'
    check (status in ('pending', 'approved', 'rejected')),
  requested_by uuid default auth.uid(),
  reviewed_by uuid,
  reviewer_note text,
  created_at timestamptz not null default now(),
  reviewed_at timestamptz
);

create index if not exists aud_approvals_status_created_idx
  on public.aud_approvals (status, created_at desc);

create index if not exists aud_approvals_type_created_idx
  on public.aud_approvals (type, created_at desc);

alter table public.aud_approvals enable row level security;

drop policy if exists aud_approvals_select on public.aud_approvals;
create policy aud_approvals_select
on public.aud_approvals
for select
to authenticated
using (
  public.get_my_role() = 'admin'
  or requested_by = auth.uid()
);

drop policy if exists aud_approvals_insert on public.aud_approvals;
create policy aud_approvals_insert
on public.aud_approvals
for insert
to authenticated
with check (requested_by = auth.uid() or requested_by is null);

create or replace function public.rpc_create_approval_request(
  p_type text,
  p_title text,
  p_reason text default null,
  p_target_id uuid default null,
  p_target_label text default null,
  p_amount numeric default null,
  p_payload jsonb default '{}'::jsonb
)
returns uuid
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_id uuid;
begin
  if auth.uid() is null then
    raise exception 'login required';
  end if;
  if nullif(trim(p_type), '') is null then
    raise exception 'approval type is required';
  end if;
  if nullif(trim(p_title), '') is null then
    raise exception 'approval title is required';
  end if;

  insert into public.aud_approvals (
    type, title, reason, target_id, target_label, amount, payload, requested_by
  )
  values (
    p_type,
    p_title,
    nullif(trim(coalesce(p_reason, '')), ''),
    p_target_id,
    p_target_label,
    p_amount,
    coalesce(p_payload, '{}'::jsonb),
    auth.uid()
  )
  returning id into v_id;

  return v_id;
end;
$$;

create or replace function public.rpc_review_approval(
  p_id uuid,
  p_status text,
  p_reviewer_note text default null
)
returns void
language plpgsql
security definer
set search_path to 'public'
as $$
begin
  if auth.uid() is null then
    raise exception 'login required';
  end if;
  if public.get_my_role() <> 'admin' then
    raise exception 'only admin can review approvals';
  end if;
  if p_status not in ('approved', 'rejected') then
    raise exception 'review status must be approved or rejected';
  end if;

  update public.aud_approvals
     set status = p_status,
         reviewed_by = auth.uid(),
         reviewer_note = nullif(trim(coalesce(p_reviewer_note, '')), ''),
         reviewed_at = now()
   where id = p_id
     and status = 'pending';

  if not found then
    raise exception 'pending approval not found';
  end if;
end;
$$;

grant select, insert on public.aud_approvals to authenticated;
grant execute on function public.rpc_create_approval_request(text, text, text, uuid, text, numeric, jsonb) to authenticated;
grant execute on function public.rpc_review_approval(uuid, text, text) to authenticated;

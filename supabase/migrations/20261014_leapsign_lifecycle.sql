-- LeapSign lifecycle: human-reviewed PDF handoff, issue context and durable cleanup.
-- Storage cannot participate in a PostgreSQL transaction, so discarded files are
-- queued durably and removed by the maintenance worker after they become hidden.
alter table public.error_reports
  add column if not exists reason text,
  add column if not exists detail text check (detail is null or char_length(detail) <= 500),
  add column if not exists reporter_name text check (reporter_name is null or char_length(reporter_name) <= 120),
  add column if not exists reporter_email text check (reporter_email is null or reporter_email ~* '^[^[:space:]@]+@[^[:space:]@]+[.][^[:space:]@]+$');

alter table public.document_versions
  add column if not exists discarded_at timestamptz,
  add column if not exists discarded_reason text;

create table if not exists public.file_cleanup_jobs (
  id bigint generated always as identity primary key,
  workflow_id uuid not null references public.workflows(id) on delete cascade,
  storage_path text not null unique,
  reason text not null,
  status text not null default 'pending' check (status in ('pending','processing','done','failed')),
  attempts smallint not null default 0,
  last_error text,
  created_at timestamptz not null default now(),
  completed_at timestamptz
);
alter table public.file_cleanup_jobs enable row level security;
create index if not exists file_cleanup_jobs_pending_idx on public.file_cleanup_jobs(status, created_at);

create or replace function public.owner_discard_versions(
  p_workflow_id uuid, p_owner_id uuid, p_version_id uuid, p_action text
) returns jsonb language plpgsql security definer set search_path = public as $$
declare target public.document_versions; path_row record;
begin
  perform 1 from public.workflows where id = p_workflow_id and owner_id = p_owner_id for update;
  if not found then raise exception 'No tienes acceso a este proceso'; end if;
  select * into target from public.document_versions where id = p_version_id and workflow_id = p_workflow_id and discarded_at is null for update;
  if target.id is null then raise exception 'La versión no está disponible'; end if;
  if p_action not in ('rollback','finalize') then raise exception 'Acción no válida'; end if;

  delete from public.open_round_locks where workflow_id = p_workflow_id;
  if p_action = 'rollback' then
    for path_row in select storage_path from public.document_versions where workflow_id = p_workflow_id and sequence > target.sequence and discarded_at is null loop
      insert into public.file_cleanup_jobs(workflow_id, storage_path, reason) values (p_workflow_id, path_row.storage_path, 'rollback') on conflict (storage_path) do nothing;
    end loop;
    update public.document_versions set discarded_at = now(), discarded_reason = 'rollback' where workflow_id = p_workflow_id and sequence > target.sequence and discarded_at is null;
    update public.workflows set current_version_id = target.id, signature_count = target.sequence, status = 'active', paused_at = null, paused_reason = null, last_activity_at = now() where id = p_workflow_id;
  else
    for path_row in select storage_path from public.document_versions where workflow_id = p_workflow_id and id <> target.id and discarded_at is null loop
      insert into public.file_cleanup_jobs(workflow_id, storage_path, reason) values (p_workflow_id, path_row.storage_path, 'finalized') on conflict (storage_path) do nothing;
    end loop;
    update public.document_versions set discarded_at = now(), discarded_reason = 'finalized' where workflow_id = p_workflow_id and id <> target.id and discarded_at is null;
    update public.workflows set current_version_id = target.id, status = 'completed', paused_at = null, paused_reason = null, last_activity_at = now() where id = p_workflow_id;
  end if;
  insert into public.workflow_audit_log(workflow_id, actor_type, actor_user_id, action, metadata) values (p_workflow_id, 'owner', p_owner_id, case when p_action='rollback' then 'owner_rolled_back_version' else 'owner_accepted_final_version' end, jsonb_build_object('version_id', target.id, 'sequence', target.sequence));
  return jsonb_build_object('ok', true, 'sequence', target.sequence);
end $$;
revoke all on function public.owner_discard_versions(uuid,uuid,uuid,text) from public, anon, authenticated;
grant execute on function public.owner_discard_versions(uuid,uuid,uuid,text) to service_role;

-- The worker calls this function after removing each private object from Storage.
create or replace function public.finish_file_cleanup(p_path text, p_error text default null)
returns void language plpgsql security definer set search_path = public as $$
begin
  update public.file_cleanup_jobs set status = case when p_error is null then 'done' else 'failed' end, attempts = attempts + 1, last_error = p_error, completed_at = case when p_error is null then now() else null end where storage_path = p_path;
end $$;
revoke all on function public.finish_file_cleanup(text,text) from public, anon, authenticated;
grant execute on function public.finish_file_cleanup(text,text) to service_role;

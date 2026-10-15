-- LeapSign lifecycle: human-reviewed PDF handoff, issue context and durable cleanup.
-- This is the first migration managed after adopting the historical schema.
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

-- Continue a restored chain with the next visible sequence, not with a discarded one.
create or replace function public.accept_open_signed_submission(
  p_workflow_id uuid, p_session_hash text, p_submission_id uuid
) returns jsonb language plpgsql security definer set search_path = public as $$
declare workflow_row public.workflows; lock_row public.open_round_locks; submission_row public.signature_submissions; next_signer record; new_version uuid; raw_token text; next_sequence smallint;
begin
  select * into workflow_row from public.workflows where id = p_workflow_id and status = 'active' for update;
  if workflow_row.id is null or workflow_row.current_version_id is null then raise exception 'Ronda no disponible'; end if;
  select * into lock_row from public.open_round_locks where workflow_id = p_workflow_id for update;
  if lock_row.workflow_id is null or lock_row.holder_session_hash <> p_session_hash or lock_row.expires_at <= now() or lock_row.version_id_at_claim <> workflow_row.current_version_id then raise exception 'Tu turno ya no está activo o el documento cambió'; end if;
  select * into submission_row from public.signature_submissions where id = p_submission_id and workflow_id = p_workflow_id and submitted_by_session_hash = p_session_hash and parent_version_id = workflow_row.current_version_id for update;
  if submission_row.id is null then raise exception 'No encontramos tu documento firmado'; end if;
  if submission_row.status = 'accepted' then return jsonb_build_object('ok', true, 'already_accepted', true); end if;
  select coalesce(max(sequence), -1) + 1 into next_sequence from public.document_versions where workflow_id = p_workflow_id and discarded_at is null;
  insert into public.document_versions(workflow_id, sequence, storage_path, sha256, byte_size, parent_version_id, submitted_by_session_hash, validation_status, validation_summary, accepted_at)
  values (p_workflow_id, next_sequence, submission_row.storage_path, submission_row.sha256, submission_row.byte_size, workflow_row.current_version_id, p_session_hash, 'accepted', '{"mode":"operational_checks"}'::jsonb, now()) returning id into new_version;
  update public.signature_submissions set status = 'accepted', validated_at = now(), accepted_version_id = new_version, validation_summary = '{"mode":"operational_checks"}'::jsonb where id = submission_row.id;
  update public.workflows set current_version_id = new_version, signature_count = least(next_sequence, 20), last_activity_at = now() where id = p_workflow_id;
  delete from public.open_round_locks where workflow_id = p_workflow_id;
  select holder_name, email, session_hash into next_signer from public.open_round_waitlist where workflow_id = p_workflow_id order by joined_at for update limit 1;
  if next_signer.session_hash is not null then raw_token := gen_random_uuid()::text; update public.open_round_waitlist set turn_token_hash = encode(extensions.digest(convert_to(raw_token, 'UTF8'), 'sha256'), 'hex'), turn_token_expires_at = now() + interval '10 minutes', notified_at = now() where workflow_id = p_workflow_id and session_hash = next_signer.session_hash; end if;
  insert into public.workflow_audit_log(workflow_id, actor_type, actor_session_hash, action, metadata) values (p_workflow_id, 'participant', p_session_hash, 'signed_version_accepted', jsonb_build_object('version_id', new_version, 'sequence', next_sequence));
  return jsonb_build_object('ok', true, 'version_id', new_version, 'next', case when next_signer.session_hash is null then null else jsonb_build_object('holder_name', next_signer.holder_name, 'email', next_signer.email, 'token', raw_token) end);
end $$;

-- The product uses an operational trust workflow: the signer declares the
-- preceding version correct and an uploaded PDF immediately becomes the next
-- immutable version. A reported problem pauses the workflow for its owner.
create or replace function public.accept_open_signed_submission(
  p_workflow_id uuid,
  p_session_hash text,
  p_submission_id uuid
)
returns jsonb language plpgsql security definer set search_path = public as $$
declare workflow_row public.workflows; lock_row public.open_round_locks; submission_row public.signature_submissions; next_signer record; new_version uuid; raw_token text; next_sequence smallint;
begin
  select * into workflow_row from public.workflows where id = p_workflow_id and status = 'active' for update;
  if workflow_row.id is null or workflow_row.current_version_id is null then raise exception 'Ronda no disponible'; end if;
  select * into lock_row from public.open_round_locks where workflow_id = p_workflow_id for update;
  if lock_row.workflow_id is null or lock_row.holder_session_hash <> p_session_hash or lock_row.expires_at <= now() then raise exception 'Tu turno ya no está activo'; end if;
  if lock_row.version_id_at_claim <> workflow_row.current_version_id then raise exception 'Existe una versión más reciente'; end if;
  select * into submission_row from public.signature_submissions where id = p_submission_id and workflow_id = p_workflow_id and submitted_by_session_hash = p_session_hash and parent_version_id = workflow_row.current_version_id for update;
  if submission_row.id is null then raise exception 'No encontramos tu documento firmado'; end if;
  if submission_row.status = 'accepted' then return jsonb_build_object('ok', true, 'already_accepted', true); end if;
  select coalesce(max(sequence), -1) + 1 into next_sequence from public.document_versions where workflow_id = p_workflow_id;
  insert into public.document_versions(workflow_id, sequence, storage_path, sha256, byte_size, parent_version_id, submitted_by_session_hash, validation_status, validation_summary, accepted_at)
  values (p_workflow_id, next_sequence, submission_row.storage_path, submission_row.sha256, submission_row.byte_size, workflow_row.current_version_id, p_session_hash, 'accepted', '{"mode":"trusted_workflow"}'::jsonb, now()) returning id into new_version;
  update public.signature_submissions set status = 'accepted', validated_at = now(), accepted_version_id = new_version, validation_summary = '{"mode":"trusted_workflow"}'::jsonb where id = submission_row.id;
  update public.workflows set current_version_id = new_version, signature_count = least(signature_count + 1, 20), last_activity_at = now() where id = p_workflow_id;
  delete from public.open_round_locks where workflow_id = p_workflow_id;
  select holder_name, email, session_hash into next_signer from public.open_round_waitlist where workflow_id = p_workflow_id order by joined_at for update limit 1;
  if next_signer.session_hash is not null then
    raw_token := gen_random_uuid()::text;
    update public.open_round_waitlist set turn_token_hash = encode(extensions.digest(convert_to(raw_token, 'UTF8'), 'sha256'), 'hex'), turn_token_expires_at = now() + interval '10 minutes', notified_at = now() where workflow_id = p_workflow_id and session_hash = next_signer.session_hash;
  end if;
  insert into public.workflow_audit_log(workflow_id, actor_type, actor_session_hash, action, metadata)
  values (p_workflow_id, 'participant', p_session_hash, 'signed_version_accepted', jsonb_build_object('version_id', new_version, 'sequence', next_sequence));
  return jsonb_build_object('ok', true, 'version_id', new_version, 'next', case when next_signer.session_hash is null then null else jsonb_build_object('holder_name', next_signer.holder_name, 'email', next_signer.email, 'token', raw_token) end);
end $$;

revoke all on function public.accept_open_signed_submission(uuid, text, uuid) from public, anon, authenticated;
grant execute on function public.accept_open_signed_submission(uuid, text, uuid) to service_role;

create or replace function public.owner_rollback_open_round(p_workflow_id uuid, p_owner_id uuid, p_version_id uuid)
returns jsonb language plpgsql security definer set search_path = public as $$
declare target public.document_versions;
begin
  perform 1 from public.workflows where id = p_workflow_id and owner_id = p_owner_id for update;
  if not found then raise exception 'No tienes acceso a esta ronda'; end if;
  select * into target from public.document_versions where id = p_version_id and workflow_id = p_workflow_id and validation_status = 'accepted';
  if target.id is null then raise exception 'Versión no disponible'; end if;
  delete from public.open_round_locks where workflow_id = p_workflow_id;
  update public.workflows set current_version_id = target.id, signature_count = target.sequence, status = 'paused_error', paused_at = now(), paused_reason = 'Retroceso solicitado por el creador', last_activity_at = now() where id = p_workflow_id;
  insert into public.workflow_audit_log(workflow_id, actor_type, actor_user_id, action, metadata) values (p_workflow_id, 'owner', p_owner_id, 'owner_rolled_back_version', jsonb_build_object('version_id', p_version_id, 'sequence', target.sequence));
  return jsonb_build_object('ok', true, 'sequence', target.sequence);
end $$;

revoke all on function public.owner_rollback_open_round(uuid, uuid, uuid) from public, anon, authenticated;
grant execute on function public.owner_rollback_open_round(uuid, uuid, uuid) to service_role;

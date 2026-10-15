-- Invitation lifecycle and durable authorship for every accepted PDF version.
alter table public.open_round_locks
  add column if not exists holder_email text
    check (holder_email is null or holder_email ~* '^[^[:space:]@]+@[^[:space:]@]+[.][^[:space:]@]+$');

alter table public.document_versions
  add column if not exists submitted_by_name text
    check (submitted_by_name is null or char_length(submitted_by_name) between 1 and 120),
  add column if not exists submitted_by_email text
    check (submitted_by_email is null or submitted_by_email ~* '^[^[:space:]@]+@[^[:space:]@]+[.][^[:space:]@]+$');

-- Preserve useful authorship for versions that already exist whenever it can be
-- reconstructed from the invitation or durable queue-access record.
update public.document_versions version
set submitted_by_name = left(coalesce(
      nullif(trim(concat_ws(' ', creator.raw_user_meta_data ->> 'first_name', creator.raw_user_meta_data ->> 'last_name')), ''),
      nullif(creator.raw_user_meta_data ->> 'full_name', ''),
      creator.email,
      'Creador del proceso'
    ), 120),
    submitted_by_email = creator.email
from public.workflows workflow
join auth.users creator on creator.id = workflow.owner_id
where version.workflow_id = workflow.id
  and version.sequence = 0
  and version.submitted_by_name is null;

update public.document_versions version
set submitted_by_name = coalesce(invitation.holder_name, invitation.email, 'Participante'),
    submitted_by_email = invitation.email
from public.round_invitations invitation
where version.workflow_id = invitation.workflow_id
  and version.submitted_by_session_hash = invitation.session_hash
  and version.sequence > 0
  and version.submitted_by_name is null;

update public.document_versions version
set submitted_by_name = coalesce(access_link.holder_name, access_link.email, 'Participante'),
    submitted_by_email = access_link.email
from public.open_round_access_links access_link
where version.workflow_id = access_link.workflow_id
  and version.submitted_by_session_hash = access_link.session_hash
  and version.sequence > 0
  and version.submitted_by_name is null;

create or replace function public.restore_round_invitation_access(
  p_workflow_id uuid,
  p_token_hash text,
  p_new_session_hash text
) returns jsonb language plpgsql security definer set search_path = public as $$
declare invitation public.round_invitations; has_turn boolean;
begin
  select * into invitation from public.round_invitations
  where workflow_id = p_workflow_id and token_hash = p_token_hash
  for update;
  if invitation.id is null then
    raise exception 'La invitación no es válida';
  end if;
  if invitation.status = 'completed' then
    raise exception 'Esta invitación ya fue completada. No es posible firmar dos veces con el mismo enlace';
  end if;
  if invitation.expires_at <= now() then
    raise exception 'La invitación ha caducado. Solicita una nueva al creador';
  end if;
  if invitation.session_hash is not null and invitation.session_hash <> p_new_session_hash then
    if exists(select 1 from public.open_round_waitlist where workflow_id=p_workflow_id and session_hash=p_new_session_hash)
       or exists(select 1 from public.open_round_locks where workflow_id=p_workflow_id and holder_session_hash=p_new_session_hash) then
      raise exception 'Este dispositivo ya tiene otra solicitud en la ronda';
    end if;
    select exists(select 1 from public.open_round_waitlist where workflow_id=p_workflow_id and session_hash=invitation.session_hash)
      or exists(select 1 from public.open_round_locks where workflow_id=p_workflow_id and holder_session_hash=invitation.session_hash and expires_at > now()) into has_turn;
    if has_turn then raise exception 'Esta invitación ya está en uso'; end if;
  end if;
  -- A released invitation may be opened again. Completion is the only terminal
  -- successful state for the recipient.
  update public.round_invitations
  set session_hash=p_new_session_hash, status='opened', opened_at=coalesce(opened_at,now())
  where id=invitation.id;
  return jsonb_build_object('holder_name', invitation.holder_name, 'email', invitation.email);
end $$;
revoke all on function public.restore_round_invitation_access(uuid,text,text) from public, anon, authenticated;
grant execute on function public.restore_round_invitation_access(uuid,text,text) to service_role;

create or replace function public.claim_open_turn(
  p_workflow_id uuid,
  p_holder_name text,
  p_session_hash text,
  p_email text default null,
  p_turn_token_hash text default null
)
returns jsonb language plpgsql security definer set search_path = public as $$
declare held public.open_round_locks; first_waiter public.open_round_waitlist; wait_position integer; current_version uuid;
begin
  select current_version_id into current_version from public.workflows where id = p_workflow_id and status = 'active' for update;
  if not found or current_version is null then raise exception 'Este proceso ya no está disponible para firmar'; end if;
  delete from public.open_round_locks where workflow_id = p_workflow_id and expires_at <= now();
  select * into held from public.open_round_locks where workflow_id = p_workflow_id;
  if held.workflow_id is not null then
    if held.holder_session_hash = p_session_hash then
      return jsonb_build_object('state','active','expires_at',held.expires_at);
    end if;
    insert into public.open_round_waitlist(workflow_id, session_hash, holder_name, email)
    values (p_workflow_id, p_session_hash, p_holder_name, nullif(p_email, ''))
    on conflict (workflow_id, session_hash) do update set holder_name=excluded.holder_name, email=coalesce(excluded.email, public.open_round_waitlist.email);
    select count(*) into wait_position from public.open_round_waitlist where workflow_id=p_workflow_id and joined_at <= (select joined_at from public.open_round_waitlist where workflow_id=p_workflow_id and session_hash=p_session_hash);
    return jsonb_build_object('state','waiting','position',wait_position,'expires_at',held.expires_at);
  end if;
  select * into first_waiter from public.open_round_waitlist where workflow_id=p_workflow_id order by joined_at for update limit 1;
  if first_waiter.workflow_id is not null and first_waiter.session_hash <> p_session_hash
     and (first_waiter.turn_token_hash is null or first_waiter.turn_token_expires_at <= now() or first_waiter.turn_token_hash <> p_turn_token_hash) then
    insert into public.open_round_waitlist(workflow_id, session_hash, holder_name, email)
    values (p_workflow_id, p_session_hash, p_holder_name, nullif(p_email, ''))
    on conflict (workflow_id, session_hash) do update set holder_name=excluded.holder_name, email=coalesce(excluded.email, public.open_round_waitlist.email);
    select count(*) into wait_position from public.open_round_waitlist where workflow_id=p_workflow_id and joined_at <= (select joined_at from public.open_round_waitlist where workflow_id=p_workflow_id and session_hash=p_session_hash);
    return jsonb_build_object('state','waiting','position',wait_position);
  end if;
  if first_waiter.workflow_id is not null then
    delete from public.open_round_waitlist where workflow_id=p_workflow_id and session_hash=first_waiter.session_hash;
  end if;
  insert into public.open_round_locks(workflow_id, holder_name, holder_session_hash, holder_email, expires_at, version_id_at_claim)
  values (
    p_workflow_id,
    coalesce(first_waiter.holder_name, p_holder_name),
    p_session_hash,
    nullif(coalesce(first_waiter.email, p_email), ''),
    now() + interval '10 minutes',
    current_version
  );
  insert into public.workflow_audit_log(workflow_id, actor_type, action, actor_session_hash, metadata)
  values (p_workflow_id, 'participant', 'turn_claimed', p_session_hash, jsonb_build_object('version_id', current_version));
  return jsonb_build_object('state','active','expires_at',now() + interval '10 minutes');
end $$;
revoke all on function public.claim_open_turn(uuid, text, text, text, text) from public, anon, authenticated;
grant execute on function public.claim_open_turn(uuid, text, text, text, text) to service_role;

create or replace function public.accept_open_signed_submission(
  p_workflow_id uuid, p_session_hash text, p_submission_id uuid
) returns jsonb language plpgsql security definer set search_path = public as $$
declare workflow_row public.workflows; lock_row public.open_round_locks; submission_row public.signature_submissions; next_signer record; new_version uuid; raw_token text; next_sequence smallint;
begin
  select * into workflow_row from public.workflows where id = p_workflow_id and status = 'active' for update;
  if workflow_row.id is null or workflow_row.current_version_id is null then raise exception 'Este proceso ya no está disponible para firmar'; end if;
  select * into lock_row from public.open_round_locks where workflow_id = p_workflow_id for update;
  if lock_row.workflow_id is null or lock_row.holder_session_hash <> p_session_hash or lock_row.expires_at <= now() or lock_row.version_id_at_claim <> workflow_row.current_version_id then raise exception 'Tu turno ya no está activo o el documento cambió'; end if;
  select * into submission_row from public.signature_submissions where id = p_submission_id and workflow_id = p_workflow_id and submitted_by_session_hash = p_session_hash and parent_version_id = workflow_row.current_version_id for update;
  if submission_row.id is null then raise exception 'No encontramos tu documento firmado'; end if;
  if submission_row.status = 'accepted' then return jsonb_build_object('ok', true, 'already_accepted', true); end if;
  select coalesce(max(sequence), -1) + 1 into next_sequence from public.document_versions where workflow_id = p_workflow_id and discarded_at is null;
  insert into public.document_versions(workflow_id, sequence, storage_path, sha256, byte_size, parent_version_id, submitted_by_session_hash, submitted_by_name, submitted_by_email, validation_status, validation_summary, accepted_at)
  values (p_workflow_id, next_sequence, submission_row.storage_path, submission_row.sha256, submission_row.byte_size, workflow_row.current_version_id, p_session_hash, lock_row.holder_name, lock_row.holder_email, 'accepted', '{"mode":"operational_checks"}'::jsonb, now()) returning id into new_version;
  update public.signature_submissions set status = 'accepted', validated_at = now(), accepted_version_id = new_version, validation_summary = '{"mode":"operational_checks"}'::jsonb where id = submission_row.id;
  update public.workflows set current_version_id = new_version, signature_count = least(next_sequence, 20), last_activity_at = now() where id = p_workflow_id;
  delete from public.open_round_locks where workflow_id = p_workflow_id;
  select holder_name, email, session_hash into next_signer from public.open_round_waitlist where workflow_id = p_workflow_id order by joined_at for update limit 1;
  if next_signer.session_hash is not null then raw_token := gen_random_uuid()::text; update public.open_round_waitlist set turn_token_hash = encode(extensions.digest(convert_to(raw_token, 'UTF8'), 'sha256'), 'hex'), turn_token_expires_at = now() + interval '10 minutes', notified_at = now() where workflow_id = p_workflow_id and session_hash = next_signer.session_hash; end if;
  insert into public.workflow_audit_log(workflow_id, actor_type, actor_session_hash, action, metadata) values (p_workflow_id, 'participant', p_session_hash, 'signed_version_accepted', jsonb_build_object('version_id', new_version, 'sequence', next_sequence));
  return jsonb_build_object('ok', true, 'version_id', new_version, 'next', case when next_signer.session_hash is null then null else jsonb_build_object('holder_name', next_signer.holder_name, 'email', next_signer.email, 'token', raw_token) end);
end $$;
revoke all on function public.accept_open_signed_submission(uuid,text,uuid) from public, anon, authenticated;
grant execute on function public.accept_open_signed_submission(uuid,text,uuid) to service_role;

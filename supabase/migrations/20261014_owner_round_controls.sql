-- Owner-only controls are implemented through a server function. Browser roles
-- never receive permission to alter locks or workflow status directly.
create or replace function public.owner_manage_open_round(
  p_workflow_id uuid,
  p_owner_id uuid,
  p_action text
)
returns jsonb language plpgsql security definer set search_path = public as $$
declare current_lock public.open_round_locks; next_signer record; raw_token text;
begin
  perform 1 from public.workflows where id = p_workflow_id and owner_id = p_owner_id for update;
  if not found then raise exception 'No tienes acceso a esta ronda'; end if;

  if p_action = 'pause' then
    update public.workflows set status = 'paused_error', paused_at = now(), paused_reason = 'Pausada por el creador', last_activity_at = now() where id = p_workflow_id;
    insert into public.workflow_audit_log(workflow_id, actor_type, actor_user_id, action) values (p_workflow_id, 'owner', p_owner_id, 'owner_paused');
    return jsonb_build_object('ok', true, 'state', 'paused_error');
  end if;

  if p_action = 'resume' then
    update public.workflows set status = 'active', paused_at = null, paused_reason = null, last_activity_at = now() where id = p_workflow_id and status = 'paused_error';
    if not found then raise exception 'Esta ronda no está pausada'; end if;
    insert into public.workflow_audit_log(workflow_id, actor_type, actor_user_id, action) values (p_workflow_id, 'owner', p_owner_id, 'owner_resumed');
    return jsonb_build_object('ok', true, 'state', 'active');
  end if;

  if p_action = 'release_turn' then
    select * into current_lock from public.open_round_locks where workflow_id = p_workflow_id for update;
    if current_lock.workflow_id is null then raise exception 'No hay un turno activo'; end if;
    delete from public.open_round_locks where workflow_id = p_workflow_id;
    select holder_name, email, session_hash into next_signer from public.open_round_waitlist where workflow_id = p_workflow_id order by joined_at for update limit 1;
    if next_signer.session_hash is not null then
      raw_token := gen_random_uuid()::text;
      update public.open_round_waitlist set turn_token_hash = encode(extensions.digest(convert_to(raw_token, 'UTF8'), 'sha256'), 'hex'), turn_token_expires_at = now() + interval '10 minutes', notified_at = now()
      where workflow_id = p_workflow_id and session_hash = next_signer.session_hash;
    end if;
    insert into public.workflow_audit_log(workflow_id, actor_type, actor_user_id, action, metadata) values (p_workflow_id, 'owner', p_owner_id, 'owner_released_turn', jsonb_build_object('previous_holder', current_lock.holder_name));
    return jsonb_build_object('ok', true, 'next', case when next_signer.session_hash is null then null else jsonb_build_object('holder_name', next_signer.holder_name, 'email', next_signer.email, 'token', raw_token) end);
  end if;

  if p_action = 'skip_next' then
    select holder_name, session_hash into next_signer from public.open_round_waitlist where workflow_id = p_workflow_id order by joined_at for update limit 1;
    if next_signer.session_hash is null then raise exception 'No hay nadie en espera'; end if;
    delete from public.open_round_waitlist where workflow_id = p_workflow_id and session_hash = next_signer.session_hash;
    insert into public.workflow_audit_log(workflow_id, actor_type, actor_user_id, action, metadata) values (p_workflow_id, 'owner', p_owner_id, 'owner_skipped_waiter', jsonb_build_object('holder_name', next_signer.holder_name));
    return jsonb_build_object('ok', true, 'skipped', next_signer.holder_name);
  end if;

  raise exception 'Acción no disponible';
end $$;

revoke all on function public.owner_manage_open_round(uuid, uuid, text) from public, anon, authenticated;
grant execute on function public.owner_manage_open_round(uuid, uuid, text) to service_role;

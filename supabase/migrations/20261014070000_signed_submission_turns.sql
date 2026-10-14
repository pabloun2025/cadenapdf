-- Historical schema: a participant may submit exactly the version they received with their active
-- turn.  Submission does not release the queue: a private validator must
-- accept it before the next signer can receive the document.
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
  if not found or current_version is null then raise exception 'Ronda no disponible'; end if;
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
  insert into public.open_round_locks(workflow_id, holder_name, holder_session_hash, expires_at, version_id_at_claim)
  values (p_workflow_id, coalesce(first_waiter.holder_name, p_holder_name), p_session_hash, now() + interval '10 minutes', current_version);
  insert into public.workflow_audit_log(workflow_id, actor_type, action, actor_session_hash, metadata)
  values (p_workflow_id, 'participant', 'turn_claimed', p_session_hash, jsonb_build_object('version_id', current_version));
  return jsonb_build_object('state','active','expires_at',now() + interval '10 minutes');
end $$;

revoke all on function public.claim_open_turn(uuid, text, text, text, text) from public, anon, authenticated;
grant execute on function public.claim_open_turn(uuid, text, text, text, text) to service_role;

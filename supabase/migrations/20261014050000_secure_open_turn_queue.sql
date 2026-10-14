-- Historical schema: secure the open-turn queue.
alter table public.open_round_waitlist
  add column if not exists turn_token_hash text,
  add column if not exists turn_token_expires_at timestamptz,
  add column if not exists notified_at timestamptz;

drop function if exists public.claim_open_turn(uuid, text, text);
drop function if exists public.claim_open_turn(uuid, text, text, text);

create function public.claim_open_turn(
  p_workflow_id uuid,
  p_holder_name text,
  p_session_hash text,
  p_email text default null,
  p_turn_token_hash text default null
)
returns jsonb language plpgsql security definer set search_path = public as $$
declare held public.open_round_locks; first_waiter public.open_round_waitlist; wait_position integer;
begin
  perform 1 from public.workflows where id = p_workflow_id and status = 'active' for update;
  if not found then raise exception 'Ronda no disponible'; end if;
  delete from public.open_round_locks where workflow_id = p_workflow_id and expires_at <= now();
  select * into held from public.open_round_locks where workflow_id = p_workflow_id;
  if held.workflow_id is not null then
    if held.holder_session_hash = p_session_hash then return jsonb_build_object('state','active','expires_at',held.expires_at); end if;
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
  insert into public.open_round_locks(workflow_id, holder_name, holder_session_hash, expires_at)
  values (p_workflow_id, coalesce(first_waiter.holder_name, p_holder_name), p_session_hash, now() + interval '10 minutes');
  insert into public.workflow_audit_log(workflow_id, actor_type, action) values (p_workflow_id, 'participant', 'turn_claimed');
  return jsonb_build_object('state','active','expires_at',now() + interval '10 minutes');
end $$;

create or replace function public.release_open_turn(p_workflow_id uuid, p_session_hash text)
returns jsonb language plpgsql security definer set search_path = public as $$
declare next_signer record; raw_token text;
begin
  delete from public.open_round_locks where workflow_id=p_workflow_id and holder_session_hash=p_session_hash;
  delete from public.open_round_waitlist where workflow_id=p_workflow_id and session_hash=p_session_hash;
  select holder_name, email, session_hash into next_signer from public.open_round_waitlist where workflow_id=p_workflow_id order by joined_at limit 1 for update;
  if next_signer.session_hash is null then return jsonb_build_object('released', true, 'next', null); end if;
  raw_token := gen_random_uuid()::text;
  update public.open_round_waitlist set turn_token_hash=encode(extensions.digest(convert_to(raw_token, 'UTF8'), 'sha256'), 'hex'), turn_token_expires_at=now()+interval '10 minutes', notified_at=now() where workflow_id=p_workflow_id and session_hash=next_signer.session_hash;
  return jsonb_build_object('released', true, 'next', jsonb_build_object('holder_name',next_signer.holder_name,'email',next_signer.email,'token',raw_token));
end $$;

revoke all on function public.claim_open_turn(uuid, text, text, text, text) from public, anon, authenticated;
grant execute on function public.claim_open_turn(uuid, text, text, text, text) to service_role;
revoke all on function public.release_open_turn(uuid, text) from public, anon, authenticated;
grant execute on function public.release_open_turn(uuid, text) to service_role;

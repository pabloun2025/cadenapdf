-- Historical schema: normalize the turn-token digest signature.
create or replace function public.release_open_turn(p_workflow_id uuid, p_session_hash text)
returns jsonb language plpgsql security definer set search_path = public as $$
declare next_signer record; raw_token text;
begin
  delete from public.open_round_locks where workflow_id=p_workflow_id and holder_session_hash=p_session_hash;
  delete from public.open_round_waitlist where workflow_id=p_workflow_id and session_hash=p_session_hash;
  select holder_name, email, session_hash into next_signer from public.open_round_waitlist where workflow_id=p_workflow_id order by joined_at limit 1 for update;
  if next_signer.session_hash is null then return jsonb_build_object('released', true, 'next', null); end if;
  raw_token := gen_random_uuid()::text;
  update public.open_round_waitlist
    set turn_token_hash=encode(extensions.digest(convert_to(raw_token, 'UTF8'), 'sha256'), 'hex'),
        turn_token_expires_at=now()+interval '10 minutes',
        notified_at=now()
    where workflow_id=p_workflow_id and session_hash=next_signer.session_hash;
  return jsonb_build_object('released', true, 'next', jsonb_build_object('holder_name',next_signer.holder_name,'email',next_signer.email,'token',raw_token));
end $$;

revoke all on function public.release_open_turn(uuid, text) from public, anon, authenticated;
grant execute on function public.release_open_turn(uuid, text) to service_role;

-- Historical schema: open signing queue.
create table public.open_round_waitlist (
  workflow_id uuid not null references public.workflows(id) on delete cascade,
  session_hash text not null,
  holder_name text not null check (char_length(holder_name) between 1 and 120),
  joined_at timestamptz not null default now(),
  primary key (workflow_id, session_hash)
);
alter table public.open_round_waitlist enable row level security;

create or replace function public.claim_open_turn(p_workflow_id uuid, p_holder_name text, p_session_hash text)
returns jsonb language plpgsql security definer set search_path = public as $$
declare held public.open_round_locks; wait_position integer;
begin
  perform 1 from public.workflows where id = p_workflow_id and status = 'active' for update;
  if not found then raise exception 'Ronda no disponible'; end if;
  delete from public.open_round_locks where workflow_id = p_workflow_id and expires_at <= now();
  select * into held from public.open_round_locks where workflow_id = p_workflow_id;
  if held.workflow_id is null then
    delete from public.open_round_waitlist where workflow_id = p_workflow_id and session_hash = p_session_hash;
    insert into public.open_round_locks(workflow_id, holder_name, holder_session_hash, expires_at) values (p_workflow_id, p_holder_name, p_session_hash, now() + interval '10 minutes');
    insert into public.workflow_audit_log(workflow_id, actor_type, action) values (p_workflow_id, 'participant', 'turn_claimed');
    return jsonb_build_object('state','active','expires_at', now() + interval '10 minutes');
  end if;
  if held.holder_session_hash = p_session_hash then return jsonb_build_object('state','active','expires_at',held.expires_at); end if;
  insert into public.open_round_waitlist(workflow_id, session_hash, holder_name) values (p_workflow_id, p_session_hash, p_holder_name) on conflict do nothing;
  select count(*) into wait_position from public.open_round_waitlist where workflow_id=p_workflow_id and joined_at <= (select joined_at from public.open_round_waitlist where workflow_id=p_workflow_id and session_hash=p_session_hash);
  return jsonb_build_object('state','waiting','position',wait_position,'expires_at',held.expires_at);
end $$;

create or replace function public.release_open_turn(p_workflow_id uuid, p_session_hash text)
returns boolean language plpgsql security definer set search_path = public as $$
begin
  delete from public.open_round_locks where workflow_id=p_workflow_id and holder_session_hash=p_session_hash;
  delete from public.open_round_waitlist where workflow_id=p_workflow_id and session_hash=p_session_hash;
  return true;
end $$;

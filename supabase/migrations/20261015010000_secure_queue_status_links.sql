-- Private, durable links let a participant recover the same queue position on
-- another tab or device. Only the SHA-256 digest is stored in the database.
create table if not exists public.open_round_access_links (
  workflow_id uuid not null references public.workflows(id) on delete cascade,
  access_token_hash text not null unique,
  session_hash text not null,
  holder_name text not null check (char_length(holder_name) between 1 and 120),
  email text check (email is null or email ~* '^[^[:space:]@]+@[^[:space:]@]+[.][^[:space:]@]+$'),
  expires_at timestamptz not null default (now() + interval '30 days'),
  created_at timestamptz not null default now(),
  primary key (workflow_id, session_hash)
);

alter table public.open_round_access_links enable row level security;
create index if not exists open_round_access_links_expiry_idx
  on public.open_round_access_links (expires_at);

create or replace function public.restore_open_turn_access(
  p_workflow_id uuid,
  p_access_token_hash text,
  p_new_session_hash text
) returns jsonb language plpgsql security definer set search_path = public as $$
declare
  access_row public.open_round_access_links;
  is_waiting boolean;
  is_active boolean;
begin
  select * into access_row
  from public.open_round_access_links
  where workflow_id = p_workflow_id
    and access_token_hash = p_access_token_hash
    and expires_at > now()
  for update;

  if access_row.workflow_id is null then
    raise exception 'El enlace de consulta no es válido o ha caducado';
  end if;

  select exists(
    select 1 from public.open_round_waitlist
    where workflow_id = p_workflow_id and session_hash = access_row.session_hash
  ) into is_waiting;
  select exists(
    select 1 from public.open_round_locks
    where workflow_id = p_workflow_id
      and holder_session_hash = access_row.session_hash
      and expires_at > now()
  ) into is_active;

  if not is_waiting and not is_active then
    raise exception 'Esta solicitud de turno ya finalizó';
  end if;

  if access_row.session_hash <> p_new_session_hash then
    if exists(
      select 1 from public.open_round_waitlist
      where workflow_id = p_workflow_id and session_hash = p_new_session_hash
    ) or exists(
      select 1 from public.open_round_locks
      where workflow_id = p_workflow_id and holder_session_hash = p_new_session_hash
    ) then
      raise exception 'Este dispositivo ya tiene otra solicitud en la ronda';
    end if;

    update public.open_round_waitlist
    set session_hash = p_new_session_hash
    where workflow_id = p_workflow_id and session_hash = access_row.session_hash;

    update public.open_round_locks
    set holder_session_hash = p_new_session_hash
    where workflow_id = p_workflow_id and holder_session_hash = access_row.session_hash;

    update public.open_round_notifications
    set session_hash = p_new_session_hash,
        dedupe_key = 'waitlisted:' || p_workflow_id::text || ':' || p_new_session_hash
    where workflow_id = p_workflow_id
      and session_hash = access_row.session_hash
      and kind = 'waitlisted';

    update public.open_round_access_links
    set session_hash = p_new_session_hash
    where workflow_id = p_workflow_id and session_hash = access_row.session_hash;
  end if;

  return jsonb_build_object(
    'holder_name', access_row.holder_name,
    'email', access_row.email
  );
end $$;

revoke all on function public.restore_open_turn_access(uuid,text,text) from public, anon, authenticated;
grant execute on function public.restore_open_turn_access(uuid,text,text) to service_role;

-- Explicitly releasing a turn also revokes its consultation link.
create or replace function public.release_open_turn(p_workflow_id uuid, p_session_hash text)
returns jsonb language plpgsql security definer set search_path = public as $$
declare next_signer record; raw_token text;
begin
  delete from public.open_round_locks where workflow_id=p_workflow_id and holder_session_hash=p_session_hash;
  delete from public.open_round_waitlist where workflow_id=p_workflow_id and session_hash=p_session_hash;
  delete from public.open_round_access_links where workflow_id=p_workflow_id and session_hash=p_session_hash;
  select holder_name, email, session_hash into next_signer from public.open_round_waitlist where workflow_id=p_workflow_id order by joined_at limit 1 for update;
  if next_signer.session_hash is null then return jsonb_build_object('released',true); end if;
  raw_token := gen_random_uuid()::text;
  update public.open_round_waitlist
    set turn_token_hash=encode(extensions.digest(convert_to(raw_token, 'UTF8'), 'sha256'), 'hex'),
        turn_token_expires_at=now()+interval '10 minutes', notified_at=now()
    where workflow_id=p_workflow_id and session_hash=next_signer.session_hash;
  return jsonb_build_object('released',true,'next',jsonb_build_object('holder_name',next_signer.holder_name,'email',next_signer.email,'token',raw_token));
end $$;

revoke all on function public.release_open_turn(uuid,text) from public, anon, authenticated;
grant execute on function public.release_open_turn(uuid,text) to service_role;

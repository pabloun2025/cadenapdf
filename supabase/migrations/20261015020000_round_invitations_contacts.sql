-- Private address book and one-time invitation links for active signing rounds.
create table public.owner_contacts (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  email text not null check (email ~* '^[^[:space:]@]+@[^[:space:]@]+[.][^[:space:]@]+$'),
  display_name text check (display_name is null or char_length(display_name) between 1 and 120),
  created_at timestamptz not null default now(),
  last_used_at timestamptz not null default now(),
  unique (owner_id, email)
);
create index owner_contacts_owner_recent_idx on public.owner_contacts(owner_id, last_used_at desc);
alter table public.owner_contacts enable row level security;
create policy "Owners manage their contacts" on public.owner_contacts for all
  using (auth.uid() = owner_id) with check (auth.uid() = owner_id);

create table public.round_invitations (
  id uuid primary key default gen_random_uuid(),
  workflow_id uuid not null references public.workflows(id) on delete cascade,
  owner_id uuid not null references auth.users(id) on delete cascade,
  email text not null check (email ~* '^[^[:space:]@]+@[^[:space:]@]+[.][^[:space:]@]+$'),
  holder_name text not null check (char_length(holder_name) between 1 and 120),
  token_hash text not null unique,
  session_hash text,
  status text not null default 'pending' check (status in ('pending','opened','completed','cancelled')),
  expires_at timestamptz not null default (now() + interval '30 days'),
  created_at timestamptz not null default now(),
  opened_at timestamptz,
  completed_at timestamptz,
  email_sent_at timestamptz,
  email_error text
);
create index round_invitations_lookup_idx on public.round_invitations(workflow_id, token_hash);
create index round_invitations_session_idx on public.round_invitations(workflow_id, session_hash);
alter table public.round_invitations enable row level security;

create or replace function public.restore_round_invitation_access(
  p_workflow_id uuid,
  p_token_hash text,
  p_new_session_hash text
) returns jsonb language plpgsql security definer set search_path = public as $$
declare invitation public.round_invitations; has_turn boolean;
begin
  select * into invitation from public.round_invitations
  where workflow_id = p_workflow_id and token_hash = p_token_hash
    and status in ('pending','opened') and expires_at > now() for update;
  if invitation.id is null then raise exception 'La invitación no es válida o ha caducado'; end if;
  if invitation.session_hash is not null and invitation.session_hash <> p_new_session_hash then
    if exists (select 1 from public.open_round_waitlist where workflow_id=p_workflow_id and session_hash=p_new_session_hash)
       or exists (select 1 from public.open_round_locks where workflow_id=p_workflow_id and holder_session_hash=p_new_session_hash) then
      raise exception 'Este dispositivo ya tiene otra solicitud en la ronda';
    end if;
    select exists(select 1 from public.open_round_waitlist where workflow_id=p_workflow_id and session_hash=invitation.session_hash)
      or exists(select 1 from public.open_round_locks where workflow_id=p_workflow_id and holder_session_hash=invitation.session_hash and expires_at > now()) into has_turn;
    if has_turn then raise exception 'Esta invitación ya está en uso'; end if;
  end if;
  update public.round_invitations set session_hash=p_new_session_hash, status='opened', opened_at=coalesce(opened_at,now()) where id=invitation.id;
  return jsonb_build_object('holder_name', invitation.holder_name, 'email', invitation.email);
end $$;
revoke all on function public.restore_round_invitation_access(uuid,text,text) from public, anon, authenticated;
grant execute on function public.restore_round_invitation_access(uuid,text,text) to service_role;

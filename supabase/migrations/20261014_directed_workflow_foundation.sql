-- Cimientos para el flujo dirigido. No expone participantes, tokens ni
-- documentos al navegador: las futuras operaciones se harán en Edge Functions.
alter table public.workflows
  add column if not exists mode text not null default 'open'
    check (mode in ('open', 'directed')),
  add column if not exists expires_at timestamptz,
  add column if not exists completed_at timestamptz;

create table if not exists public.workflow_participants (
  id uuid primary key default gen_random_uuid(),
  workflow_id uuid not null references public.workflows(id) on delete cascade,
  position smallint not null check (position between 1 and 20),
  name text not null check (char_length(name) between 1 and 120),
  email text not null check (email ~* '^[^[:space:]@]+@[^[:space:]@]+[.][^[:space:]@]+$'),
  deadline_minutes smallint not null check (deadline_minutes in (30, 60, 120, 300, 720, 1440, 2880)),
  status text not null default 'pending'
    check (status in ('pending', 'active', 'completed', 'late', 'skipped', 'replaced')),
  signer_token_hash text,
  one_time_code_hash text,
  token_expires_at timestamptz,
  activated_at timestamptz,
  completed_at timestamptz,
  replaced_by uuid references public.workflow_participants(id) on delete set null,
  created_at timestamptz not null default now(),
  unique (workflow_id, position)
);

create unique index if not exists workflow_participants_unique_email
  on public.workflow_participants (workflow_id, lower(email));
create index if not exists workflow_participants_active_idx
  on public.workflow_participants (workflow_id, status, position);

create table if not exists public.workflow_notifications (
  id bigint generated always as identity primary key,
  workflow_id uuid not null references public.workflows(id) on delete cascade,
  participant_id uuid references public.workflow_participants(id) on delete set null,
  kind text not null check (kind in ('invite', 'reminder', 'turn_ready', 'expired', 'completed')),
  destination_hash text not null,
  status text not null default 'pending' check (status in ('pending', 'sent', 'failed', 'cancelled')),
  provider_message_id text,
  scheduled_for timestamptz not null default now(),
  sent_at timestamptz,
  failed_at timestamptz,
  error_code text,
  created_at timestamptz not null default now()
);

create unique index if not exists workflow_notifications_dedupe_idx
  on public.workflow_notifications (workflow_id, participant_id, kind)
  where status in ('pending', 'sent');
create index if not exists workflow_notifications_schedule_idx
  on public.workflow_notifications (status, scheduled_for);

alter table public.workflow_audit_log
  add column if not exists actor_user_id uuid references auth.users(id) on delete set null,
  add column if not exists actor_session_hash text,
  add column if not exists metadata jsonb not null default '{}'::jsonb;

alter table public.workflow_participants enable row level security;
alter table public.workflow_notifications enable row level security;

create policy "owners read own participants" on public.workflow_participants
  for select to authenticated using (
    exists (select 1 from public.workflows w where w.id = workflow_id and w.owner_id = auth.uid())
  );
create policy "owners read own notifications" on public.workflow_notifications
  for select to authenticated using (
    exists (select 1 from public.workflows w where w.id = workflow_id and w.owner_id = auth.uid())
  );
create policy "owners read own audit events" on public.workflow_audit_log
  for select to authenticated using (
    exists (select 1 from public.workflows w where w.id = workflow_id and w.owner_id = auth.uid())
  );

-- El creador no actualiza directamente estados, claves ni participantes:
-- esas transiciones se validan exclusivamente en funciones de servidor.
drop policy if exists "owners update own workflows" on public.workflows;

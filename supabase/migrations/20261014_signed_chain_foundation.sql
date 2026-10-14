-- Base inmutable para una cadena de versiones firmadas. Las cargas candidatas
-- se mantienen en cuarentena hasta que un validador privado las acepte.
alter table public.workflows
  add column if not exists current_version_id uuid,
  add column if not exists paused_at timestamptz,
  add column if not exists paused_reason text check (paused_reason is null or char_length(paused_reason) between 1 and 1000);

alter table public.document_versions
  add column if not exists parent_version_id uuid references public.document_versions(id) on delete restrict,
  add column if not exists submitted_by_session_hash text,
  add column if not exists validation_status text not null default 'accepted' check (validation_status in ('accepted', 'rejected', 'pending_review')),
  add column if not exists validation_summary jsonb not null default '{}'::jsonb,
  add column if not exists accepted_at timestamptz not null default now();

update public.workflows w
set current_version_id = (
  select v.id from public.document_versions v where v.workflow_id = w.id order by v.sequence desc limit 1
)
where w.current_version_id is null
  and exists (select 1 from public.document_versions v where v.workflow_id = w.id);

alter table public.workflows
  drop constraint if exists workflows_current_version_id_fkey,
  add constraint workflows_current_version_id_fkey
  foreign key (current_version_id) references public.document_versions(id) on delete restrict;

alter table public.open_round_locks
  add column if not exists version_id_at_claim uuid references public.document_versions(id) on delete restrict,
  add column if not exists reviewed_version_at timestamptz;

create table if not exists public.signature_submissions (
  id uuid primary key default gen_random_uuid(),
  workflow_id uuid not null references public.workflows(id) on delete cascade,
  parent_version_id uuid not null references public.document_versions(id) on delete restrict,
  storage_path text not null unique,
  sha256 text not null check (sha256 ~ '^[a-f0-9]{64}$'),
  byte_size integer not null check (byte_size > 0 and byte_size <= 10485760),
  submitted_by_session_hash text not null,
  status text not null default 'uploaded' check (status in ('uploaded', 'validating', 'rejected', 'accepted')),
  rejection_reason text check (rejection_reason is null or char_length(rejection_reason) <= 1000),
  validation_summary jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  validated_at timestamptz,
  accepted_version_id uuid references public.document_versions(id) on delete set null
);

create index if not exists signature_submissions_workflow_idx
  on public.signature_submissions (workflow_id, created_at desc);
create unique index if not exists signature_submissions_inflight_idx
  on public.signature_submissions (workflow_id, submitted_by_session_hash, parent_version_id)
  where status in ('uploaded', 'validating');

create table if not exists public.open_round_notifications (
  id bigint generated always as identity primary key,
  workflow_id uuid not null references public.workflows(id) on delete cascade,
  session_hash text not null,
  email text not null check (email ~* '^[^[:space:]@]+@[^[:space:]@]+[.][^[:space:]@]+$'),
  kind text not null check (kind in ('waitlisted', 'turn_ready')),
  dedupe_key text not null unique,
  turn_token_hash text,
  turn_token_expires_at timestamptz,
  status text not null default 'pending' check (status in ('pending', 'sending', 'sent', 'failed', 'cancelled')),
  provider_message_id text,
  error_code text,
  attempts smallint not null default 0 check (attempts between 0 and 10),
  scheduled_for timestamptz not null default now(),
  sent_at timestamptz,
  created_at timestamptz not null default now()
);

create index if not exists open_round_notifications_pending_idx
  on public.open_round_notifications (status, scheduled_for);

alter table public.signature_submissions enable row level security;
alter table public.open_round_notifications enable row level security;

-- Ningún rol de navegador accede a candidatos ni a correos de la cola.
-- Las futuras funciones de propietario operarán con service_role y validarán
-- de forma explícita la titularidad de la ronda.

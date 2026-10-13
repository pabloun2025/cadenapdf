-- Producto mínimo: ronda masiva. Todos los documentos se operan desde
-- funciones de servidor; no se concede acceso directo a participantes.
create extension if not exists pgcrypto;

create type public.workflow_status as enum ('active', 'paused_error', 'completed', 'cancelled', 'purged');

create table public.workflows (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete restrict,
  title text not null check (char_length(title) between 1 and 120),
  message text not null default '' check (char_length(message) <= 500),
  status public.workflow_status not null default 'active',
  group_key_hash text,
  signature_count smallint not null default 0 check (signature_count between 0 and 20),
  last_activity_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  cancelled_at timestamptz,
  purged_at timestamptz
);

create table public.document_versions (
  id uuid primary key default gen_random_uuid(),
  workflow_id uuid not null references public.workflows(id) on delete cascade,
  sequence smallint not null check (sequence between 0 and 20),
  storage_path text not null unique,
  sha256 text not null check (sha256 ~ '^[a-f0-9]{64}$'),
  byte_size integer not null check (byte_size > 0 and byte_size <= 10485760),
  certificate_id text,
  signatures jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now(),
  unique (workflow_id, sequence)
);

create table public.open_round_locks (
  workflow_id uuid primary key references public.workflows(id) on delete cascade,
  holder_name text not null check (char_length(holder_name) between 1 and 120),
  holder_session_hash text not null,
  expires_at timestamptz not null,
  created_at timestamptz not null default now()
);

create table public.error_reports (
  id uuid primary key default gen_random_uuid(),
  workflow_id uuid not null references public.workflows(id) on delete cascade,
  reporter_session_hash text not null,
  comment text not null check (char_length(comment) between 1 and 1000),
  created_at timestamptz not null default now()
);

create table public.workflow_audit_log (
  id bigint generated always as identity primary key,
  workflow_id uuid not null references public.workflows(id) on delete cascade,
  actor_type text not null check (actor_type in ('owner', 'participant', 'system')),
  action text not null,
  created_at timestamptz not null default now()
);

create index workflows_owner_idx on public.workflows(owner_id);
create index versions_workflow_idx on public.document_versions(workflow_id, sequence desc);
create index locks_expiry_idx on public.open_round_locks(expires_at);

alter table public.workflows enable row level security;
alter table public.document_versions enable row level security;
alter table public.open_round_locks enable row level security;
alter table public.error_reports enable row level security;
alter table public.workflow_audit_log enable row level security;

-- Únicamente el creador autenticado puede ver sus propios metadatos. Las
-- operaciones de ronda, documentos, bloqueo y purga se harán en funciones
-- de servidor con comprobación explícita, no mediante políticas abiertas.
create policy "owners read own workflows" on public.workflows
  for select to authenticated using (owner_id = auth.uid());

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('firmador-documents', 'firmador-documents', false, 10485760, array['application/pdf'])
on conflict (id) do update set public = false, file_size_limit = 10485760, allowed_mime_types = array['application/pdf'];

-- Sin políticas de storage: ni anon ni authenticated pueden descargar o subir
-- directamente. Las funciones de servidor verifican estado y autorización.

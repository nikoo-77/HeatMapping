create extension if not exists pgcrypto;

create table if not exists public.active_incident_state (
  id text primary key,
  snapshot jsonb not null,
  updated_at timestamptz not null default now()
);

comment on table public.active_incident_state is
  'Singleton active calamity report snapshot used to restore the current incident state across reloads and logins.';

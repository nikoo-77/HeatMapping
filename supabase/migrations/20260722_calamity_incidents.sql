create extension if not exists pgcrypto;

create table if not exists public.calamity_incidents (
  id uuid primary key default gen_random_uuid(),
  incident_key text not null unique,
  source_report_id text,
  incident_type text not null,
  incident_name text not null,
  location_label text not null,
  lat double precision not null,
  lng double precision not null,
  radius_km double precision not null default 1,
  description text not null,
  status text not null default 'pending_manager_review',
  created_by_employee_id text,
  created_by_employee_name text,
  created_by_role text,
  approved_by text,
  approved_at timestamptz,
  closed_at timestamptz,
  join_deadline_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint calamity_incident_status_chk check (
    status in (
      'pending_manager_review',
      'manager_approved',
      'approved',
      'closed',
      'reopened'
    )
  )
);

create table if not exists public.calamity_incident_people (
  id uuid primary key default gen_random_uuid(),
  incident_id uuid not null references public.calamity_incidents(id) on delete cascade,
  employee_id text not null,
  employee_name text not null,
  employee_avatar text,
  employee_role text,
  relation_status text not null default 'self_reported',
  joined_at timestamptz not null default now(),
  joined_source text,
  verified_by text,
  verified_at timestamptz,
  notes text,
  constraint calamity_incident_people_unique unique (incident_id, employee_id),
  constraint calamity_incident_people_relation_chk check (
    relation_status in (
      'self_reported',
      'pending_manager_review',
      'manager_verified',
      'approved',
      'rejected'
    )
  )
);

create index if not exists idx_calamity_incidents_status on public.calamity_incidents(status);
create index if not exists idx_calamity_incidents_type on public.calamity_incidents(incident_type);
create index if not exists idx_calamity_incidents_location on public.calamity_incidents(location_label);
create index if not exists idx_calamity_incident_people_incident_id on public.calamity_incident_people(incident_id);
create index if not exists idx_calamity_incident_people_employee_id on public.calamity_incident_people(employee_id);

comment on table public.calamity_incidents is
  'Normalized calamity incident records. One incident can have many affected employees.';

comment on table public.calamity_incident_people is
  'Employees affected by a calamity incident, one row per incident per employee.';

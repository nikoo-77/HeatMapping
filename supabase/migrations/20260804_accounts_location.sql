-- Precise home location pins for employee accounts (map accuracy).
-- Run this in the Supabase SQL editor if columns are not yet present.

alter table public.accounts
  add column if not exists latitude double precision,
  add column if not exists longitude double precision,
  add column if not exists location_set_at timestamptz;

comment on column public.accounts.latitude is
  'Employee-confirmed home GPS latitude (WGS84). Overrides city-derived map scatter.';

comment on column public.accounts.longitude is
  'Employee-confirmed home GPS longitude (WGS84). Overrides city-derived map scatter.';

comment on column public.accounts.location_set_at is
  'When the employee last saved their map pin.';

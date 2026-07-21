-- Persistent login accounts for HeatMapping (admin / manager / employee)
-- Passwords are stored as salted scrypt hashes — never plaintext.
-- Primary key is employee_id (Employee ID). System accounts use ADMIN / MANAGER.

create extension if not exists pgcrypto;

-- Fresh installs
create table if not exists public.accounts (
  employee_id text primary key,
  username text not null,
  password_hash text not null,
  access_role text not null,
  display_name text,
  profile_picture text,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint accounts_username_unique unique (username),
  constraint accounts_role_chk check (
    access_role in ('admin', 'manager', 'official')
  )
);

-- Existing installs: drop uuid id and promote employee_id to primary key
do $$
begin
  if exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'accounts'
      and column_name = 'id'
  ) then
    -- System accounts need a stable Employee ID
    update public.accounts
    set employee_id = 'ADMIN'
    where lower(username) = 'admin' and (employee_id is null or btrim(employee_id) = '');

    update public.accounts
    set employee_id = 'MANAGER'
    where lower(username) = 'manager' and (employee_id is null or btrim(employee_id) = '');

    -- Any leftover rows without an Employee ID cannot be PKs
    delete from public.accounts
    where employee_id is null or btrim(employee_id) = '';

    -- Keep one row per Employee ID (prefer earliest created_at)
    delete from public.accounts a
    using public.accounts b
    where a.employee_id = b.employee_id
      and a.ctid < b.ctid;

    alter table public.accounts drop constraint if exists accounts_pkey;
    drop index if exists idx_accounts_employee_id;
    alter table public.accounts drop column id;
    alter table public.accounts alter column employee_id set not null;
    alter table public.accounts add primary key (employee_id);
  end if;
end $$;

create index if not exists idx_accounts_username_lower
  on public.accounts (lower(username));

comment on table public.accounts is
  'Login credentials for HeatMapping. PK = employee_id (Employee ID). password_hash is salt:scrypt hex.';

comment on column public.accounts.employee_id is
  'Employee ID from Employee Details. System accounts use ADMIN / MANAGER.';

-- Profile picture URL (public storage URL or other text reference)
alter table public.accounts
  add column if not exists profile_picture text;

comment on column public.accounts.profile_picture is
  'Public URL (or text reference) for the user profile picture.';

insert into storage.buckets (id, name, public)
values ('profile-pictures', 'profile-pictures', true)
on conflict (id) do nothing;

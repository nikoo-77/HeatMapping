create extension if not exists pgcrypto;

create table if not exists public.aid_assistance_requests (
  id uuid primary key default gen_random_uuid(),
  request_code text not null unique,
  employee_id text not null,
  employee_name text not null,
  department text not null,
  position text,
  manager_id text,
  manager_name text,
  aid_type text not null,
  damage_type text not null,
  incident_name text not null,
  reason text not null,
  status text not null default 'Pending Manager Review',
  submitted_at timestamptz not null default now(),
  manager_decision text,
  manager_remarks text,
  manager_reviewed_by text,
  manager_reviewed_at timestamptz,
  admin_decision text,
  admin_remarks text,
  admin_reviewed_by text,
  admin_reviewed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint aid_assistance_status_chk check (
    status in (
      'Pending Manager Review',
      'Rejected by Manager',
      'Pending Admin Review',
      'Rejected by Admin/CSR',
      'Approved'
    )
  )
);

create table if not exists public.aid_assistance_attachments (
  id uuid primary key default gen_random_uuid(),
  aid_assistance_id uuid not null references public.aid_assistance_requests(id) on delete cascade,
  employee_id text not null,
  file_name text not null,
  file_path text not null,
  public_url text not null,
  uploaded_at timestamptz not null default now()
);

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'aid_assistance_attachments_employee_fk'
  ) then
    begin
      alter table public.aid_assistance_attachments
      add constraint aid_assistance_attachments_employee_fk
      foreign key (employee_id)
      references public."Employee Details"("Employee ID");
    exception
      when others then
        null;
    end;
  end if;
end $$;

create index if not exists idx_aid_assistance_requests_employee_id on public.aid_assistance_requests(employee_id);
create index if not exists idx_aid_assistance_requests_manager_id on public.aid_assistance_requests(manager_id);
create index if not exists idx_aid_assistance_requests_status on public.aid_assistance_requests(status);
create index if not exists idx_aid_assistance_attachments_request on public.aid_assistance_attachments(aid_assistance_id);

insert into storage.buckets (id, name, public)
values ('aid-assistance-attachments', 'aid-assistance-attachments', true)
on conflict (id) do nothing;

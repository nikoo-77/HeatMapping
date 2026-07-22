create extension if not exists pgcrypto;

create table if not exists public.checkin_email_events (
  id uuid primary key default gen_random_uuid(),
  incident_id text,
  incident_name text,
  sender_employee_id text,
  sender_name text not null,
  sender_role text not null,
  recipient_employee_id text not null,
  recipient_name text not null,
  recipient_email text not null,
  provider_message_id text,
  status text not null default 'pending',
  error_message text,
  response_choice text,
  responded_at timestamptz,
  sent_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  constraint checkin_email_events_status_chk check (status in ('pending', 'sent', 'failed')),
  constraint checkin_email_events_response_choice_chk check (response_choice in ('SAFE', 'NEED_HELP'))
);

create table if not exists public.checkin_email_tokens (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references public.checkin_email_events(id) on delete cascade,
  token_hash text not null unique,
  expires_at timestamptz not null,
  used_at timestamptz,
  used_choice text,
  allowed_choices text[] not null default array['SAFE', 'NEED_HELP']::text[],
  created_at timestamptz not null default now(),
  constraint checkin_email_tokens_used_choice_chk check (used_choice in ('SAFE', 'NEED_HELP'))
);

create table if not exists public.checkin_email_responses (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references public.checkin_email_events(id) on delete cascade,
  token_id uuid references public.checkin_email_tokens(id) on delete set null,
  incident_id text,
  recipient_employee_id text not null,
  recipient_email text not null,
  choice text not null,
  responded_at timestamptz not null default now(),
  sender_employee_id text,
  sender_name text,
  sender_role text,
  ip_address text,
  user_agent text,
  created_at timestamptz not null default now(),
  constraint checkin_email_responses_choice_chk check (choice in ('SAFE', 'NEED_HELP')),
  constraint checkin_email_responses_event_unique unique (event_id)
);

create index if not exists idx_checkin_email_events_recipient on public.checkin_email_events(recipient_employee_id);
create index if not exists idx_checkin_email_events_sent_at on public.checkin_email_events(sent_at desc);
create index if not exists idx_checkin_email_tokens_event_id on public.checkin_email_tokens(event_id);
create index if not exists idx_checkin_email_tokens_expires_at on public.checkin_email_tokens(expires_at);
create index if not exists idx_checkin_email_responses_recipient on public.checkin_email_responses(recipient_employee_id);
create index if not exists idx_checkin_email_responses_responded_at on public.checkin_email_responses(responded_at desc);

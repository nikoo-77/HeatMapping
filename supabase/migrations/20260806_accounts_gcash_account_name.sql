-- Optional GCash payout identity metadata for verification.
-- Run this migration so payouts can be validated against both number and registered account name.

alter table public.accounts
  add column if not exists gcash_account_name text;

comment on column public.accounts.gcash_account_name is
  'Registered GCash account holder name for payout verification.';

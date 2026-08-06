-- Optional GCash payout identity metadata for verification.
-- Run this migration so payouts can be validated against both number and registered account name.

alter table public.accounts
  add column if not exists gcash_number text,
  add column if not exists bank_account_details text,
  add column if not exists gcash_account_name text;

comment on column public.accounts.gcash_number is
  'GCash mobile number used for cash aid disbursement.';

comment on column public.accounts.bank_account_details is
  'Optional fallback bank account details for aid disbursement.';

comment on column public.accounts.gcash_account_name is
  'Registered GCash account holder name for payout verification.';

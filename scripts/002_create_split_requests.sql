-- Migration: 002_create_split_requests
-- Creates the split_requests table for tracking payment intent lifecycle.
-- Run against your Supabase project via the SQL Editor or supabase db push.

create table if not exists public.split_requests (
  id                  uuid primary key default gen_random_uuid(),
  trip_id             uuid not null references public.trips(id) on delete cascade,
  requester_user_id   uuid not null,  -- creditor: person owed money
  payer_user_id       uuid not null,  -- debtor: person sending money
  amount_cents        integer not null check (amount_cents > 0),
  currency            text not null default 'EUR',
  note                text not null default '',
  status              text not null default 'created'
                        check (status in ('created','request_sent','pending','completed','declined','expired')),
  preferred_wallet    text not null
                        check (preferred_wallet in ('revolut','venmo','lydia','paypal','other')),
  external_ref_id     text,           -- reserved for Stripe session ID (Chunk A)
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now()
);

-- Index for the most common query: all requests for a trip, newest first.
create index if not exists split_requests_trip_id_idx
  on public.split_requests (trip_id, created_at desc);

-- Index for looking up all requests where a user is the payer.
create index if not exists split_requests_payer_idx
  on public.split_requests (payer_user_id);

-- Automatically keep updated_at current on any row update.
create or replace function public.set_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger split_requests_updated_at
  before update on public.split_requests
  for each row execute function public.set_updated_at();

-- RLS: users can only see requests for trips they belong to.
alter table public.split_requests enable row level security;

create policy "members can view trip split requests"
  on public.split_requests for select
  using (
    exists (
      select 1 from public.trip_members
      where trip_members.trip_id = split_requests.trip_id
        and trip_members.user_id = auth.uid()
    )
  );

create policy "payer can insert split requests"
  on public.split_requests for insert
  with check (payer_user_id = auth.uid());

create policy "payer can update own split requests"
  on public.split_requests for update
  using (payer_user_id = auth.uid());

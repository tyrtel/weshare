-- Migration: 003_split_requests
-- Creates the split_requests table for tracking payment intent lifecycle.

create table if not exists public.split_requests (
  id                    uuid        primary key default gen_random_uuid(),
  trip_id               uuid        not null references public.trips(id) on delete cascade,
  requester_user_id     uuid        not null,  -- creditor: person owed money
  payer_user_id         uuid        not null,  -- debtor: person sending money
  amount_cents          integer     not null check (amount_cents > 0),
  currency              char(3)     not null default 'EUR',
  note                  text        not null default '',
  status                text        not null default 'created'
                          check (status in ('created','request_sent','pending','completed','declined','expired')),
  preferred_wallet      text        not null
                          check (preferred_wallet in ('revolut','venmo','lydia','paypal','other')),
  external_ref_id       text,
  stripe_payment_link_id text,
  stripe_session_id     text,
  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now()
);

create index if not exists split_requests_trip_id_idx
  on public.split_requests (trip_id, created_at desc);

create index if not exists split_requests_payer_idx
  on public.split_requests (payer_user_id);

create index if not exists split_requests_stripe_session_idx
  on public.split_requests (stripe_session_id)
  where stripe_session_id is not null;

-- Keep updated_at current automatically.
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

-- RLS
alter table public.split_requests enable row level security;

create policy "members can view trip split requests"
  on public.split_requests for select
  using (
    exists (
      select 1 from public.trip_members
      where trip_members.trip_id = split_requests.trip_id
        and trip_members.user_id = auth.uid()
    )
    or exists (
      select 1 from public.trips
      where trips.id = split_requests.trip_id
        and trips.owner_id = auth.uid()
    )
  );

create policy "payer can insert split requests"
  on public.split_requests for insert
  with check (payer_user_id = auth.uid());

-- Payer can update status/wallet; Stripe webhook (service_role) bypasses RLS.
create policy "payer can update own split requests"
  on public.split_requests for update
  using (payer_user_id = auth.uid());

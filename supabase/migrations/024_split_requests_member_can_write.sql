-- Any trip member can now insert or update split requests for their trip.
-- The old payer-only policies blocked creditors from clicking "Mark Paid"
-- and the rollover flow from creating split requests on behalf of debtors.

drop policy if exists "payer can insert split requests"       on public.split_requests;
drop policy if exists "payer can update own split requests"   on public.split_requests;

create policy "members can insert split requests"
  on public.split_requests for insert
  with check (
    exists (
      select 1 from public.trip_members
      where trip_members.trip_id = split_requests.trip_id
        and trip_members.user_id = auth.uid()
    )
  );

create policy "members can update trip split requests"
  on public.split_requests for update
  using (
    exists (
      select 1 from public.trip_members
      where trip_members.trip_id = split_requests.trip_id
        and trip_members.user_id = auth.uid()
    )
  );

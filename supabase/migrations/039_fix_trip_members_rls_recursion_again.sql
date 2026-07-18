-- Migration 039: Re-fix infinite recursion between trips and trip_members RLS.
--
-- Migration 017 broke this cycle once already by routing the trips SELECT
-- policy through the SECURITY DEFINER is_trip_member() helper (which bypasses
-- RLS internally, so it can read trip_members without re-triggering its
-- policy). Migration 027 had to drop and recreate several policies to change
-- trip_members.user_id from uuid to text, and its recreated "trips: members
-- can read" reverted to a direct EXISTS subquery on trip_members instead of
-- the helper — reopening the same cycle:
--   trips SELECT policy        -> queries trip_members (its SELECT policy)
--   trip_members SELECT policy -> queries trips        (its SELECT policy) -> ...
--
-- Fix: add a second SECURITY DEFINER helper, is_trip_owner(), and rewrite both
-- policies to use the two helpers instead of ever querying each other's table
-- directly. Also route the trip_members INSERT policy through is_trip_owner()
-- for the same reason, even though the SELECT-side fix alone breaks the cycle.

create or replace function public.is_trip_owner(p_trip_id uuid)
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select exists (
    select 1 from public.trips
    where id = p_trip_id and owner_id = auth.uid()
  );
$$;

-- trips: members can read
drop policy if exists "trips: members can read" on public.trips;
create policy "trips: members can read"
  on public.trips for select
  using (
    owner_id = auth.uid()
    or public.is_trip_member(id)
  );

-- trip_members: members can read
drop policy if exists "trip_members: members can read" on public.trip_members;
create policy "trip_members: members can read"
  on public.trip_members for select
  using (
    user_id = auth.uid()::text
    or public.is_trip_owner(trip_members.trip_id)
    or public.is_trip_member(trip_members.trip_id)
  );

-- trip_members: owner or self can insert
drop policy if exists "trip_members: owner or self can insert" on public.trip_members;
create policy "trip_members: owner or self can insert"
  on public.trip_members for insert
  with check (
    user_id = auth.uid()::text
    or public.is_trip_owner(trip_members.trip_id)
  );

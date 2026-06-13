-- Migration 017: Fix infinite recursion in RLS policies between trips and trip_members.
--
-- The original policies formed a cycle:
--   trips SELECT policy      → queries trip_members (triggers trip_members policy)
--   trip_members SELECT policy → queries trips      (triggers trips policy)  → ...
--
-- Fix: introduce a SECURITY DEFINER helper that reads trip_members bypassing RLS,
-- then rewrite both SELECT policies to use it instead of a direct subquery.

CREATE OR REPLACE FUNCTION public.is_trip_member(p_trip_id uuid)
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
STABLE
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.trip_members
    WHERE trip_id = p_trip_id AND user_id = auth.uid()
  );
$$;

-- trips: members can read
DROP POLICY IF EXISTS "trips: members can read" ON public.trips;
CREATE POLICY "trips: members can read"
  ON public.trips FOR SELECT
  USING (
    owner_id = auth.uid()
    OR public.is_trip_member(id)
  );

-- trip_members: members can read
DROP POLICY IF EXISTS "trip_members: members can read" ON public.trip_members;
CREATE POLICY "trip_members: members can read"
  ON public.trip_members FOR SELECT
  USING (
    user_id = auth.uid()
    OR EXISTS (
      SELECT 1 FROM public.trips t
      WHERE t.id = trip_members.trip_id AND t.owner_id = auth.uid()
    )
    OR public.is_trip_member(trip_members.trip_id)
  );

-- trip_members.user_id: uuid → text
--
-- Guest participants have client-generated IDs like "guest_9898..." which are
-- not valid UUIDs. The column type was previously uuid (FK dropped in 019),
-- but Postgres still rejects non-UUID text values at the type level.
-- Changing to text lets guests participate in trips exactly like real users.
--
-- All policies that compare user_id against auth.uid() (which returns uuid)
-- are dropped and recreated with an explicit ::text cast so the types match.

-- Drop policies that reference user_id without a cast
DROP POLICY IF EXISTS "trip_members: members can read"          ON public.trip_members;
DROP POLICY IF EXISTS "trip_members: owner or self can insert"  ON public.trip_members;
DROP POLICY IF EXISTS "trip_members: member can update own row" ON public.trip_members;

-- Change the column (existing UUID values round-trip perfectly through ::text)
ALTER TABLE public.trip_members
  ALTER COLUMN user_id TYPE text USING user_id::text;

-- Update the SECURITY DEFINER helper so it casts auth.uid() before comparing
CREATE OR REPLACE FUNCTION public.is_trip_member(p_trip_id uuid)
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
STABLE
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.trip_members
    WHERE trip_id = p_trip_id
      AND user_id = auth.uid()::text
  );
$$;

-- Recreate policies with explicit ::text cast on auth.uid()
CREATE POLICY "trip_members: members can read"
  ON public.trip_members FOR SELECT
  USING (
    user_id = auth.uid()::text
    OR EXISTS (
      SELECT 1 FROM public.trips t
      WHERE t.id = trip_members.trip_id AND t.owner_id = auth.uid()
    )
    OR public.is_trip_member(trip_members.trip_id)
  );

CREATE POLICY "trip_members: owner or self can insert"
  ON public.trip_members FOR INSERT
  WITH CHECK (
    user_id = auth.uid()::text
    OR EXISTS (
      SELECT 1 FROM public.trips t
      WHERE t.id = trip_members.trip_id AND t.owner_id = auth.uid()
    )
  );

CREATE POLICY "trip_members: member can update own row"
  ON public.trip_members FOR UPDATE
  USING  (user_id = auth.uid()::text)
  WITH CHECK (
    user_id  = auth.uid()::text
    AND trip_id = trip_id
  );

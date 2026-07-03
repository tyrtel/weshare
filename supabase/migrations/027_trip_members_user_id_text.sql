-- trip_members.user_id: uuid → text
--
-- Guest participants have client-generated IDs like "guest_9898..." which are
-- not valid UUIDs. The column type was previously uuid (FK dropped in 019),
-- but Postgres still rejects non-UUID text values at the type level.
-- Changing to text lets guests participate in trips exactly like real users.
--
-- All policies that compare user_id against auth.uid() (which returns uuid)
-- are dropped and recreated with an explicit ::text cast so the types match.
--
-- Postgres also blocks ALTER COLUMN when any policy on ANY table references
-- the column through a subquery, so split_requests policies are included too.

-- Drop trip_members policies that reference user_id directly
DROP POLICY IF EXISTS "trip_members: members can read"          ON public.trip_members;
DROP POLICY IF EXISTS "trip_members: owner or self can insert"  ON public.trip_members;
DROP POLICY IF EXISTS "trip_members: member can update own row" ON public.trip_members;

-- Drop splits policy whose subquery references trip_members.user_id.
DROP POLICY IF EXISTS "splits: members can insert" ON public.splits;

-- Drop split_requests policies whose subqueries reference trip_members.user_id.
-- Without these drops the ALTER below fails with SQLSTATE 0A000.
DROP POLICY IF EXISTS "members can view trip split requests"   ON public.split_requests;
DROP POLICY IF EXISTS "members can insert split requests"      ON public.split_requests;
DROP POLICY IF EXISTS "members can update trip split requests" ON public.split_requests;

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

-- Recreate trip_members policies with explicit ::text cast on auth.uid()
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

-- Recreate splits policy with ::text cast on the trip_members join
CREATE POLICY "splits: members can insert"
  ON public.splits FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.expenses e
      JOIN public.trips t ON t.id = e.trip_id
      WHERE e.id = splits.expense_id
        AND (
          t.owner_id = auth.uid()
          OR EXISTS (
            SELECT 1 FROM public.trip_members tm
            WHERE tm.trip_id = t.id AND tm.user_id = auth.uid()::text
          )
        )
    )
  );

-- Recreate split_requests policies with ::text cast to match the new column type
CREATE POLICY "members can view trip split requests"
  ON public.split_requests FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.trip_members
      WHERE trip_members.trip_id = split_requests.trip_id
        AND trip_members.user_id = auth.uid()::text
    )
    OR EXISTS (
      SELECT 1 FROM public.trips
      WHERE trips.id = split_requests.trip_id
        AND trips.owner_id = auth.uid()
    )
  );

CREATE POLICY "members can insert split requests"
  ON public.split_requests FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.trip_members
      WHERE trip_members.trip_id = split_requests.trip_id
        AND trip_members.user_id = auth.uid()::text
    )
  );

CREATE POLICY "members can update trip split requests"
  ON public.split_requests FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM public.trip_members
      WHERE trip_members.trip_id = split_requests.trip_id
        AND trip_members.user_id = auth.uid()::text
    )
  );

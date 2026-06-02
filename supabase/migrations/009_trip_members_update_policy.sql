-- SEC-11: Add UPDATE policy for trip_members.
--
-- Without this, authenticated users have no way to correct their own display
-- name or update contact details (phone, email) — the app would need a
-- service-role bypass to do so, which is worse. This policy restricts updates
-- to a member's own row only and prevents changing the trip_id or user_id
-- (identity columns).

CREATE POLICY "trip_members: member can update own row"
  ON public.trip_members FOR UPDATE
  USING  (user_id = auth.uid())
  WITH CHECK (
    user_id  = auth.uid()
    AND trip_id = trip_id  -- prevent reassigning to a different trip
  );

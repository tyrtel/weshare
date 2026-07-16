-- Migration 034: fix split_requests for group-scoped payments and guest users.
--
-- Two separate pre-existing bugs, both on this table, both in the same
-- "guest support was added everywhere except here" family already fixed for
-- trip_members/expenses/splits in 019/020/027:
--
-- 1. group_id does not exist on split_requests, and trip_id is still NOT
--    NULL. The application code (SupabaseSplitRequestRepository, rowSchemas)
--    and migration 032 (claim_group_member_slot) already read/write a
--    group_id column and treat trip_id as optional — group-level settlement
--    ("Record Payment" in useGroupDetail, shipped in Phase 4c) has never
--    worked against real Postgres, only against the in-memory test repo.
--
-- 2. payer_user_id/requester_user_id are still `uuid`. Guest participants
--    have client-generated ids like `guest_<uuid>` (see
--    useAddGroupMember.ts), which are not valid UUID literals. Any settlement
--    involving a guest — as payer or requester — fails outright with
--    "invalid input syntax for type uuid" on insert, and migration 032's
--    guest-merge UPDATEs against split_requests (`payer_user_id = auth.uid()
--    where payer_user_id = p_placeholder_user_id`) would raise the same error
--    the moment they run, since the placeholder id itself can't parse as uuid.
--
-- Both are fixed together since they touch the same table and the same
-- "guest-compatible id" theme; existing UUID values round-trip perfectly
-- through ::text (same reasoning as 027).

-- ── 1. Convert payer/requester columns to text ────────────────────────────────
-- Postgres blocks ALTER COLUMN TYPE while any policy depends on the column
-- through a subquery — audit_log's read policy (014) does exactly that, the
-- same obstacle 027 hit for trip_members.user_id. Drop and recreate it with
-- ::text casts, same pattern as 027.

DROP POLICY IF EXISTS "Users can read audit events for their split requests" ON public.audit_log;

ALTER TABLE public.split_requests
  ALTER COLUMN payer_user_id      TYPE text USING payer_user_id::text,
  ALTER COLUMN requester_user_id  TYPE text USING requester_user_id::text;

CREATE POLICY "Users can read audit events for their split requests"
  ON public.audit_log FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.split_requests sr
      WHERE sr.id::text = audit_log.entity_id
        AND (sr.payer_user_id = auth.uid()::text OR sr.requester_user_id = auth.uid()::text)
    )
  );

-- ── 2. Add group support ──────────────────────────────────────────────────────

ALTER TABLE public.split_requests
  ALTER COLUMN trip_id DROP NOT NULL,
  ADD COLUMN group_id text REFERENCES public.groups(id) ON DELETE CASCADE;

ALTER TABLE public.split_requests
  ADD CONSTRAINT split_requests_scope_check
    CHECK (trip_id IS NOT NULL OR group_id IS NOT NULL) NOT VALID;

CREATE INDEX IF NOT EXISTS split_requests_group_id_idx
  ON public.split_requests (group_id, created_at DESC)
  WHERE group_id IS NOT NULL;

-- ── 3. Extend RLS to cover group-scoped rows ──────────────────────────────────
-- Recreate the three policies from 027 (the latest prior version) with an
-- added group_members branch. The trip_members branch is untouched — trip-
-- scoped requests keep working exactly as before.

DROP POLICY IF EXISTS "members can view trip split requests"   ON public.split_requests;
DROP POLICY IF EXISTS "members can insert split requests"      ON public.split_requests;
DROP POLICY IF EXISTS "members can update trip split requests" ON public.split_requests;

CREATE POLICY "members can view split requests"
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
    OR EXISTS (
      SELECT 1 FROM public.group_members
      WHERE group_members.group_id = split_requests.group_id
        AND group_members.user_id = auth.uid()::text
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
    OR EXISTS (
      SELECT 1 FROM public.group_members
      WHERE group_members.group_id = split_requests.group_id
        AND group_members.user_id = auth.uid()::text
    )
  );

CREATE POLICY "members can update split requests"
  ON public.split_requests FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM public.trip_members
      WHERE trip_members.trip_id = split_requests.trip_id
        AND trip_members.user_id = auth.uid()::text
    )
    OR EXISTS (
      SELECT 1 FROM public.group_members
      WHERE group_members.group_id = split_requests.group_id
        AND group_members.user_id = auth.uid()::text
    )
  );

-- ── 4. Fix migration 032's guest-merge UPDATEs ────────────────────────────────
-- claim_member_slot/claim_group_member_slot already write
-- `payer_user_id = auth.uid()::text` — that half was already correct once (1)
-- above lands. Nothing to redo there; this comment documents why 032 needed
-- no code change, only this column-type fix underneath it.

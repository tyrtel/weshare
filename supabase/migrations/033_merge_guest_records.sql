-- Migration 033: bulk-merge every one of a signed-in user's guest placeholder
-- records — across every group and trip they were ever pre-added to — into
-- their real account. Chunk B of TODO_userMerge.md.
--
-- Client-triggered (not a Supabase Auth Hook): this project's plan has no
-- "after user created" / "post user creation" hook type, only "Before User
-- Created" (which fires before the row exists) and the MFA/password
-- verification hooks (unrelated, and gated behind a plan upgrade anyway).
-- Called best-effort after every successful sign-in from the client
-- (SupabaseAuthService), not just the first — see below for why that's safe.
--
-- Deliberately takes NO email parameter. Accepting a client-supplied email
-- would let any authenticated caller merge someone ELSE's placeholder data
-- (and their financial history) into their own account. The caller's own
-- email is always resolved server-side from auth.users, exactly like
-- claim_member_slot/claim_group_member_slot already do.
--
-- Reuses claim_member_slot/claim_group_member_slot for the actual
-- re-parenting rather than duplicating that cascade a third time — this
-- function's only job is to find every matching placeholder and loop.
--
-- Idempotent: a claimed placeholder flips is_guest to false, so it can never
-- match again on a later call — safe to call on every sign-in, not just
-- account creation. That's a deliberate choice, not just a side effect: it
-- means a placeholder created *after* someone's first login (e.g. added to a
-- new group later) still gets picked up on their next sign-in, and a merge
-- skipped because the app closed mid-call simply retries next time.

create or replace function merge_guest_records_for_new_user()
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_caller_email text;
  v_match record;
begin
  select email into v_caller_email
    from auth.users
    where id = auth.uid();

  if v_caller_email is null then
    return;
  end if;

  -- Every group placeholder matching this email. claim_group_member_slot
  -- also re-parents that group's own trips, so this alone covers group-owned
  -- trip data too — no separate handling needed for trips inside a group.
  for v_match in
    select group_id, user_id
      from group_members
      where is_guest = true
        and email is not null
        and lower(email) = lower(v_caller_email)
  loop
    -- Isolated per match: one bad row must not roll back every other
    -- legitimate merge in the same bulk call.
    begin
      perform claim_group_member_slot(v_match.group_id, v_match.user_id);
    exception when others then
      raise warning 'merge_guest_records_for_new_user: failed to claim group % member %: %',
        v_match.group_id, v_match.user_id, sqlerrm;
    end;
  end loop;

  -- Every remaining trip placeholder matching this email — standalone trips
  -- (no group), or a trip-level placeholder independent of any group
  -- membership. Trips already re-parented via the group loop above no longer
  -- match (is_guest is now false), so there's no double-processing.
  for v_match in
    select trip_id, user_id
      from trip_members
      where is_guest = true
        and email is not null
        and lower(email) = lower(v_caller_email)
  loop
    begin
      perform claim_member_slot(v_match.trip_id, v_match.user_id);
    exception when others then
      raise warning 'merge_guest_records_for_new_user: failed to claim trip % member %: %',
        v_match.trip_id, v_match.user_id, sqlerrm;
    end;
  end loop;
end;
$$;

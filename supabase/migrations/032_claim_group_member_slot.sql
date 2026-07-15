-- Migration 032: extend guest-claiming to groups, and close a gap in the
-- existing trip-level claim_member_slot (it never re-parented split_requests,
-- so a claimed guest's recorded ledger payments silently stayed attributed to
-- the dead placeholder id).

-- ── claim_member_slot (trip) — add split_requests re-parenting ───────────────

create or replace function claim_member_slot(p_trip_id text, p_placeholder_user_id text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_caller_email text;
  v_placeholder_email text;
begin
  select email into v_caller_email
    from auth.users
    where id = auth.uid();

  select email into v_placeholder_email
    from trip_members
    where trip_id = p_trip_id and user_id = p_placeholder_user_id;

  if v_caller_email is null or v_placeholder_email is null
     or lower(v_caller_email) != lower(v_placeholder_email) then
    raise exception 'Email mismatch: cannot claim this member slot';
  end if;

  update trip_members
    set user_id = auth.uid()::text, is_guest = false
    where trip_id = p_trip_id and user_id = p_placeholder_user_id;

  update expenses
    set paid_by_user_id = auth.uid()::text
    where trip_id = p_trip_id and paid_by_user_id = p_placeholder_user_id;

  update splits
    set user_id = auth.uid()::text
    where user_id = p_placeholder_user_id
      and expense_id in (select id from expenses where trip_id = p_trip_id);

  update split_requests
    set payer_user_id = auth.uid()::text
    where trip_id = p_trip_id and payer_user_id = p_placeholder_user_id;

  update split_requests
    set requester_user_id = auth.uid()::text
    where trip_id = p_trip_id and requester_user_id = p_placeholder_user_id;
end;
$$;

-- ── claim_group_member_slot (group) ───────────────────────────────────────────
-- Merges a pre-added placeholder GroupMember into an authenticated user's
-- account. Cascades across everything the group spans: the group's own
-- membership row, every trip_members row in the group's trips, and every
-- expense/split/split_request reachable either directly (group_id) or via one
-- of the group's trips (trip_id) — groups have carried both kinds of expense
-- since the ledger rework, unlike when the trip-only claim function was written.

create or replace function claim_group_member_slot(p_group_id text, p_placeholder_user_id text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_caller_email text;
  v_placeholder_email text;
begin
  select email into v_caller_email
    from auth.users
    where id = auth.uid();

  select email into v_placeholder_email
    from group_members
    where group_id = p_group_id and user_id = p_placeholder_user_id;

  if v_caller_email is null or v_placeholder_email is null
     or lower(v_caller_email) != lower(v_placeholder_email) then
    raise exception 'Email mismatch: cannot claim this group member slot';
  end if;

  -- Re-parent the group membership row.
  update group_members
    set user_id = auth.uid()::text, is_guest = false
    where group_id = p_group_id and user_id = p_placeholder_user_id;

  -- Re-parent trip_members for every trip in this group.
  update trip_members
    set user_id = auth.uid()::text, is_guest = false
    where user_id = p_placeholder_user_id
      and trip_id in (select id from trips where group_id = p_group_id);

  -- Re-parent expenses paid by the placeholder — both direct group expenses
  -- and expenses on one of the group's trips.
  update expenses
    set paid_by_user_id = auth.uid()::text
    where paid_by_user_id = p_placeholder_user_id
      and (
        group_id = p_group_id
        or trip_id in (select id from trips where group_id = p_group_id)
      );

  -- Re-parent splits assigned to the placeholder, across both expense kinds.
  update splits
    set user_id = auth.uid()::text
    where user_id = p_placeholder_user_id
      and expense_id in (
        select id from expenses
        where group_id = p_group_id
           or trip_id in (select id from trips where group_id = p_group_id)
      );

  -- Re-parent ledger split_requests where the placeholder was payer or payee —
  -- both direct group-scoped requests and requests on one of the group's trips.
  update split_requests
    set payer_user_id = auth.uid()::text
    where payer_user_id = p_placeholder_user_id
      and (
        group_id = p_group_id
        or trip_id in (select id from trips where group_id = p_group_id)
      );

  update split_requests
    set requester_user_id = auth.uid()::text
    where requester_user_id = p_placeholder_user_id
      and (
        group_id = p_group_id
        or trip_id in (select id from trips where group_id = p_group_id)
      );
end;
$$;

-- ── RLS: allow self-insert into group_members ─────────────────────────────────
-- Today group_members can only be written by the group owner ("group owner can
-- manage memberships", FOR ALL). Joining a group via invite link needs a
-- brand-new (non-placeholder-match) member to insert their own row, mirroring
-- trip_members' existing "owner or self can insert" policy. This is additive —
-- Postgres OR's multiple permissive policies together, so the owner's existing
-- write access is unaffected.

create policy "group_members: owner or self can insert"
  on group_members for insert
  with check (user_id = auth.uid()::text);

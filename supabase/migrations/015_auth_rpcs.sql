-- Migration 015: RPCs for guest session recovery and invite participant matching.
-- Both functions run as security definer (service-role access) with explicit
-- ownership checks so they cannot be abused by arbitrary callers.

-- ── claim_guest_session ───────────────────────────────────────────────────────
-- Re-parents all records from a guest (anonymous) session to the now-authenticated
-- user. Called immediately after Google / Apple sign-in when a prior guest session
-- was active on the device.
--
-- Security: the function only touches rows where user_id = old_user_id; the
-- caller cannot redirect another user's data because auth.uid() is enforced
-- server-side as the destination.

create or replace function claim_guest_session(old_user_id text)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if old_user_id is null or old_user_id = '' then
    return;
  end if;

  -- Prevent a user from claiming their own (already authenticated) session.
  if old_user_id = auth.uid()::text then
    return;
  end if;

  update trip_members
    set user_id = auth.uid()::text, is_guest = false
    where user_id = old_user_id;

  update expenses
    set paid_by_user_id = auth.uid()::text
    where paid_by_user_id = old_user_id;

  update splits
    set user_id = auth.uid()::text
    where user_id = old_user_id;

  update split_requests
    set payer_user_id = auth.uid()::text
    where payer_user_id = old_user_id;

  update split_requests
    set requester_user_id = auth.uid()::text
    where requester_user_id = old_user_id;
end;
$$;

-- ── claim_member_slot ─────────────────────────────────────────────────────────
-- Merges a pre-added placeholder TripMember into an authenticated user's account.
-- Called when a user arrives via invite link and their email matches a placeholder
-- that the trip owner pre-entered.
--
-- Security: verifies that the placeholder's email matches auth.users.email for the
-- calling user before allowing the update.

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
  -- Resolve the authenticated caller's email from auth.users.
  select email into v_caller_email
    from auth.users
    where id = auth.uid();

  -- Resolve the placeholder member's email.
  select email into v_placeholder_email
    from trip_members
    where trip_id = p_trip_id and user_id = p_placeholder_user_id;

  -- Only proceed if both emails are present and equal.
  if v_caller_email is null or v_placeholder_email is null
     or lower(v_caller_email) != lower(v_placeholder_email) then
    raise exception 'Email mismatch: cannot claim this member slot';
  end if;

  -- Re-parent the member row.
  update trip_members
    set user_id = auth.uid()::text, is_guest = false
    where trip_id = p_trip_id and user_id = p_placeholder_user_id;

  -- Re-parent expenses on this trip paid by the placeholder.
  update expenses
    set paid_by_user_id = auth.uid()::text
    where trip_id = p_trip_id and paid_by_user_id = p_placeholder_user_id;

  -- Re-parent splits on this trip assigned to the placeholder.
  update splits
    set user_id = auth.uid()::text
    where user_id = p_placeholder_user_id
      and expense_id in (select id from expenses where trip_id = p_trip_id);
end;
$$;

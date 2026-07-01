# Guest-to-User Merge — Design & Implementation Plan

## Status key
- [ ] not started
- [~] in progress
- [x] done

---

## Background

Guests are participants added to a group or trip without a real Supabase auth account.
They are stored with a `userId` prefixed `guest_<uuid>` and an optional `email` / `phone`.

The goal is to let those guest rows be "claimed" by a real user account once that
person signs up or logs in — migrating all their financial history (expenses, splits)
without any data loss.

---

## What already exists (trip-level pipeline — complete)

- `useAddGroupMember` captures `email` and `phone` when adding a guest to a group
- `trip_members.email` is persisted alongside the guest row
- `IMemberRepository.findMemberByEmail` finds a placeholder by email on a given trip
- `IMemberRepository.claimMemberSlot` re-parents a placeholder to a real user
- `useJoinTrip.joinAuthenticated` calls both automatically when a user joins via invite link
- DB RPC `claim_member_slot` (migration 015) does the re-parenting transactionally:
  - updates `trip_members.user_id`
  - updates `expenses.paid_by_user_id`
  - updates `splits.user_id`
  — all in one statement block, so no orphaned financial data is possible

The trip side works end-to-end for the email-based merge flow today.

---

## What is missing

There is no equivalent at the **group** level:
- No `claimGroupMemberSlot` DB function
- No group-level merge in the join-group hook
- No cascade from group → its trips → their expenses/splits
- No UX for guests who were added with name only (no email)
- No global auto-merge that fires when a user signs up for the first time

---

## The three scenarios

### Scenario 1 — Guest has email stored (most common)
Owner adds Jay as a guest and enters `jay@email.com`.
Jay later downloads the app and signs up.
System can match and merge automatically — same email-based flow as trips, extended to groups.

### Scenario 2 — Guest has no email (added by name only)
Owner added "Jay" with no contact info. No automatic path is possible.
Fix: UX affordance for the owner to enter an email and send Jay a personal invite link,
which then collapses into Scenario 1 once Jay taps it.

### Scenario 3 — Auto-merge at first login across everything
When a brand-new user signs in, scan all `group_members` and `trip_members` where
`email = new_user.email` across every group and trip they were ever pre-added to,
and merge all of them in one go — no user action required.

---

## Chunk A — Close the gap for groups  [ ]

**Scope:** ~1 day. Low risk. Direct port of the trip pattern.

### A1 — DB migration: `claim_group_member_slot` RPC  [ ]

New migration file `028_claim_group_member_slot.sql`.

The function must be SECURITY DEFINER (like `claim_member_slot`) so it can update
rows on behalf of the calling user without hitting RLS.

Logic (plain SQL, not in a code block):

    CREATE OR REPLACE FUNCTION claim_group_member_slot(
      p_group_id            text,
      p_placeholder_user_id text
    )
    RETURNS void
    LANGUAGE plpgsql
    SECURITY DEFINER
    SET search_path = public
    AS $$
    DECLARE
      v_caller_email      text;
      v_placeholder_email text;
    BEGIN
      SELECT email INTO v_caller_email
        FROM auth.users WHERE id = auth.uid();

      SELECT email INTO v_placeholder_email
        FROM group_members
        WHERE group_id = p_group_id AND user_id = p_placeholder_user_id;

      IF v_caller_email IS NULL OR v_placeholder_email IS NULL
         OR lower(v_caller_email) != lower(v_placeholder_email) THEN
        RAISE EXCEPTION 'Email mismatch: cannot claim this group member slot';
      END IF;

      -- Re-parent the group member row
      UPDATE group_members
        SET user_id = auth.uid()::text, is_guest = false
        WHERE group_id = p_group_id AND user_id = p_placeholder_user_id;

      -- Re-parent trip_members for every trip in this group
      UPDATE trip_members
        SET user_id = auth.uid()::text, is_guest = false
        WHERE user_id = p_placeholder_user_id
          AND trip_id IN (SELECT id FROM trips WHERE group_id = p_group_id);

      -- Re-parent expenses paid by the placeholder across those trips
      UPDATE expenses
        SET paid_by_user_id = auth.uid()::text
        WHERE paid_by_user_id = p_placeholder_user_id
          AND trip_id IN (SELECT id FROM trips WHERE group_id = p_group_id);

      -- Re-parent splits assigned to the placeholder across those trips
      UPDATE splits
        SET user_id = auth.uid()::text
        WHERE user_id = p_placeholder_user_id
          AND expense_id IN (
            SELECT e.id FROM expenses e
            JOIN trips t ON e.trip_id = t.id
            WHERE t.group_id = p_group_id
          );
    END;
    $$;

### A2 — Interface: add `claimGroupMemberSlot` to `IGroupRepository`  [ ]

File: `src/core/interfaces/IGroupRepository.ts`

Add method:

    claimGroupMemberSlot(
      groupId:            string,
      placeholderUserId:  string,
    ): Promise<Result<GroupMember, AppError>>;

### A3 — Production impl: `SupabaseGroupRepository.claimGroupMemberSlot`  [ ]

File: `src/infrastructure/supabase/SupabaseGroupRepository.ts`

    async claimGroupMemberSlot(groupId, placeholderUserId) {
      const { error } = await supabase.rpc('claim_group_member_slot', {
        p_group_id:            groupId,
        p_placeholder_user_id: placeholderUserId,
      });
      if (error) return err(toAppError(error, 'GroupMember', placeholderUserId));

      // Fetch the newly-updated row to return to the caller
      const { data, error: fetchError } = await supabase
        .from('group_members')
        .select()
        .eq('group_id', groupId)
        .eq('user_id', '<auth.uid() — pass as param or re-read>')
        .single();
      if (fetchError || !data) return err(...);
      return rowToGroupMember(data);
    }

### A4 — Mock impl: `InMemoryGroupRepository.claimGroupMemberSlot`  [ ]

File: `src/__mocks__/InMemoryGroupRepository.ts`

Mirror the email-check + re-parent logic using the in-memory maps.
The mock must also update any `TripMember` rows held by the test container's
`InMemoryMemberRepository` that belong to trips in this group — or accept a
`memberRepo` dependency if needed for the cascade.

### A5 — Hook: extend join-group flow to trigger group claim  [ ]

Find (or create) the hook that handles joining a group via invite token.
After the user is confirmed as signed in, check if any `group_members` row
for this group has `email = user.email`. If so, call `claimGroupMemberSlot`
instead of `addMember`.

Pattern (mirrors `useJoinTrip` lines 68–86):

    if (user.email) {
      const match = await groupRepo.findMemberByEmail(group.id, user.email);
      if (match) {
        await groupRepo.claimGroupMemberSlot(group.id, match.userId);
        // reload group in store
        return;
      }
    }
    // fall through to addMember as before

Requires adding `findMemberByEmail` to `IGroupRepository` (parallel to the trip version).

### A6 — Tests  [ ]

- Unit test for `InMemoryGroupRepository.claimGroupMemberSlot`: email mismatch rejects,
  email match updates `userId`, `isGuest` flips to false
- Integration-style test for the join-group hook: pre-seed a guest with email, sign in
  with matching email, verify the guest row is claimed and not duplicated

---

## Chunk B — Auto-merge at first login  [ ]

**Scope:** ~2 days. Medium risk (multi-table cascade, needs thorough testing).

When a brand-new user account is created in Supabase, scan all `group_members` and
`trip_members` where `email = new_user.email` and merge every one of them.

### B1 — DB function: `merge_guest_records_for_new_user`  [ ]

New migration. SECURITY DEFINER function that:

1. Finds all `group_members` rows where `email = p_email` (the new user's email)
2. For each, runs the same cascade as `claim_group_member_slot`:
   - updates `group_members.user_id`
   - updates all `trip_members` in that group
   - updates `expenses` and `splits` for those trips
3. Also handles standalone trips (trips with no `group_id`):
   - finds `trip_members` where `email = p_email` directly
   - re-parents `trip_members`, `expenses`, `splits` for each

The function should be idempotent — safe to call multiple times with the same email.

### B2 — Trigger point: Supabase Auth webhook or DB trigger  [ ]

Two options:

**Option A — Supabase Edge Function on `USER_CREATED` webhook (preferred)**
- Register a webhook in Supabase dashboard (Auth → Hooks → User Created)
- Edge Function calls `merge_guest_records_for_new_user(new_user.email, new_user.id)`
- Pros: runs server-side, no client involvement, fires once on account creation
- Cons: requires deploying an Edge Function

**Option B — DB trigger on `auth.users INSERT`**
- `AFTER INSERT ON auth.users` trigger calls the merge function
- Pros: fully in the DB, no Edge Function
- Cons: triggers on `auth.users` require elevated permissions and are fragile to
  Supabase internals; generally not recommended

Recommendation: Edge Function.

### B3 — Tests  [ ]

- Seed multiple groups and standalone trips with guest rows sharing an email
- Simulate new user creation (call the merge function directly in test)
- Assert all `group_members`, `trip_members`, `expenses`, `splits` are re-parented
- Assert idempotency: running again changes nothing

---

## Chunk C — UX for guests with no email  [ ]

**Scope:** ~1 day. Low risk (UI over existing infrastructure after Chunk A).

### C1 — "Unlinked members" indicator in group detail  [ ]

In `app/group/[id].tsx`, guests who are still `isGuest: true` (not yet claimed)
show a small indicator — a dashed ring on the avatar or a "·" badge.

Only visible to the group owner.

### C2 — "Send invite" action per unlinked guest  [ ]

Owner taps an unlinked guest avatar (or a context menu on the member row).
A bottom sheet appears with:
- Guest's current display name
- Email field (pre-filled if stored, empty if not)
- "Send invite" button

If email is new, save it to `group_members.email` first (needs an `updateMemberEmail`
method or inline `UPDATE`). Then generate a one-time invite link scoped to that guest
using an existing or new token column on `group_members`.

When the guest taps the link → signs in → Chunk A email-match fires automatically.

### C3 — "Claim my spot" prompt on first login  [ ]

If auto-merge (Chunk B) is not yet implemented, show a one-time prompt after first
login: "Were you added to any groups or trips before signing up? Enter the email used
to find your history." Triggers a client-side call to a search RPC and surfaces matches
for the user to confirm before merging.

This is a fallback — if Chunk B is shipped, this prompt is never needed.

---

## Complexity summary

| Chunk | Scope     | Risk   | Dependencies     |
|-------|-----------|--------|------------------|
| A — Group claiming | ~1 day | Low | none (port of trip pattern) |
| B — Auto-merge on signup | ~2 days | Medium | A (uses same cascade logic) |
| C — No-email UX | ~1 day | Low | A (sends invite → Chunk A claim) |

**Recommended order:** A → C → B.
A closes the functional gap, C delivers the UX for the hard case, B makes the whole
thing transparent to the user so they never have to take any action at all.

---

## Key invariants to preserve throughout

- Every re-parent operation must be atomic — partial updates leave orphaned financial data
- The email check in all SECURITY DEFINER functions must be case-insensitive
- A claimed slot must flip `is_guest = false` — never leave a real user marked as guest
- Merging must be idempotent — duplicate calls must be safe
- A guest can appear in multiple groups and trips; Chunk B must handle all of them in one pass

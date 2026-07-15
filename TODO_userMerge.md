# Guest-to-User Merge — Design & Implementation Plan

## Status key
- [ ] not started
- [~] in progress
- [x] done

---

## Re-analysis (2026-07-15) — what changed since this doc was written

This doc predates the Phase 4 ongoing-settlement-ledger rework. Re-reading the
current codebase before starting Chunk A surfaced five real differences from
what's written below — the scenarios, invariants, and overall ordering still
hold, but the specifics changed:

1. **No group "join via invite link" flow existed at all.** `Group.inviteToken`
   and `getGroupByInviteToken` already existed, but there was no route, no
   screen, no hook, and `group_members` writes were **owner-only** at the RLS
   level (trip_members has always had a "owner or self can insert" policy;
   group_members never did). Chunk A below was rewritten to build this from
   scratch, not just port the trip pattern's hook logic.
2. **The existing, already-shipped trip-level `claim_member_slot` RPC had a
   real bug**: it never re-parented `split_requests` (didn't exist in its
   current ledger-aware form when this doc was written), so a claimed guest's
   recorded payments silently stayed attributed to the dead placeholder id.
   Fixed in the same migration as the group work, since the group RPC needed
   the exact same `split_requests` re-parenting logic anyway.
3. **Groups now have direct expenses** (`Expense.groupId` with no `tripId`),
   not just expenses reached through a trip in the group — the original SQL
   sketch below only walked `trip_id IN (SELECT id FROM trips WHERE group_id =
   ...)`, which would have silently skipped them. Fixed in the shipped
   migration.
4. **Migration numbering was stale** — `028` was already taken
   (`028_users_email_canonical.sql`); the real migration shipped as `032`.
5. **No auth-lifecycle webhook infrastructure exists** for Chunk B's "fires on
   first login" idea — still true, not addressed by Chunk A's work below.

**Chunk A shipped 2026-07-15** with this redesign folded in (see the chunk
below for exactly what was built). **Chunks B and C are still not started.**

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

## Chunk A — Close the gap for groups  [x]

**Actual scope: significantly larger than the original "~1 day, direct port"
estimate** — no group join-via-link flow existed at all (see re-analysis
above), so this chunk also had to build that from scratch, not just the
claim/merge plumbing. Shipped 2026-07-15.

### A1 — DB migration: `claim_group_member_slot` RPC  [x]

Shipped as `supabase/migrations/032_claim_group_member_slot.sql` (not `028` —
see re-analysis above). Differs from the original sketch below in three ways:
it also fixes the trip-level `claim_member_slot` to re-parent `split_requests`
(a pre-existing bug, not part of the original ask, fixed here since the same
logic was needed for groups anyway); it re-parents expenses/splits/
split_requests reached **either directly via `group_id` or via one of the
group's trips** (`trip_id`), not just the latter; and it adds a new
`"group_members: owner or self can insert"` RLS policy (additive, alongside
the existing owner-only policy) so a brand-new member can self-insert when
joining, mirroring `trip_members`' existing policy. The original sketch below
is kept for the historical record of what was originally planned.

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

### A2 — Interface: add `claimGroupMemberSlot` to `IGroupRepository`  [x]

Shipped in `src/core/interfaces/IGroupRepository.ts`, alongside
`findMemberByEmail` (both were needed together, not as separate follow-ups).
Signature matches trip's `claimMemberSlot` exactly — takes `newUserId` and
`newDisplayName` too (the original sketch above omitted these; the RPC itself
doesn't set display name, a separate client-side `UPDATE` does, mirroring
`SupabaseMemberRepository.claimMemberSlot`'s exact pattern).

### A3 — Production impl: `SupabaseGroupRepository.claimGroupMemberSlot`  [x]

Shipped, mirroring `SupabaseMemberRepository.claimMemberSlot`'s real pattern
(RPC call, then a separate `.update({ display_name })` keyed on the new user's
id — not the placeholder-fetch-and-guess shown in the original sketch above).

### A4 — Mock impl: `InMemoryGroupRepository.claimGroupMemberSlot`  [x]

Shipped, mirroring `InMemoryMemberRepository.claimMemberSlot`'s actual
(simpler than originally sketched) pattern: it only re-parents the
`GroupMember` row itself in the mock's own map. It does **not** cascade into
expense/split/split_request mocks — checked the existing trip-level mock
first, and it doesn't either; the expense/split/split_request cascade is only
real in the production RPC and untested at the mock level, consistent with
how the trip side has always worked. Not a gap introduced here.

### A5 — Hook + screen + route: group join-via-invite-link flow  [x]

**Expanded from the original ask** — re-analysis found no group join flow
existed at all (see top of doc), so this became "build one," not just "wire
a claim call into an existing hook":
- `src/features/groups/hooks/useJoinGroup.ts` — new, mirrors `useJoinTrip`
  exactly (token resolution, `joinAuthenticated` with email-match claim vs.
  fresh `addMember`, idempotency re-check against the repo rather than the
  hook's own possibly-stale snapshot).
- `src/features/groups/screens/JoinGroupScreen.tsx` — new, mirrors `JoinScreen`.
- `app/group/join/[token].tsx` — new route.
- `group_members` gained a self-insert RLS policy (see A1) so a brand-new
  member can actually complete the non-claim path.
- Reachability: added `shareGroup` to `IShareService`/`NativeShareService`/
  `MockShareService`, and a "Share invite link" button on
  `app/group/add-member.tsx` (gated on the group having an `inviteToken`) —
  without this there was no way to actually get a link to test the flow with
  end-to-end. Deliberately minimal — no new dedicated "invite" screen the way
  trips have one; that's Chunk C's territory (per-guest invite UX) if wanted.

### A6 — Tests  [x]

- `InMemoryGroupRepository.test.ts`: `findMemberByEmail` (case-insensitive
  match, no-match → null) and `claimGroupMemberSlot` (re-parents + flips
  `isGuest`, `NotFoundError` for an unknown placeholder)
- `useJoinGroup.test.ts` / `useJoinGroup.emailMatch.test.ts`: token resolution,
  `joinAuthenticated` (fresh join, auth-required, idempotency), full
  email-match suite mirroring `useJoinTrip.emailMatch.test.ts` (merges into
  placeholder, doesn't keep the old placeholder id, adds fresh when no
  placeholder, doesn't cross-claim on a different email, idempotent on
  re-join)
- `JoinGroupScreen.test.tsx`: error state, sign-in prompt, join-and-navigate
- `NativeShareService.test.ts` + `add-member.test.tsx`: `shareGroup` message
  content, button visibility gated on `inviteToken`

Verified: full suite green and stable across repeated runs (1035/1035),
typechecked clean (diffed against a pre-merge baseline — the handful of new
"errors" are the same class of pre-existing gap already present elsewhere in
the same files, e.g. stale generated Supabase types affecting every
insert/update/rpc call in `SupabaseGroupRepository.ts`), lint clean.

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

| Chunk | Scope     | Risk   | Dependencies     | Status |
|-------|-----------|--------|------------------|--------|
| A — Group claiming | Larger than ~1 day estimated — no join-link flow existed, had to be built from scratch | Low | none (port of trip pattern) | **Done 2026-07-15** |
| B — Auto-merge on signup | ~2 days | Medium | A (uses same cascade logic) | Not started |
| C — No-email UX | ~1 day | Low | A (sends invite → Chunk A claim) | Not started |

**Recommended order:** A → C → B.
A closes the functional gap, C delivers the UX for the hard case, B makes the whole
thing transparent to the user so they never have to take any action at all.

**Next up: Chunk C.** With A's join flow and RLS policy now in place, C1's
"unlinked members" indicator and C2's per-guest "send invite" bottom sheet
are UI work over infrastructure that already exists — no new DB migration
needed. B still has no auth-webhook infrastructure to build on (see
re-analysis above) and is the larger, riskier piece; C is the natural next
step per the doc's own original ordering.

---

## Key invariants to preserve throughout

- Every re-parent operation must be atomic — partial updates leave orphaned financial data
- The email check in all SECURITY DEFINER functions must be case-insensitive
- A claimed slot must flip `is_guest = false` — never leave a real user marked as guest
- Merging must be idempotent — duplicate calls must be safe
- A guest can appear in multiple groups and trips; Chunk B must handle all of them in one pass

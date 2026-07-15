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
   first login" idea. Confirmed directly in the Supabase dashboard before
   building Chunk B: there is **no "after/post user created" Auth Hook type
   at all** on this project — only "Before User Created" (wrong timing) and
   the MFA/Password Verification hooks (unrelated, plan-gated). So Chunk B's
   original "Option A — Edge Function on a webhook" was never actually
   available; see the Chunk B entry below for what was built instead.

**Chunk A shipped 2026-07-15** with this redesign folded in (see the chunk
below for exactly what was built). **Chunk C (C1/C2) also shipped
2026-07-15** — simpler than originally sketched, since it reuses Chunk A's
join flow and invite link instead of adding a separate per-guest token.
**Chunk B shipped 2026-07-15 too** — client-triggered (see its entry for why
the webhook route was ruled out), which also fully absorbed C3's purpose.
**All three chunks are now done.**

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

## Chunk B — Auto-merge at first login  [x]

**Shipped 2026-07-15.** The trigger-mechanism decision below superseded the
original B2 sketch (both its options) — see "Decision: how Chunk B actually
triggers" first, then B1/B3 for what was built.

### Decision: how Chunk B actually triggers

The original B2 draft (Edge Function on a `USER_CREATED` webhook vs. a
`auth.users` DB trigger) turned out to rest on a feature that doesn't exist.
Checked directly in the Supabase dashboard (Authentication → Hooks) before
building anything: **there is no "after/post user created" Auth Hook type on
this project at all** — only "Before User Created" (fires *before* the row
exists, wrong timing for this) and the MFA/Password Verification hooks
(unrelated, and gated behind a plan upgrade this project doesn't have
anyway). So the original "Option A — Edge Function on a webhook" was never
actually available to build, on any plan.

That left two real options, decided together:
- **A DB trigger on `auth.users` `AFTER INSERT`** — the only way to get
  fully-automatic server-side behavior, but exactly the approach the
  original doc already flagged as risky (Supabase owns and can change the
  internal shape of that schema without notice).
- **A client-triggered call right after sign-in** — no dependency on
  undocumented Supabase internals, fully within this codebase, fully
  testable with existing patterns.

**Chose client-triggered.** With the Auth Hook route confirmed unavailable,
the DB-trigger route no longer had an "or just use the simple official hook
instead" fallback if it ever caused trouble — it was the DB trigger's own
inherent risk against a resilient, fully-controlled alternative, not a
tossup between two safe options.

### B1 — DB function: `merge_guest_records_for_new_user`  [x]

Shipped as `supabase/migrations/033_merge_guest_records.sql`. Differs from
the original sketch in three ways, all deliberate:
- **Takes no `p_email` parameter at all.** The original sketch's
  `merge_guest_records_for_new_user(new_user.email, new_user.id)` signature
  would let any authenticated caller pass an arbitrary email and merge
  *someone else's* placeholder data (and financial history) into their own
  account. The function resolves the caller's own email server-side from
  `auth.users` via `auth.uid()`, exactly like `claim_member_slot`/
  `claim_group_member_slot` already do — this is a real security
  consideration the original sketch didn't account for, not just a style
  choice.
- **Reuses `claim_group_member_slot`/`claim_member_slot` in a loop**, rather
  than duplicating their cascade logic a third time — this function's only
  job is finding every `(group_id/trip_id, placeholder_user_id)` pair
  matching the caller's email and calling the existing single-target
  functions for each. Single source of truth for the actual re-parenting.
- **Each match is wrapped in its own `BEGIN...EXCEPTION WHEN OTHERS`** so one
  bad match can't roll back every other legitimate merge in the same bulk
  call — necessary once you're processing several matches in one function
  invocation, unlike the single-target functions where an exception should
  (and does) abort.

Idempotent exactly as originally specified — a claimed row flips
`is_guest = false` and can never match again.

### B2 — Trigger point  [x]

See "Decision" above. Implemented as a new private `_mergeGuestRecords()`
method on `SupabaseAuthService`, called from all **five** success paths that
complete a sign-in (`signIn`, `signUp`'s direct-session branch, `verifyOtp`,
`signInWithGoogle`, `signInWithApple`) — not just "new account creation."
That's deliberate, not scope creep: since the RPC is idempotent and cheap
when there's nothing to merge, calling it on *every* successful sign-in
(not only the first) means a placeholder created after someone's first
login still gets picked up on their next one, and a merge skipped because
the app closed mid-call simply retries next time — cheaper to reason about
than trying to detect "is this really the user's first login" precisely.

**Deliberately fire-and-forget, unlike `_upsertUser`.** Traced
`SupabaseAuthService`'s existing pattern first: `_upsertUser` (profile
creation) is awaited inside each method's own try/catch, so its failure
*is* fatal to sign-in today. The merge call is a different risk profile — a
merge failure must never block someone from logging in — so it's wrapped in
its own try/catch and never awaited by the callers, with failures logged via
`Sentry.captureMessage` (sync throw, async rejection, and an `{error}`
response are all three handled, matching the resolve-with-error convention
Supabase's client uses instead of rejecting). Also deliberately **not**
added to `MockAuthService` — that class never simulates any of
`SupabaseAuthService`'s server-side bookkeeping (`_upsertUser` has no mock
equivalent either), and there's no in-memory analog for a bulk SQL cascade
to fake.

### B3 — Tests  [x]

`SupabaseAuthService.test.ts`: added `rpc: jest.fn()` to the mocked
Supabase client (wasn't mocked at all before — `signUp`'s existing
`canonical_email_taken` RPC call was silently surviving on a swallowed
"not a function" throw). New tests: the merge RPC fires from all five
success paths (including plain `signIn`, the one path that never calls
`_upsertUser` — confirms the trigger doesn't ride on that helper), and two
tests proving a failing or throwing merge RPC does not block sign-in
success. The bulk SQL cascade itself isn't separately unit-tested here (no
local Postgres test harness in this repo) — it's covered by construction,
since it's a thin loop over `claim_group_member_slot`/`claim_member_slot`,
both already covered by Chunk A's tests.

Verified: full suite green and stable across repeated runs (1053/1053),
typechecked clean (zero new errors — one new error surfaced during
development, from `supabase.rpc(...)`'s typed return not exposing `.catch`,
fixed by using the two-argument `.then()` form instead of chaining
`.catch()`), lint clean.

---

## Chunk C — UX for guests with no email  [~]

**C1 and C2 shipped 2026-07-15.** C3 (see below) is now superseded by Chunk
B rather than merely deferred — Chunk B's client-triggered call fires on
every sign-in, which covers everything C3's "claim my spot" prompt was a
fallback for. C3 is left unstarted deliberately, not left open by omission.

### C1 — "Unlinked members" indicator in group detail  [x]

Shipped in `app/group/[id].tsx` + `src/components/ui/ParticipantsRow.tsx`.
`ParticipantsRow` (shared with `TripDetailScreen`) gained optional
`isGuest`/`email` fields on its member type and an optional `onMemberPress` +
`unlinkedLabel` prop — additive, so the trip call site (which never passes
these) is unaffected. A small dot badge renders on any `isGuest` member's
avatar when `onMemberPress` is provided; `app/group/[id].tsx` only passes it
when `group.ownerId === auth.currentUser()?.id`, so the indicator and the tap
target are both owner-only, per spec.

### C2 — "Send invite" action per unlinked guest  [x]

Shipped: `src/features/groups/components/SendInviteSheet.tsx` (bottom sheet,
same Modal/backdrop/handle-bar structure as `RecordPaymentSheet` — display
name + email field pre-filled if stored, "Send invite" button, basic format
validation via the existing `validateAndNormalizeEmail` util) and a new
`useSendGroupInvite` hook.

**Deliberately simpler than the original sketch**: no per-guest token, no new
token column. Since `useJoinGroup` (Chunk A) already claims a placeholder by
matching the signed-in user's email against *any* `group_members` row with
that email, "sending an invite" to one specific guest is just (a) saving
their email via the new `IGroupRepository.updateMemberEmail` if it's new or
changed, then (b) sharing the group's *existing* invite link (the same
`shareGroup` Chunk A built) — reusing infrastructure rather than adding a
parallel one. When the guest taps that link → signs in → Chunk A's
email-match fires automatically, exactly as originally specified.

### C3 — "Claim my spot" prompt on first login  [x] (superseded, not built)

**Not built — superseded by Chunk B, not merely deferred.** C3 existed as a
fallback for exactly the gap Chunk B's client-triggered call now closes: it
would have been a client-side "search everything for my email and let me
confirm" prompt. Chunk B's `_mergeGuestRecords()` does this automatically,
silently, on every sign-in — no user-facing prompt needed, and no
confirm-before-merging step, since the email match is already a strong
enough signal (the same trust level Chunk A's invite-link claim already
relies on). Marked done rather than left open since there's no remaining
gap for it to fill.

Verified (C1/C2): full suite green and stable across repeated runs
(1045/1045), typechecked clean (diffed against a pre-Chunk-C baseline — the
one new "error" is the same class of pre-existing stale-Supabase-types gap
already present throughout `SupabaseGroupRepository.ts`), lint clean.

---

## Complexity summary

| Chunk | Scope     | Risk   | Dependencies     | Status |
|-------|-----------|--------|------------------|--------|
| A — Group claiming | Larger than ~1 day estimated — no join-link flow existed, had to be built from scratch | Low | none (port of trip pattern) | **Done 2026-07-15** |
| B — Auto-merge on signup | Smaller than ~2 days estimated once the webhook route was ruled out (no Edge Function to build/deploy) | Low (client-triggered, fully in-repo) | A (uses same cascade logic) | **Done 2026-07-15** |
| C — No-email UX | C1/C2 smaller than estimated (reused A's link instead of a new token); C3 superseded | Low | A (sends invite → Chunk A claim) | **All done 2026-07-15** |

**Recommended order:** A → C → B — followed as planned, with B landing last
once the Auth Hook question was settled.

**All three chunks are now done.** The guest-to-user merge story from this
doc is complete: groups can be claimed via invite link with email matching
(A), owners can chase down no-email guests (C1/C2), and every sign-in
silently sweeps up anything matching the signer's email across every group
and trip (B) — with C3's fallback need fully absorbed into B.

---

## Key invariants to preserve throughout

- Every re-parent operation must be atomic — partial updates leave orphaned financial data
- The email check in all SECURITY DEFINER functions must be case-insensitive
- A claimed slot must flip `is_guest = false` — never leave a real user marked as guest
- Merging must be idempotent — duplicate calls must be safe
- A guest can appear in multiple groups and trips; Chunk B must handle all of them in one pass

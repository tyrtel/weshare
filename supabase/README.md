# Supabase — Database & RLS Reference

This document describes every table, its Row Level Security (RLS) policies, and what each policy protects. It also explicitly confirms the two access-model invariants that client-side guards depend on for defence-in-depth.

---

## Access model summary

All tables have RLS enabled. Unauthenticated requests are rejected at the database level. The service-role key (used only by Edge Functions) bypasses RLS; everything else uses the anon key with `auth.uid()`.

---

## Tables

### `users`

Mirrors `auth.users`. One row per registered user.

| Operation | Policy | Rule |
|-----------|--------|------|
| SELECT | `users: read own row` | `auth.uid() = id` |
| INSERT | `users: insert own row` | `auth.uid() = id` |
| UPDATE | `users: update own row` | `auth.uid() = id` |
| DELETE | *(none)* | Users cannot delete their own account via the client |

**What it protects:** Prevents any authenticated user from reading or modifying another user's profile row.

---

### `trips`

One row per trip. `owner_id` is set at creation and never changes.

| Operation | Policy | Rule |
|-----------|--------|------|
| SELECT | `trips: members can read` | Caller is the owner, OR exists in `trip_members` for this trip |
| INSERT | `trips: owner can insert` | `owner_id = auth.uid()` |
| UPDATE | `trips: owner can update` | `owner_id = auth.uid()` |
| DELETE | `trips: owner can delete` | `owner_id = auth.uid()` |

**What it protects:**
- Non-members cannot see trips they have not joined.
- Only the trip owner can rename, change currency, or update the `status` column (active / settling / closed). The client-side `ClosedTripGuard` is a UX convenience; the DB enforces this independently.

> **Verified invariant:** "Only the trip owner can update trip status."  
> The `trips: owner can update` policy gates all UPDATE operations on `owner_id = auth.uid()`. There is no separate column-level bypass. ✅

---

### `trip_members`

Join table linking users to trips.

| Operation | Policy | Rule |
|-----------|--------|------|
| SELECT | `trip_members: members can read` | Caller is the trip owner, OR is already a member of the trip |
| INSERT | `trip_members: owner or self can insert` | `user_id = auth.uid()` (self-join via invite link) OR caller is trip owner |
| UPDATE | `trip_members: member can update own row` | `user_id = auth.uid()`; `WITH CHECK` prevents changing `trip_id` or `user_id` |
| DELETE | `trip_members: owner can delete` | Caller is the trip owner |

**What it protects:**
- A user outside a trip cannot enumerate its members.
- Members can update their own display name, phone, and email but cannot reassign their row to a different trip or impersonate another user.
- Only the owner can remove members.

---

### `expenses`

One row per expense within a trip.

| Operation | Policy | Rule |
|-----------|--------|------|
| SELECT | `expenses: members can read` | Caller is the trip owner, OR is in `trip_members` for `trip_id` |
| INSERT | `expenses: members can insert` | Caller is in `trip_members` for `trip_id`, OR is the trip owner |
| UPDATE | `expenses: payer or owner can update` | `paid_by_user_id = auth.uid()` OR caller is trip owner |
| DELETE | `expenses: payer or owner can delete` | `paid_by_user_id = auth.uid()` OR caller is trip owner |

**What it protects:**
- A user who is not a member of a trip receives zero rows for that trip's expenses — even if they somehow know an expense `id`.
- Editing or deleting an expense is restricted to the person who paid or the trip owner.

> **Verified invariant:** "A member can only read expenses for trips they belong to."  
> The `expenses: members can read` SELECT policy requires the caller to appear in `trip_members.user_id` for the expense's `trip_id` (or be the owner). There is no catch-all read policy. ✅

---

### `splits`

One row per (expense, user) share of an expense.

| Operation | Policy | Rule |
|-----------|--------|------|
| SELECT | `splits: members can read` | Caller is the trip owner, OR is in `trip_members`, resolved via `expenses → trips` join |
| INSERT | `splits: payer can insert` | Caller is the expense payer (`paid_by_user_id`) OR the trip owner |
| UPDATE | *(none — dropped in migration 008)* | Client cannot update split rows directly |
| DELETE | `splits: payer or owner can delete` | Expense payer OR trip owner |

**What it protects:**
- Members cannot read splits for trips they do not belong to.
- The UPDATE policy was intentionally dropped (SEC-3, migration 008): settlement must only occur through the `stripe-webhook` and `ob-webhook` Edge Functions, which run under the service-role key and bypass RLS. Allowing direct client-side updates would let any member bypass the payment flow and mark debts settled without payment.

---

### `split_requests`

Tracks the lifecycle of a payment request (created → request_sent → pending/authorized → completed/declined/expired).

| Operation | Policy | Rule |
|-----------|--------|------|
| SELECT | `members can view trip split requests` | Caller is in `trip_members` for `trip_id`, OR is the trip owner |
| INSERT | `payer can insert split requests` | `payer_user_id = auth.uid()` |
| UPDATE | `payer can update own split requests` | `payer_user_id = auth.uid()` |
| DELETE | *(none)* | Requests are never deleted by clients; Stripe/OB webhooks only append status transitions |

**What it protects:**
- Non-members cannot view payment requests.
- Only the debtor (payer) can create or update their own request. The creditor (requester) cannot alter the request unilaterally. Terminal status transitions (`completed`, `declined`) are written by Edge Functions via service-role.

---

### `storage.objects` — `receipts` bucket

Private bucket. Objects are stored at `{userId}/{receiptId}.jpg|png`.

| Operation | Policy | Rule |
|-----------|--------|------|
| INSERT | `receipts_insert_own` | `foldername(name)[1] = auth.uid()::text` |
| SELECT | `receipts_select_own` | `foldername(name)[1] = auth.uid()::text` |
| UPDATE | `receipts_update_own` | `foldername(name)[1] = auth.uid()::text` |
| DELETE | `receipts_delete_own` | `foldername(name)[1] = auth.uid()::text` |

**What it protects:** Each user can only access files under their own folder. Receipts uploaded by one user are not readable by other trip members.

---

### `ocr_rate_limit`

Tracks OCR calls per user for rate limiting inside the `parse-receipt` Edge Function.

| Operation | Policy |
|-----------|--------|
| *(all)* | RLS enabled; no client-facing policies |

**What it protects:** Clients cannot read or manipulate rate-limit records. The `check_ocr_rate_limit()` function (called by the Edge Function via the service-role client) is the only write path. This prevents a client from clearing its own limit.

---

## Migration index

| File | Change |
|------|--------|
| `001_initial_schema.sql` | Creates `users`, `trips`, `trip_members`, `expenses`, `splits` with full RLS |
| `002_invite_tokens.sql` | Adds invite token trigger (no RLS change) |
| `003_split_requests.sql` | Creates `split_requests` with RLS |
| `004_ob_fields.sql` | Adds `ob_payment_id`, `ob_provider`; extends status enum |
| `005_trip_members_contact_fields.sql` | Adds `phone`, `email` to `trip_members` |
| `006_receipts_storage.sql` | Creates `receipts` bucket and storage RLS policies |
| `007_ocr_rate_limit.sql` | Creates `ocr_rate_limit` table and `check_ocr_rate_limit()` function |
| `008_fix_splits_rls.sql` | **SEC-3** Drops `splits: member can update own split` — settlement via Edge Functions only |
| `009_trip_members_update_policy.sql` | **SEC-11** Adds `trip_members: member can update own row` with identity-column guard |
| `010_csprng_invite_token.sql` | **SEC-8** Replaces Mersenne Twister with CSPRNG in invite token generation |
| `011_trip_status.sql` | Adds `status` column to `trips` |
| `012_split_request_rollover.sql` | Adds `rolled_over_from_trip_id` to `split_requests` |
| `013_trip_closed_at.sql` | Adds `closed_at` column to `trips` |

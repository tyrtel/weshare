# Monetization — Design & Implementation Plan

---

## Overview

Freemium model: two flagship features (OCR receipt scan, report export) ship a generous but
finite lifetime sample, then require payment. Two ways to pay — a per-trip one-time pass for
occasional/travel users, and a monthly subscription for power users (roommates, recurring
groups). A user-level override exists for friends/testers, and a build-level flag unlocks
everything on non-production builds so QA never has to purchase anything to get coverage.

Chosen vendor: **RevenueCat**. It wraps both Google Play Billing and StoreKit2 behind one API,
supports both auto-renewing subscriptions and one-time (non-subscription) products from a single
SDK, has a usable free tier, and — the important part for this app — pushes **webhooks** on every
purchase/renewal/cancellation event, the same shape of integration this codebase already has for
Stripe (`supabase/functions/stripe-webhook`) and Tink (`ob-webhook`). Entitlement state should
live authoritatively in Supabase, not on-device — see "Server-Side Enforcement" below for why.

---

## Feature-Gating Analysis

The guiding principle: **gate features whose value is immediately visible and felt**, and never
gate the thing that keeps people opening the app in the first place (settling up). A gate on an
invisible improvement (e.g. "your exchange rate is 30 minutes fresher") teaches nothing and
converts nobody — the user has to already understand the value to miss it, which defeats the
point of a sample. A gate on OCR teaches itself: type it once manually, scan it once, feel the
difference, then hit the wall.

| Feature | Free tier | Paid unlock | Why this shape |
|---|---|---|---|
| **OCR receipt scan** | 5 uses, lifetime (never resets) | Unlimited | Highest visible value per use; already fully built (`ReceiptCapture` → `parse-receipt` Edge Function). Best conversion lever in the app. |
| **Report export (PDF)** | 5 exports, lifetime | Unlimited | One press = one tangible artifact (a shareable PDF) — easy to understand what you're losing. Also your best organic acquisition channel: exported PDFs get forwarded to non-users. |
| **Recurring expenses** | 1 active rule | Unlimited | This is the "unsure how to sample" one you raised — the answer is a **count cap**, not a time cap. A single free recurring rule (e.g. "Rent") lets a roommate group feel the entire mechanic — it fires monthly, they see it work — and then hits a wall the moment they want a second one (utilities, subscriptions). That second-rule wall is a strong, well-timed nudge because by then they've already trusted the feature once. |
| **Groups (persistent, multi-trip)** | 1 active group | Unlimited | Same count-cap logic as recurring expenses, and it's the natural retention anchor for subscriptions — roommates/long-term households are recurring users, not one-trip tourists, so this is the cap most likely to convert to the *subscription* specifically (see Trip Pass vs. Subscription below). |
| **Trip creation, splitting, settlement (Stripe/Open Banking), balances** | Always free, no cap | — | Never gate money movement or the core ledger. Friction here just pushes people to settle via Venmo/cash outside the app, which kills the loop that exposes them to everything else. This is true regardless of subscription status. |
| Multi-currency FX rate freshness | Not gated | — | Considered and rejected as a gate: the value (live vs. cached rate) is invisible to a user who isn't an FX nerd. A bad gate teaches nothing. Leave `ExchangeRateService`'s 3-tier fallback exactly as-is. |

**A cap only blocks creating a new instance beyond the limit — it never hides or locks data the
user already has.** If someone's free recurring rule or free group predates a downgrade (e.g.
subscription lapses), their existing rule/group keeps running exactly as before; they just can't
add a second one until they pay. This matches how "closing" already works elsewhere in this app
(closing a trip/expense is organizational, never destructive) and avoids the "you lost access to
your own data" panic that erodes trust in a money app.

---

## Product Catalog

| Product | Type | Price | Store product ID (proposed) | RevenueCat entitlement |
|---|---|---|---|---|
| Trip Pass | One-time (non-subscription) | €1.99 | `trip_pass_single` | `trip_pass` (attached per-purchase, scoped by metadata to one `tripId`) |
| Premium Monthly | Auto-renewing subscription | €2.99/mo | `premium_monthly` | `premium` |

Trip Pass unlocks full feature access **for one specific trip**, for a maximum of 30 days from
purchase — regardless of whether the trip itself stays open longer. This cap exists specifically
so a Trip Pass can't be used to keep one trip permanently "premium" for free.

Premium Monthly unlocks full feature access across **all** trips and groups, billed immediately
on subscribe, auto-renewing.

---

## Entitlement Model

### New models (`src/core/models/Entitlement.ts`)

    export interface TripPass {
      id: string;
      userId: string;
      tripId: string;
      purchasedAt: Date;
      expiresAt: Date;              // purchasedAt + 30 days, hard cap, independent of trip status
      storeTransactionId: string;
    }

    export interface SubscriptionWindow {
      id: string;
      userId: string;
      startedAt: Date;
      expiresAt: Date;               // see "Rolling window" decision below
      storeTransactionId: string;
    }

    export type UsageFeature = 'ocr_scan' | 'report_export';

    export interface UsageCounter {
      userId: string;
      feature: UsageFeature;
      usedCount: number;             // lifetime, never resets
    }

    export type EntitlementSource = 'override' | 'qa_build' | 'subscription' | 'trip_pass' | 'free';

    export interface EntitlementStatus {
      source: EntitlementSource;
      hasFullAccess: (tripId?: string) => boolean;
      remainingFreeUses: (feature: UsageFeature) => number;
    }

### "Rolling window" decision — finalized

Decided: **not** literally tracking 30 discrete day-passes — that's a lot of bookkeeping (30 rows,
or a counter, per renewal) for something a single timestamp already expresses. Instead, each
renewal event computes

    newExpiry = max(now, currentExpiry) + 30 days

and writes one `SubscriptionWindow` row (or updates one `expiresAt` column). This gives the
intended behavior — the user rides out unused days after cancelling (because `expiresAt` just sits
in the future until it naturally passes), and renewals stack seamlessly (paying again before
expiry extends from the *current* expiry, not from "now," so no days are lost) — with a tenth of
the code and no separate ledger to keep consistent. It's also exactly what RevenueCat's
`EntitlementInfo.expirationDate` already tracks, so in practice a separate `SubscriptionWindow`
table may not even be needed — just cache RevenueCat's `expirationDate` in Supabase via the
webhook (see below) so it can be checked server-side.

Discrete, individually-identifiable day-passes (e.g. for a future "gift a day" feature) are out of
scope for this plan — a bigger, different data model, and not needed for launch. Revisit only if
that feature gets prioritized.

### Extended existing model

    // users table / User model
    fullAccessOverride: boolean   // default false; friends/testers/you — see below

### DB Schema (new migration)

    user_feature_usage
      user_id       text NOT NULL
      feature       text NOT NULL   -- 'ocr_scan' | 'report_export'
      used_count    int  NOT NULL DEFAULT 0
      PRIMARY KEY (user_id, feature)

    trip_passes
      id                    text PK
      user_id               text NOT NULL
      trip_id               text NOT NULL REFERENCES trips(id) ON DELETE CASCADE
      purchased_at          timestamptz NOT NULL DEFAULT now()
      expires_at            timestamptz NOT NULL
      store_transaction_id  text NOT NULL UNIQUE   -- webhook idempotency key

    subscription_windows
      id                    text PK
      user_id               text NOT NULL
      started_at            timestamptz NOT NULL DEFAULT now()
      expires_at            timestamptz NOT NULL
      store_transaction_id  text NOT NULL UNIQUE   -- webhook idempotency key

    ALTER TABLE users ADD COLUMN full_access_override boolean NOT NULL DEFAULT false;

`full_access_override` is deliberately **not** writable through any client-facing RPC — only via
direct SQL / the Supabase dashboard, same trust boundary as an admin flag. A user should never be
able to grant it to themselves through the app, no matter what the client sends.

### New service interface (`src/core/interfaces/IEntitlementService.ts`)

    export interface IEntitlementService {
      getStatus(): EntitlementStatus;
      hasFullAccess(tripId?: string): boolean;
      remainingFreeUses(feature: UsageFeature): number;
      purchaseTripPass(tripId: string): Promise<Result<TripPass, AppError>>;
      purchaseSubscription(): Promise<Result<SubscriptionWindow, AppError>>;
      restorePurchases(): Promise<Result<void, AppError>>;
      refresh(): Promise<void>;     // re-sync from RevenueCat after app resume / purchase
    }

Follows the existing 4-step pattern: `RevenueCatEntitlementService` (production, wraps the
RevenueCat SDK + reads `full_access_override`/usage counters from Supabase),
`MockEntitlementService` (tests + simulation mode, fully controllable — see Testing Strategy),
registered under a new `ENTITLEMENT` DI token.

---

## Server-Side Enforcement — do not skip this

Client-side gating alone (`if (usedCount >= 5) showPaywall()`) is trivially bypassed — clear app
storage, patch the APK, or just not send the increment call. The usage counters and expiry checks
must be enforced where the client can't skip them:

- **OCR** already has a natural enforcement point: `supabase/functions/parse-receipt/index.ts`
  already rate-limits at 20 calls/60min per user before calling Claude Vision. Extend that same
  check to also read `user_feature_usage` (or the user's entitlement status) and reject with a
  specific error code (e.g. `402 OCR_LIMIT_REACHED`) once the free allowance is used and there's
  no active pass/subscription/override. Increment `used_count` only after a successful parse.
- **Reports** have no server round-trip today — PDF generation is fully client-side
  (`useGenerateReport` → `expo-print`). To enforce the cap server-side without adding a full
  Edge Function, add a security-definer Postgres RPC — same pattern already used for
  `claim_member_slot`/`claim_guest_session` — e.g. `increment_usage_if_allowed(feature text)`
  that atomically checks entitlement + increments the counter and returns whether the call is
  allowed. The client calls this RPC immediately before generating the PDF; if it returns false,
  show the paywall instead of generating.
- **Trip Pass / Subscription validity**: never trust the client's `Date.now()` to decide whether
  a pass/subscription is still active. `expires_at` is written into Supabase by the RevenueCat
  webhook handler (new `revenuecat-webhook` Edge Function, same shape as `stripe-webhook`) at
  purchase/renewal time — that's the authoritative value. The client can read it for UI display,
  but the actual gate (the RPC above, or the parse-receipt check) must re-read it from Supabase,
  not from a locally cached value.

---

## The "everything unlocked" flags

### Build-level (QA/test builds)

This app already has exactly this pattern for simulation mode — reuse it rather than invent a
second mechanism. `eas.json` already sets `EXPO_PUBLIC_SIMULATE` per build profile and
`app.config.ts` reads it into `extra.simulation`. Add a parallel `EXPO_PUBLIC_QA_UNLOCK`:

    // eas.json — add to development, debug-device, and preview profiles; NOT production
    "env": { "EXPO_PUBLIC_QA_UNLOCK": "true" }

    // app.config.ts
    const isQaUnlock = process.env.EXPO_PUBLIC_QA_UNLOCK === 'true';
    extra: { simulation: isSimulation, qaUnlock: isQaUnlock }

`RevenueCatEntitlementService` checks `Constants.expoConfig.extra.qaUnlock` and short-circuits
`hasFullAccess()` to `true` when set, without touching RevenueCat at all. Production builds never
set the env var, so this can't accidentally ship unlocked — same safety property `EXPO_PUBLIC_SIMULATE`
already has today.

### User-level (friends, you, manual testers)

The `users.full_access_override` column above. `hasFullAccess()` checks this first, before
anything else. Set it by hand in the Supabase dashboard for specific accounts. No UI, no
self-service — this is an operator action, not a feature.

**Precedence order** `hasFullAccess()` should check, in this order: override → QA build flag →
active subscription → active trip pass (scoped to the given `tripId`) → free tier caps.

---

## Screen / UX touchpoints

- New shared `PaywallSheet` component — triggered from: OCR limit-reached response, report-export
  RPC returning "not allowed," "add a second recurring rule" tap over the cap, "create a second
  group" tap over the cap. Offers both products (Trip Pass — only shown when there's a specific
  trip in context — and Premium Monthly), plus "Restore purchases."
- Settings/Profile menu: "Manage subscription" (deep-links to the platform's subscription
  management — Play Store/App Store handle this natively, no custom UI needed) and "Restore
  purchases" (needed for reinstall / new device — RevenueCat handles the receipt lookup).
- If a user already has an active subscription, hide the Trip Pass purchase option entirely
  (subscription already covers everything a Trip Pass would) rather than letting them buy a
  redundant pass.

---

## Chunk Plan

### Chunk A — Entitlement data foundation — DONE
- [x] `Entitlement.ts` models, `IEntitlementService` interface, `ENTITLEMENT` DI token
- [x] `MockEntitlementService` — fully controllable (see Testing Strategy), wired into
      `createTestContainer` and `createSimulationContainer`
- [x] Migration `040_monetization_entitlements.sql`: `user_feature_usage`, `trip_passes`,
      `subscription_windows`, `users.full_access_override` (+ trigger locking the override
      column against client writes)
- [x] `increment_usage_if_allowed` Postgres RPC
- [x] Pure precedence/cap/rolling-window logic extracted to `core/logic/entitlement.ts`,
      25 boundary tests, 1308/1308 suite green

**No real money moves in this chunk.** Everything is mockable/testable before touching a store.
Not yet wired: `productionContainer.ts` has no `ENTITLEMENT` registration — that lands in
Chunk B alongside `RevenueCatEntitlementService`. Migration has not been applied to a live
Supabase project or verified against a running Postgres (the local Supabase CLI's Go binary
isn't installed in this environment) — run `supabase db reset --local` or push to a dev project
before relying on it.

### Chunk B — RevenueCat integration
**Depends on:** Chunk A.
- [ ] RevenueCat account + products configured in both Play Console and App Store Connect
      (`trip_pass_single`, `premium_monthly`) — **manual, external-account work, see below**
- [x] `RevenueCatEntitlementService` (production impl) — wraps `react-native-purchases` SDK
      (`src/infrastructure/services/RevenueCatEntitlementService.ts`), registered under
      `ENTITLEMENT` in `productionContainer.ts`
- [x] `revenuecat-webhook` Edge Function — writes `trip_passes`/`subscription_windows` rows,
      idempotent on `store_transaction_id` (`supabase/functions/revenuecat-webhook/index.ts`)
- [x] `qaUnlock` env var + `eas.json` profile wiring (`development`, `debug-device`, `preview`;
      not `production`)

**Design notes:**
- Entitlement status (`hasFullAccess`/`remainingFreeUses`/`getStatus`) is read from Supabase
  (`trip_passes`, `subscription_windows`, `user_feature_usage`, `users.full_access_override`),
  never from RevenueCat's local `CustomerInfo` cache — the SDK's only job is driving the
  purchase flow. This matches "Server-Side Enforcement": Supabase is authoritative.
- A Trip Pass has no product-level custom metadata, so the trip it's for is carried through
  RevenueCat as a subscriber attribute (`pending_trip_pass_trip_id`, set immediately before
  `purchaseStoreProduct`) and read back off the webhook event's `subscriber_attributes`.
- `subscription_windows.expires_at` is written straight from RevenueCat's own
  `expiration_at_ms` on each grant event, rather than recomputing the rolling-window formula
  server-side — the store's billing cycle is already the authoritative clock for a real
  auto-renewing subscription. `computeSubscriptionRenewalExpiry` (Chunk A) is exercised by
  `MockEntitlementService`/simulation mode, which has no real store to ask.
- `purchaseTripPass`/`purchaseSubscription` poll Supabase for up to ~8s after a successful
  store purchase (the webhook write is async) before returning `ok`; a timeout returns a
  `NetworkError` telling the caller to refresh shortly — Chunk C's `PaywallSheet` should
  surface this as a "processing" state, not a hard failure.
- RevenueCat's `app_user_id` is kept in sync with the Supabase session via
  `supabase.auth.onAuthStateChange` inside the service itself (`Purchases.logIn`/`logOut`),
  so no screen needs to call an explicit "identify" step.

**What you need to do manually** (none of this is scriptable from here):
1. Create a RevenueCat account/project, add iOS + Android apps to it.
2. In Play Console and App Store Connect, create the two products from the Product Catalog
   table above (`trip_pass_single` as a non-subscription/one-time product, `premium_monthly`
   as an auto-renewing subscription) and attach them to RevenueCat.
3. In RevenueCat, create entitlements `trip_pass` and `premium` and attach the matching product
   to each.
4. Copy the iOS and Android **public** SDK keys into EAS secrets:
   `EXPO_PUBLIC_REVENUECAT_IOS_API_KEY`, `EXPO_PUBLIC_REVENUECAT_ANDROID_API_KEY`.
5. RevenueCat Dashboard → Project → Integrations → Webhooks: add an endpoint pointing at
   `https://<your-project-ref>.supabase.co/functions/v1/revenuecat-webhook`, set an
   "Authorization header value" (any string you choose), and save that same string as the
   Supabase secret `REVENUECAT_WEBHOOK_AUTH_HEADER`
   (`supabase secrets set REVENUECAT_WEBHOOK_AUTH_HEADER=...`). Unlike Stripe/Tink, RevenueCat
   does not sign webhooks — this shared-secret header is the only verification.
6. Deploy the new function: `supabase functions deploy revenuecat-webhook`.

**Not yet verified** (can't be, from this environment): the `react-native-purchases` SDK calls
in `RevenueCatEntitlementService.ts` (`configure`, `logIn`/`logOut`, `getProducts`,
`purchaseStoreProduct`, `restorePurchases`, `setAttributes`) are written against the
long-stable, documented API surface, but this is a native module — nothing here runs without
a real device/simulator build and a real (sandbox) store account, which is exactly what
Chunk C's sandbox testing is for. Re-check the exact call signatures against the installed
`react-native-purchases@10.4.3` docs before relying on them.

### Chunk C — Trip Pass purchase flow
**Depends on:** Chunk B.
- [x] `PaywallSheet` component, Trip Pass path (`src/shared/components/PaywallSheet.tsx`) —
      Trip Pass + Premium Monthly cards, purchase/restore/cancel flows, "already unlocked"
      state. 9/9 tests in `PaywallSheet.test.tsx`; full suite green (117/117 suites,
      1317/1317 tests). Not yet mounted from any screen — that trigger wiring lands with
      Chunks E/F/G (gate OCR/reports/recurring/groups), which open it on cap-exceeded.
- [x] Purchase → webhook → Supabase round trip verified end-to-end in sandbox — done
      against a **local** Supabase stack (`supabase start` + `supabase functions serve
      revenuecat-webhook --env-file ... --no-verify-jwt`, `ALLOW_UNSIGNED_WEBHOOKS=true`),
      not the linked hosted project. Posted a synthetic `NON_RENEWING_PURCHASE` RevenueCat
      event at the deployed function; confirmed a `trip_passes` row lands with the right
      `user_id`/`trip_id`/`store_transaction_id` and `expires_at = purchased_at + 30 days`
      exactly. Re-posted the identical event (same `transaction_id`) and confirmed no
      duplicate row — the `ON CONFLICT (store_transaction_id) DO NOTHING` upsert is
      correctly idempotent.
- [x] 30-day expiry enforced server-side, verified against a backdated `purchased_at` — posted
      a second event with `purchased_at_ms` 40 days in the past (a different trip). Called
      `increment_usage_if_allowed` as the authenticated test user: the still-valid trip's pass
      returns `{allowed:true, remaining:null}` (unlimited); the expired trip's pass does **not**
      grant access — it silently falls through to the free-tier branch instead
      (`{allowed:true, remaining:4}`, i.e. `used_count` incremented 0→1). Confirmed the free-tier
      cap itself blocks at exactly the 5th use, not the 4th or 6th
      (`{allowed:false, remaining:0}` on the 6th call) — this is real server-side enforcement,
      not a client-side check that happens to also exist.

**Bug found and fixed along the way (`PaywallSheet.test.tsx` had never actually passed):** the
shared reanimated Jest mock's `useSharedValue` returned a new object every render, so
`PaywallSheet`'s effect (which listed the shared value in its dependency array) re-fired every
render in an infinite loop until the Jest worker OOM'd — that's what looked like a WSL crash.
Fixed by making the mock return a stable `useRef`-backed handle (matching real Reanimated) and
dropping the unnecessary dependency in the component. Full suite now green (117/117 suites,
1317/1317 tests).

**Second bug found via this sandbox test, fixed in `041_monetization_grants.sql`:** the
`revenuecat-webhook`'s upsert into `trip_passes`/`subscription_windows` needs explicit `SELECT`
+ `INSERT` grants for `service_role` — Postgres's `BYPASS RLS` attribute skips RLS *policies*,
it does not substitute for a table-level `GRANT`, and PostgREST's `ignoreDuplicates` upsert path
needs `SELECT` even when the response itself is `return=minimal` (confirmed directly against
local PostgREST's own permission-denied hint). The same restricted grant (missing basic
INSERT/SELECT/UPDATE/DELETE for `service_role`) was also present on foundational tables like
`users`/`trips` in this local stack, which strongly suggests it's a gap in `supabase start`'s
local bootstrap rather than the hosted project — the hosted Supabase platform grants these by
default at project creation, outside of any migration file, so the existing `stripe-webhook`/
`ob-webhook` presumably already work in production today. Added the explicit grants anyway as a
defensive, purely-additive migration since they're idempotent and harmless either way.

**Still not done (genuinely needs a real device):** an actual RevenueCat sandbox purchase through
Play Console License Testing or an App Store sandbox account, confirming the real
purchase → RevenueCat → webhook delivery path (not just the webhook → Supabase half tested
above). See "Layer 3 — Real store sandbox" below.

### Chunk D — Subscription purchase flow — DONE
**Depends on:** Chunk B. **Parallel with:** Chunk C.
- [x] `PaywallSheet` component, Premium Monthly path — was already built alongside Chunk C's
      Trip Pass path in the same component.
- [x] Renewal, cancellation, and grace-period webhook events all handled and idempotent —
      `revenuecat-webhook` already handled `INITIAL_PURCHASE`/`RENEWAL`/`UNCANCELLATION`/
      `PRODUCT_CHANGE`; added `BILLING_ISSUE` to the same grant-event set so a failed renewal
      charge extends `subscription_windows.expires_at` to the store's grace-period expiry
      instead of dropping access immediately. Verified against a local sandbox: a `RENEWAL`
      then a `BILLING_ISSUE` event correctly leaves the grace-period row as the active one
      (`fetchActiveSubscription` orders by `expires_at DESC`). Cancellation/expiration still
      need no code — access reverts naturally once `expires_at` passes, same as before.
- [x] "Manage subscription" deep link in Settings — added to `ProfileMenuSheet` (opens
      `apps.apple.com/account/subscriptions` on iOS, Play Store's subscriptions page scoped to
      this app's package on Android), plus a "Restore purchases" row alongside it per the
      design doc's UX section. 11/11 tests in `ProfileMenuSheet.test.tsx`.

### Chunk E — Gate OCR — DONE
**Depends on:** Chunk A (works even before B/C/D land, using override/QA flags for testing).
- [x] `parse-receipt` extended with the entitlement + usage check — calls
      `increment_usage_if_allowed('ocr_scan', tripId)` via a user-scoped client (not
      service-role — `auth.uid()` inside the RPC must resolve to the caller) before invoking
      Claude Vision, returning `402 OCR_LIMIT_REACHED` once the free tier is exhausted and no
      subscription/trip-pass/override applies. Verified end-to-end against a local sandbox:
      5 calls succeed, the 6th is blocked with `OCR_LIMIT_REACHED`; granting a Trip Pass for
      that trip immediately unblocks scanning again without incrementing `used_count` further.
- [x] Client shows remaining-uses count and/or paywall on the `OCR_LIMIT_REACHED` response —
      `ReceiptCapture` shows "N free scans left" (hidden once the user has full access via
      subscription/override/QA-build/an active trip pass for the current trip) and opens
      `PaywallSheet` instead of the generic error banner when the server returns
      `OCR_LIMIT_REACHED`. `tripId` threads through from `ExpenseFormScreen` so a Trip Pass
      purchase from that paywall unlocks OCR for the same trip. 6/6 tests in the new
      `ReceiptCapture.test.tsx`, plus 3 new tests on `useReceiptParser`'s `limitReached` state.

### Chunk F — Gate Reports
**Depends on:** Chunk A.
- [ ] `useGenerateReport` calls `increment_usage_if_allowed('report_export')` before generating
- [ ] Paywall on rejection

### Chunk G — Gate recurring expenses + groups
**Depends on:** Chunk A.
- [ ] Count-cap check (1 free each) before "create" actions; existing over-cap items unaffected
- [ ] Paywall on rejection

### Chunk H — Store listing + release readiness
**Depends on:** all above.
- [ ] Both products approved/live in Play Console and App Store Connect
- [ ] Full sandbox test matrix passed (see Testing Strategy)
- [ ] Add a monetization section to `TODO_release.md` pointing here once shipped

---

## Testing Strategy

This is genuinely three different testing problems layered on top of each other — pure logic,
store integration, and time/expiry correctness — and they need different tools.

### Layer 1 — Pure logic, Jest, no store involved

`hasFullAccess()`'s precedence order, the count-cap logic for recurring expenses/groups, and the
"rolling window" expiry math (`max(now, currentExpiry) + 30 days`) are all pure functions of data
you already have in a `Result`/model shape this codebase tests everywhere else. Test them exactly
like `deriveTripFinancialSummary` or `computeGroupBalances` are tested today — no mocks of
RevenueCat needed, just construct `TripPass`/`SubscriptionWindow`/`UsageCounter` objects with
factory functions (`tripPassFactory`, `subscriptionWindowFactory` — add to
`src/__testUtils__/factories.ts` alongside the existing ones) and assert on the output.

**Critical rule for these tests**: never call `new Date()` / `Date.now()` inside the function
under test without a way to inject "now." `MockExchangeRateService.delay` is already this
codebase's precedent for making a time-like behavior swappable in tests — follow the same shape:
pass `now` as a parameter (defaulting to `Date.now()` in production callers) so a test can assert
"expiry math is correct the instant before/after the boundary" without real timers or `jest.useFakeTimers()`.
This matters specifically for Trip Pass's 30-day cutoff and subscription renewal stacking — those
are exactly the kind of off-by-one-day bugs that are easy to introduce and easy to miss without a
boundary test.

### Layer 2 — Service integration, `MockEntitlementService`

`MockEntitlementService` should expose test-only setters beyond the interface
(`setOverride(bool)`, `setQaUnlock(bool)`, `grantTripPass(tripId, expiresAt)`,
`grantSubscription(expiresAt)`, `setUsageCount(feature, n)`) so component/screen tests can put the
entitlement system in any state without touching RevenueCat. This is also what lets *you*
exercise expiration in simulation mode without waiting 30 real days — expose the same setters
through a debug-only panel (gated behind `qaUnlock`) so you can tap "expire my trip pass now" and
immediately see the paywall reappear on a real device.

Screen-level tests to write once the gates exist (mirroring how `ExpenseFormScreen`/`GroupDetailScreen`
are tested today, mocking the hook and asserting on rendered output):
- OCR scan button disabled/paywall-triggering at exactly 5 lifetime uses, not 4 or 6
- Report export button same, independently of OCR's counter (they must not share a counter)
- "Add recurring expense" / "Create group" blocked at exactly 1 existing active item
- Override flag and QA flag each independently bypass every gate above
- An expired Trip Pass no longer grants access to *that* trip, but a still-valid one does, and it
  doesn't leak into other trips

### Layer 3 — Real store sandbox

Unavoidable — Jest can't validate real receipt verification or webhook delivery. But keep this
layer as small and late as possible; everything above should already be correct before you spend
sandbox-testing time.

- **Google Play**: add your own account (and friends/testers) as License Testers in Play
  Console, upload to Internal Testing track — license testers get real purchase flows with no
  real charge.
- **Apple**: create Sandbox Tester Apple IDs in App Store Connect; sign into the sandbox account
  on-device (not the simulator's `.storekit` config, since you need the RevenueCat round trip,
  not just local StoreKit) for full end-to-end coverage.
- **Webhook delivery**: this repo already depends on `@expo/ngrok` for exactly this kind of local
  webhook testing (used for Stripe today) — point RevenueCat's sandbox webhook at an ngrok tunnel
  to your local `revenuecat-webhook` function during development, same workflow as
  `stripe listen --forward-to` in `TODO_release.md` §2.
- **Idempotency**: fire the same sandbox webhook event twice (RevenueCat, like Stripe, does not
  guarantee exactly-once delivery) and confirm `trip_passes`/`subscription_windows` end up with
  one row, not two — the `UNIQUE` constraint on `store_transaction_id` should make the second
  insert a no-op, not an error that drops the event.

### Sandbox test matrix (run once per store, before launch)

- [ ] Trip Pass purchase succeeds → full access on that trip only, immediately
- [ ] Trip Pass purchase cancelled mid-flow → no access granted, no charge, no orphaned row
- [ ] Trip Pass expires at 30 days (backdate `purchased_at` in Supabase rather than waiting) →
      access reverts to free tier on that trip; trip and its data are untouched
- [ ] Subscribe → immediate access to all trips/groups, first charge happens now
- [ ] Cancel subscription mid-cycle → access continues until `expires_at`, then reverts; nothing
      deleted
- [ ] Resubscribe before previous `expires_at` passes → new expiry stacks from the old one, no
      days lost
- [ ] Resubscribe after a lapse → new expiry starts from now, not from the old (already-passed)
      one
- [ ] Restore purchases on a reinstall / new device → correct entitlement reappears, keyed by
      account (`userId`), not device
- [ ] Override flag set on an account → every gate bypassed, independent of any real purchase
      state
- [ ] `qaUnlock` build → every gate bypassed; confirm a `production`-profile build does **not**
      have it set
- [ ] Tamper test: with a build that has `qaUnlock` off and no purchases, manually call the
      client-side purchase-success path without a real webhook firing — confirm the server-side
      RPC/Edge Function still blocks OCR/reports, proving the enforcement boundary is actually
      server-side and not just "the client also happened to check"

---

## What is explicitly deferred

- Annual subscription SKU (discount pricing) — revisit once monthly conversion data exists
- Family/household sharing across store accounts
- Automated refund handling beyond what RevenueCat/the stores do natively
- A settlement-volume take rate (Stripe Connect application fees) — a separate, independent
  revenue lever from everything in this document; not needed at current volume
- Any change to the OCR rate limiter (20 calls/60 min) — that's an abuse guard, this document's
  cap (5 lifetime) is a monetization gate; they're independent and both stay

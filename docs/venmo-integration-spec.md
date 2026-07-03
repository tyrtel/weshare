# Venmo Integration Spec

**Status:** Partially implemented — analysis of current state and improvement options  
**Last updated:** July 2026

---

## What Is Already Implemented

Venmo exists throughout the codebase as a first-class `PaymentProvider`. Here is what is wired up:

**`IPaymentService.ts`** — `'venmo'` is in the `PaymentProvider` union type.

**`DeepLinkPaymentService.ts`** — builds the deep link URL:

    venmo://paycharge?txn=pay&recipients={handle}&amount={amount}&note=ouiShare

**`DeepLinkPaymentMethod.ts`** — `PROVIDER_DISPLAY` entry: label "Venmo", icon `cash-outline`. `NATIVE_SCHEMES` probes `venmo://` to detect if the app is installed.

**`productionContainer.ts`** — Venmo is in `DEEP_LINK_PROVIDERS`, so `DeepLinkPaymentMethod` for it is registered in the `PaymentMethodRegistry` and appears in the trip settle `PaymentMethodSheet`.

**`split_requests` table** — migration 003 includes `'venmo'` in the `preferred_wallet` check constraint.

**`AuditDetailScreen`** and **`generateProofHTML.ts`** — display the "Venmo" label in the payment history/audit view.

**Tests** — `DeepLinkPaymentService.test.ts` has a passing test for the Venmo URL format.

In short: Venmo shows up in the settle payment sheet, launches the Venmo app via deep link if installed, and records a `SplitRequest` with `preferred_wallet = 'venmo'`. The happy path works.

---

## Problems with the Current Implementation

### 1. Wrong transaction direction

The URL uses `txn=pay`, which means the current user is paying the recipient. In a bill-splitting context, the correct direction depends on who is acting:

- If the debtor opens the sheet and taps Venmo → they want to **pay** the creditor. `txn=pay` is correct.
- If the creditor opens the sheet and taps Venmo → they want to **request** money from the debtor. `txn=charge` would be correct.

The current code always uses `txn=pay`. The settlement sheet (`SettlementScreen`) only shows the "Pay" button to the debtor (`isCurrentUserDebtor` guard), so the direction is currently correct for the trip settle flow. But it is worth noting that `txn=charge` (a payment request) is also possible and might be the preferred flow if the creditor wants to initiate.

### 2. The handle is a display name, not a Venmo username

`buildPaymentLink('venmo', amount, currency, recipientName)` receives `recipientName` (e.g. "Alice Dupont") from `PaymentMethodSheet`. Venmo's deep link `recipients` parameter expects a Venmo username (e.g. `@alice-dupont`). These are not the same thing.

The current deep link will open the Venmo app and pre-fill the recipient field with "Alice Dupont", which Venmo then needs to match against its user database. If it finds no match, the user has to manually type the correct username. This degrades the UX significantly.

There is no `venmoHandle` field anywhere in `TripMember`, `GroupMember`, or any profile model.

### 3. Undocumented and historically broken deep links

Venmo has never published an official deep link spec. The `venmo://paycharge` scheme is reverse-engineered and has been broken by Venmo app updates in the past without notice. There is no guarantee of forward compatibility.

### 4. US-only

Venmo is exclusively available to users in the United States with a US bank account and US phone number. WeShare's current feature set is heavily European — EUR default currency, Wero integration, Lydia support. Showing Venmo in the payment sheet to a French or Belgian user is noise at best and confusing at worst.

There is no geographic filtering of the payment sheet. A user in Paris will see Venmo as an option even though they cannot have a Venmo account.

### 5. `preferred_wallet` database constraint not updated

Migration 003 has:

    check (preferred_wallet in ('revolut','venmo','lydia','paypal','other'))

`'wero'` was added to the TypeScript `PaymentProvider` union recently but the database check constraint was not updated. Any `SplitRequest` that records `preferred_wallet = 'wero'` will be rejected by Postgres. This needs a migration regardless of other Venmo work.

---

## Options for Improvement

### Option 1 — Fix the handle problem: add a Venmo username field

The minimal fix for current functionality. Add an optional `venmoHandle?: string` to `TripMember` and `GroupMember`. Users can optionally fill it in their profile. The payment sheet shows the Venmo option only when the recipient has a handle on file.

**Effort:** Low  
**Benefit:** Deep link actually pre-fills the correct recipient  
**Limitation:** Still undocumented, still US-only, still no confirmation

This is the only code change needed to make the current approach actually work end-to-end.

### Option 2 — Add `txn=charge` as an alternative mode

Allow the creditor to send a payment request rather than requiring the debtor to initiate. Practically: an "Request via Venmo" option alongside "Pay via Venmo" in the sheet. This requires the creditor's Venmo handle (not the debtor's), and again relies on the undocumented scheme.

**Effort:** Very low  
**Benefit:** More natural "remind someone to pay" UX  
**Limitation:** Same fragility as Option 1

### Option 3 — Add geographic filtering to the payment sheet

Before showing Venmo in the `PaymentMethodSheet`, check the user's device locale. If the locale is not `en-US`, do not include Venmo in the available methods (regardless of whether the app is installed).

This is a small change to `DeepLinkPaymentMethod.canHandle()` — check `Localization.locale` (from `expo-localization`) before returning true.

**Effort:** Very low  
**Benefit:** Stops non-US users seeing a payment option they cannot use  
**Recommendation:** Ship this now regardless of other decisions

### Option 4 — Integrate Braintree SDK for confirmed Venmo payments

Braintree (owned by PayPal) has a React Native drop-in UI that supports Venmo as a payment method with proper server-side confirmation. The flow is:

1. App calls a Supabase Edge Function to generate a Braintree client token
2. App presents the Braintree drop-in (or headless SDK) — user authenticates in Venmo
3. Braintree returns a payment method nonce
4. App sends the nonce to a second Edge Function which charges the nonce via Braintree's server SDK
5. Webhook or polling confirms the payment

This is the only option that gives WeShare server-confirmed payment status for Venmo transactions, eliminating the "mark as settled manually" step.

**Effort:** High — requires a Braintree merchant account, two new Edge Functions, a React Native native module (community library, not Expo-managed), significant testing  
**Benefit:** Confirmed payments, no display-name/handle ambiguity  
**Limitations:** US-only (Braintree's Venmo support is US merchants only), adds a new payment processor to maintain, requires native module which adds build complexity to an Expo managed workflow  
**Recommendation:** Not worth pursuing given WeShare's European focus

### Option 5 — PayPal's "Pay with Venmo" via PayPal Checkout

As of 2025, PayPal Checkout's JavaScript SDK supports "Pay with Venmo" as a payment option. This is web-only (JavaScript SDK) so it does not apply to the native mobile app. It could apply to a potential WeShare web client but is out of scope for the React Native app.

### Option 6 — Deprecate Venmo and replace with PayPal

PayPal works internationally, has an official `paypal.me` URL scheme already implemented, and covers US users who might prefer it over Venmo. The `paypal` provider already exists in the codebase.

If WeShare's user base is primarily European, Venmo is redundant next to PayPal. The practical difference for a US user is minor — both are owned by PayPal Inc., both are P2P transfers, and the PayPal.me link already works without a username-lookup problem.

**Effort:** Remove Venmo from `DEEP_LINK_PROVIDERS` in `productionContainer.ts` — one line  
**Benefit:** Cleaner payment sheet, no US-handle-lookup problem  
**Cost:** US users lose Venmo as an option (though PayPal remains)

---

## Recommended Path

**Immediate (one small migration + one line of code):**

1. Add a migration to update the `split_requests.preferred_wallet` check constraint to include `'wero'`:

        ALTER TABLE split_requests
          DROP CONSTRAINT split_requests_preferred_wallet_check;

        ALTER TABLE split_requests
          ADD CONSTRAINT split_requests_preferred_wallet_check
          CHECK (preferred_wallet IN ('revolut','venmo','lydia','paypal','wero','other'));

2. Add locale filtering to `DeepLinkPaymentMethod.canHandle()` for Venmo so non-US users stop seeing it.

**Short term:**

3. Add a `venmoHandle?: string` field to member profiles (both `TripMember` and `GroupMember`). Show the Venmo payment option in the sheet only when the recipient has a Venmo handle. Pass the handle, not the display name, to `buildPaymentLink`.

**Longer term — if US market grows:**

4. Evaluate Braintree SDK only if a meaningful portion of the user base is US-based and is asking for confirmed Venmo payments. Given the European focus of the current payment stack, this is low priority.

---

## Current Status Summary

| Area | Status |
|---|---|
| Deep link URL built | Done |
| App installed detection | Done |
| Shows in payment sheet | Done |
| Database constraint includes 'venmo' | Done |
| Audit / history display | Done |
| Correct handle (not display name) | Not done |
| Locale filtering (US-only guard) | Not done |
| 'wero' added to DB constraint | Not done |
| Server-confirmed payment | Not done |

---

## References

- [Braintree — Venmo overview](https://developer.paypal.com/braintree/docs/guides/venmo/overview)
- [PayPal — Pay with Venmo integration](https://developer.paypal.com/docs/checkout/pay-with-venmo/integrate/)
- [Venmo deep linking — community documentation](https://blog.alexbeals.com/posts/venmo-deeplinking)
- [Venmo deep linking from web apps](https://goleary.com/posts/2020-07-29-venmo-deeplinking-including-from-web-apps)
- [react-native-braintree-dropin-ui](https://github.com/wgltony/react-native-braintree-dropin-ui)
- [Venmo availability — US only](https://accountinginsights.org/is-venmo-available-in-europe-the-answer-alternatives/)
- [Checkout.com — Venmo API only (deprecated new signups April 2026)](https://www.checkout.com/docs/payments/add-payment-methods/venmo/api-only)

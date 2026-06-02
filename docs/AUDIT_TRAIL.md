# ouiShare — Audit Trail

This document explains what ouiShare records when a payment is requested or made, why it records it, and what it does not record. It is intended to help trip members understand the evidence available if a payment is disputed or needs to be verified.

---

## What is an audit trail?

When one person in a trip requests payment from another, ouiShare creates a **split request** — a record that tracks the payment from the moment it is initiated until it is confirmed settled or abandoned. Every status change to that record is timestamped.

This gives both parties a shared, neutral history they can refer back to: "Was the bank transfer authorized?", "When did the Stripe payment go through?", "Did the Revolut request actually get sent?"

---

## What is recorded

Every split request record contains the following information:

| Field | What it means |
|-------|--------------|
| **Requester** | The person who is owed money (the creditor) |
| **Payer** | The person who owes money (the debtor) |
| **Amount** | The exact amount in the smallest currency unit (e.g. 2500 = €25.00) |
| **Currency** | ISO currency code — EUR, USD, GBP, etc. |
| **Note** | A short description of what the payment is for |
| **Payment method** | Which method was chosen: Revolut, Lydia, Venmo, PayPal, Stripe, or bank transfer |
| **Status** | The current state of the payment (see status lifecycle below) |
| **Created at** | When the split request was first created |
| **Updated at** | When the status was last changed |

For **Stripe** payments, the record also stores:
- The Stripe Payment Link ID (`pl_xxx`) — links back to the Stripe Dashboard
- The Stripe Checkout Session ID (`cs_xxx`) — used to query live payment status

For **Open Banking / SEPA** payments, the record also stores:
- The Tink payment ID — the reference used by the bank aggregator
- The OB provider — which aggregator processed the payment (Tink or Powens)

---

## Status lifecycle

A split request moves through the following statuses. Each transition updates the `updated_at` timestamp, giving a timestamped log of the payment's progress.

```
created
  │  Split request saved. Payment not yet initiated.
  │
  ▼
request_sent
  │  Payment initiated: wallet URL opened, Stripe Checkout launched,
  │  or bank authorization URL opened. The payer has been sent to
  │  the payment interface.
  │
  ▼
authorized        (Open Banking only)
  │  The payer's bank has approved the transfer. The SEPA payment
  │  is in transit. Funds have not yet settled.
  │
  ▼
pending
  │  Wallet flows only: the payer returned from the wallet app and
  │  confirmed they completed the payment. ouiShare cannot verify
  │  wallet payments programmatically — this status reflects the
  │  payer's self-report.
  │
  ▼
completed ✓       Terminal — payment confirmed.
  │  Stripe: Stripe's webhook confirmed checkout.session.completed.
  │  Open Banking: Tink's webhook confirmed the SEPA transfer settled.
  │  Wallet: payer confirmed payment in the app.

declined ✗        Terminal — payment failed or was rejected.
  │  Stripe: payment_intent.payment_failed webhook received.
  │  Open Banking: bank rejected the transfer.
  │  Wallet: payer indicated the payment did not go through.

expired ✗         Terminal — payment window closed.
     Stripe: checkout.session.expired webhook received.
     Open Banking: the authorization window passed before the
     payer approved the transfer at their bank.
```

Once a split request reaches `completed`, `declined`, or `expired`, its status will not change again. A new split request must be created for a retry.

---

## How status updates happen

Status changes come from two sources depending on the payment method:

**Wallet payments (Revolut, Lydia, Venmo, PayPal)**
The wallet app does not send ouiShare any notification when a payment is made. When the payer returns to ouiShare after using their wallet app, the app shows a prompt: "Did you complete the payment?" The status is updated based on the payer's response. This is self-reported and cannot be verified by the app.

**Stripe**
Status is updated by two mechanisms working in parallel:
1. The app polls the `payment-status` Edge Function every 6 seconds while the payment card is on screen, and immediately when the app comes back to the foreground.
2. Stripe sends a signed webhook to the `stripe-webhook` Edge Function when the checkout session completes, expires, or fails. The signature is verified using an HMAC secret before any update is made.

The webhook is the authoritative source. Polling exists so the UI reflects the correct state quickly even if the webhook is slightly delayed.

**Open Banking / SEPA**
Status is updated by two mechanisms:
1. The app polls the `ob-status` Edge Function every 8 seconds while `BankPaymentScreen` is open, and immediately when the app foregrounds.
2. Tink sends a signed webhook to the `ob-webhook` Edge Function when the payment status changes. The signature is verified using HMAC-SHA256 before any update is made.

The `authorized` → `completed` transition typically takes a few seconds to a few hours depending on the bank and time of day. SEPA Instant Credit Transfer settles in seconds; standard SEPA transfers settle by end of business day.

---

## Who can see the records

Row Level Security is enforced at the database level. A split request record is readable only by:
- **Any member of the trip** the split request belongs to
- The Supabase service-role key (used only by Edge Functions for webhook processing — not accessible from the app)

A split request can only be **created** by the payer (the person being charged). Status updates from the payer are also restricted to that user. Webhook updates bypass RLS using the service-role key, which is only available server-side.

No other users — including users on other trips — can read or write a split request.

---

## What is not recorded

ouiShare intentionally does not store:

- **Bank account numbers or IBANs.** The IBAN entered in BankPaymentScreen is passed directly to the Tink API over TLS and is never written to the ouiShare database.
- **Card numbers or card details.** Stripe handles all card data. ouiShare only stores the Stripe session ID, which is a reference identifier, not payment instrument data.
- **Wallet credentials or account details.** Deep-link payments open the wallet app directly; no wallet credentials pass through ouiShare.
- **Exact webhook payloads.** The `stripe-webhook` and `ob-webhook` Edge Functions extract only the fields they need (status, payment ID) and do not persist the full webhook body.
- **Authentication tokens or passwords.** These are managed by Supabase Auth and are never visible to the application layer.

---

## Interpreting the history in the app

The settlement screen shows a status badge next to each amount owed. The badge reflects the status of the **most recent** split request for that pair of users within the trip.

| Badge | Meaning |
|-------|---------|
| **Created** | A payment has been logged but not yet initiated |
| **Sent** | The payer was directed to the payment interface |
| **Pending** | Wallet flow: payer self-reported payment sent |
| **Paid** | Payment confirmed by Stripe or bank (authoritative) |
| **Declined** | Payment failed at Stripe or the bank |
| **Expired** | The payment window closed before the payer completed it |

If a payment shows **Paid**, it means either Stripe or the bank aggregator confirmed the transaction — not just that the payer said they paid. For wallet payments showing **Pending**, the confirmation is self-reported and should be cross-checked in the wallet app if there is any doubt.

---

## Retrying a failed payment

If a split request reaches `declined` or `expired`, it cannot be reactivated. To retry, the requester taps "Settle" again in the settlement screen, which creates a new split request starting from `created`. The failed record is preserved and visible in the badge history for the pair.

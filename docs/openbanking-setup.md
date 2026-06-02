# Open Banking Setup — Tink PIS (SEPA)

This guide walks through getting the Open Banking payment flow working end-to-end
in the ouiShare sandbox environment. It covers Tink console setup, Supabase secret
configuration, Edge Function deployment, and how to verify the flow is working.

> **Without credentials:** The app runs in mock OB mode whenever `TINK_CLIENT_ID` is
> not set. `ob-initiate` returns a fake authorization URL and `ouishare://ob-return`
> immediately, letting you test the UI flow locally without a Tink account.

---

## 1. Create a Tink sandbox account

1. Go to [console.tink.com](https://console.tink.com) and sign up.
2. Once logged in, create a new **App** (the console may call it an "application" or "client").
3. Under the app settings, ensure the following **scopes** are enabled:
   - `payment:write`
   - `payment:read`
4. Note down the **Client ID** and **Client Secret** — these go into Supabase secrets below.

> Tink's sandbox environment uses `api.tink.com` for all API calls. There is no
> separate sandbox subdomain; sandbox vs. production is determined by whether you
> use test or live credentials.

---

## 2. Register the redirect URI

In the Tink console, under your app's **Redirect URIs**, add:

```
ouishare://ob-return
```

This must match the value set in `TINK_REDIRECT_URI` exactly. When the payer
completes bank authorization, Tink redirects to this URI, which brings ouiShare
back to the foreground via the `expo-web-browser` auth session.

---

## 3. Register the webhook endpoint

In the Tink console, under **Webhooks**, register the following endpoint:

```
https://<your-project-ref>.supabase.co/functions/v1/ob-webhook
```

Enable the **payment** event type (Tink will send callbacks whenever a payment
status changes). Tink will display a **webhook secret** — copy it for the next step.

The `ob-webhook` Edge Function verifies incoming requests using HMAC-SHA256 with
the header `x-tink-signature`. If `TINK_WEBHOOK_SECRET` is not set, signature
verification is skipped (safe for local testing; do not skip in production).

---

## 4. Set Supabase Edge Function secrets

Run these commands in your terminal. All five values are required for the live OB
flow; the mock fallback activates automatically when `TINK_CLIENT_ID` is missing.

```bash
supabase secrets set TINK_CLIENT_ID=<your-client-id>
supabase secrets set TINK_CLIENT_SECRET=<your-client-secret>
supabase secrets set TINK_WEBHOOK_SECRET=<webhook-secret-from-tink-console>
supabase secrets set TINK_REDIRECT_URI=ouishare://ob-return
supabase secrets set TINK_MARKET=FR
```

`TINK_MARKET` is the ISO 3166-1 alpha-2 country code for the market you are
testing. Tink's PIS coverage varies by market. Supported values include `FR`,
`DE`, `ES`, `GB`, `SE`, `NL`. Set this to the market where your test bank
accounts are located.

---

## 5. Run the database migration

Migration `004_ob_fields.sql` adds `ob_payment_id` and `ob_provider` columns to
`split_requests` and extends the status constraint to include `authorized`. If you
have not run it yet:

```bash
supabase db push
```

Verify by checking that `split_requests` has the new columns:

```bash
supabase db diff
```

---

## 6. Deploy the Edge Functions

```bash
supabase functions deploy ob-initiate ob-status ob-webhook
```

To confirm deployment succeeded, check the Supabase dashboard under
**Edge Functions** and verify all three functions show a recent deployment timestamp.

---

## 7. Test the flow

### Test IBANs

Tink's sandbox accepts the following IBANs for test payments. Use these in the
IBAN input field in `BankPaymentScreen` — do not use real IBANs against the sandbox.

| Country | Test IBAN | Expected outcome |
|---------|-----------|-----------------|
| France | `FR7630006000011234567890189` | Payment proceeds through full lifecycle |
| Sweden | `SE3550000000054910000003` | Payment proceeds through full lifecycle |

### Expected status progression

After entering a test IBAN and tapping **Pay via bank transfer**:

```
created         — split_request saved before ob-initiate is called
request_sent    — ob-initiate succeeded; authorization URL opened in browser
authorized      — payer approved at the bank; SEPA transfer in transit
completed       — Tink webhook confirms funds settled
```

The `authorized → completed` transition arrives via webhook. For SEPA Instant
Credit Transfer this takes seconds; for standard SEPA it may take until end of
business day.

If the payer abandons the authorization flow, the status stays at `request_sent`.
If the bank rejects the payment, Tink sends a `REJECTED` or `CANCELLED` status
which maps to `declined`.

### Tink status → ouiShare status mapping

| Tink status | ouiShare status |
|-------------|----------------|
| `CREATED` | `pending` |
| `USER_AUTHORIZATION_REQUIRED` | `pending` |
| `INITIATED` | `authorized` |
| `AUTHENTICATED` | `authorized` |
| `PENDING` | `pending` |
| `PAID` | `completed` |
| `REJECTED` | `declined` |
| `CANCELLED` | `declined` |

---

## 8. Verify the webhook is being received

After a test payment completes, check the Edge Function logs to confirm the
webhook arrived and was processed:

```bash
supabase functions logs ob-webhook
```

A successful log line looks like:

```
[ob-webhook] mock_tink_<split-request-id> → completed
```

If you see `[ob-webhook] TINK_WEBHOOK_SECRET not set`, signature verification is
being skipped — set the secret and redeploy before testing in production.

If the webhook is not arriving, check:
- The webhook URL registered in the Tink console matches your project ref exactly
- The Edge Function is deployed (`supabase functions deploy ob-webhook`)
- The `ob-webhook` function is not returning a non-200 response (check logs)

---

## Quick-reference: all commands

```bash
# 1. Set secrets
supabase secrets set TINK_CLIENT_ID=...
supabase secrets set TINK_CLIENT_SECRET=...
supabase secrets set TINK_WEBHOOK_SECRET=...
supabase secrets set TINK_REDIRECT_URI=ouishare://ob-return
supabase secrets set TINK_MARKET=FR

# 2. Run migration
supabase db push

# 3. Deploy functions
supabase functions deploy ob-initiate ob-status ob-webhook

# 4. Check logs after a test payment
supabase functions logs ob-webhook
supabase functions logs ob-initiate
```

# Payment Integration — Open Items

Chunks C, A, and B are largely complete. The items below are the remaining gaps.

---

## Open: expo-web-browser

Replace `Linking.openURL` with the appropriate `expo-web-browser` primitive:

- **`StripeService.openCheckout`** → `WebBrowser.openBrowserAsync(url)` (in-app browser sheet; user taps Done to return without leaving the app)
- **`OpenBankingService.openAuthorizationUrl`** → `WebBrowser.openAuthSessionAsync(url, 'ouishare://ob-return')` (resolves promise when bank redirects back, eliminating AppState polling latency)
- **Deep-link wallets** — keep `Linking.openURL`; wallet deep-links must open the target app, not an in-app browser

Files:
- `src/infrastructure/services/StripeService.ts`
- `src/infrastructure/services/OpenBankingService.ts`

Add a no-op stub to simulation and test containers.

---

## Open: QR code in StripePaymentCard

Install `react-native-qrcode-svg` and render `<QRCode value={checkoutUrl} size={180} />` inside `StripePaymentCard` when status is `pending` or `request_sent`. The requester shows the card; the payer scans the QR code.

File: `src/components/ui/StripePaymentCard.tsx`

---

## Open: audit_log table

See **F8** in `TODO_features.md` — tracked there as it touches infrastructure, DI, and the Edge Functions.

---

## Open: BankSelectorSheet

See **F9** in `TODO_features.md` — tracked there as it spans UI, service, and the `ob-initiate` Edge Function.

---

## Open: statusColors utility

Create `src/core/utils/statusColors.ts` — single source of truth for `SplitRequestStatus → { bg, text, label }` mapping. Currently each component applies its own inline color logic.

---

## Open: PaymentContext

Create `src/context/PaymentContext.tsx` — React context exposing active `SplitRequest` records to all screens without prop-drilling. Useful as the payment UI grows more complex.

---

## Manual / operational steps

These require external system access and cannot be verified in code:

- **Stripe webhook** — register `https://<project-ref>.supabase.co/functions/v1/stripe-webhook` in the Stripe Dashboard under Developers → Webhooks. Subscribe to: `checkout.session.completed`, `checkout.session.expired`, `payment_intent.payment_failed`.
- **Local Stripe testing** — run `stripe listen --forward-to localhost:54321/functions/v1/stripe-webhook` with the Stripe CLI installed.
- **Expo Go device testing** — verify the full deep-link round-trip (C.6) on a physical device.

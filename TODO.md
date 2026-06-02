# WeShare — Open Work

All architecture improvements (repo split, state unification, resilience, type safety, code quality, tests) are complete.
All OCR receipt scanning is complete.
Payment integration Chunks C, A, and B are largely complete.

---

## Remaining items by effort

### High effort (~1–3 days each)

| Item | File | Notes |
|------|------|-------|
| F8 — `audit_log` table | `TODO_features.md` | Supabase migration + Edge Function inserts + IAuditLogRepository + DI wiring |
| F9 — `BankSelectorSheet` | `TODO_features.md` | IBankListService + TinkBankListService + UI sheet + ob-initiate backend change |

### Medium effort (~1–2 hrs each)

| Item | File | Notes |
|------|------|-------|
| F10 — Migrate PanResponder → GestureHandler | `TODO_features.md` | PaymentMethodSheet + ProportionalSplitBar |
| expo-web-browser | `TODO_payments.md` | StripeService + OpenBankingService; eliminates AppState polling latency for OB |
| QR code in StripePaymentCard | `TODO_payments.md` | `react-native-qrcode-svg` installation + component wiring |

### Low effort (~30 min each)

| Item | File | Notes |
|------|------|-------|
| `statusColors.ts` utility | `TODO_payments.md` | Centralise status → color mapping |
| `PaymentContext.tsx` | `TODO_payments.md` | Context for active SplitRequests |

### Manual / operational (no code)

| Item | Notes |
|------|-------|
| Register Stripe webhook | Stripe Dashboard → Developers → Webhooks |
| Local Stripe CLI testing | `stripe listen --forward-to localhost:54321/functions/v1/stripe-webhook` |
| Expo Go device testing | Verify deep-link round-trip on physical device |

# ouiShare — Architecture

ouiShare is a React Native bill-split app built with Expo. Its central design principle is a **dependency-injection container** that separates business logic from infrastructure, keeping features testable without native modules, and keeping the simulation mode (in-memory mocks) trivially available for demos and development.

---

## Layer diagram

```
┌─────────────────────────────────────────────────────────────────┐
│                          Expo Router                            │
│        app/(tabs)/  app/trip/  app/expense/  app/settle/        │
└──────────────────────────────┬──────────────────────────────────┘
                               │ renders
┌──────────────────────────────▼──────────────────────────────────┐
│                        Feature modules                          │
│  src/features/                                                  │
│    trips/        expenses/        settlement/                   │
│    balance/      invite/                                        │
│                                                                 │
│  Each module: components/ + hooks/ + screens/ + __tests__/      │
└────────────────┬─────────────────────────────┬─────────────────┘
                 │ useService()                 │ domain types
┌────────────────▼──────────────┐  ┌───────────▼─────────────────┐
│       DI container            │  │         Core layer          │
│  src/core/di/                 │  │  src/core/                  │
│                               │  │    models/   interfaces/    │
│  ServiceContext.tsx           │  │    logic/    schemas/        │
│  ServiceContainer.ts          │  │    types/    utils/          │
│  tokens.ts                    │  │    services/ di/             │
│                               │  │                             │
│  createProductionContainer()  │  │  No infrastructure imports. │
│  createSimulationContainer()  │  │  No React. Pure TypeScript. │
│  createTestContainer()        │  └─────────────────────────────┘
└────────────────┬──────────────┘
                 │ implements interfaces
     ┌───────────┴────────────┐
     │                        │
┌────▼────────────┐  ┌────────▼──────────────────────────────────┐
│  src/__mocks__/ │  │  src/infrastructure/                      │
│                 │  │                                           │
│  In-memory      │  │  supabase/         — Supabase clients,    │
│  implementations│  │    SupabaseTripRepository                 │
│  used by:       │  │    SupabaseExpenseRepository              │
│  • Jest tests   │  │    SupabaseMemberRepository               │
│  • Simulation   │  │    SupabaseSplitRepository                │
│    mode         │  │    SupabaseSplitRequestRepository         │
│                 │  │    SupabaseAuthService                    │
│                 │  │    rowSchemas.ts (Zod validation)         │
│                 │  │                                           │
│                 │  │  services/         — external APIs        │
│                 │  │    DeepLinkPaymentService                 │
│                 │  │    StripeService                          │
│                 │  │    OpenBankingService                     │
│                 │  │    NativeShareService                     │
│                 │  │                                           │
│                 │  │  payment/          — IPaymentMethod impls │
│                 │  │    DeepLinkPaymentMethod                  │
│                 │  │    StripePaymentMethod                    │
│                 │  │    OpenBankingPaymentMethod               │
└─────────────────┘  └───────────────────────────────────────────┘
```

---

## DI container

`src/core/di/ServiceContainer.ts` is a simple typed map of token → instance. The three factory functions produce different implementations behind the same interface:

| Factory | When used | Storage | Payments |
|---------|-----------|---------|----------|
| `createProductionContainer()` | Expo app (normal run) | Supabase | Real Stripe / Tink / wallet deep-links |
| `createSimulationContainer()` | `EXPO_PUBLIC_SIMULATE=true` | In-memory | Mock services, no external calls |
| `createTestContainer()` | Jest tests | In-memory | Mock services, controllable via test handles |

`ServiceProvider` (mounted in `app/_layout.tsx`) reads `Constants.expoConfig.extra.simulation` to pick the factory. Hooks and components never import infrastructure directly — they call `useService(TOKEN)` and receive whatever the container registered.

**Registered tokens:**

| Token | Interface | Production impl |
|-------|-----------|----------------|
| `TRIP_REPO` | `ITripRepository` | `SupabaseTripRepository` |
| `MEMBER_REPO` | `IMemberRepository` | `SupabaseMemberRepository` |
| `EXPENSE_REPO` | `IExpenseRepository` | `SupabaseExpenseRepository` |
| `SPLIT_REPO` | `ISplitRepository` | `SupabaseSplitRepository` |
| `SPLIT_REQUEST_REPO` | `ISplitRequestRepository` | `SupabaseSplitRequestRepository` |
| `AUTH` | `IAuthService` | `SupabaseAuthService` |
| `PAYMENT` | `IPaymentService` | `DeepLinkPaymentService` |
| `STRIPE` | `IStripeService` | `StripeService` |
| `OPEN_BANKING` | `IOpenBankingService` | `OpenBankingService` |
| `PAYMENT_REGISTRY` | `IPaymentMethodRegistry` | `PaymentMethodRegistry` |
| `SHARE` | `IShareService` | `NativeShareService` |
| `TRIP_STORE` | `ITripSessionStore` | Zustand store (wraps all repos) |

---

## State management

`TRIP_STORE` is a Zustand vanilla store (`src/store/tripSessionStore.ts`) that holds all in-session trip data. It is the single source of truth for trips, expenses, members, splits, and split requests while a trip is active.

Hooks read from the store via `useTripSessionStore(selector)`. Mutations write to both the store and the Supabase repository in a single action, so the UI updates immediately without a round-trip.

`ScreenWrapper` blocks rendering until the store is hydrated (`isHydrated === true`), preventing flashes of empty state on cold start.

---

## Supabase backend

### Database tables

| Table | Purpose | Migrations |
|-------|---------|-----------|
| `users` | Display name, avatar URL; mirrors `auth.users` | 001 |
| `trips` | Trip name, currency, owner, invite token | 001, 002 |
| `trip_members` | User ↔ trip membership, display name cache | 001 |
| `expenses` | Expense records with `total_amount_cents` | 001 |
| `splits` | Per-member share of each expense | 001 |
| `split_requests` | Payment intent lifecycle (see Payment layer below) | 003, 004 |

All monetary amounts are stored as integer cents. All timestamps are `timestamptz`. All tables have Row Level Security enabled — users can only read and write rows that belong to trips they are members of.

### Edge Functions

| Function | Method | Purpose |
|----------|--------|---------|
| `create-payment-link` | POST | Creates a Stripe Checkout Session, saves `stripeSessionId` to `split_requests` |
| `payment-status` | GET | Polls Stripe for the current checkout session status |
| `stripe-webhook` | POST | Receives Stripe events, verifies HMAC signature, updates `split_requests.status` |
| `ob-initiate` | POST | Calls Tink PIS to create a SEPA payment, returns authorization URL |
| `ob-status` | GET | Polls Tink for the current payment status |
| `ob-webhook` | POST | Receives Tink callbacks, verifies HMAC-SHA256, updates `split_requests.status` |

Shared utilities live in `supabase/functions/_shared/`: `cors.ts` (CORS headers), `supabase.ts` (admin and user-scoped clients), `tink.ts` (Tink PIS API helpers and status normalization).

---

## Payment layer (C → A → B)

The three payment layers were built in dependency order. Each reuses the `SplitRequest` data model.

### C — Deep-link wallets (Revolut, Lydia, Venmo, PayPal)

```
PaymentMethodSheet
  └─ PaymentMethodRegistry.getAvailable()
       └─ DeepLinkPaymentMethod.canHandle()  — Linking.canOpenURL('revolut://')
  └─ DeepLinkPaymentMethod.launch()
       └─ DeepLinkPaymentService.buildPaymentLink()  — constructs wallet-specific URL
       └─ SplitRequestRepository.saveSplitRequest()  — status: 'created'
       └─ Linking.openURL(walletUrl)                 — opens wallet app
       └─ SplitRequestRepository.updateSplitRequest() — status: 'request_sent'
  └─ useStatusPoller + AppState listener
       └─ "Did you complete the payment?" alert       — status: 'pending' | 'completed'
```

No server-side component. Status confirmation is manual (user taps "Yes" on return from wallet app). The wallet app does not send a callback.

### A — Stripe Checkout

```
PaymentMethodSheet
  └─ StripePaymentMethod.launch()
       └─ StripeService.createCheckoutSession()  — POST /functions/v1/create-payment-link
       └─ SplitRequestRepository.saveSplitRequest()  — status: 'created', stripeSessionId set
       └─ Linking.openURL(checkoutUrl)               — opens Stripe Checkout in browser
  └─ StripePaymentCard (rendered in SettlementScreen)
       └─ useStatusPoller — polls /functions/v1/payment-status every 6s + AppState foreground
  └─ stripe-webhook Edge Function (server-side)
       └─ checkout.session.completed → status: 'completed'
       └─ checkout.session.expired   → status: 'expired'
       └─ payment_intent.failed      → status: 'declined'
```

Status updates arrive via both client-side polling and server-side webhook. The webhook is the authoritative source; polling is the fallback while the browser is open.

### B — Open Banking / SEPA (Tink)

```
PaymentMethodSheet
  └─ OpenBankingPaymentMethod.launch()
       └─ router.push('/settle/bank-transfer', params)  — navigate to BankPaymentScreen

BankPaymentScreen
  └─ IBANInputField — IBAN entry with checksum validation and space formatting
  └─ handleSubmit()
       └─ SplitRequestRepository.saveSplitRequest()   — status: 'created'
       └─ OpenBankingService.initiatePayment()         — POST /functions/v1/ob-initiate
            └─ ob-initiate calls Tink PIS API
            └─ returns { authorizationUrl, obPaymentId, obProvider }
       └─ SplitRequestRepository.updateSplitRequest() — status: 'request_sent', obPaymentId set
       └─ OpenBankingService.openAuthorizationUrl()   — Linking.openURL(authorizationUrl)
  └─ useStatusPoller — polls /functions/v1/ob-status every 8s + AppState foreground
  └─ ob-webhook Edge Function (server-side)
       └─ Tink callback → tinkStatusToInternal() → update split_requests.status
            └─ authorized  (bank approved, SEPA in transit)
            └─ completed   (funds settled)
            └─ declined    (bank rejected)
            └─ expired     (authorization window passed)
```

---

## Screen map

```
app/
  (tabs)/
    index.tsx          — Trips list (home screen)
    balance.tsx        — Cross-trip balance summary
  trip/
    [id].tsx           — Trip detail: expense list + member list
    create.tsx         — New trip form
    edit.tsx           — Edit trip name / currency
  expense/
    add.tsx            — Add expense with split assignment
    edit.tsx           — Edit existing expense
    [id].tsx           — Expense detail with split breakdown
  settle/
    [tripId].tsx       — Settlement screen: who owes whom, payment CTAs
    bank-transfer.tsx  — BankPaymentScreen (OB/SEPA flow)
  invite.tsx           — Share invite link / QR
  join/[token].tsx     — Accept invite, join trip
```

---

## Adding a new service

Follow the 4-step pattern:

1. Define the interface in `src/core/interfaces/IMyService.ts`
2. Write the production implementation in `src/infrastructure/services/MyServiceImpl.ts`
3. Write the mock in `src/__mocks__/MockMyService.ts`
4. Register both in `src/core/di/`:
   - Add a token to `tokens.ts`
   - Register the production impl in `productionContainer.ts` (dynamic import)
   - Register the mock in `simulationContainer.ts` and `testContainer.ts` (require)

Hooks and components call `useService(MY_TOKEN)` and receive whichever implementation the container provides. No direct infrastructure imports anywhere in `src/features/` or `src/hooks/`.

---

## Testing

Tests live in `src/features/**/__tests__/` and `src/components/ui/__tests__/`. Every test calls `createTestContainer()` to get in-memory implementations — no SQLite, no network, no native modules.

Run the full suite:

```bash
npm test
```

Run a single file:

```bash
npx jest src/features/settlement/__tests__/stripePayment.test.ts
```

511 tests as of the last architecture review.

# WeShare — Feature Work (Open Items)

F1–F7 are complete. Sections below cover the three remaining items.

---

## F8 — `audit_log` table: append-only event log

**Estimate: ~1 day**

### Problem
The `split_requests` table is mutable — status transitions overwrite previous state. Debugging a stuck payment requires reading Stripe Dashboard or Tink Console outside the app. No server-side record of when each transition happened or what payload was received.

### Steps

1. **Supabase migration** — add `audit_log` table:

```sql
create table audit_log (
  id          uuid primary key default gen_random_uuid(),
  entity_type text not null,          -- 'split_request'
  entity_id   text not null,          -- split_request.id
  event_type  text not null,          -- 'stripe.checkout.completed', 'ob.authorized', etc.
  payload     jsonb,                  -- raw webhook payload (redact PII before storing)
  created_at  timestamptz not null default now()
);
create index on audit_log (entity_id, created_at desc);
```

2. **Edge Function updates** — inside `stripe-webhook`, `ob-status`, and `ob-webhook`, insert a row into `audit_log` after each status update. Fire-and-forget (failure must not fail the webhook response).

3. **`IAuditLogRepository`** (`src/core/interfaces/IAuditLogRepository.ts`) — `getEventsForRequest(splitRequestId): Promise<Result<AuditEvent[], AppError>>`.

4. **`SupabaseAuditLogRepository`** — queries `audit_log` ordered by `created_at desc`.

5. **`InMemoryAuditLogRepository`** — mock for tests and simulation mode.

6. **DI wiring** — add `AUDIT_LOG` token, register both implementations in all three containers.

7. **Optional: surface in `AuditDetailScreen`** — show granular events below SplitRequest summary rows.

### Risk
Webhook payloads may contain PII. The `payload` column must redact sensitive fields before storing, or RLS must restrict read access to service-role only.

---

## F9 — `BankSelectorSheet`: Tink bank picker

**Estimate: ~2–3 days**

### Problem
`BankPaymentScreen` jumps straight to IBAN entry without asking which bank the user uses. Tink routes SEPA payments to specific bank integrations based on the payer's bank; without selecting a bank, Tink uses a generic flow that may not support instant credit transfer in all markets.

### Steps

1. **`IBankListService`** (`src/core/interfaces/IBankListService.ts`):
   ```ts
   getBanks(market: string): Promise<Result<Bank[], AppError>>
   // Bank = { id: string; name: string; logoUrl: string }
   ```

2. **`TinkBankListService`** (`src/infrastructure/services/TinkBankListService.ts`) — calls Tink PIS bank list endpoint with `TINK_MARKET`. Cache result in AsyncStorage with 24-hour TTL.

3. **`MockBankListService`** — returns hardcoded 3–5 fictional banks for simulation mode and tests.

4. **`BankSelectorSheet` component** — bottom sheet (same Modal pattern as `PaymentMethodSheet`) with:
   - Search `TextInput` filtering banks by name
   - `FlatList` of bank rows (logo + name)
   - Selection dismisses sheet and sets `selectedBank` in `BankPaymentScreen`

5. **Integration in `BankPaymentScreen`** — show "Select your bank" row before IBAN input. Bank selection is optional (payment proceeds without it) but pre-fills routing metadata.

6. **Backend: pass `providerId` to `ob-initiate`** — Edge Function must accept and forward optional `providerId` to Tink's initiation API.

7. **DI wiring** — add `BANK_LIST` token, register all three implementations.

8. **Tests** — unit test with mock, test bank search filtering, test BankPaymentScreen with and without selected bank.

### Risk
Cannot be developed or tested without Tink sandbox credentials and a running `ob-initiate` Edge Function.

---

## F10 — Migrate `PanResponder` → `useAnimatedGestureHandler`

**Estimate: ~1–2 hrs**

### Problem
Two components use `PanResponder` (JS thread), while all other animations run on the UI thread via Reanimated. Heavy gestures can stutter if the JS thread is busy.

- `src/features/settlement/components/PaymentMethodSheet.tsx` — drag-to-dismiss bottom sheet
- `src/features/expenses/components/ProportionalSplitBar.tsx` — drag slider for proportional splits

### Steps

1. **`PaymentMethodSheet`** — replace `PanResponder` with `PanGestureHandler`. `onActive` mutates `translateY` directly in a worklet; `onEnd` springs to closed or open based on velocity and position.

2. **`ProportionalSplitBar`** — replace `PanResponder` with `PanGestureHandler`. `onActive` computes new width from `translationX`, clamps, mutates shared value in worklet.

### Note
Verify `GestureHandlerRootView` is already wrapping the app root in `app/_layout.tsx` (required by `react-native-gesture-handler`).

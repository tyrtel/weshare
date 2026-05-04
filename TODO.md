# WeShare — UI & state layer TODO

> **Architect rules:** Work through each phase in order. Before starting a phase, summarise what you are about to do and wait for confirmation. After completing a phase, summarise what was built and what the next phase will do.

> **Context:** Phases 1–11 of the original build plan are complete ✅. The DI container, Supabase infrastructure, domain models, and feature hooks/screens all exist. This TODO covers the remaining work: a Zustand client-state layer on top of the existing services, derived computation hooks, UI polish, and the final coverage gate.

> **Engineering principles — non-negotiable:**
> - **Single responsibility**: stores hold state, services handle I/O, hooks compose them for components. No business logic in components.
> - **Dependency injection**: the Zustand store factory accepts an `IStorageService` — never imports infrastructure directly. Tests inject `InMemoryStorageService`.
> - **Interface-first**: define or extend TypeScript interfaces before writing implementations.
> - **Open/closed**: swapping backends (Supabase → SQLite → memory) must not touch any hook or store — only the DI composition root.
> - **No `any`**: zero `any` types in the state layer.

---

## 0. Bootstrap

- [x] 0.1 Audit `package.json` — confirm `zustand` and `zod` are absent
- [x] 0.2 Install `zustand` and `zod`
- [x] 0.3 Verify `tsc --noEmit` baseline — pre-existing errors only (Supabase `never` types from missing `gen types` run; Expo tsconfig quirk). No new errors introduced.
- [x] 0.4 Commit package changes with a `chore: add zustand + zod` message

---

## 1. Zod schemas & runtime validation

Files in `src/core/schemas/`

- [x] 1.1 `billSessionSchema.ts` — Zod schemas mirroring existing domain models (`Trip`, `Expense`, `Split`, `TripMember`, `Settlement`). These are used to validate data rehydrated from the Zustand persist layer before it is accepted into the store — protecting against stale or malformed persisted state.
- [x] 1.2 Export a `safeParse<T>(schema, data)` helper that returns `Result<T, ValidationError>` using the existing `Result` type from `src/core/types/Result.ts`
- [x] 1.3 Unit tests: valid object passes, missing required field fails with `ValidationError`, extra fields are stripped

---

## 2. Zustand store — trip session state

Files in `src/store/`

The existing feature hooks (`useTrips`, `useTripDetail`, `useAddExpense`, etc.) call `IStorageService` directly on every render cycle. The Zustand layer introduces a client-side cache so screens share state without redundant fetches.

- [x] 2.1 Define `ITripSessionStore` interface (state shape + action signatures) in `src/core/interfaces/ITripSessionStore.ts` before opening any store file
- [x] 2.2 Implement `createTripSessionStore(storage: IStorageService)` factory using `zustand/vanilla` `createStore` (no React bindings — factory pattern, tests call `store.getState()` directly). No persist middleware — Supabase is the persistence layer; `isHydrated` is managed as plain state.
  - State: `activeTripId`, `trips: Trip[]`, `expenses: Record<string, Expense[]>`, `members: Record<string, TripMember[]>`, `isHydrated`, `hydrationError`
  - Actions: `loadTrips`, `loadTripDetail(tripId)`, `addExpense`, `removeExpense`, `markSettled`, `setActiveTrip`, `resetSession`
- [x] 2.3 Zod validation runs on every `IStorageService` response via `safeParse`; invalid items are silently dropped (store never crashes on bad data)
- [x] 2.4 `TRIP_STORE` token added to `tokens.ts`; store registered in all four containers (`productionContainer`, `testContainer`, `simulationContainer`); `useTripSessionStore()` hook (with optional selector overload) exported from `ServiceContext.tsx`
- [x] 2.5 21 unit tests: initial state, `loadTrips` (success, error, partial Zod failure, all-invalid fallback, error recovery), `loadTripDetail` (success, multi-trip isolation, error cases), `addExpense`, `removeExpense`, `markSettled` (nested split update, no cross-expense mutation), `setActiveTrip`, `resetSession`

---

## 3. Derived computation hooks

Files in `src/hooks/` (shared hooks, not feature-scoped)

Each hook has exactly one responsibility and reads exclusively from the Zustand store — never from `AsyncStorage` or `IStorageService` directly.

- [x] 3.1 `useSplitTotals(personId, tripId)` → `SplitTotals` with `foodTotalCents`, `taxShareCents` (0, embedded in model), `serviceShareCents` (0), `grandTotalCents`, `currency`, and `.display` companions formatted via `Intl.NumberFormat`
- [x] 3.2 `useAssignmentState(tripId)` → `{ assignments: Record<ExpenseId, UserId[]>, unassignedExpenses: Expense[], assignExpense (stub), unassignExpense (stub) }` — mutation stubs pending Phase 5 split-mutation store actions
- [x] 3.3 `usePeopleWithTotals(tripId)` → `MemberWithTotal[]` each decorated with `grandTotalCents` + `grandTotalDisplay`
- [x] 3.4 27 tests covering: zero-item, single assignee, multi-assignee shared item, three-way rounding (100¢ and 1000¢ cases), all-settled edge case, multi-expense accumulation, display formatting, `deriveAssignments` (all edge cases), `computePeopleWithTotals` (all edge cases)
- [x] Pure computation functions extracted to `src/hooks/computations/` (no React/Expo imports) — hooks are thin wrappers. Tests import from `computations/` directly to avoid `expo-modules-core` transitive dependency.

---

## 4. Session lifecycle

Files in `src/hooks/useSessionPersistence.ts`

Zustand's `persist` middleware rehydrates asynchronously on React Native. Components must not render stale data before hydration completes.

- [ ] 4.1 `useSessionPersistence()` → `{ isHydrated: boolean, hydrationError: Error | null, resetSession: () => void }`
  - `isHydrated` starts `false`, flips `true` inside `onRehydrateStorage` success callback
  - `hydrationError` captures any Zod parse or storage failure from §2.3
- [ ] 4.2 `ScreenWrapper` (already exists in `src/components/ui/`) updated to gate render on `isHydrated` — shows a skeleton or spinner while `false`
- [ ] 4.3 Unit test: `isHydrated` is `false` before hydration callback fires, `true` after

---

## 5. UI polish — Phase 12 carry-over

These items were left unfinished at the end of the original build plan.

- [ ] 5.1 **Haptic feedback** — add `expo-haptics` calls (already installed) on:
  - Expense save success → `Haptics.notificationAsync(NotificationFeedbackType.Success)`
  - Settlement pay tap → `Haptics.impactAsync(ImpactFeedbackStyle.Medium)`
  - Destructive actions (remove expense, reset session) → `Haptics.notificationAsync(NotificationFeedbackType.Warning)`
- [ ] 5.2 **Optimistic UI on expense add** — `addExpense` action in the Zustand store appends the new expense to local state immediately (with a `pending: true` flag), then calls `IStorageService.createExpense`. On failure, rolls back the optimistic entry and surfaces an `AppError` via the existing `hydrationError` channel.
- [ ] 5.3 **Error boundary components** — create `src/components/ErrorBoundary.tsx` (class component, required for React error boundaries) wrapping a `retry` callback prop. Wrap `TripDetailScreen`, `AddExpenseScreen`, and `SettlementScreen`. On error, render a styled card using design tokens with a Retry button.
- [ ] 5.4 **Offline detection banner** — create `src/components/OfflineBanner.tsx` using `@react-native-community/netinfo` (install if absent). Fixed-position amber strip (reuse `SimulationBanner` styling) shown when `NetInfo.isConnected === false`. Mount in `app/_layout.tsx` alongside `SimulationBanner`.

---

## 6. Documentation

- [ ] 6.1 **README.md** — at project root, covering:
  - Architecture overview (DI container → services → Zustand store → hooks → screens)
  - Folder map (`src/core/`, `src/features/`, `src/store/`, `src/hooks/`, `src/infrastructure/`)
  - How to add a new service (the 4-step pattern from CLAUDE.md)
  - How to run tests (`npm test`, `npm run test:watch`, `npm run test:coverage`)
  - How to run simulation mode (`npm run simulate`)
  - How to run the dev server and connect a device

---

## 7. Final quality gate

- [ ] 7.1 `npx jest --coverage` — core logic (`src/core/logic/`) and hooks (`src/hooks/`, `src/features/**/hooks/`) must report **>80% line coverage**
- [ ] 7.2 `tsc --noEmit` — zero type errors
- [ ] 7.3 `npm run lint` — zero lint errors
- [ ] 7.4 Confirm `AsyncStorage` (if installed) is imported in exactly one file. Confirm `IStorageService` is the only storage abstraction used in hooks and stores.
- [ ] 7.5 Confirm no business logic (split math, settlement calculation, validation) has leaked into any component or screen file
- [ ] 7.6 Mark all items in this TODO complete

---

## Architect notes

**On amounts:** All money is integer cents throughout the store and hooks. `Intl.NumberFormat` is called only at the display boundary inside hooks — never inside components.

**On the Result type:** Every `IStorageService` method returns `Promise<Result<T, AppError>>`. The Zustand store unwraps Results and maps errors to `hydrationError` or action-level error state. Hooks expose `{ data, error, loading }`. UI never catches raw exceptions.

**On the DI root:** `src/core/di/ServiceContext.tsx` remains the single composition point. The Zustand store singleton is created there and exported via a `useTripSessionStore` hook from `ServiceContext`. Nothing else instantiates `SupabaseStorageService` or `InMemoryStorageService`.

**On Phase 12 carry-overs:** Items in §5 (haptics, optimistic UI, error boundaries, offline banner) should be done after the Zustand layer (§§2–4) is stable, since optimistic UI in particular depends on the store's action/rollback pattern.

**On guests vs accounts:** Guest users (`isGuest: true`) are already supported via `SupabaseAuthService`. The Zustand store must not make assumptions about session permanence — `resetSession` must work for both guest and authenticated users.

# Auth Implementation Gap Report

Compares `docs/auth-design.md` against the actual code as of 2026-06-24.

Sources examined:
- `src/infrastructure/supabase/supabaseClient.ts`
- `src/infrastructure/supabase/SupabaseAuthService.ts`
- `src/infrastructure/supabase/LargeSecureStore.ts`
- `src/core/interfaces/IAuthService.ts`
- `src/__mocks__/MockAuthService.ts`
- `src/core/di/productionContainer.ts` / `simulationContainer.ts` / `testContainer.ts`
- `src/core/di/ServiceContext.tsx`
- `app/_layout.tsx` (AuthGate)
- `app/auth/index.tsx` / `signup.tsx` / `verify.tsx` / `forgot-password.tsx`
- `app.config.ts`
- `src/infrastructure/__tests__/SupabaseAuthService.test.ts`

---

## Section 1 — What the implementation actually does

### Startup / singleton guard

`ServiceContext.tsx` stores the container promise on `globalThis.__weShareContainerPromise`
rather than a module-level variable. The comment explains this is required because Metro can
evaluate the same module from two different resolved paths, giving each evaluation its own
closure. A module-level variable alone would not survive that. `getAuthService()` in
`SupabaseAuthService.ts` adds a second guard with a module-level `_instance`, ensuring
exactly one `SupabaseAuthService` exists per JS bundle regardless of how many times
`createProductionContainer` runs.

### Supabase client configuration

```
supabaseClient.ts
  autoRefreshToken: !isSimulation
  persistSession:   !isSimulation
  detectSessionInUrl: false
  storage: isSimulation || web ? undefined : LargeSecureStore
```

In simulation mode the Supabase client is created with no storage and no auto-refresh.
This prevents a stale production session from surfacing in the simulator. The client is
still importable (needed by live OCR path) but is effectively inert for auth.

### LargeSecureStore

1800-byte chunk size. On every `setItem()` it deletes all previous layout (chunked or
single) before writing. The chunk count is stored in `{key}_n`; chunks in `{key}_0`,
`{key}_1`, etc. A missing chunk on read is treated as full failure (returns `null`) rather
than returning partial data.

### SupabaseAuthService internals

**Internal state:**

```
_currentUser: User | null        — in-memory app User model
_expiresAt:   number             — Unix seconds; 0 means "skip expiry check"
_readyPromise: Promise<void>     — resolves when getInitialUser() finishes
_initialUserPromise: Promise<...>— deduplication guard, set on first call
```

**Constructor side effects:**
1. Creates `_readyPromise` with an extractable `_readyResolve`
2. Adds a Sentry breadcrumb
3. Calls `pingSupabase()` — a fire-and-forget fetch to the Supabase REST endpoint to
   trigger GoTrue warm-up before `getInitialUser()` awaits `getSession()`
4. Registers one permanent `supabase.auth.onAuthStateChange` listener (internal)

**Internal `onAuthStateChange` listener behaviour:**
- `TOKEN_REFRESHED` with session → updates `_expiresAt` only; does not touch `_currentUser`
- No session → clears `_currentUser`, `_expiresAt`, calls `_clearUserCache()`
- Any other event with session → calls `_fetchUser()` and updates `_currentUser` if result
  is non-null

**`getInitialUser()` / `_doGetInitialUser()`:**

Cache-hit path (returning user):
1. `_readUserCache()` reads `weshare_user_v1` from SecureStore (~5 ms)
2. Sets `_currentUser` to the cached value immediately
3. Fires `supabase.auth.getSession()` in the background (void promise)
4. Background callback: validates session, updates `_expiresAt`, then re-fetches user
   profile from `public.users` and refreshes the cache
5. Calls `_readyResolve()` in `finally` block

Cache-miss path (first install or post-sign-out):
1. Calls `supabase.auth.getSession()` with a **65-second** `_withTimeout`
2. On success: reads `session.user.id`, calls `_fetchUser()` with an **8-second** inner
   timeout using `Promise.race`
3. Writes user to cache, sets `_currentUser`
4. `_readyResolve()` in `finally`

**Public `onAuthStateChange` listener (the one consumers subscribe to):**

This registers a *second* Supabase `onAuthStateChange` subscription on top of the
constructor's. Key branching:

- `TOKEN_REFRESHED` + `_currentUser.id === session.user.id` → calls listener with
  `_currentUser` immediately (no DB hit)
- `TOKEN_REFRESHED` + `_currentUser` is null + `_initialUserPromise` exists → awaits the
  initial promise and calls listener with its result if IDs match
- `TOKEN_REFRESHED` + neither condition → falls through to `_fetchUser()` (DB hit)
- Any other event with session → `_fetchUser()` then calls listener

### AuthGate (`app/_layout.tsx`)

```
useEffect
  auth.getInitialUser()  →  .then(setUser + setAuthReady)
  auth.onAuthStateChange →  setUser only
  cleanup: cancelled flag + unsub
```

`authReady` only becomes `true` once `getInitialUser()` resolves. The navigation redirect
effect depends on `authReady`, so the app never redirects until the session restore
completes. The loading screen shown while `!authReady` has a debug-reset button that calls
`auth.debugSignOut()` (local-only, no network call).

### Sign-in flows

**Email/password:**
- `signIn()`: `_withRetry(3, 5 000 ms)` wrapping `_withTimeout(20 000 ms)` around
  `supabase.auth.signInWithPassword()`
- On success: `_fetchUser()` → `_writeUserCache()` → returns `ok(user)`
- Timeout error text is replaced by `coldStartMessage()` which detects GoTrue JSON parse
  errors (non-JSON HTML body during cold-start) and surfaces a human-readable message

**Google:**
- `GoogleSignin.configure({ webClientId: Constants.expoConfig?.extra?.googleWebClientId })`
- `GoogleSignin.hasPlayServices()` → `GoogleSignin.signIn()` → extracts `idToken`
- `_withRetry(3, 5 000 ms)` + `_withTimeout(20 000 ms)` → `supabase.auth.signInWithIdToken()`
- `_upsertUser()` with display name from Google user object, `_withTimeout(10 000 ms)`
- Avatar URL taken from `userInfo.data?.user?.photo`

**Apple:**
- `Platform.OS !== 'ios'` guard → returns `AuthError` on Android
- `expo-apple-authentication` requested scopes: `FULL_NAME` + `EMAIL`
- Falls back gracefully when Apple doesn't provide a name (repeat sign-in), using
  `email.split('@')[0]` or `'User'`
- Same retry/timeout pattern, no avatar stored

**Sign-up + OTP:**
- `signUp()`: no retry, no timeout — single call to `supabase.auth.signUp()`
- Returns `{ needsEmailConfirmation: true }` when `session === null`
- `verifyOtp()`: `_withTimeout(20 000 ms)`, no retry; creates profile via `_upsertUser()`

### Config / environment

```
app.config.ts
  extra.googleWebClientId  ←  process.env.GOOGLE_WEB_CLIENT_ID ?? ''
  android.package          = 'com.ouishare.app'
  scheme                   = 'ouishare'

Plugins registered:
  @react-native-google-signin/google-signin  (webClientId, iosUrlScheme)
  expo-apple-authentication
  expo-secure-store
```

`GOOGLE_IOS_URL_SCHEME` falls back to `'com.googleusercontent.apps.placeholder'` when the
env var is absent.

### Simulation mode specifics

`simulationContainer.ts` uses `MockAuthService` which auto-signs-in as
`RESTAURANT_CURRENT_USER_EMAIL`. When `USE_LIVE_OCR=true`, it additionally calls
`supabase.auth.signInAnonymously()` so the Supabase client holds a valid JWT for
Edge Function calls. This anonymous session is NOT persisted (storage adapter is disabled
in simulation mode).

### Test coverage

`SupabaseAuthService.test.ts` mocks `supabaseClient` and `SecureStore`. Coverage:
`signIn` (success + auth error + missing profile), `signOut` (success + failure),
`currentUser` (null before sign-in, null after sign-out, null when expired, present when
valid, skip when `expires_at` absent), `signUp` (session + needsEmailConfirmation +
Supabase error + upsert failure), `verifyOtp` (success + invalid token + upsert failure),
`onAuthStateChange` (returns unsubscribe function).

`getInitialUser()` has zero test coverage. `signInWithGoogle()` and `signInWithApple()`
have zero test coverage. The `TOKEN_REFRESHED` race logic in the public listener has zero
test coverage.

---

## Section 2 — Gap report

### CONFIRMED CORRECT — design matches implementation

| Design claim | Verdict |
|---|---|
| Session stores access_token, refresh_token, expires_at, user | Correct — `_expiresAt` tracks it, SDK stores full JSON |
| `LargeSecureStore` chunked at 1 800 bytes | Correct — `CHUNK_SIZE = 1800` |
| `weshare_user_v1` cache key | Correct |
| `detectSessionInUrl: false` | Correct |
| Module-level singleton via `getAuthService()` | Correct |
| `pingSupabase()` fires in constructor | Correct |
| Cache-first rehydration, background `getSession()` | Correct |
| TOKEN_REFRESHED skips DB fetch via `_currentUser` reuse | Correct — both listeners implement this |
| `debugSignOut()` uses `scope: 'local'` | Correct |
| `webClientId` read from `extra.googleWebClientId` | Correct |
| `GOOGLE_WEB_CLIENT_ID` from EAS env / `app.config.ts` | Correct |
| Google `idToken` discarded after Supabase call | Correct — not stored anywhere |
| `autoRefreshToken: true`, `persistSession: true` in production | Correct |
| Storage adapter disabled in simulation mode | Correct |
| Retry (3×, 5 s delay) on sign-in and Google sign-in | Correct |
| `_withTimeout(20 000 ms)` on sign-in calls | Correct |
| Apple Sign-In blocked on Android | Correct — Platform guard present |

---

### GAP 1 — Password reset is not implemented

**Design says:** The app has a `forgot-password` route linked from the sign-in screen.

**Reality:** `app/auth/forgot-password.tsx` is a static placeholder:

> "Password reset is coming soon. In the meantime, sign in with Google or Apple..."

There is no call to `supabase.auth.resetPasswordForEmail()` anywhere in the codebase. The
`IAuthService` interface has no `resetPassword` method. The design doc says nothing about
this being deferred.

**Impact:** Users who forget their email/password and have no linked social account cannot
recover their account.

---

### GAP 2 — OTP resend is broken

**Design says:** `verifyOtp()` is fully implemented. The verification screen handles the
full OTP flow.

**Reality:** `app/auth/verify.tsx` — `handleResend()`:

```tsx
async function handleResend() {
  // signUp with the same credentials triggers Supabase to re-send the OTP.
  // We don't have the password here, so we navigate back to let the user retry.
  router.back();
}
```

The comment describes the intended design but acknowledges it is not implemented. The
`resent` state variable is declared but never set to `true`, so the "Code sent!" feedback
text is unreachable. The user is sent back to the sign-up screen to re-enter their
password in order to trigger a resend.

**Impact:** Any user who doesn't receive the OTP email (spam folder, delay, typo) has to
navigate back and re-enter all their credentials. The `resent` dead state and the broken
button leave the UI in a misleading state.

---

### GAP 3 — Cache-first path does not handle a null session on background validation

**Design says:**

> "If the refresh token is somehow invalidated (admin sign-out, session revocation), the
> cache still returns a User but the Supabase client will fire `SIGNED_OUT` shortly after,
> which clears `_currentUser`."

**Reality:** The background `getSession()` branch in `_doGetInitialUser()`:

```ts
void supabase.auth.getSession()
  .then(({ data, error }) => {
    if (error) {
      Sentry.captureMessage(`session_bg_error: ${error.message}`, 'warning');
      return;          // ← _currentUser not cleared
    }
    if (!data.session) {
      Sentry.captureMessage('session_bg_null', 'warning');
      return;          // ← _currentUser not cleared, cache not cleared
    }
    ...
  })
```

When the background `getSession()` returns no session (refresh token invalid or rotated
away), the code fires a Sentry warning and does nothing else. `_currentUser` stays set to
the cached user. The user-facing cache (`weshare_user_v1`) is not cleared.

The design's stated recovery path — `SIGNED_OUT` via `onAuthStateChange` — only fires if
GoTrue actively triggers an event. `getSession()` reading from storage does not make a
network call to validate the refresh token unless the access token is expired. A user whose
Supabase session was admin-revoked while the access token was still valid will remain
"logged in" in the app for up to the JWT TTL (default 1 hour) with no `SIGNED_OUT` event.

**Impact:** Revoked sessions are not detected during the cache-first warm startup. App
calls that reach the DB will return RLS errors, but the user will not be redirected to
sign-in until either the JWT expires naturally or a Supabase event fires.

---

### GAP 4 — 65-second session timeout is extreme

**Design says:**

> "If GoTrue is cold-starting on the free tier, that refresh takes 10–30 seconds."

**Reality:** `_doGetInitialUser()` uses `_withTimeout(sessionPromise, 65_000)` — 65
seconds. This means a user with an empty cache (first install, post-sign-out) who hits a
sleeping Supabase project stares at a loading screen for up to 65 seconds before the app
decides nobody is logged in and shows the sign-in screen.

GoTrue free-tier cold-start is typically 5–15 seconds. The `pingSupabase()` call in the
constructor reduces the window (it warms the HTTP connection before `getSession()` is
awaited), but 65 seconds is still the outer bound the user can wait.

The inner `_fetchUser()` timeout after a successful session restore is `Promise.race` at 8
seconds, which is more reasonable.

**Impact:** In the worst case, cold-start on first install / after sign-out produces a
loading screen that lasts over a minute before giving the user any feedback or navigation.
There is no progress indicator or intermediate message during the wait.

---

### GAP 5 — AppState handling absent

**Design says:**

> `autoRefreshToken: true` keeps sessions alive silently.

**Reality:** This is true, but only covers the case where the app is in the foreground or
recently backgrounded. There is no `AppState.addEventListener('change', ...)` anywhere in
the auth layer. If the device has been offline for hours and comes back online while the
app is backgrounded, the GoTrue auto-refresh may not fire until the app is next foregrounded
and a Supabase API call triggers the SDK to notice the expired token.

The design doc does not recommend AppState handling, but does not flag the absence as
acceptable either. Common pattern in production Supabase + React Native apps:

```ts
AppState.addEventListener('change', state => {
  if (state === 'active') supabase.auth.startAutoRefresh();
  else                    supabase.auth.stopAutoRefresh();
});
```

Without this, on low-end Android devices that aggressively background-kill JS, there is a
window after foreground restore where an expired token is used before the refresh completes.

**Impact:** Low frequency, but produces 401 errors on first post-background API call until
the auto-refresh catches up.

---

### GAP 6 — Refresh token rotation status is unknown and unverifiable

**Design says:**

> "Refresh token rotation (recommended: on) ... The pre-clear + rewrite pattern in
> `LargeSecureStore.setItem()` handles the case where a crash between invalidation and
> storage write could strand the user."

**Reality:** Rotation is a Supabase Dashboard setting. The code is written correctly to
handle rotation being on (the pre-clear pattern). But there is no code-level indicator of
whether rotation is actually enabled in the project, and no test that simulates the
rotation scenario. If rotation is off, the pre-clear overhead is unnecessary. If rotation
is on and a crash occurs mid-write, the user is silently signed out with no recovery path.

The design doc recommends it but gives no steps for verifying or testing it. There is no
documentation of the current Dashboard state.

---

### GAP 7 — Two active Supabase listeners per consumer, not one

**Design says:**

> "The module-level singleton ensures exactly one auth service instance exists per JS
> bundle lifetime."

**Reality:** The singleton ensures one `SupabaseAuthService`. But it does not mean one
Supabase listener. The constructor always registers one permanent listener. Every call to
`auth.onAuthStateChange(fn)` in application code registers a *second* listener on the
underlying Supabase client.

`AuthGate` calls `auth.onAuthStateChange(setUser)`. This means during normal app operation
there are two active Supabase `onAuthStateChange` subscriptions:

1. The constructor's internal listener (permanent, never unsubscribed)
2. The `AuthGate` listener (unsubscribed on component unmount via the returned function)

For every auth event, both listeners fire. The constructor's listener updates internal
state; the AuthGate listener calls `setUser`. This is the intended design, but the phrasing
in the design doc ("exactly one auth service instance") implies one listener, which is
misleading. If additional components also call `auth.onAuthStateChange()`, each adds
another Supabase subscription.

**Impact:** Functionally correct but easy to misread. A future developer adding
`auth.onAuthStateChange()` in a screen component (rather than `AuthGate`) would register
a third subscription that never gets cleaned up unless they store and call the returned
unsubscribe function.

---

### GAP 8 — iOS Google Sign-In placeholder URL scheme

**Design says:**

> "GOOGLE_IOS_URL_SCHEME when adding iOS support (reversed iOS client ID). Replace
> GOOGLE_IOS_URL_SCHEME EAS secret when adding iOS support."

**Reality:** `app.config.ts`:

```ts
iosUrlScheme: process.env.GOOGLE_IOS_URL_SCHEME ?? 'com.googleusercontent.apps.placeholder',
```

The placeholder string is a syntactically valid reversed client ID format but points to
nothing. On an iOS build where `GOOGLE_IOS_URL_SCHEME` is not set as an EAS secret,
Google Sign-In will attempt to redirect back via this scheme and the redirect will silently
fail — the user completes the Google picker and the app hangs. There is no runtime guard
that warns when the value is the placeholder.

The design doc calls this out as needing configuration, but does not flag the missing
guard as a risk.

---

### GAP 9 — `getInitialUser()` and the TOKEN_REFRESHED race have zero test coverage

**Design says (implicitly):** The rehydration path is described in detail and acknowledged
as the source of past bugs.

**Reality:** `SupabaseAuthService.test.ts` tests `signIn`, `signOut`, `currentUser`,
`signUp`, `verifyOtp`, and the `onAuthStateChange` unsubscribe plumbing. It does not test:

- `getInitialUser()` cache-hit path
- `getInitialUser()` cache-miss path
- `getInitialUser()` timeout behaviour
- The TOKEN_REFRESHED early-event race (`token_refreshed_awaiting_initial_promise` branch)
- `signInWithGoogle()`
- `signInWithApple()`
- `_writeUserCache()` / `_readUserCache()` / `_clearUserCache()`

The most complex and historically bug-prone code has the least test coverage.

---

### GAP 10 — Observability layer not in design doc

**Design says:** Nothing.

**Reality:** The implementation is heavily Sentry-instrumented. Every significant step in
`_doGetInitialUser()`, both `onAuthStateChange` listeners, `_fetchUser()`, and all sign-in
flows emit `Sentry.addBreadcrumb()` calls. Some steps emit `Sentry.captureMessage()`.
`pingSupabase()` emits breadcrumbs for both success and failure. `LargeSecureStore` uses
a `labelFor()` function specifically to avoid Sentry's PII scrubber stripping token-related
keys.

This instrumentation is important operational context — it is the primary debugging tool
for the rehydration hang — but it is entirely absent from the design doc.

---

### GAP 11 — Anonymous sign-in for live OCR not in design doc

**Design says:** Nothing about simulation mode or OCR.

**Reality:** `simulationContainer.ts` calls `supabase.auth.signInAnonymously()` when
`EXPO_PUBLIC_OCR_LIVE=true`. This creates a real, unauthenticated Supabase session so that
`supabase.functions.invoke()` can pass a JWT to the Edge Function. The session is not
persisted (storage is undefined in simulation mode). If anonymous sign-in fails, the code
falls back to the mock OCR parser silently.

This is a third distinct auth path (alongside email/password and social OAuth) with no
design coverage, no `IAuthService` representation, and no tests.

---

### GAP 12 — `coldStartMessage()` error normalisation not in design doc

**Design says:**

> "GoTrue can return non-JSON (plain text or HTML) during cold-start."

**Reality:** `coldStartMessage()` in `SupabaseAuthService.ts`:

```ts
function coldStartMessage(e: unknown): string {
  const raw = e instanceof Error ? e.message : String(e);
  if (raw.includes('JSON Parse error') || raw.includes('Unexpected character')) {
    return 'Server is starting up — please try again in a moment.';
  }
  return raw;
}
```

This is only used in the `catch` block of `signInWithGoogle()` and `signInWithApple()`.
The `signIn()` method does NOT use `coldStartMessage()` — it uses the raw error message. If
GoTrue returns non-JSON on an email/password cold-start, the user sees an internal JSON
parse error string rather than the human-readable message.

**Impact:** Inconsistent cold-start UX between email/password sign-in (raw error) and
social sign-in (friendly error).

---

### GAP 13 — `_expiresAt = 0` semantics undocumented

**Design says:**

> "`_expiresAt` — Unix timestamp, used by `currentUser()` for fast expiry check"

**Reality:** `currentUser()`:

```ts
if (this._expiresAt > 0 && Math.floor(Date.now() / 1000) >= this._expiresAt) {
  return null;
}
return this._currentUser;
```

`_expiresAt = 0` means "skip the expiry check entirely." This state exists because
`session?.expires_at` is absent in some Supabase responses (notably the mock session
object in tests, and theoretically in edge cases where Supabase omits the field). The
design doc describes `_expiresAt` as a timestamp but doesn't document the sentinel-zero
semantics.

**Impact:** Low. Tests cover this case (`currentUser skips expiry check when expires_at
was not provided`). But a future developer reading `_expiresAt: number = 0` without
reading `currentUser()` would assume 0 means epoch time (1970), not "unchecked."

---

## Summary table

| # | Area | Design doc | Code | Severity |
|---|---|---|---|---|
| 1 | Password reset | Not flagged as missing | Placeholder stub | High — **FIXED** |
| 2 | OTP resend | Implied as working | Broken — routes back instead of resending | High — **FIXED** |
| 3 | Revoked session on cache-hit | Claims SIGNED_OUT is recovery | SIGNED_OUT not guaranteed to fire within JWT TTL | Medium — **FIXED** |
| 4 | Session restore timeout | Notes cold-start hang | 65-second ceiling, no intermediate feedback | Medium — **FIXED** (20 s + slow-startup message) |
| 5 | AppState refresh | Not mentioned | Absent — no foreground reconnection | Low — **FIXED** |
| 6 | Refresh token rotation | Recommends enabling | Unknown Dashboard state, no code enforcement | Low — **FIXED** (rotation on, reuse interval 0) |
| 7 | Listener count | "Exactly one service instance" | Two Supabase listeners during normal operation | Low — **FIXED** (design doc updated; two listeners is correct and intentional) |
| 8 | iOS URL scheme placeholder | Flags as needing config | No runtime guard against placeholder value | Low — **FIXED** |
| 9 | Test coverage | — | `getInitialUser`, Google/Apple, TOKEN_REFRESHED race all untested | High — **FIXED** (780/780 tests pass) |
| 10 | Observability (Sentry) | Not mentioned | Extensive breadcrumb instrumentation | Info — **FIXED** (OCR removal cleaned this up) |
| 11 | Anonymous sign-in (OCR) | Not mentioned | Third auth path, no interface, no tests | Info — **FIXED** (OCR mode removed entirely) |
| 12 | `coldStartMessage()` | Notes cold-start JSON errors | Applied to Google/Apple only, not email sign-in | Low — **FIXED** |
| 13 | `_expiresAt = 0` sentinel | Not documented | Sentinel-zero skips expiry check | Low — **FIXED** (design doc updated) |

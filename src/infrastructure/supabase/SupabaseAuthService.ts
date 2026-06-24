import { Platform } from 'react-native';
import Constants from 'expo-constants';
import * as SecureStore from 'expo-secure-store';
import * as Sentry from '@sentry/react-native';
import { ok, err } from '../../core/types/Result';
import type { Result } from '../../core/types/Result';
import type { AppError } from '../../core/types/AppError';
import type { IAuthService, AuthStateListener, Unsubscribe } from '../../core/interfaces/IAuthService';
import type { User } from '../../core/models/User';
import { supabase, pingSupabase } from './supabaseClient';

// Expo Router renders the root layout twice in concurrent mode, causing
// ServiceProvider to create two DI containers. Both containers call
// new SupabaseAuthService(), which would register duplicate onAuthStateChange
// listeners and race concurrent getInitialUser() calls against the same
// Supabase singleton — corrupting session state. A module-level singleton
// ensures exactly one auth service instance exists per JS bundle lifetime.
let _instance: SupabaseAuthService | null = null;
export function getAuthService(): SupabaseAuthService {
  if (!_instance) _instance = new SupabaseAuthService();
  return _instance;
}

export class SupabaseAuthService implements IAuthService {
  private _currentUser: User | null = null;
  private _expiresAt: number = 0;
  private _readyPromise: Promise<void>;
  private _readyResolve: () => void = () => {};
  private _initialUserPromise: Promise<User | null> | null = null;

  private static readonly USER_CACHE_KEY = 'weshare_user_v1';

  constructor() {
    this._readyPromise = new Promise(resolve => { this._readyResolve = resolve; });
    Sentry.addBreadcrumb({ category: 'auth', message: 'auth_service_constructed', level: 'info' });

    pingSupabase();

    supabase.auth.onAuthStateChange(async (event, session) => {
      Sentry.addBreadcrumb({
        category: 'auth',
        message:  `auth_state_change: ${event} has_session=${!!session?.user}`,
        level:    'info',
        data:     { expires_at: session?.expires_at },
      });
      try {
        // TOKEN_REFRESHED is a transient event during getInitialUser()'s getSession()
        // call. Clearing _currentUser here would race with getInitialUser() setting it,
        // causing load() to see null and bail with an empty trips screen.
        if (event === 'TOKEN_REFRESHED' && session?.user) {
          this._expiresAt = session.expires_at ?? 0;
          return;
        }
        if (!session?.user) {
          this._currentUser = null;
          this._expiresAt   = 0;
          void this._clearUserCache();
          return;
        }
        this._expiresAt = session.expires_at ?? 0;
        // Only overwrite _currentUser when the row is actually found. The event
        // may fire before _upsertUser completes on first sign-in, returning null
        // and wiping out the value set by the sign-in method.
        const user = await this._fetchUser(session.user.id, session.user.email);
        if (user) this._currentUser = user;
      } catch {
        // Background user sync failed — session state is unchanged.
      }
    });
  }

  // ── Cache helpers ─────────────────────────────────────────────────────────

  private async _readUserCache(): Promise<User | null> {
    try {
      const json = await SecureStore.getItemAsync(SupabaseAuthService.USER_CACHE_KEY);
      if (!json) {
        Sentry.addBreadcrumb({ category: 'auth', message: 'user_cache_read: empty', level: 'info' });
        return null;
      }
      const parsed = JSON.parse(json);
      Sentry.addBreadcrumb({
        category: 'auth',
        message:  `user_cache_read: id=${String(parsed?.id ?? 'unknown').slice(0, 8)}`,
        level:    'info',
      });
      return { ...parsed, createdAt: new Date(parsed.createdAt) };
    } catch {
      Sentry.addBreadcrumb({ category: 'auth', message: 'user_cache_read: parse_error', level: 'warning' });
      return null;
    }
  }

  private async _writeUserCache(user: User): Promise<void> {
    try {
      Sentry.addBreadcrumb({ category: 'auth', message: `user_cache_write: id=${user.id.slice(0, 8)}`, level: 'info' });
      await SecureStore.setItemAsync(
        SupabaseAuthService.USER_CACHE_KEY,
        JSON.stringify({ ...user, createdAt: user.createdAt.toISOString() }),
      );
    } catch {}
  }

  private async _clearUserCache(): Promise<void> {
    Sentry.addBreadcrumb({ category: 'auth', message: 'user_cache_clear', level: 'warning' });
    try { await SecureStore.deleteItemAsync(SupabaseAuthService.USER_CACHE_KEY); } catch {}
  }

  // ── Private helpers ───────────────────────────────────────────────────────

  private static async _withTimeout<T>(promise: Promise<T>, ms: number, message?: string): Promise<T> {
    return Promise.race([
      promise,
      new Promise<T>((_, reject) => {
        const t = setTimeout(() => reject(new Error(message ?? `Request timed out after ${ms / 1000}s`)), ms);
        if (typeof t === 'object' && t !== null) t.unref();
      }),
    ]);
  }

  // Retries fn up to maxAttempts times on thrown exceptions (e.g. timeouts).
  // Supabase calls that return {data, error} never throw on auth errors, so
  // wrong-password failures are instant — only genuine network timeouts retry.
  private static async _withRetry<T>(
    fn: () => Promise<T>,
    maxAttempts: number,
    retryDelayMs: number,
  ): Promise<T> {
    for (let attempt = 0; attempt < maxAttempts; attempt++) {
      if (attempt > 0) await new Promise(r => setTimeout(r, retryDelayMs));
      try {
        return await fn();
      } catch (e) {
        if (attempt === maxAttempts - 1) throw e;
      }
    }
    throw new Error('unreachable');
  }

  private async _fetchUser(authId: string, email?: string): Promise<User | null> {
    const t0 = Date.now();
    Sentry.addBreadcrumb({ category: 'auth', message: `fetch_user: id=${authId.slice(0, 8)}`, level: 'info' });
    const { data, error } = await supabase
      .from('users')
      .select()
      .eq('id', authId)
      .single();
    Sentry.addBreadcrumb({
      category: 'auth',
      message:  `fetch_user_done: found=${!!data && !error} ms=${Date.now() - t0}`,
      level:    error ? 'warning' : 'info',
      data:     error ? { code: error.code } : undefined,
    });
    if (error || !data) return null;
    return {
      id:        data.id,
      name:      data.display_name,
      email,
      avatarUrl: data.avatar_url ?? undefined,
      createdAt: new Date(data.created_at),
    };
  }

  private async _upsertUser(id: string, displayName: string, avatarUrl?: string): Promise<User> {
    const { data, error } = await supabase
      .from('users')
      .upsert(
        { id, display_name: displayName, avatar_url: avatarUrl ?? null },
        { onConflict: 'id', ignoreDuplicates: false },
      )
      .select()
      .single();

    if (error || !data) {
      const existing = await this._fetchUser(id);
      if (existing) return existing;
      throw new Error(`Failed to upsert user row: ${error?.message ?? 'unknown'}`);
    }
    return {
      id:        data.id,
      name:      data.display_name,
      avatarUrl: data.avatar_url ?? undefined,
      createdAt: new Date(data.created_at),
    };
  }

  // ── IAuthService ──────────────────────────────────────────────────────────

  async signIn(email: string, password: string): Promise<Result<User, AppError>> {
    try {
      const { data, error } = await SupabaseAuthService._withRetry(
        () => SupabaseAuthService._withTimeout(
          supabase.auth.signInWithPassword({ email, password }),
          20_000,
          'Connection timed out — Supabase may be starting up, please try again',
        ),
        3,
        5_000,
      );
      if (error) return err({ kind: 'AuthError', message: error.message });
      if (!data.user) return err({ kind: 'AuthError', message: 'No user returned from sign-in' });

      this._expiresAt = data.session?.expires_at ?? 0;
      const user = await this._fetchUser(data.user.id, data.user.email);
      if (!user) return err({ kind: 'AuthError', message: 'User profile not found' });
      this._currentUser = user;
      void this._writeUserCache(user);
      return ok(user);
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Sign-in failed';
      return err({ kind: 'AuthError', message: msg });
    }
  }

  async signUp(
    email: string,
    password: string,
    name: string,
  ): Promise<Result<User | { needsEmailConfirmation: true }, AppError>> {
    const { data, error } = await supabase.auth.signUp({ email, password });
    if (error) return err({ kind: 'AuthError', message: error.message });
    if (!data.user) return err({ kind: 'AuthError', message: 'Account creation failed' });

    // Supabase returns session=null when email confirmation is required.
    if (!data.session) {
      return ok({ needsEmailConfirmation: true });
    }

    this._expiresAt = data.session.expires_at ?? 0;
    try {
      const user = await SupabaseAuthService._withTimeout(
        this._upsertUser(data.user.id, name),
        10_000,
        'Profile save timed out — please try again',
      );
      this._currentUser = { ...user, email: data.user.email };
      void this._writeUserCache(this._currentUser);
      return ok(this._currentUser);
    } catch (e) {
      return err({ kind: 'AuthError', message: e instanceof Error ? e.message : String(e) });
    }
  }

  async verifyOtp(email: string, token: string, name: string): Promise<Result<User, AppError>> {
    let data: Awaited<ReturnType<typeof supabase.auth.verifyOtp>>['data'];
    let error: Awaited<ReturnType<typeof supabase.auth.verifyOtp>>['error'];
    try {
      ({ data, error } = await SupabaseAuthService._withTimeout(
        supabase.auth.verifyOtp({ email, token, type: 'signup' }),
        20_000,
        'Connection timed out — please try again',
      ));
    } catch (e) {
      return err({ kind: 'AuthError', message: e instanceof Error ? e.message : 'Verification failed' });
    }
    if (error) return err({ kind: 'AuthError', message: error.message });
    if (!data.user) return err({ kind: 'AuthError', message: 'Verification failed' });

    this._expiresAt = data.session?.expires_at ?? 0;
    try {
      const user = await SupabaseAuthService._withTimeout(
        this._upsertUser(data.user.id, name),
        10_000,
        'Profile save timed out — please try again',
      );
      this._currentUser = { ...user, email: data.user.email };
      void this._writeUserCache(this._currentUser);
      return ok(this._currentUser);
    } catch (e) {
      return err({ kind: 'AuthError', message: e instanceof Error ? e.message : String(e) });
    }
  }

  async signOut(): Promise<Result<void, AppError>> {
    const { error } = await supabase.auth.signOut();
    if (error) return err({ kind: 'AuthError', message: error.message });
    this._currentUser = null;
    this._expiresAt   = 0;
    void this._clearUserCache();
    return ok(undefined);
  }

  async debugSignOut(): Promise<void> {
    // Local-only signout avoids a network round-trip to a sleeping DB.
    try { await supabase.auth.signOut({ scope: 'local' }); } catch {}
    this._currentUser        = null;
    this._expiresAt          = 0;
    this._initialUserPromise = null;
    await this._clearUserCache();
  }

  async signInWithGoogle(): Promise<Result<User, AppError>> {
    try {
      const { GoogleSignin } = await import('@react-native-google-signin/google-signin');
      GoogleSignin.configure({ webClientId: Constants.expoConfig?.extra?.googleWebClientId ?? '' });

      await GoogleSignin.hasPlayServices({ showPlayServicesUpdateDialog: true });
      const userInfo = await GoogleSignin.signIn();
      const idToken  = userInfo.data?.idToken;

      if (!idToken) return err({ kind: 'AuthError', message: 'No ID token returned from Google' });

      const { data, error } = await SupabaseAuthService._withRetry(
        () => SupabaseAuthService._withTimeout(
          supabase.auth.signInWithIdToken({ provider: 'google', token: idToken }),
          20_000,
          'Connection timed out — Supabase may be starting up, please try again',
        ),
        3,
        5_000,
      );
      if (error) return err({ kind: 'AuthError', message: error.message });
      if (!data.user) return err({ kind: 'AuthError', message: 'No user returned from Google sign-in' });

      const displayName = userInfo.data?.user?.name ?? data.user.email?.split('@')[0] ?? 'User';
      const avatarUrl   = userInfo.data?.user?.photo ?? undefined;
      const user        = await SupabaseAuthService._withTimeout(
        this._upsertUser(data.user.id, displayName, avatarUrl),
        10_000,
        'Profile save timed out — please try again',
      );
      this._currentUser = { ...user, email: data.user.email };
      this._expiresAt   = data.session?.expires_at ?? 0;
      void this._writeUserCache(this._currentUser);
      Sentry.captureMessage('signin_google_success', 'info');

      return ok(this._currentUser);
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Google sign-in failed';
      return err({ kind: 'AuthError', message: msg });
    }
  }

  async signInWithApple(): Promise<Result<User, AppError>> {
    if (Platform.OS !== 'ios') {
      return err({ kind: 'AuthError', message: 'Apple Sign-In is only available on iOS' });
    }
    try {
      const AppleAuth = await import('expo-apple-authentication');
      const available = await AppleAuth.isAvailableAsync();
      if (!available) return err({ kind: 'AuthError', message: 'Apple Sign-In is not available on this device' });

      const credential = await AppleAuth.signInAsync({
        requestedScopes: [
          AppleAuth.AppleAuthenticationScope.FULL_NAME,
          AppleAuth.AppleAuthenticationScope.EMAIL,
        ],
      });

      if (!credential.identityToken) return err({ kind: 'AuthError', message: 'No identity token from Apple' });

      const { data, error } = await SupabaseAuthService._withRetry(
        () => SupabaseAuthService._withTimeout(
          supabase.auth.signInWithIdToken({ provider: 'apple', token: credential.identityToken }),
          20_000,
          'Connection timed out — Supabase may be starting up, please try again',
        ),
        3,
        5_000,
      );
      if (error) return err({ kind: 'AuthError', message: error.message });
      if (!data.user) return err({ kind: 'AuthError', message: 'No user returned from Apple sign-in' });

      // Apple only provides name on the very first sign-in; fall back gracefully.
      const firstName   = credential.fullName?.givenName  ?? '';
      const lastName    = credential.fullName?.familyName ?? '';
      const displayName = [firstName, lastName].filter(Boolean).join(' ')
        || data.user.email?.split('@')[0]
        || 'User';

      const user        = await SupabaseAuthService._withTimeout(
        this._upsertUser(data.user.id, displayName),
        10_000,
        'Profile save timed out — please try again',
      );
      this._currentUser = { ...user, email: data.user.email };
      this._expiresAt   = data.session?.expires_at ?? 0;
      void this._writeUserCache(this._currentUser);

      return ok(this._currentUser);
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Apple sign-in failed';
      return err({ kind: 'AuthError', message: msg });
    }
  }

  async getInitialUser(): Promise<User | null> {
    const deduped = !!this._initialUserPromise;
    Sentry.addBreadcrumb({ category: 'auth', message: `get_initial_user: deduped=${deduped}`, level: 'info' });
    if (deduped) return this._initialUserPromise!;
    this._initialUserPromise = this._doGetInitialUser();
    return this._initialUserPromise;
  }

  private async _doGetInitialUser(): Promise<User | null> {
    const t0 = Date.now();
    Sentry.addBreadcrumb({ category: 'auth', message: 'do_get_initial_user_start', level: 'info' });
    try {
      // getSession() is called exactly once. Never retry it — Supabase rotates
      // the refresh token on each use, so concurrent calls (one per retry)
      // consume the token and subsequent calls get "Invalid Refresh Token",
      // firing SIGNED_OUT and corrupting auth state.
      const sessionPromise = supabase.auth.getSession();
      Sentry.addBreadcrumb({ category: 'auth', message: 'get_session_called', level: 'info' });

      let sessionData: Awaited<ReturnType<typeof supabase.auth.getSession>>;
      try {
        // Fast path: if the stored token is still valid, getSession() reads from
        // storage and returns in milliseconds. 10 s is a generous ceiling.
        sessionData = await SupabaseAuthService._withTimeout(sessionPromise, 10_000, 'Session restore timed out');
        Sentry.addBreadcrumb({
          category: 'auth',
          message:  `get_session_fast: ms=${Date.now() - t0} has_session=${!!sessionData.data.session}`,
          level:    'info',
        });
      } catch {
        // Token is expired and the DB is waking up (free-tier). Return the
        // cached user so the app opens immediately. sessionPromise keeps running;
        // the Supabase SDK deduplicates the in-flight refresh so subsequent API
        // calls wait for it rather than failing. TOKEN_REFRESHED fires when done.
        Sentry.addBreadcrumb({
          category: 'auth',
          message:  `get_session_timed_out: ms=${Date.now() - t0}`,
          level:    'warning',
        });
        const cached = await this._readUserCache();
        if (cached) {
          this._currentUser = cached;
          Sentry.captureMessage('session_restore_slow_path', 'info');
          Sentry.addBreadcrumb({
            category: 'auth',
            message:  `returning_cached_user: id=${cached.id.slice(0, 8)}`,
            level:    'info',
          });
          // Track whether the background refresh eventually succeeds or fails.
          // This tells us if TOKEN_REFRESHED will fire and trigger a trips reload.
          void sessionPromise
            .then(({ data, error }) => {
              if (error) {
                Sentry.captureMessage(`session_bg_error: ${error.message}`, 'warning');
              } else if (!data.session) {
                Sentry.captureMessage('session_bg_null', 'warning');
              } else {
                const expiresIn = (data.session.expires_at ?? 0) - Math.floor(Date.now() / 1000);
                Sentry.captureMessage(`session_bg_ok: expires_in=${expiresIn}s`, 'info');
              }
            })
            .catch(e => Sentry.captureMessage(`session_bg_threw: ${String(e)}`, 'warning'));
          return cached;
        }
        // No cache (first install or post-sign-out). Wait for the full refresh;
        // there is nothing to show until we know who the user is.
        Sentry.addBreadcrumb({ category: 'auth', message: 'no_cache_waiting_55s', level: 'warning' });
        try {
          sessionData = await SupabaseAuthService._withTimeout(sessionPromise, 55_000, 'Session restore timed out');
          Sentry.addBreadcrumb({
            category: 'auth',
            message:  `get_session_55s: ms=${Date.now() - t0} has_session=${!!sessionData.data.session}`,
            level:    'info',
          });
        } catch (e) {
          const msg = e instanceof Error ? e.message : String(e);
          Sentry.captureMessage(`session_restore_error: ${msg}`, 'warning');
          return null;
        }
      }
      const { data } = sessionData;
      if (!data.session?.user) {
        // getSession() succeeded but returned no session — nothing stored.
        Sentry.captureMessage('session_restore_no_session', 'warning');
        return null;
      }

      this._expiresAt = data.session.expires_at ?? 0;
      const { id: userId, email } = data.session.user;
      Sentry.addBreadcrumb({
        category: 'auth',
        message:  `session_found: user=${userId.slice(0, 8)} expires_in=${(data.session.expires_at ?? 0) - Math.floor(Date.now() / 1000)}s`,
        level:    'info',
      });

      // Fast path: return cached profile immediately, refresh DB in background.
      // Eliminates the DB round-trip on every warm restart so the app opens instantly.
      const cached = await this._readUserCache();
      if (cached?.id === userId) {
        Sentry.addBreadcrumb({ category: 'auth', message: `profile_cache_hit: id=${cached.id.slice(0, 8)}`, level: 'info' });
        this._currentUser = cached;
        this._fetchUser(userId, email)
          .then(fresh => {
            if (fresh) {
              this._currentUser = fresh;
              void this._writeUserCache(fresh);
            }
          })
          .catch(() => {});
        return cached;
      }

      // Cache miss (first install or after sign-out): fetch with a timeout so a
      // cold-start Supabase pause never blocks the app indefinitely.
      Sentry.addBreadcrumb({ category: 'auth', message: 'profile_cache_miss', level: 'info' });
      const user = await Promise.race([
        this._fetchUser(userId, email),
        new Promise<null>(resolve => setTimeout(() => resolve(null), 8_000)),
      ]);
      Sentry.addBreadcrumb({
        category: 'auth',
        message:  `profile_fetch_done: found=${!!user} ms=${Date.now() - t0}`,
        level:    user ? 'info' : 'warning',
      });
      if (user) {
        this._currentUser = user;
        void this._writeUserCache(user);
      }
      return user;
    } finally {
      Sentry.addBreadcrumb({
        category: 'auth',
        message:  `auth_ready_resolved: total_ms=${Date.now() - t0}`,
        level:    'info',
      });
      this._readyResolve();
    }
  }

  awaitReady(): Promise<void> {
    return this._readyPromise;
  }

  currentUser(): User | null {
    if (this._expiresAt > 0 && Math.floor(Date.now() / 1000) >= this._expiresAt) {
      return null;
    }
    return this._currentUser;
  }

  onAuthStateChange(listener: AuthStateListener): Unsubscribe {
    const { data } = supabase.auth.onAuthStateChange(async (event, session) => {
      Sentry.addBreadcrumb({
        category: 'auth',
        message:  `public_auth_change: ${event} session_user=${session?.user?.id?.slice(0, 8) ?? 'null'} current=${this._currentUser?.id?.slice(0, 8) ?? 'null'}`,
        level:    'info',
      });
      try {
        if (!session?.user) { listener(null); return; }

        // TOKEN_REFRESHED means the session was silently renewed — user identity
        // is unchanged. Calling _fetchUser() here would fail while the DB is still
        // waking up (the very window when this event fires on cold start), silently
        // dropping the listener call and leaving the trips screen permanently empty.
        // Reuse _currentUser (set from cache on the fast path) instead.
        if (event === 'TOKEN_REFRESHED' && this._currentUser?.id === session.user.id) {
          Sentry.addBreadcrumb({ category: 'auth', message: 'token_refreshed_reuse_current_user', level: 'info' });
          listener(this._currentUser!);
          return;
        }

        const user = await this._fetchUser(session.user.id, session.user.email);
        if (user) {
          Sentry.addBreadcrumb({ category: 'auth', message: `listener_called: id=${user.id.slice(0, 8)}`, level: 'info' });
          listener(user);
        } else {
          Sentry.addBreadcrumb({ category: 'auth', message: 'listener_skipped: fetch_returned_null', level: 'warning' });
        }
      } catch (e) {
        Sentry.addBreadcrumb({
          category: 'auth',
          message:  `listener_skipped: fetch_threw ${e instanceof Error ? e.message : String(e)}`,
          level:    'warning',
        });
      }
    });
    return () => data.subscription.unsubscribe();
  }
}

jest.mock('expo-constants', () => ({
  __esModule: true,
  default: {
    expoConfig: {
      extra: {
        googleWebClientId:  'test-web-client-id',
        googleIosUrlScheme: 'com.googleusercontent.apps.12345678',
      },
    },
  },
}));

jest.mock('@react-native-google-signin/google-signin', () => ({
  GoogleSignin: {
    configure: jest.fn(),
    hasPlayServices: jest.fn().mockResolvedValue(true),
    signIn: jest.fn(),
  },
}));

jest.mock('expo-apple-authentication', () => ({
  isAvailableAsync: jest.fn().mockResolvedValue(true),
  signInAsync: jest.fn(),
  AppleAuthenticationScope: { FULL_NAME: 'FULL_NAME', EMAIL: 'EMAIL' },
}));

jest.mock('../supabase/supabaseClient', () => ({
  pingSupabase: jest.fn(),
  supabase: {
    auth: {
      signInWithPassword:    jest.fn(),
      signUp:                jest.fn(),
      verifyOtp:             jest.fn(),
      signOut:               jest.fn(),
      signInWithIdToken:     jest.fn(),
      updateUser:            jest.fn(),
      resend:                jest.fn(),
      resetPasswordForEmail: jest.fn(),
      startAutoRefresh:      jest.fn().mockResolvedValue(undefined),
      stopAutoRefresh:       jest.fn().mockResolvedValue(undefined),
      getSession: jest.fn().mockResolvedValue({ data: { session: null }, error: null }),
      onAuthStateChange: jest.fn().mockReturnValue({
        data: { subscription: { unsubscribe: jest.fn() } },
      }),
    },
    from: jest.fn(),
    rpc:  jest.fn(),
  },
}));

import { SupabaseAuthService } from '../supabase/SupabaseAuthService';
import * as SecureStore from 'expo-secure-store';

const { supabase } = require('../supabase/supabaseClient') as {
  supabase: {
    auth: {
      signInWithPassword:    jest.Mock;
      signUp:                jest.Mock;
      verifyOtp:             jest.Mock;
      signOut:               jest.Mock;
      signInWithIdToken:     jest.Mock;
      updateUser:            jest.Mock;
      resend:                jest.Mock;
      resetPasswordForEmail: jest.Mock;
      startAutoRefresh:      jest.Mock;
      stopAutoRefresh:       jest.Mock;
      getSession:            jest.Mock;
      onAuthStateChange:     jest.Mock;
    };
    from: jest.Mock;
    rpc:  jest.Mock;
  };
};

const { GoogleSignin } = require('@react-native-google-signin/google-signin') as {
  GoogleSignin: {
    configure:        jest.Mock;
    hasPlayServices:  jest.Mock;
    signIn:           jest.Mock;
  };
};

const AppleAuth = require('expo-apple-authentication') as {
  isAvailableAsync: jest.Mock;
  signInAsync:      jest.Mock;
};

// Build a mock Supabase query chain that resolves with `result` at .single().
function mockFromChain(result: { data: unknown; error: null | { message: string } }) {
  const single = jest.fn().mockResolvedValue(result);
  const chain = { select: jest.fn(), eq: jest.fn(), insert: jest.fn(), upsert: jest.fn(), single };
  chain.select.mockReturnValue(chain);
  chain.eq.mockReturnValue(chain);
  chain.insert.mockReturnValue(chain);
  chain.upsert.mockReturnValue(chain);
  return chain;
}

const NOW_STR  = '2025-06-01T12:00:00Z';
const USER_ROW = { id: 'u1', display_name: 'Jay', avatar_url: null, created_at: NOW_STR };
const FUTURE   = Math.floor(Date.now() / 1000) + 3600;

describe('SupabaseAuthService', () => {
  let service: SupabaseAuthService;

  beforeEach(() => {
    jest.useFakeTimers();
    jest.clearAllMocks();
    supabase.auth.onAuthStateChange.mockReturnValue({
      data: { subscription: { unsubscribe: jest.fn() } },
    });
    supabase.auth.getSession.mockResolvedValue({ data: { session: null }, error: null });
    supabase.rpc.mockResolvedValue({ data: null, error: null });
    (SecureStore.getItemAsync as jest.Mock).mockResolvedValue(null);
    service = new SupabaseAuthService();
  });

  afterEach(() => {
    jest.clearAllTimers();
    jest.useRealTimers();
  });

  // ── signIn ──────────────────────────────────────────────────────────────

  it('signIn returns User on success', async () => {
    supabase.auth.signInWithPassword.mockResolvedValue({
      data: { user: { id: 'u1', email: 'jay@example.com' }, session: {} },
      error: null,
    });
    supabase.from.mockReturnValue(mockFromChain({ data: USER_ROW, error: null }));

    const result = await service.signIn('jay@example.com', 'password');
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.name).toBe('Jay');
      expect(result.value.email).toBe('jay@example.com');
    }
  });

  it('signIn returns AuthError on Supabase error', async () => {
    supabase.auth.signInWithPassword.mockResolvedValue({
      data: { user: null, session: null },
      error: { message: 'Invalid credentials' },
    });
    const result = await service.signIn('bad@example.com', 'wrong');
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.kind).toBe('AuthError');
    }
  });

  it('signIn returns AuthError when user profile not found', async () => {
    supabase.auth.signInWithPassword.mockResolvedValue({
      data: { user: { id: 'u1', email: 'jay@example.com' }, session: {} },
      error: null,
    });
    supabase.from.mockReturnValue(mockFromChain({ data: null, error: { message: 'not found' } }));

    const result = await service.signIn('jay@example.com', 'pass');
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.kind).toBe('AuthError');
  });

  // ── signOut ─────────────────────────────────────────────────────────────

  it('signOut returns ok on success', async () => {
    supabase.auth.signOut.mockResolvedValue({ error: null });
    const result = await service.signOut();
    expect(result.ok).toBe(true);
  });

  it('signOut returns AuthError on failure', async () => {
    supabase.auth.signOut.mockResolvedValue({ error: { message: 'session expired' } });
    const result = await service.signOut();
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.kind).toBe('AuthError');
  });

  // ── currentUser ──────────────────────────────────────────────────────────

  it('currentUser returns null before any sign-in', () => {
    expect(service.currentUser()).toBeNull();
  });

  it('currentUser returns null after signOut clears it', async () => {
    supabase.auth.signOut.mockResolvedValue({ error: null });
    await service.signOut();
    expect(service.currentUser()).toBeNull();
  });

  it('currentUser returns null when session has expired', async () => {
    const expiredAt = Math.floor(Date.now() / 1000) - 60;
    supabase.auth.signInWithPassword.mockResolvedValue({
      data: { user: { id: 'u1', email: 'jay@example.com' }, session: { expires_at: expiredAt } },
      error: null,
    });
    supabase.from.mockReturnValue(mockFromChain({ data: USER_ROW, error: null }));
    await service.signIn('jay@example.com', 'password');
    expect(service.currentUser()).toBeNull();
  });

  it('currentUser returns user when session has not yet expired', async () => {
    supabase.auth.signInWithPassword.mockResolvedValue({
      data: { user: { id: 'u1', email: 'jay@example.com' }, session: { expires_at: FUTURE } },
      error: null,
    });
    supabase.from.mockReturnValue(mockFromChain({ data: USER_ROW, error: null }));
    await service.signIn('jay@example.com', 'password');
    const user = service.currentUser();
    expect(user).not.toBeNull();
    expect(user?.name).toBe('Jay');
  });

  it('currentUser skips expiry check when expires_at was not provided', async () => {
    supabase.auth.signInWithPassword.mockResolvedValue({
      data: { user: { id: 'u1', email: 'jay@example.com' }, session: {} },
      error: null,
    });
    supabase.from.mockReturnValue(mockFromChain({ data: USER_ROW, error: null }));
    await service.signIn('jay@example.com', 'password');
    expect(service.currentUser()).not.toBeNull();
  });

  // ── signUp ───────────────────────────────────────────────────────────────

  it('signUp returns User when session is provided (no email confirmation)', async () => {
    supabase.auth.signUp.mockResolvedValue({
      data: { user: { id: 'u1', email: 'new@example.com' }, session: { expires_at: FUTURE } },
      error: null,
    });
    supabase.from.mockReturnValue(mockFromChain({ data: USER_ROW, error: null }));

    const result = await service.signUp('new@example.com', 'secret123', 'Jay');
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect('needsEmailConfirmation' in result.value).toBe(false);
      if (!('needsEmailConfirmation' in result.value)) {
        expect(result.value.email).toBe('new@example.com');
      }
    }
  });

  it('signUp returns needsEmailConfirmation when session is null', async () => {
    supabase.auth.signUp.mockResolvedValue({
      data: { user: { id: 'u1', email: 'new@example.com' }, session: null },
      error: null,
    });
    const result = await service.signUp('new@example.com', 'secret123', 'Jay');
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value).toEqual({ needsEmailConfirmation: true });
    }
  });

  it('signUp returns AuthError on Supabase error', async () => {
    supabase.auth.signUp.mockResolvedValue({
      data: { user: null, session: null },
      error: { message: 'Email already registered' },
    });
    const result = await service.signUp('taken@example.com', 'secret123', 'Jay');
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.kind).toBe('AuthError');
      expect(result.error.message).toContain('already registered');
    }
  });

  it('signUp returns AuthError when user profile upsert fails', async () => {
    supabase.auth.signUp.mockResolvedValue({
      data: { user: { id: 'u1', email: 'new@example.com' }, session: { expires_at: FUTURE } },
      error: null,
    });
    supabase.from.mockReturnValue(mockFromChain({ data: null, error: { message: 'DB unavailable' } }));
    const result = await service.signUp('new@example.com', 'secret123', 'Jay');
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.kind).toBe('AuthError');
  });

  // ── verifyOtp ────────────────────────────────────────────────────────────

  it('verifyOtp returns User on valid token', async () => {
    supabase.auth.verifyOtp.mockResolvedValue({
      data: { user: { id: 'u1', email: 'new@example.com' }, session: { expires_at: FUTURE } },
      error: null,
    });
    supabase.from.mockReturnValue(mockFromChain({ data: USER_ROW, error: null }));
    const result = await service.verifyOtp('new@example.com', '123456', 'Jay');
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.email).toBe('new@example.com');
      expect(result.value.name).toBe('Jay');
    }
  });

  it('verifyOtp returns AuthError on invalid token', async () => {
    supabase.auth.verifyOtp.mockResolvedValue({
      data: { user: null, session: null },
      error: { message: 'Token has expired or is invalid' },
    });
    const result = await service.verifyOtp('new@example.com', '000000', 'Jay');
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.kind).toBe('AuthError');
      expect(result.error.message).toContain('expired or is invalid');
    }
  });

  it('verifyOtp returns AuthError when profile upsert fails', async () => {
    supabase.auth.verifyOtp.mockResolvedValue({
      data: { user: { id: 'u1', email: 'new@example.com' }, session: { expires_at: FUTURE } },
      error: null,
    });
    supabase.from.mockReturnValue(mockFromChain({ data: null, error: { message: 'DB error' } }));
    const result = await service.verifyOtp('new@example.com', '123456', 'Jay');
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.kind).toBe('AuthError');
  });

  // ── resendOtp ─────────────────────────────────────────────────────────────

  it('resendOtp returns ok on success', async () => {
    supabase.auth.resend.mockResolvedValue({ data: {}, error: null });
    const result = await service.resendOtp('jay@example.com');
    expect(result.ok).toBe(true);
    expect(supabase.auth.resend).toHaveBeenCalledWith({ type: 'signup', email: 'jay@example.com' });
  });

  it('resendOtp returns AuthError on failure', async () => {
    supabase.auth.resend.mockResolvedValue({ data: {}, error: { message: 'Rate limit exceeded' } });
    const result = await service.resendOtp('jay@example.com');
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.kind).toBe('AuthError');
      expect(result.error.message).toContain('Rate limit');
    }
  });

  // ── sendPasswordReset ─────────────────────────────────────────────────────

  it('sendPasswordReset returns ok on success', async () => {
    supabase.auth.resetPasswordForEmail.mockResolvedValue({ data: {}, error: null });
    const result = await service.sendPasswordReset('jay@example.com');
    expect(result.ok).toBe(true);
    expect(supabase.auth.resetPasswordForEmail).toHaveBeenCalledWith('jay@example.com');
  });

  it('sendPasswordReset returns AuthError on failure', async () => {
    supabase.auth.resetPasswordForEmail.mockResolvedValue({ data: {}, error: { message: 'Too many requests' } });
    const result = await service.sendPasswordReset('jay@example.com');
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.kind).toBe('AuthError');
  });

  // ── confirmPasswordReset ──────────────────────────────────────────────────

  it('confirmPasswordReset returns User on success', async () => {
    supabase.auth.verifyOtp.mockResolvedValue({
      data: { user: { id: 'u1', email: 'jay@example.com' }, session: { expires_at: FUTURE } },
      error: null,
    });
    supabase.auth.updateUser.mockResolvedValue({
      data: { user: { id: 'u1', email: 'jay@example.com' } },
      error: null,
    });
    supabase.from.mockReturnValue(mockFromChain({ data: USER_ROW, error: null }));

    const result = await service.confirmPasswordReset('jay@example.com', '123456', 'newpass1');
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.id).toBe('u1');
      expect(result.value.name).toBe('Jay');
    }
    expect(supabase.auth.verifyOtp).toHaveBeenCalledWith(
      expect.objectContaining({ email: 'jay@example.com', token: '123456', type: 'recovery' }),
    );
  });

  it('confirmPasswordReset returns AuthError when OTP is invalid', async () => {
    supabase.auth.verifyOtp.mockResolvedValue({
      data: { user: null, session: null },
      error: { message: 'Token has expired or is invalid' },
    });
    const result = await service.confirmPasswordReset('jay@example.com', '000000', 'newpass1');
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.kind).toBe('AuthError');
  });

  it('confirmPasswordReset returns AuthError when updateUser fails', async () => {
    supabase.auth.verifyOtp.mockResolvedValue({
      data: { user: { id: 'u1', email: 'jay@example.com' }, session: { expires_at: FUTURE } },
      error: null,
    });
    supabase.auth.updateUser.mockResolvedValue({
      data: { user: null },
      error: { message: 'Password update failed' },
    });
    const result = await service.confirmPasswordReset('jay@example.com', '123456', 'newpass1');
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.kind).toBe('AuthError');
  });

  // ── AppState integration (GAP 5) ─────────────────────────────────────────

  describe('AppState foreground/background', () => {
    function getChangeCallback() {
      const { AppState } = require('react-native') as { AppState: { addEventListener: jest.Mock } };
      const call = AppState.addEventListener.mock.calls.find(([event]: [string]) => event === 'change');
      return call?.[1] as ((state: string) => void) | undefined;
    }

    it('calls startAutoRefresh when app becomes active', () => {
      const cb = getChangeCallback();
      expect(cb).toBeDefined();
      cb?.('active');
      expect(supabase.auth.startAutoRefresh).toHaveBeenCalled();
    });

    it('calls stopAutoRefresh when app goes to background', () => {
      const cb = getChangeCallback();
      cb?.('background');
      expect(supabase.auth.stopAutoRefresh).toHaveBeenCalled();
    });

    it('calls stopAutoRefresh when app becomes inactive', () => {
      const cb = getChangeCallback();
      cb?.('inactive');
      expect(supabase.auth.stopAutoRefresh).toHaveBeenCalled();
    });
  });

  // ── signInWithGoogle iOS guard (GAP 8) ───────────────────────────────────

  it('signInWithGoogle returns error on iOS when URL scheme is the placeholder', async () => {
    const mod = require('expo-constants') as { default: { expoConfig: { extra: Record<string, string> } } };
    const saved = mod.default.expoConfig.extra.googleIosUrlScheme;
    mod.default.expoConfig.extra.googleIosUrlScheme = 'com.googleusercontent.apps.placeholder';

    const result = await service.signInWithGoogle();

    mod.default.expoConfig.extra.googleIosUrlScheme = saved;
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.message).toContain('not configured');
  });

  // ── signIn cold-start message (GAP 12) ───────────────────────────────────

  it('signIn surfaces friendly message on GoTrue cold-start JSON parse error', async () => {
    supabase.auth.signInWithPassword.mockRejectedValue(
      new Error('JSON Parse error: Unexpected character: <'),
    );
    const promise = service.signIn('jay@example.com', 'password');
    // _withRetry makes 3 attempts with 5 s between each — advance past both delays
    await jest.advanceTimersByTimeAsync(10_001);
    const result = await promise;
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.message).toBe('Server is starting up — please try again in a moment.');
    }
  });

  // ── onAuthStateChange ────────────────────────────────────────────────────

  it('onAuthStateChange returns an unsubscribe function', () => {
    const unsubscribe = jest.fn();
    supabase.auth.onAuthStateChange.mockReturnValue({
      data: { subscription: { unsubscribe } },
    });
    const unsub = service.onAuthStateChange(() => {});
    expect(typeof unsub).toBe('function');
    unsub();
    expect(unsubscribe).toHaveBeenCalledTimes(1);
  });

  // ── getInitialUser ───────────────────────────────────────────────────────

  describe('getInitialUser', () => {
    const CACHED_USER = { id: 'u1', name: 'Jay', email: 'jay@example.com', createdAt: NOW_STR };

    it('returns cached user immediately without waiting for session', async () => {
      (SecureStore.getItemAsync as jest.Mock).mockResolvedValueOnce(
        JSON.stringify(CACHED_USER),
      );
      const user = await service.getInitialUser();
      expect(user?.id).toBe('u1');
      expect(user?.name).toBe('Jay');
    });

    it('cache hit does not block on getSession', async () => {
      let sessionResolved = false;
      supabase.auth.getSession.mockImplementation(
        () => new Promise(resolve => setTimeout(() => { sessionResolved = true; resolve({ data: { session: null }, error: null }); }, 5000)),
      );
      (SecureStore.getItemAsync as jest.Mock).mockResolvedValueOnce(
        JSON.stringify(CACHED_USER),
      );
      const user = await service.getInitialUser();
      expect(user?.id).toBe('u1');
      expect(sessionResolved).toBe(false);
    });

    it('cache miss with valid session returns fetched user', async () => {
      supabase.auth.getSession.mockResolvedValue({
        data: {
          session: {
            expires_at: FUTURE,
            user: { id: 'u1', email: 'jay@example.com' },
          },
        },
        error: null,
      });
      supabase.from.mockReturnValue(mockFromChain({ data: USER_ROW, error: null }));

      const user = await service.getInitialUser();
      expect(user?.id).toBe('u1');
      expect(user?.name).toBe('Jay');
      expect(SecureStore.setItemAsync).toHaveBeenCalled();
    });

    it('cache miss with no session returns null', async () => {
      supabase.auth.getSession.mockResolvedValue({ data: { session: null }, error: null });
      const user = await service.getInitialUser();
      expect(user).toBeNull();
    });

    it('deduplicates concurrent calls — getSession called only once', async () => {
      supabase.auth.getSession.mockResolvedValue({ data: { session: null }, error: null });
      await Promise.all([service.getInitialUser(), service.getInitialUser()]);
      expect(supabase.auth.getSession).toHaveBeenCalledTimes(1);
    });

    it('resolves awaitReady() after getInitialUser completes', async () => {
      supabase.auth.getSession.mockResolvedValue({ data: { session: null }, error: null });
      const initPromise  = service.getInitialUser();
      const readyPromise = service.awaitReady();
      await initPromise;
      await expect(readyPromise).resolves.toBeUndefined();
    });

    it('clears state and calls local signOut when background session validation returns null', async () => {
      supabase.auth.getSession.mockResolvedValue({ data: { session: null }, error: null });
      supabase.auth.signOut.mockResolvedValue({ error: null });
      (SecureStore.getItemAsync as jest.Mock).mockResolvedValueOnce(JSON.stringify(CACHED_USER));

      const user = await service.getInitialUser();
      expect(user?.id).toBe('u1'); // cached user returned immediately

      // Drain microtasks so the void background getSession().then() runs
      await Promise.resolve();
      await Promise.resolve();
      await Promise.resolve();

      expect(supabase.auth.signOut).toHaveBeenCalledWith({ scope: 'local' });
      expect(service.currentUser()).toBeNull();
    });

    it('times out session restore and returns null after 20 seconds', async () => {
      supabase.auth.getSession.mockImplementation(() => new Promise(() => {}));
      const promise = service.getInitialUser();
      await jest.advanceTimersByTimeAsync(20_001);
      const user = await promise;
      expect(user).toBeNull();
    });
  });

  // ── signInWithGoogle ─────────────────────────────────────────────────────

  describe('signInWithGoogle', () => {
    beforeEach(() => {
      GoogleSignin.signIn.mockResolvedValue({
        data: { idToken: 'google-id-token', user: { name: 'Jay G', photo: 'https://example.com/pic.jpg' } },
      });
      supabase.auth.signInWithIdToken.mockResolvedValue({
        data: { user: { id: 'u1', email: 'jay@gmail.com' }, session: { expires_at: FUTURE } },
        error: null,
      });
      supabase.from.mockReturnValue(mockFromChain({ data: USER_ROW, error: null }));
    });

    it('returns User on success', async () => {
      const result = await service.signInWithGoogle();
      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value.name).toBe('Jay');
        expect(result.value.email).toBe('jay@gmail.com');
      }
      expect(supabase.auth.signInWithIdToken).toHaveBeenCalledWith(
        expect.objectContaining({ provider: 'google', token: 'google-id-token' }),
      );
    });

    it('returns AuthError when Google returns no idToken', async () => {
      GoogleSignin.signIn.mockResolvedValue({ data: { idToken: null, user: null } });
      const result = await service.signInWithGoogle();
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error.kind).toBe('AuthError');
        expect(result.error.message).toContain('No ID token');
      }
    });

    it('returns AuthError when Supabase rejects the id token', async () => {
      supabase.auth.signInWithIdToken.mockResolvedValue({
        data: { user: null, session: null },
        error: { message: 'Invalid JWT' },
      });
      const result = await service.signInWithGoogle();
      expect(result.ok).toBe(false);
      if (!result.ok) expect(result.error.kind).toBe('AuthError');
    });

    it('writes user to cache on success', async () => {
      await service.signInWithGoogle();
      expect(SecureStore.setItemAsync).toHaveBeenCalled();
    });
  });

  // ── signInWithApple ──────────────────────────────────────────────────────

  describe('signInWithApple', () => {
    beforeEach(() => {
      AppleAuth.isAvailableAsync.mockResolvedValue(true);
      AppleAuth.signInAsync.mockResolvedValue({
        identityToken: 'apple-id-token',
        fullName: { givenName: 'Jay', familyName: 'Mac' },
        email: 'jay@privaterelay.appleid.com',
      });
      supabase.auth.signInWithIdToken.mockResolvedValue({
        data: { user: { id: 'u1', email: 'jay@privaterelay.appleid.com' }, session: { expires_at: FUTURE } },
        error: null,
      });
      supabase.from.mockReturnValue(mockFromChain({ data: USER_ROW, error: null }));
    });

    it('returns User on success', async () => {
      const result = await service.signInWithApple();
      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value.id).toBe('u1');
      }
      expect(supabase.auth.signInWithIdToken).toHaveBeenCalledWith(
        expect.objectContaining({ provider: 'apple', token: 'apple-id-token' }),
      );
    });

    it('returns AuthError when Apple provides no identity token', async () => {
      AppleAuth.signInAsync.mockResolvedValue({ identityToken: null, fullName: null, email: null });
      const result = await service.signInWithApple();
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error.kind).toBe('AuthError');
        expect(result.error.message).toContain('No identity token');
      }
    });

    it('falls back to email username when Apple provides no name (repeat sign-in)', async () => {
      AppleAuth.signInAsync.mockResolvedValue({
        identityToken: 'apple-id-token',
        fullName: { givenName: null, familyName: null },
        email: null,
      });
      supabase.auth.signInWithIdToken.mockResolvedValue({
        data: { user: { id: 'u1', email: 'jay@privaterelay.appleid.com' }, session: { expires_at: FUTURE } },
        error: null,
      });
      supabase.from.mockReturnValue(mockFromChain({ data: USER_ROW, error: null }));
      const result = await service.signInWithApple();
      expect(result.ok).toBe(true);
    });

    it('returns AuthError when Supabase rejects the id token', async () => {
      supabase.auth.signInWithIdToken.mockResolvedValue({
        data: { user: null, session: null },
        error: { message: 'Invalid JWT' },
      });
      const result = await service.signInWithApple();
      expect(result.ok).toBe(false);
      if (!result.ok) expect(result.error.kind).toBe('AuthError');
    });
  });

  // ── TOKEN_REFRESHED race (public onAuthStateChange) ───────────────────────

  describe('TOKEN_REFRESHED fast path in public onAuthStateChange', () => {
    it('reuses _currentUser when ids match — no DB call', async () => {
      supabase.auth.signInWithPassword.mockResolvedValue({
        data: { user: { id: 'u1', email: 'jay@example.com' }, session: { expires_at: FUTURE } },
        error: null,
      });
      supabase.from.mockReturnValue(mockFromChain({ data: USER_ROW, error: null }));
      await service.signIn('jay@example.com', 'password');

      let capturedHandler: Function = () => {};
      supabase.auth.onAuthStateChange.mockImplementation((handler: Function) => {
        capturedHandler = handler;
        return { data: { subscription: { unsubscribe: jest.fn() } } };
      });

      const received: unknown[] = [];
      service.onAuthStateChange(u => received.push(u));

      supabase.from.mockClear();
      await capturedHandler('TOKEN_REFRESHED', {
        expires_at: FUTURE + 3600,
        user: { id: 'u1', email: 'jay@example.com' },
      });

      expect(received).toHaveLength(1);
      expect((received[0] as { id: string }).id).toBe('u1');
      expect(supabase.from).not.toHaveBeenCalled();
    });
  });

  // ── merge_guest_records_for_new_user trigger (TODO_userMerge.md Chunk B) ──

  describe('guest-record merge trigger', () => {
    it('signIn triggers the merge RPC', async () => {
      supabase.auth.signInWithPassword.mockResolvedValue({
        data: { user: { id: 'u1', email: 'jay@example.com' }, session: {} },
        error: null,
      });
      supabase.from.mockReturnValue(mockFromChain({ data: USER_ROW, error: null }));

      await service.signIn('jay@example.com', 'password');
      await Promise.resolve(); // flush the fire-and-forget microtask

      expect(supabase.rpc).toHaveBeenCalledWith('merge_guest_records_for_new_user');
    });

    it('signUp (no email confirmation) triggers the merge RPC', async () => {
      supabase.auth.signUp.mockResolvedValue({
        data: { user: { id: 'u1', email: 'new@example.com' }, session: { expires_at: FUTURE } },
        error: null,
      });
      supabase.from.mockReturnValue(mockFromChain({ data: USER_ROW, error: null }));

      await service.signUp('new@example.com', 'secret123', 'Jay');
      await Promise.resolve();

      expect(supabase.rpc).toHaveBeenCalledWith('merge_guest_records_for_new_user');
    });

    it('verifyOtp triggers the merge RPC', async () => {
      supabase.auth.verifyOtp.mockResolvedValue({
        data: { user: { id: 'u1', email: 'new@example.com' }, session: { expires_at: FUTURE } },
        error: null,
      });
      supabase.from.mockReturnValue(mockFromChain({ data: USER_ROW, error: null }));

      await service.verifyOtp('new@example.com', '123456', 'Jay');
      await Promise.resolve();

      expect(supabase.rpc).toHaveBeenCalledWith('merge_guest_records_for_new_user');
    });

    it('signInWithGoogle triggers the merge RPC', async () => {
      GoogleSignin.signIn.mockResolvedValue({
        data: { idToken: 'google-id-token', user: { name: 'Jay G', photo: null } },
      });
      supabase.auth.signInWithIdToken.mockResolvedValue({
        data: { user: { id: 'u1', email: 'jay@gmail.com' }, session: { expires_at: FUTURE } },
        error: null,
      });
      supabase.from.mockReturnValue(mockFromChain({ data: USER_ROW, error: null }));

      await service.signInWithGoogle();
      await Promise.resolve();

      expect(supabase.rpc).toHaveBeenCalledWith('merge_guest_records_for_new_user');
    });

    it('signInWithApple triggers the merge RPC', async () => {
      AppleAuth.isAvailableAsync.mockResolvedValue(true);
      AppleAuth.signInAsync.mockResolvedValue({
        identityToken: 'apple-id-token',
        fullName: { givenName: 'Jay', familyName: 'Mac' },
        email: 'jay@privaterelay.appleid.com',
      });
      supabase.auth.signInWithIdToken.mockResolvedValue({
        data: { user: { id: 'u1', email: 'jay@privaterelay.appleid.com' }, session: { expires_at: FUTURE } },
        error: null,
      });
      supabase.from.mockReturnValue(mockFromChain({ data: USER_ROW, error: null }));

      await service.signInWithApple();
      await Promise.resolve();

      expect(supabase.rpc).toHaveBeenCalledWith('merge_guest_records_for_new_user');
    });

    it('does not block sign-in success when the merge RPC fails', async () => {
      supabase.auth.signInWithPassword.mockResolvedValue({
        data: { user: { id: 'u1', email: 'jay@example.com' }, session: {} },
        error: null,
      });
      supabase.from.mockReturnValue(mockFromChain({ data: USER_ROW, error: null }));
      supabase.rpc.mockResolvedValue({ data: null, error: { message: 'merge failed' } });

      const result = await service.signIn('jay@example.com', 'password');

      expect(result.ok).toBe(true);
    });

    it('does not block sign-in success when the merge RPC throws', async () => {
      supabase.auth.signInWithPassword.mockResolvedValue({
        data: { user: { id: 'u1', email: 'jay@example.com' }, session: {} },
        error: null,
      });
      supabase.from.mockReturnValue(mockFromChain({ data: USER_ROW, error: null }));
      supabase.rpc.mockImplementation(() => { throw new Error('network down'); });

      const result = await service.signIn('jay@example.com', 'password');

      expect(result.ok).toBe(true);
    });

    it('plain signIn (no _upsertUser call) still triggers the merge RPC', async () => {
      // signIn is the one success path that never calls _upsertUser — confirms
      // the merge trigger doesn't ride on that helper, it's wired independently.
      supabase.auth.signInWithPassword.mockResolvedValue({
        data: { user: { id: 'u1', email: 'jay@example.com' }, session: {} },
        error: null,
      });
      supabase.from.mockReturnValue(mockFromChain({ data: USER_ROW, error: null }));

      await service.signIn('jay@example.com', 'password');
      await Promise.resolve();

      expect(supabase.rpc).toHaveBeenCalledTimes(1);
    });
  });
});

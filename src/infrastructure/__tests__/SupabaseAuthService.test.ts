jest.mock('@react-native-google-signin/google-signin', () => ({
  GoogleSignin: {
    configure: jest.fn(),
    hasPlayServices: jest.fn().mockResolvedValue(true),
    signIn: jest.fn(),
  },
}));

jest.mock('../supabase/supabaseClient', () => ({
  pingSupabase: jest.fn(),
  supabase: {
    auth: {
      signInWithPassword: jest.fn(),
      signUp: jest.fn(),
      verifyOtp: jest.fn(),
      signOut: jest.fn(),
      getSession: jest.fn().mockResolvedValue({ data: { session: null }, error: null }),
      onAuthStateChange: jest.fn().mockReturnValue({
        data: { subscription: { unsubscribe: jest.fn() } },
      }),
    },
    from: jest.fn(),
  },
}));

import { SupabaseAuthService } from '../supabase/SupabaseAuthService';

const { supabase } = require('../supabase/supabaseClient') as {
  supabase: {
    auth: {
      signInWithPassword: jest.Mock;
      signUp: jest.Mock;
      verifyOtp: jest.Mock;
      signOut: jest.Mock;
      onAuthStateChange: jest.Mock;
    };
    from: jest.Mock;
  };
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

const NOW_STR = '2025-06-01T12:00:00Z';
const USER_ROW = { id: 'u1', display_name: 'Jay', avatar_url: null, created_at: NOW_STR };

describe('SupabaseAuthService', () => {
  let service: SupabaseAuthService;

  beforeEach(() => {
    jest.clearAllMocks();
    // Constructor calls onAuthStateChange — reset it each test.
    supabase.auth.onAuthStateChange.mockReturnValue({
      data: { subscription: { unsubscribe: jest.fn() } },
    });
    service = new SupabaseAuthService();
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
    const expiredAt = Math.floor(Date.now() / 1000) - 60; // 60 s in the past
    supabase.auth.signInWithPassword.mockResolvedValue({
      data: {
        user: { id: 'u1', email: 'jay@example.com' },
        session: { expires_at: expiredAt },
      },
      error: null,
    });
    supabase.from.mockReturnValue(mockFromChain({ data: USER_ROW, error: null }));

    await service.signIn('jay@example.com', 'password');

    expect(service.currentUser()).toBeNull();
  });

  it('currentUser returns user when session has not yet expired', async () => {
    const futureAt = Math.floor(Date.now() / 1000) + 3600; // 1 h in the future
    supabase.auth.signInWithPassword.mockResolvedValue({
      data: {
        user: { id: 'u1', email: 'jay@example.com' },
        session: { expires_at: futureAt },
      },
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
      data: {
        user: { id: 'u1', email: 'new@example.com' },
        session: { expires_at: Math.floor(Date.now() / 1000) + 3600 },
      },
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
      data: {
        user: { id: 'u1', email: 'new@example.com' },
        session: { expires_at: Math.floor(Date.now() / 1000) + 3600 },
      },
      error: null,
    });
    // Both upsert and fallback fetch fail
    supabase.from.mockReturnValue(mockFromChain({ data: null, error: { message: 'DB unavailable' } }));

    const result = await service.signUp('new@example.com', 'secret123', 'Jay');
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.kind).toBe('AuthError');
  });

  // ── verifyOtp ────────────────────────────────────────────────────────────

  it('verifyOtp returns User on valid token', async () => {
    supabase.auth.verifyOtp.mockResolvedValue({
      data: {
        user: { id: 'u1', email: 'new@example.com' },
        session: { expires_at: Math.floor(Date.now() / 1000) + 3600 },
      },
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
      data: {
        user: { id: 'u1', email: 'new@example.com' },
        session: { expires_at: Math.floor(Date.now() / 1000) + 3600 },
      },
      error: null,
    });
    supabase.from.mockReturnValue(mockFromChain({ data: null, error: { message: 'DB error' } }));

    const result = await service.verifyOtp('new@example.com', '123456', 'Jay');
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.kind).toBe('AuthError');
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
});

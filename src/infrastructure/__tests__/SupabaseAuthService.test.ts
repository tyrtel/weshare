jest.mock('../supabase/supabaseClient', () => ({
  supabase: {
    auth: {
      signInWithPassword: jest.fn(),
      signInAnonymously: jest.fn(),
      signOut: jest.fn(),
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
      signInAnonymously: jest.Mock;
      signOut: jest.Mock;
      onAuthStateChange: jest.Mock;
    };
    from: jest.Mock;
  };
};

// Build a mock Supabase query chain that resolves with `result` at .single().
function mockFromChain(result: { data: unknown; error: null | { message: string } }) {
  const single = jest.fn().mockResolvedValue(result);
  const chain = { select: jest.fn(), eq: jest.fn(), insert: jest.fn(), single };
  chain.select.mockReturnValue(chain);
  chain.eq.mockReturnValue(chain);
  chain.insert.mockReturnValue(chain);
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

  // ── signInAsGuest ────────────────────────────────────────────────────────

  it('signInAsGuest creates an anonymous session and inserts user row', async () => {
    supabase.auth.signInAnonymously.mockResolvedValue({
      data: { user: { id: 'guest-u1' }, session: {} },
      error: null,
    });
    supabase.from.mockReturnValue(
      mockFromChain({ data: { ...USER_ROW, id: 'guest-u1', display_name: 'Marie' }, error: null }),
    );

    const result = await service.signInAsGuest('Marie');
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.name).toBe('Marie');
      expect(result.value.id).toBe('guest-u1');
    }
  });

  it('signInAsGuest returns AuthError when signInAnonymously fails', async () => {
    supabase.auth.signInAnonymously.mockResolvedValue({
      data: { user: null, session: null },
      error: { message: 'anonymous auth disabled' },
    });
    const result = await service.signInAsGuest('Tom');
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

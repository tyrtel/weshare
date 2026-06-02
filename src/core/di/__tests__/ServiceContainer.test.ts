import { ServiceContainer, DIError, createToken } from '../ServiceContainer';
import { createTestContainer } from '../testContainer';
import { TRIP_REPO, AUTH, PAYMENT, SHARE } from '../tokens';
import type { ITripRepository } from '../../interfaces/ITripRepository';
import type { IAuthService } from '../../interfaces/IAuthService';
import type { IPaymentService } from '../../interfaces/IPaymentService';
import type { IShareService } from '../../interfaces/IShareService';

// ── ServiceContainer core ─────────────────────────────────────────────────────

describe('ServiceContainer', () => {
  it('register then resolve returns the same instance', () => {
    const container = new ServiceContainer();
    const token = createToken<{ value: number }>('test');
    const impl = { value: 42 };
    container.register(token, impl);
    expect(container.resolve(token)).toBe(impl);
  });

  it('has() returns false before registration', () => {
    const container = new ServiceContainer();
    const token = createToken<string>('unregistered');
    expect(container.has(token)).toBe(false);
  });

  it('has() returns true after registration', () => {
    const container = new ServiceContainer();
    const token = createToken<string>('registered');
    container.register(token, 'hello');
    expect(container.has(token)).toBe(true);
  });

  it('resolve throws DIError for missing token', () => {
    const container = new ServiceContainer();
    const token = createToken<string>('missing');
    expect(() => container.resolve(token)).toThrow(DIError);
  });

  it('DIError message includes the token description', () => {
    const container = new ServiceContainer();
    const token = createToken<string>('MyService');
    expect(() => container.resolve(token)).toThrow(/MyService/);
  });

  it('different tokens with same description are distinct', () => {
    const container = new ServiceContainer();
    const token1 = createToken<string>('same');
    const token2 = createToken<string>('same');
    container.register(token1, 'first');
    expect(() => container.resolve(token2)).toThrow(DIError);
    expect(container.resolve(token1)).toBe('first');
  });

  it('registering again overwrites the previous implementation', () => {
    const container = new ServiceContainer();
    const token = createToken<string>('overwrite');
    container.register(token, 'original');
    container.register(token, 'updated');
    expect(container.resolve(token)).toBe('updated');
  });
});

// ── createTestContainer ───────────────────────────────────────────────────────

describe('createTestContainer', () => {
  it('resolves TRIP_REPO, AUTH, PAYMENT, SHARE tokens', () => {
    const container = createTestContainer();
    expect(() => container.resolve(TRIP_REPO)).not.toThrow();
    expect(() => container.resolve(AUTH)).not.toThrow();
    expect(() => container.resolve(PAYMENT)).not.toThrow();
    expect(() => container.resolve(SHARE)).not.toThrow();
  });

  it('each call produces a fresh container (isolated state)', () => {
    const c1 = createTestContainer();
    const c2 = createTestContainer();
    expect(c1.resolve(TRIP_REPO)).not.toBe(c2.resolve(TRIP_REPO));
  });

  it('accepts a tripRepo override', () => {
    const fakeTripRepo = {} as ITripRepository;
    const container = createTestContainer({ tripRepo: fakeTripRepo });
    expect(container.resolve(TRIP_REPO)).toBe(fakeTripRepo);
  });

  it('accepts an auth override', () => {
    const fakeAuth = {} as IAuthService;
    const container = createTestContainer({ auth: fakeAuth });
    expect(container.resolve(AUTH)).toBe(fakeAuth);
  });

  it('accepts a payment override', () => {
    const fakePayment = {} as IPaymentService;
    const container = createTestContainer({ payment: fakePayment });
    expect(container.resolve(PAYMENT)).toBe(fakePayment);
  });

  it('accepts a share override', () => {
    const fakeShare = {} as IShareService;
    const container = createTestContainer({ share: fakeShare });
    expect(container.resolve(SHARE)).toBe(fakeShare);
  });

  it('non-overridden services still resolve to defaults', () => {
    const fakeTripRepo = {} as ITripRepository;
    const container = createTestContainer({ tripRepo: fakeTripRepo });
    expect(() => container.resolve(AUTH)).not.toThrow();
    expect(container.resolve(AUTH)).not.toBe(fakeTripRepo);
  });
});

// ── Mock implementations smoke test ──────────────────────────────────────────

describe('mock implementations via createTestContainer', () => {
  it('MockAuthService.signInAsGuest creates a user', async () => {
    const container = createTestContainer();
    const auth = container.resolve(AUTH);
    const result = await auth.signInAsGuest('Jay');
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.name).toBe('Jay');
    }
  });

  it('MockAuthService.currentUser is null before sign-in', () => {
    const container = createTestContainer();
    const auth = container.resolve(AUTH);
    expect(auth.currentUser()).toBeNull();
  });

  it('MockAuthService.onAuthStateChange fires after sign-in', async () => {
    const container = createTestContainer();
    const auth = container.resolve(AUTH);
    const received: (import('../../models/User').User | null)[] = [];
    auth.onAuthStateChange(user => received.push(user));
    await auth.signInAsGuest('Marie');
    expect(received).toHaveLength(1);
    expect(received[0]?.name).toBe('Marie');
  });

  it('MockAuthService.onAuthStateChange unsubscribe stops notifications', async () => {
    const container = createTestContainer();
    const auth = container.resolve(AUTH);
    const received: unknown[] = [];
    const unsub = auth.onAuthStateChange(user => received.push(user));
    unsub();
    await auth.signInAsGuest('Tom');
    expect(received).toHaveLength(0);
  });

  it('MockPaymentService records calls and returns deterministic URL', () => {
    const container = createTestContainer();
    const payment = container.resolve(PAYMENT);
    const url = payment.buildPaymentLink('revolut', 2500, 'EUR', 'jay123');
    expect(url).toBe('revolut://pay/jay123?amount=2500&currency=EUR');
  });

  it('MockShareService records shareTrip calls', async () => {
    const container = createTestContainer();
    const share = container.resolve(SHARE);
    const result = await share.shareTrip('t1', 'Chez Paul');
    expect(result.ok).toBe(true);
  });

  it('InMemoryTripRepository returns NotFoundError for unknown trip', async () => {
    const container = createTestContainer();
    const tripRepo = container.resolve(TRIP_REPO);
    const result = await tripRepo.getTrip('nonexistent');
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.kind).toBe('NotFoundError');
    }
  });

  it('InMemoryTripRepository saves and retrieves a trip', async () => {
    const container = createTestContainer();
    const tripRepo = container.resolve(TRIP_REPO);
    const trip = {
      id: 't1',
      name: 'Chez Paul',
      currency: 'EUR',
      createdAt: new Date(),
      ownerId: 'u1',
      members: [],
    };
    await tripRepo.saveTrip(trip);
    const result = await tripRepo.getTrip('t1');
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.name).toBe('Chez Paul');
    }
  });
});

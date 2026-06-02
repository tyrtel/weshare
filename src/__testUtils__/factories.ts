import type { Trip } from '../core/models/Trip';
import type { TripMember } from '../core/models/TripMember';
import type { Expense } from '../core/models/Expense';
import type { Split } from '../core/models/Split';
import type { SplitRequest } from '../core/models/SplitRequest';

export const TEST_DATE = new Date('2025-06-01T12:00:00Z');

export function tripFactory(overrides: Partial<Trip> = {}): Trip {
  return {
    id: 't1',
    name: 'Chez Paul',
    currency: 'EUR',
    ownerId: 'u1',
    createdAt: TEST_DATE,
    members: [],
    status: 'active',
    closedAt: null,
    ...overrides,
  };
}

export function memberFactory(overrides: Partial<TripMember> = {}): TripMember {
  return {
    userId: 'u1',
    tripId: 't1',
    displayName: 'Alice',
    isGuest: false,
    joinedAt: TEST_DATE,
    ...overrides,
  };
}

export function expenseFactory(overrides: Partial<Expense> = {}): Expense {
  return {
    id: 'e1',
    tripId: 't1',
    description: 'Dinner',
    totalAmountCents: 6000,
    currency: 'EUR',
    paidByUserId: 'u1',
    createdAt: TEST_DATE,
    splits: [],
    metadata: {},
    ...overrides,
  };
}

export function splitFactory(overrides: Partial<Split> = {}): Split {
  return {
    id: 's1',
    expenseId: 'e1',
    userId: 'u1',
    amountOwedCents: 3000,
    amountPaidCents: 0,
    ...overrides,
  };
}

export function splitRequestFactory(overrides: Partial<SplitRequest> = {}): SplitRequest {
  return {
    id: 'req-1',
    tripId: 't1',
    requesterUserId: 'u2',
    payerUserId: 'u1',
    amountCents: 2500,
    currency: 'EUR',
    note: 'dinner',
    status: 'created',
    preferredWallet: 'other',
    externalRefId: null,
    stripePaymentLinkId: null,
    stripeSessionId: null,
    obPaymentId: null,
    obProvider: null,
    rolledOverFromTripId: null,
    createdAt: TEST_DATE,
    updatedAt: TEST_DATE,
    ...overrides,
  };
}

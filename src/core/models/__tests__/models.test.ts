// Construction tests for all ouiShare domain models.
// These verify required fields, optional fields, and integer-cents money handling.

import type { User } from '../User';
import type { Trip } from '../Trip';
import type { TripMember } from '../TripMember';
import type { Expense, ExpenseMetadata, ExpenseLineItem } from '../Expense';
import type { Split } from '../Split';
import type { Settlement } from '../Settlement';

const NOW = new Date('2025-06-01T12:00:00Z');

// ── User ─────────────────────────────────────────────────────────────────────

describe('User', () => {
  it('constructs with required fields', () => {
    const user: User = { id: 'u1', name: 'Jay', createdAt: NOW };
    expect(user.id).toBe('u1');
    expect(user.name).toBe('Jay');
    expect(user.email).toBeUndefined();
    expect(user.avatarUrl).toBeUndefined();
  });

  it('accepts optional email and avatarUrl', () => {
    const user: User = {
      id: 'u2',
      name: 'Marie',
      email: 'marie@example.com',
      avatarUrl: 'https://example.com/avatar.png',
      createdAt: NOW,
    };
    expect(user.email).toBe('marie@example.com');
    expect(user.avatarUrl).toBe('https://example.com/avatar.png');
  });
});

// ── TripMember ───────────────────────────────────────────────────────────────

describe('TripMember', () => {
  it('constructs with all required fields', () => {
    const member: TripMember = {
      userId: 'u1',
      tripId: 't1',
      displayName: 'Jay',
      joinedAt: NOW,
      isGuest: false,
    };
    expect(member.isGuest).toBe(false);
  });

  it('supports guest members', () => {
    const guest: TripMember = {
      userId: 'guest_001',
      tripId: 't1',
      displayName: 'Friend (guest)',
      joinedAt: NOW,
      isGuest: true,
    };
    expect(guest.isGuest).toBe(true);
  });
});

// ── Trip ─────────────────────────────────────────────────────────────────────

describe('Trip', () => {
  it('constructs with required fields and an empty member list', () => {
    const trip: Trip = {
      id: 't1',
      name: 'Chez Paul dinner',
      currency: 'EUR',
      createdAt: NOW,
      ownerId: 'u1',
      members: [],
    };
    expect(trip.currency).toBe('EUR');
    expect(trip.members).toHaveLength(0);
    expect(trip.inviteToken).toBeUndefined();
  });

  it('accepts an inviteToken', () => {
    const trip: Trip = {
      id: 't2',
      name: 'Road trip',
      currency: 'USD',
      createdAt: NOW,
      ownerId: 'u1',
      members: [],
      inviteToken: 'abc123',
    };
    expect(trip.inviteToken).toBe('abc123');
  });

  it('stores member list', () => {
    const member: TripMember = {
      userId: 'u2',
      tripId: 't1',
      displayName: 'Sara',
      joinedAt: NOW,
      isGuest: false,
    };
    const trip: Trip = {
      id: 't1',
      name: 'Weekend',
      currency: 'GBP',
      createdAt: NOW,
      ownerId: 'u1',
      members: [member],
    };
    expect(trip.members).toHaveLength(1);
    expect(trip.members[0].displayName).toBe('Sara');
  });
});

// ── Split ─────────────────────────────────────────────────────────────────────

describe('Split', () => {
  it('stores amounts as integer cents', () => {
    const split: Split = {
      id: 's1',
      expenseId: 'e1',
      userId: 'u1',
      amountOwedCents: 4800, // €48.00
      amountPaidCents: 0,
    };
    expect(split.amountOwedCents).toBe(4800);
    expect(split.settledAt).toBeUndefined();
  });

  it('accepts a settledAt date', () => {
    const split: Split = {
      id: 's2',
      expenseId: 'e1',
      userId: 'u2',
      amountOwedCents: 2400,
      amountPaidCents: 2400,
      settledAt: NOW,
    };
    expect(split.settledAt).toBe(NOW);
  });
});

// ── Expense ──────────────────────────────────────────────────────────────────

describe('Expense', () => {
  it('stores totalAmountCents as integer', () => {
    const expense: Expense = {
      id: 'e1',
      tripId: 't1',
      description: 'Steak frites',
      totalAmountCents: 22500, // €225.00
      currency: 'EUR',
      paidByUserId: 'u1',
      createdAt: NOW,
      splits: [],
      metadata: {},
    };
    expect(expense.totalAmountCents).toBe(22500);
    expect(Number.isInteger(expense.totalAmountCents)).toBe(true);
  });

  it('metadata lineItems default to undefined (OCR stub)', () => {
    const meta: ExpenseMetadata = {};
    expect(meta.lineItems).toBeUndefined();
  });

  it('metadata accepts lineItems when OCR is present', () => {
    const lineItem: ExpenseLineItem = {
      id: 'li1',
      description: 'Wine',
      amountCents: 850,
      assignedUserIds: ['u1', 'u2'],
    };
    const meta: ExpenseMetadata = { lineItems: [lineItem] };
    expect(meta.lineItems).toHaveLength(1);
    expect(meta.lineItems![0].amountCents).toBe(850);
  });
});

// ── Settlement ────────────────────────────────────────────────────────────────

describe('Settlement', () => {
  it('captures a minimal transfer in integer cents', () => {
    const s: Settlement = {
      fromUserId: 'u2',
      toUserId: 'u1',
      amountCents: 3750, // €37.50
      currency: 'EUR',
    };
    expect(s.amountCents).toBe(3750);
    expect(Number.isInteger(s.amountCents)).toBe(true);
  });
});

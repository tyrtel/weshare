import {
  splitSchema,
  tripMemberSchema,
  expenseSchema,
  expenseLineItemSchema,
  expenseMetadataSchema,
  tripSchema,
  settlementSchema,
  userSchema,
  safeParse,
} from '../billSessionSchema';
import { isOk, isErr } from '../../types/Result';

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const validSplit = {
  id: 's1',
  expenseId: 'e1',
  userId: 'u1',
  amountOwedCents: 5000,
  amountPaidCents: 0,
};

const validTripMember = {
  userId: 'u1',
  tripId: 't1',
  displayName: 'Jay',
  joinedAt: new Date('2024-01-01T00:00:00.000Z'),
  isGuest: false,
};

const validExpense = {
  id: 'e1',
  tripId: 't1',
  description: 'Dinner',
  totalAmountCents: 14800,
  currency: 'EUR',
  paidByUserId: 'u1',
  createdAt: new Date('2024-06-01T00:00:00.000Z'),
  splits: [validSplit],
  metadata: {},
};

const validTrip = {
  id: 't1',
  name: 'Lisbon Weekend',
  currency: 'EUR',
  createdAt: new Date('2024-01-01T00:00:00.000Z'),
  ownerId: 'u1',
  members: [validTripMember],
};

// ---------------------------------------------------------------------------
// splitSchema
// ---------------------------------------------------------------------------

describe('splitSchema', () => {
  it('accepts a valid split', () => {
    expect(isOk(safeParse(splitSchema, validSplit))).toBe(true);
  });

  it('accepts an optional settledAt as Date', () => {
    const withSettled = { ...validSplit, settledAt: new Date() };
    expect(isOk(safeParse(splitSchema, withSettled))).toBe(true);
  });

  it('coerces settledAt ISO string to Date', () => {
    const result = safeParse(splitSchema, {
      ...validSplit,
      settledAt: '2024-06-15T12:00:00.000Z',
    });
    expect(isOk(result)).toBe(true);
    if (isOk(result)) {
      expect(result.value.settledAt).toBeInstanceOf(Date);
    }
  });

  it('fails when id is missing', () => {
    const { id: _id, ...withoutId } = validSplit;
    const result = safeParse(splitSchema, withoutId);
    expect(isErr(result)).toBe(true);
    if (isErr(result)) {
      expect(result.error.kind).toBe('ValidationError');
      expect(result.error.field).toBe('id');
    }
  });

  it('fails when amountOwedCents is a float', () => {
    const result = safeParse(splitSchema, { ...validSplit, amountOwedCents: 49.99 });
    expect(isErr(result)).toBe(true);
  });

  it('strips unknown extra fields', () => {
    const result = safeParse(splitSchema, { ...validSplit, unexpectedField: true });
    expect(isOk(result)).toBe(true);
    if (isOk(result)) {
      expect((result.value as Record<string, unknown>).unexpectedField).toBeUndefined();
    }
  });
});

// ---------------------------------------------------------------------------
// tripMemberSchema
// ---------------------------------------------------------------------------

describe('tripMemberSchema', () => {
  it('accepts a valid member', () => {
    expect(isOk(safeParse(tripMemberSchema, validTripMember))).toBe(true);
  });

  it('coerces joinedAt ISO string to Date', () => {
    const result = safeParse(tripMemberSchema, {
      ...validTripMember,
      joinedAt: '2024-01-01T00:00:00.000Z',
    });
    expect(isOk(result)).toBe(true);
    if (isOk(result)) {
      expect(result.value.joinedAt).toBeInstanceOf(Date);
    }
  });

  it('fails when displayName is missing', () => {
    const { displayName: _d, ...without } = validTripMember;
    const result = safeParse(tripMemberSchema, without);
    expect(isErr(result)).toBe(true);
    if (isErr(result)) {
      expect(result.error.kind).toBe('ValidationError');
      expect(result.error.field).toBe('displayName');
    }
  });

  it('fails when isGuest is not boolean', () => {
    const result = safeParse(tripMemberSchema, { ...validTripMember, isGuest: 'yes' });
    expect(isErr(result)).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// expenseMetadataSchema
// ---------------------------------------------------------------------------

describe('expenseMetadataSchema', () => {
  it('accepts an empty metadata object', () => {
    expect(isOk(safeParse(expenseMetadataSchema, {}))).toBe(true);
  });

  it('accepts metadata with all optional fields', () => {
    const full = {
      notes: 'paid by card',
      receiptUrl: 'https://example.com/receipt.jpg',
      lineItems: [
        { id: 'li1', description: 'Pasta', amountCents: 1200, assignedUserIds: ['u1'] },
      ],
    };
    expect(isOk(safeParse(expenseMetadataSchema, full))).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// expenseLineItemSchema
// ---------------------------------------------------------------------------

describe('expenseLineItemSchema', () => {
  it('accepts a valid line item', () => {
    const item = { id: 'li1', description: 'Wine', amountCents: 3000, assignedUserIds: ['u1', 'u2'] };
    expect(isOk(safeParse(expenseLineItemSchema, item))).toBe(true);
  });

  it('fails when assignedUserIds is missing', () => {
    const result = safeParse(expenseLineItemSchema, {
      id: 'li1',
      description: 'Wine',
      amountCents: 3000,
    });
    expect(isErr(result)).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// expenseSchema
// ---------------------------------------------------------------------------

describe('expenseSchema', () => {
  it('accepts a valid expense', () => {
    expect(isOk(safeParse(expenseSchema, validExpense))).toBe(true);
  });

  it('coerces createdAt ISO string to Date', () => {
    const result = safeParse(expenseSchema, {
      ...validExpense,
      createdAt: '2024-06-01T00:00:00.000Z',
    });
    expect(isOk(result)).toBe(true);
    if (isOk(result)) {
      expect(result.value.createdAt).toBeInstanceOf(Date);
    }
  });

  it('fails when description is missing', () => {
    const { description: _d, ...without } = validExpense;
    const result = safeParse(expenseSchema, without);
    expect(isErr(result)).toBe(true);
    if (isErr(result)) {
      expect(result.error.kind).toBe('ValidationError');
      expect(result.error.field).toBe('description');
    }
  });

  it('fails when totalAmountCents is a float', () => {
    const result = safeParse(expenseSchema, { ...validExpense, totalAmountCents: 148.50 });
    expect(isErr(result)).toBe(true);
  });

  it('accepts an expense with nested split settledAt', () => {
    const expense = {
      ...validExpense,
      splits: [{ ...validSplit, settledAt: '2024-07-01T00:00:00.000Z' }],
    };
    expect(isOk(safeParse(expenseSchema, expense))).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// tripSchema
// ---------------------------------------------------------------------------

describe('tripSchema', () => {
  it('accepts a valid trip', () => {
    expect(isOk(safeParse(tripSchema, validTrip))).toBe(true);
  });

  it('accepts inviteToken when present', () => {
    const result = safeParse(tripSchema, { ...validTrip, inviteToken: 'abc123' });
    expect(isOk(result)).toBe(true);
    if (isOk(result)) {
      expect(result.value.inviteToken).toBe('abc123');
    }
  });

  it('leaves inviteToken undefined when absent', () => {
    const result = safeParse(tripSchema, validTrip);
    expect(isOk(result)).toBe(true);
    if (isOk(result)) {
      expect(result.value.inviteToken).toBeUndefined();
    }
  });

  it('fails when name is missing', () => {
    const { name: _n, ...without } = validTrip;
    const result = safeParse(tripSchema, without);
    expect(isErr(result)).toBe(true);
    if (isErr(result)) {
      expect(result.error.kind).toBe('ValidationError');
      expect(result.error.field).toBe('name');
    }
  });

  it('fails when members is not an array', () => {
    const result = safeParse(tripSchema, { ...validTrip, members: 'jay' });
    expect(isErr(result)).toBe(true);
  });

  it('strips unknown extra fields', () => {
    const result = safeParse(tripSchema, { ...validTrip, internalFlag: true });
    expect(isOk(result)).toBe(true);
    if (isOk(result)) {
      expect((result.value as Record<string, unknown>).internalFlag).toBeUndefined();
    }
  });
});

// ---------------------------------------------------------------------------
// settlementSchema
// ---------------------------------------------------------------------------

describe('settlementSchema', () => {
  it('accepts a valid settlement', () => {
    const s = { fromUserId: 'u2', toUserId: 'u1', amountCents: 6733, currency: 'EUR' };
    expect(isOk(safeParse(settlementSchema, s))).toBe(true);
  });

  it('fails when amountCents is missing', () => {
    const result = safeParse(settlementSchema, {
      fromUserId: 'u2',
      toUserId: 'u1',
      currency: 'EUR',
    });
    expect(isErr(result)).toBe(true);
    if (isErr(result)) {
      expect(result.error.field).toBe('amountCents');
    }
  });
});

// ---------------------------------------------------------------------------
// userSchema
// ---------------------------------------------------------------------------

describe('userSchema', () => {
  it('accepts a valid user', () => {
    const u = { id: 'u1', name: 'Jay', createdAt: new Date() };
    expect(isOk(safeParse(userSchema, u))).toBe(true);
  });

  it('accepts optional email and avatarUrl', () => {
    const u = { id: 'u1', name: 'Jay', createdAt: new Date(), email: 'j@example.com', avatarUrl: 'https://example.com/a.png' };
    expect(isOk(safeParse(userSchema, u))).toBe(true);
  });

  it('fails when name is missing', () => {
    const result = safeParse(userSchema, { id: 'u1', createdAt: new Date() });
    expect(isErr(result)).toBe(true);
    if (isErr(result)) {
      expect(result.error.field).toBe('name');
    }
  });
});

// ---------------------------------------------------------------------------
// safeParse — generic behaviour
// ---------------------------------------------------------------------------

describe('safeParse', () => {
  it('returns Ok with parsed value on success', () => {
    const result = safeParse(splitSchema, validSplit);
    expect(isOk(result)).toBe(true);
    if (isOk(result)) {
      expect(result.value.id).toBe('s1');
    }
  });

  it('returns Err<ValidationError> on failure', () => {
    const result = safeParse(splitSchema, { not: 'a split' });
    expect(isErr(result)).toBe(true);
    if (isErr(result)) {
      expect(result.error.kind).toBe('ValidationError');
      expect(typeof result.error.field).toBe('string');
      expect(typeof result.error.message).toBe('string');
    }
  });

  it('returns Err when passed null', () => {
    expect(isErr(safeParse(tripSchema, null))).toBe(true);
  });

  it('returns Err when passed a primitive', () => {
    expect(isErr(safeParse(tripSchema, 42))).toBe(true);
  });
});

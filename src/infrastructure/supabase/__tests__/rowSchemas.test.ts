import {
  parseTripRow,
  parseMemberRow,
  parseExpenseRow,
  parseSplitRow,
  parseSplitRequestRow,
  mapRows,
} from '../rowSchemas';

// ── Fixtures ──────────────────────────────────────────────────────────────────

const validTripRow = {
  id:           'trip-1',
  name:         'Paris Trip',
  currency:     'EUR',
  owner_id:     'user-1',
  created_at:   '2024-01-01T00:00:00Z',
  invite_token: null,
};

const validMemberRow = {
  trip_id:      'trip-1',
  user_id:      'user-1',
  display_name: 'Alice',
  is_guest:     false,
  joined_at:    '2024-01-01T00:00:00Z',
};

const validExpenseRow = {
  id:                 'exp-1',
  trip_id:            'trip-1',
  description:        'Dinner',
  total_amount_cents: 5000,
  currency:           'EUR',
  paid_by_user_id:    'user-1',
  created_at:         '2024-01-01T00:00:00Z',
  metadata:           {},
};

const validSplitRow = {
  id:                'split-1',
  expense_id:        'exp-1',
  user_id:           'user-1',
  amount_owed_cents: 2500,
  amount_paid_cents: 2500,
  settled_at:        null,
};

const validSplitRequestRow = {
  id:                     'req-1',
  trip_id:                'trip-1',
  requester_user_id:      'user-1',
  payer_user_id:          'user-2',
  amount_cents:           3000,
  currency:               'EUR',
  note:                   'Dinner split',
  status:                 'pending',
  preferred_wallet:       'stripe',
  external_ref_id:        null,
  stripe_payment_link_id: null,
  stripe_session_id:      null,
  ob_payment_id:          null,
  ob_provider:            null,
  created_at:             '2024-01-01T00:00:00Z',
  updated_at:             '2024-01-01T00:00:00Z',
};

// ── parseTripRow ──────────────────────────────────────────────────────────────

describe('parseTripRow', () => {
  it('accepts a valid trip row', () => {
    const result = parseTripRow(validTripRow);
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.value.id).toBe('trip-1');
  });

  it('accepts a row with a non-null invite_token', () => {
    const result = parseTripRow({ ...validTripRow, invite_token: 'abc123' });
    expect(result.ok).toBe(true);
  });

  it('returns ValidationError when id is missing', () => {
    const { id: _id, ...noId } = validTripRow;
    const result = parseTripRow(noId);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.kind).toBe('ValidationError');
  });

  it('returns ValidationError when currency is an empty string', () => {
    const result = parseTripRow({ ...validTripRow, currency: '' });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.kind).toBe('ValidationError');
  });

  it('returns ValidationError when input is not an object', () => {
    const result = parseTripRow(null);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.kind).toBe('ValidationError');
  });
});

// ── parseMemberRow ────────────────────────────────────────────────────────────

describe('parseMemberRow', () => {
  it('accepts a valid member row', () => {
    const result = parseMemberRow(validMemberRow);
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.value.user_id).toBe('user-1');
  });

  it('returns ValidationError when is_guest is not a boolean', () => {
    const result = parseMemberRow({ ...validMemberRow, is_guest: 'true' });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.kind).toBe('ValidationError');
  });

  it('returns ValidationError when display_name is empty', () => {
    const result = parseMemberRow({ ...validMemberRow, display_name: '' });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.kind).toBe('ValidationError');
  });
});

// ── parseExpenseRow ───────────────────────────────────────────────────────────

describe('parseExpenseRow', () => {
  it('accepts a valid expense row', () => {
    const result = parseExpenseRow(validExpenseRow);
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.value.total_amount_cents).toBe(5000);
  });

  it('defaults metadata to {} when absent', () => {
    const { metadata: _m, ...noMeta } = validExpenseRow;
    const result = parseExpenseRow(noMeta);
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.value.metadata).toEqual({});
  });

  it('returns ValidationError when total_amount_cents is a string', () => {
    const result = parseExpenseRow({ ...validExpenseRow, total_amount_cents: 'five' });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.kind).toBe('ValidationError');
  });

  it('returns ValidationError when description is missing', () => {
    const { description: _d, ...noDesc } = validExpenseRow;
    const result = parseExpenseRow(noDesc);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.kind).toBe('ValidationError');
  });
});

// ── parseSplitRow ─────────────────────────────────────────────────────────────

describe('parseSplitRow', () => {
  it('accepts a valid split row', () => {
    const result = parseSplitRow(validSplitRow);
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.value.amount_owed_cents).toBe(2500);
  });

  it('accepts a row with a settled_at timestamp', () => {
    const result = parseSplitRow({ ...validSplitRow, settled_at: '2024-02-01T00:00:00Z' });
    expect(result.ok).toBe(true);
  });

  it('returns ValidationError when amount_paid_cents is missing', () => {
    const { amount_paid_cents: _a, ...noAmt } = validSplitRow;
    const result = parseSplitRow(noAmt);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.kind).toBe('ValidationError');
  });
});

// ── parseSplitRequestRow ──────────────────────────────────────────────────────

describe('parseSplitRequestRow', () => {
  it('accepts a valid split request row', () => {
    const result = parseSplitRequestRow(validSplitRequestRow);
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.value.amount_cents).toBe(3000);
  });

  it('accepts a row with non-null ob fields', () => {
    const result = parseSplitRequestRow({
      ...validSplitRequestRow,
      ob_payment_id: 'tink_abc',
      ob_provider:   'tink',
    });
    expect(result.ok).toBe(true);
  });

  it('returns ValidationError when requester_user_id is missing', () => {
    const { requester_user_id: _r, ...noReq } = validSplitRequestRow;
    const result = parseSplitRequestRow(noReq);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.kind).toBe('ValidationError');
  });

  it('returns ValidationError when amount_cents is not a number', () => {
    const result = parseSplitRequestRow({ ...validSplitRequestRow, amount_cents: 'abc' });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.kind).toBe('ValidationError');
  });
});

// ── mapRows ───────────────────────────────────────────────────────────────────

describe('mapRows', () => {
  it('maps all valid rows and returns ok', () => {
    const rows = [validSplitRow, { ...validSplitRow, id: 'split-2' }];
    const result = mapRows(rows, parseSplitRow);
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.value).toHaveLength(2);
  });

  it('short-circuits and returns the first error on a malformed row', () => {
    const rows = [validSplitRow, { bad: 'data' }];
    const result = mapRows(rows, parseSplitRow);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.kind).toBe('ValidationError');
  });

  it('returns ok([]) for an empty array', () => {
    const result = mapRows([], parseSplitRow);
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.value).toEqual([]);
  });
});

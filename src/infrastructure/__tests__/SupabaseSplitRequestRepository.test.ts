jest.mock('../supabase/supabaseClient', () => ({
  supabase: { from: jest.fn() },
}));

import { SupabaseSplitRequestRepository } from '../supabase/SupabaseSplitRequestRepository';
import { mockChain } from '../../__testUtils__/supabaseMockChain';
import type { SplitRequest } from '../../core/models/SplitRequest';

const { supabase } = require('../supabase/supabaseClient') as { supabase: { from: jest.Mock } };

function splitRequestRow(overrides: Record<string, unknown> = {}) {
  return {
    id:                        'sr1',
    trip_id:                   't1',
    group_id:                  null,
    requester_user_id:         'jay',
    payer_user_id:             'marie',
    amount_cents:              2500,
    currency:                  'EUR',
    note:                      'Dinner',
    status:                    'request_sent',
    preferred_wallet:          'other',
    external_ref_id:           null,
    stripe_payment_link_id:    null,
    stripe_session_id:         'cs_test_abc',
    ob_payment_id:             null,
    ob_provider:               null,
    rolled_over_from_trip_id:  null,
    created_at:                '2026-07-01T12:00:00.000Z',
    updated_at:                '2026-07-01T13:00:00.000Z',
    ...overrides,
  };
}

function splitRequest(overrides: Partial<SplitRequest> = {}): SplitRequest {
  return {
    id:                  'sr1',
    tripId:              't1',
    requesterUserId:     'jay',
    payerUserId:         'marie',
    amountCents:         2500,
    currency:            'EUR',
    note:                'Dinner',
    status:              'request_sent',
    preferredWallet:     'other',
    externalRefId:       null,
    stripePaymentLinkId: null,
    stripeSessionId:     null,
    obPaymentId:         null,
    obProvider:          null,
    rolledOverFromTripId: null,
    createdAt:           new Date('2026-07-01T12:00:00.000Z'),
    updatedAt:           new Date('2026-07-01T12:00:00.000Z'),
    ...overrides,
  };
}

beforeEach(() => {
  jest.clearAllMocks();
});

describe('SupabaseSplitRequestRepository — getSplitRequest', () => {
  it('maps a row to a SplitRequest', async () => {
    supabase.from.mockReturnValue(mockChain({ data: splitRequestRow(), error: null }));

    const result = await new SupabaseSplitRequestRepository().getSplitRequest('sr1');

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.id).toBe('sr1');
      expect(result.value.tripId).toBe('t1');
      expect(result.value.groupId).toBeUndefined();
      expect(result.value.requesterUserId).toBe('jay');
      expect(result.value.payerUserId).toBe('marie');
      expect(result.value.amountCents).toBe(2500);
      expect(result.value.status).toBe('request_sent');
      expect(result.value.stripeSessionId).toBe('cs_test_abc');
      expect(result.value.createdAt).toBeInstanceOf(Date);
      expect(result.value.updatedAt).toBeInstanceOf(Date);
    }
  });

  it('maps groupId when the row belongs to a group instead of a trip', async () => {
    supabase.from.mockReturnValue(
      mockChain({ data: splitRequestRow({ trip_id: null, group_id: 'g1' }), error: null }),
    );

    const result = await new SupabaseSplitRequestRepository().getSplitRequest('sr1');

    if (result.ok) {
      expect(result.value.tripId).toBeUndefined();
      expect(result.value.groupId).toBe('g1');
    }
  });

  it('wraps a PGRST116 error as NotFoundError', async () => {
    supabase.from.mockReturnValue(
      mockChain({ data: null, error: { message: 'no rows', code: 'PGRST116' } }),
    );

    const result = await new SupabaseSplitRequestRepository().getSplitRequest('missing');

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.kind).toBe('NotFoundError');
      if (result.error.kind === 'NotFoundError') {
        expect(result.error.resource).toBe('SplitRequest');
        expect(result.error.id).toBe('missing');
      }
    }
  });

  it('wraps a generic Supabase error as NetworkError', async () => {
    supabase.from.mockReturnValue(
      mockChain({ data: null, error: { message: 'connection reset' } }),
    );

    const result = await new SupabaseSplitRequestRepository().getSplitRequest('sr1');

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.kind).toBe('NetworkError');
      if (result.error.kind === 'NetworkError') expect(result.error.message).toBe('connection reset');
    }
  });

  it('returns a ValidationError when the row fails schema validation', async () => {
    supabase.from.mockReturnValue(
      mockChain({ data: splitRequestRow({ amount_cents: 'not-a-number' }), error: null }),
    );

    const result = await new SupabaseSplitRequestRepository().getSplitRequest('sr1');

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.kind).toBe('ValidationError');
  });
});

describe('SupabaseSplitRequestRepository — getSplitRequestsForTrip / getSplitRequestsForGroup', () => {
  it('maps a list of rows for a trip, most recent first as returned by the query', async () => {
    supabase.from.mockReturnValue(mockChain({
      data: [splitRequestRow({ id: 'sr1' }), splitRequestRow({ id: 'sr2' })],
      error: null,
    }));

    const result = await new SupabaseSplitRequestRepository().getSplitRequestsForTrip('t1');

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value).toHaveLength(2);
      expect(result.value.map(r => r.id)).toEqual(['sr1', 'sr2']);
    }
  });

  it('maps a list of rows for a group', async () => {
    supabase.from.mockReturnValue(mockChain({
      data: [splitRequestRow({ id: 'sr1', trip_id: null, group_id: 'g1' })],
      error: null,
    }));

    const result = await new SupabaseSplitRequestRepository().getSplitRequestsForGroup('g1');

    expect(result.ok).toBe(true);
    if (result.ok) expect(result.value[0].groupId).toBe('g1');
  });

  it('propagates a Supabase error without attempting to map rows', async () => {
    supabase.from.mockReturnValue(mockChain({ data: null, error: { message: 'timeout' } }));

    const result = await new SupabaseSplitRequestRepository().getSplitRequestsForTrip('t1');

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.kind).toBe('NetworkError');
  });

  it('stops at the first invalid row instead of returning a partial list', async () => {
    supabase.from.mockReturnValue(mockChain({
      data: [splitRequestRow({ id: 'sr1' }), splitRequestRow({ id: 'sr2', status: undefined })],
      error: null,
    }));

    const result = await new SupabaseSplitRequestRepository().getSplitRequestsForTrip('t1');

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.kind).toBe('ValidationError');
  });
});

describe('SupabaseSplitRequestRepository — saveSplitRequest', () => {
  it('inserts the request and returns the row Supabase echoes back', async () => {
    supabase.from.mockReturnValue(
      mockChain({ data: splitRequestRow({ id: 'sr-new' }), error: null }),
    );

    const result = await new SupabaseSplitRequestRepository().saveSplitRequest(
      splitRequest({ id: 'sr-new' }),
    );

    expect(result.ok).toBe(true);
    if (result.ok) expect(result.value.id).toBe('sr-new');
  });

  it('returns a NetworkError when the insert fails', async () => {
    supabase.from.mockReturnValue(
      mockChain({ data: null, error: { message: 'duplicate key value' } }),
    );

    const result = await new SupabaseSplitRequestRepository().saveSplitRequest(splitRequest());

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.kind).toBe('NetworkError');
  });
});

describe('SupabaseSplitRequestRepository — updateSplitRequest', () => {
  it('updates the request and returns the mapped row', async () => {
    supabase.from.mockReturnValue(
      mockChain({ data: splitRequestRow({ status: 'completed' }), error: null }),
    );

    const result = await new SupabaseSplitRequestRepository().updateSplitRequest(
      splitRequest({ status: 'completed' }),
    );

    expect(result.ok).toBe(true);
    if (result.ok) expect(result.value.status).toBe('completed');
  });

  it('wraps a PGRST116 error (row not found) as NotFoundError', async () => {
    supabase.from.mockReturnValue(
      mockChain({ data: null, error: { message: 'no rows', code: 'PGRST116' } }),
    );

    const result = await new SupabaseSplitRequestRepository().updateSplitRequest(
      splitRequest({ id: 'ghost' }),
    );

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.kind).toBe('NotFoundError');
      if (result.error.kind === 'NotFoundError') expect(result.error.id).toBe('ghost');
    }
  });
});

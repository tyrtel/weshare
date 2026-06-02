/**
 * Lisbon Weekend scenario — 2 people, 2 expenses.
 *
 * Jay pays hotel €200 (2-way, 10000¢ each).
 * Marie pays dinner €60 (2-way, 3000¢ each).
 *
 * Expected settlement output:
 *   Marie → Jay   7000¢ (€70.00)
 *
 * This trip is added alongside restaurantScenario in simulation mode so
 * TripListScreen shows two trips and the empty-state is never hit.
 */

import type { StorageFixtures } from './types';

const NOW = new Date('2025-05-24T18:00:00Z');
const TRIP_ID = 'trip_lisbon';

const MEMBERS = [
  { userId: 'guest_jay',   tripId: TRIP_ID, displayName: 'Jay',   joinedAt: NOW, isGuest: true },
  { userId: 'guest_marie', tripId: TRIP_ID, displayName: 'Marie', joinedAt: NOW, isGuest: true },
];

export const twoPersonScenario: StorageFixtures = {
  trips: [
    {
      id:          TRIP_ID,
      name:        'Lisbon Weekend',
      currency:    'EUR',
      ownerId:     'guest_jay',
      createdAt:   NOW,
      inviteToken: 'LISBWKND',
      status:      'active' as const,
      closedAt:    null,
      members:     MEMBERS,
    },
  ],

  members: MEMBERS,

  expenses: [
    {
      id: 'exp_hotel', tripId: TRIP_ID,
      description: 'Hotel', totalAmountCents: 20000, currency: 'EUR',
      paidByUserId: 'guest_jay', createdAt: NOW, splits: [], metadata: {},
    },
    {
      id: 'exp_dinner', tripId: TRIP_ID,
      description: 'Dinner', totalAmountCents: 6000, currency: 'EUR',
      paidByUserId: 'guest_marie', createdAt: NOW, splits: [], metadata: {},
    },
  ],

  splits: [
    // Hotel — Jay pays, 2-way equal
    { id: 'sh1', expenseId: 'exp_hotel', userId: 'guest_jay',   amountOwedCents: 10000, amountPaidCents: 0 },
    { id: 'sh2', expenseId: 'exp_hotel', userId: 'guest_marie', amountOwedCents: 10000, amountPaidCents: 0 },

    // Dinner — Marie pays, 2-way equal
    { id: 'sd1', expenseId: 'exp_dinner', userId: 'guest_jay',   amountOwedCents: 3000, amountPaidCents: 0 },
    { id: 'sd2', expenseId: 'exp_dinner', userId: 'guest_marie', amountOwedCents: 3000, amountPaidCents: 0 },
  ],
};

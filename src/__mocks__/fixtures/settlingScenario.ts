/**
 * Amsterdam Conference scenario — 3 people, 2 expenses, status: settling.
 *
 * Jay pays hotel €300 (3-way, 10000¢ each).
 * Sara pays team dinner €90 (3-way, 3000¢ each).
 *
 * Expected settlement:
 *   Marie → Jay   10000¢ (€100.00)
 *   Sara  → Jay    7000¢ ( €70.00)
 *
 * Trip is in 'settling' state so the SettlementScreen is immediately reachable
 * from simulation mode without having to trigger the Settle Up flow manually.
 */

import type { StorageFixtures } from './types';

const NOW     = new Date('2025-06-10T09:00:00Z');
const TRIP_ID = 'trip_amsterdam';

const MEMBERS = [
  { userId: 'guest_jay',   tripId: TRIP_ID, displayName: 'Jay',   joinedAt: NOW, isGuest: true },
  { userId: 'guest_marie', tripId: TRIP_ID, displayName: 'Marie', joinedAt: NOW, isGuest: true },
  { userId: 'guest_sara',  tripId: TRIP_ID, displayName: 'Sara',  joinedAt: NOW, isGuest: true },
];

export const settlingScenario: StorageFixtures = {
  trips: [
    {
      id:          TRIP_ID,
      name:        'Amsterdam Conf',
      currency:    'EUR',
      ownerId:     'guest_jay',
      createdAt:   NOW,
      inviteToken: 'AMSTCONF',
      status:      'settling' as const,
      closedAt:    null,
      members:     MEMBERS,
    },
  ],

  members: MEMBERS,

  expenses: [
    {
      id: 'exp_hotel_ams', tripId: TRIP_ID,
      description: 'Hotel', totalAmountCents: 30000, currency: 'EUR',
      paidByUserId: 'guest_jay', createdAt: NOW, splits: [], metadata: {},
    },
    {
      id: 'exp_dinner_ams', tripId: TRIP_ID,
      description: 'Team Dinner', totalAmountCents: 9000, currency: 'EUR',
      paidByUserId: 'guest_sara', createdAt: NOW, splits: [], metadata: {},
    },
  ],

  splits: [
    // Hotel — Jay pays, 3-way equal
    { id: 'sa1', expenseId: 'exp_hotel_ams', userId: 'guest_jay',   amountOwedCents: 10000, amountPaidCents: 0 },
    { id: 'sa2', expenseId: 'exp_hotel_ams', userId: 'guest_marie', amountOwedCents: 10000, amountPaidCents: 0 },
    { id: 'sa3', expenseId: 'exp_hotel_ams', userId: 'guest_sara',  amountOwedCents: 10000, amountPaidCents: 0 },

    // Team Dinner — Sara pays, 3-way equal
    { id: 'sb1', expenseId: 'exp_dinner_ams', userId: 'guest_jay',   amountOwedCents: 3000, amountPaidCents: 0 },
    { id: 'sb2', expenseId: 'exp_dinner_ams', userId: 'guest_marie', amountOwedCents: 3000, amountPaidCents: 0 },
    { id: 'sb3', expenseId: 'exp_dinner_ams', userId: 'guest_sara',  amountOwedCents: 3000, amountPaidCents: 0 },
  ],

  splitRequests: [],
};

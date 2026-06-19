/**
 * Amsterdam Conference scenario — 3 people, 2 expenses, status: settling.
 *
 * Jay McCleery pays hotel €300 (3-way, 10000¢ each).
 * Sara pays team dinner €90 (3-way, 3000¢ each).
 *
 * Expected settlement:
 *   Arnaud → Jay   10000¢ (€100.00)
 *   Sara   → Jay    7000¢ ( €70.00)
 *
 * Trip is in 'settling' state so the SettlementScreen is immediately reachable
 * from simulation mode without having to trigger the Settle Up flow manually.
 */

import type { StorageFixtures } from './types';

const NOW     = new Date('2025-06-10T09:00:00Z');
const TRIP_ID = 'trip_amsterdam';

const JAY_AVATAR    = 'https://lh3.googleusercontent.com/a/ACg8ocJFNrgXPuCE0bw1Ze8UM9tsWcNC9-RHJ57qAqfTJT2BPNldnfA=s96-c';
const ARNAUD_AVATAR = 'https://lh3.googleusercontent.com/a/ACg8ocLD-H_BRLqfGAzzHKEdNuMR80cb0ltV3akL5j4U7F5fjU2PlA=s96-c';

const MEMBERS = [
  { userId: 'user_jay@sim.local', tripId: TRIP_ID, displayName: 'Jay McCleery',     joinedAt: NOW, isGuest: true, avatarUrl: JAY_AVATAR },
  { userId: 'guest_arnaud',       tripId: TRIP_ID, displayName: 'Arnaud Denechaud', joinedAt: NOW, isGuest: true, avatarUrl: ARNAUD_AVATAR },
  { userId: 'guest_sara',         tripId: TRIP_ID, displayName: 'Sara',             joinedAt: NOW, isGuest: true },
];

export const settlingScenario: StorageFixtures = {
  trips: [
    {
      id:          TRIP_ID,
      name:        'Amsterdam Conf',
      currency:    'EUR',
      ownerId:     'user_jay@sim.local',
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
      paidByUserId: 'user_jay@sim.local', createdAt: NOW, splits: [], metadata: {},
    },
    {
      id: 'exp_dinner_ams', tripId: TRIP_ID,
      description: 'Team Dinner', totalAmountCents: 9000, currency: 'EUR',
      paidByUserId: 'guest_sara', createdAt: NOW, splits: [], metadata: {},
    },
  ],

  splits: [
    // Hotel — Jay pays, 3-way equal
    { id: 'sa1', expenseId: 'exp_hotel_ams', userId: 'user_jay@sim.local', amountOwedCents: 10000, amountPaidCents: 0 },
    { id: 'sa2', expenseId: 'exp_hotel_ams', userId: 'guest_arnaud',       amountOwedCents: 10000, amountPaidCents: 0 },
    { id: 'sa3', expenseId: 'exp_hotel_ams', userId: 'guest_sara',         amountOwedCents: 10000, amountPaidCents: 0 },

    // Team Dinner — Sara pays, 3-way equal
    { id: 'sb1', expenseId: 'exp_dinner_ams', userId: 'user_jay@sim.local', amountOwedCents: 3000, amountPaidCents: 0 },
    { id: 'sb2', expenseId: 'exp_dinner_ams', userId: 'guest_arnaud',       amountOwedCents: 3000, amountPaidCents: 0 },
    { id: 'sb3', expenseId: 'exp_dinner_ams', userId: 'guest_sara',         amountOwedCents: 3000, amountPaidCents: 0 },
  ],

  splitRequests: [],
};

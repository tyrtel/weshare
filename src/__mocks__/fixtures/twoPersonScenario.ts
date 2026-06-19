/**
 * Lisbon Weekend scenario — 2 people, 2 expenses.
 *
 * Jay McCleery pays hotel €200 (2-way, 10000¢ each).
 * Arnaud pays dinner €60 (2-way, 3000¢ each).
 *
 * Expected settlement output:
 *   Arnaud → Jay   7000¢ (€70.00)
 *
 * This trip is added alongside restaurantScenario in simulation mode so
 * TripListScreen shows two trips and the empty-state is never hit.
 */

import type { StorageFixtures } from './types';

const NOW = new Date('2025-05-24T18:00:00Z');
const TRIP_ID = 'trip_lisbon';

const JAY_AVATAR    = 'https://lh3.googleusercontent.com/a/ACg8ocJFNrgXPuCE0bw1Ze8UM9tsWcNC9-RHJ57qAqfTJT2BPNldnfA=s96-c';
const ARNAUD_AVATAR = 'https://lh3.googleusercontent.com/a/ACg8ocLD-H_BRLqfGAzzHKEdNuMR80cb0ltV3akL5j4U7F5fjU2PlA=s96-c';

const MEMBERS = [
  { userId: 'user_jay@sim.local', tripId: TRIP_ID, displayName: 'Jay McCleery',     joinedAt: NOW, isGuest: true, avatarUrl: JAY_AVATAR },
  { userId: 'guest_arnaud',       tripId: TRIP_ID, displayName: 'Arnaud Denechaud', joinedAt: NOW, isGuest: true, avatarUrl: ARNAUD_AVATAR },
];

export const twoPersonScenario: StorageFixtures = {
  trips: [
    {
      id:          TRIP_ID,
      name:        'Lisbon Weekend',
      currency:    'EUR',
      ownerId:     'user_jay@sim.local',
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
      paidByUserId: 'user_jay@sim.local', createdAt: NOW, splits: [], metadata: {},
    },
    {
      id: 'exp_dinner', tripId: TRIP_ID,
      description: 'Dinner', totalAmountCents: 6000, currency: 'EUR',
      paidByUserId: 'guest_arnaud', createdAt: NOW, splits: [], metadata: {},
    },
  ],

  splits: [
    // Hotel — Jay pays, 2-way equal
    { id: 'sh1', expenseId: 'exp_hotel', userId: 'user_jay@sim.local', amountOwedCents: 10000, amountPaidCents: 0 },
    { id: 'sh2', expenseId: 'exp_hotel', userId: 'guest_arnaud',       amountOwedCents: 10000, amountPaidCents: 0 },

    // Dinner — Arnaud pays, 2-way equal
    { id: 'sd1', expenseId: 'exp_dinner', userId: 'user_jay@sim.local', amountOwedCents: 3000, amountPaidCents: 0 },
    { id: 'sd2', expenseId: 'exp_dinner', userId: 'guest_arnaud',       amountOwedCents: 3000, amountPaidCents: 0 },
  ],
};

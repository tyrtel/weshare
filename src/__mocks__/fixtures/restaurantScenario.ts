/**
 * Chez Paul restaurant scenario — 4 people, 3 expenses.
 *
 * Jay pays €148 for food (4-way, 3700¢ each).
 * Marie pays €64 for wine (Jay/Marie/Sara only — Tom teetotal; 2134/2133/2133¢).
 * Tom pays €36 for desserts (4-way, 900¢ each).
 *
 * Expected settlement output (greedy algorithm):
 *   Sara  → Jay   6733¢ (€67.33)
 *   Tom   → Jay   1000¢ (€10.00)
 *   Marie → Jay    333¢ ( €3.33)
 *
 * Current user: Jay (signed in as guest_jay in simulation mode).
 */

import type { StorageFixtures } from './types';

const NOW = new Date('2025-06-01T19:00:00Z');
const TRIP_ID = 'trip_chez_paul';

const MEMBERS = [
  { userId: 'guest_jay',   tripId: TRIP_ID, displayName: 'Jay',   joinedAt: NOW, isGuest: true },
  { userId: 'guest_marie', tripId: TRIP_ID, displayName: 'Marie', joinedAt: NOW, isGuest: true },
  { userId: 'guest_tom',   tripId: TRIP_ID, displayName: 'Tom',   joinedAt: NOW, isGuest: true },
  { userId: 'guest_sara',  tripId: TRIP_ID, displayName: 'Sara',  joinedAt: NOW, isGuest: true },
];

export const restaurantScenario: StorageFixtures = {
  trips: [
    {
      id:          TRIP_ID,
      name:        'Chez Paul',
      currency:    'EUR',
      ownerId:     'guest_jay',
      createdAt:   NOW,
      inviteToken: 'CHEZPAUL',
      status:      'active' as const,
      closedAt:    null,
      members:     MEMBERS,
    },
  ],

  members: MEMBERS,

  expenses: [
    {
      id: 'exp_food', tripId: TRIP_ID,
      description: 'Food', totalAmountCents: 14800, currency: 'EUR',
      paidByUserId: 'guest_jay', createdAt: NOW, splits: [], metadata: {},
    },
    {
      id: 'exp_wine', tripId: TRIP_ID,
      description: 'Wine', totalAmountCents: 6400, currency: 'EUR',
      paidByUserId: 'guest_marie', createdAt: NOW, splits: [], metadata: {},
    },
    {
      id: 'exp_desserts', tripId: TRIP_ID,
      description: 'Desserts', totalAmountCents: 3600, currency: 'EUR',
      paidByUserId: 'guest_tom', createdAt: NOW, splits: [], metadata: {},
    },
  ],

  splits: [
    // Food — Jay pays, 4-way equal
    { id: 'sf1', expenseId: 'exp_food', userId: 'guest_jay',   amountOwedCents: 3700, amountPaidCents: 0 },
    { id: 'sf2', expenseId: 'exp_food', userId: 'guest_marie', amountOwedCents: 3700, amountPaidCents: 0 },
    { id: 'sf3', expenseId: 'exp_food', userId: 'guest_tom',   amountOwedCents: 3700, amountPaidCents: 0 },
    { id: 'sf4', expenseId: 'exp_food', userId: 'guest_sara',  amountOwedCents: 3700, amountPaidCents: 0 },

    // Wine — Marie pays, Jay/Marie/Sara only (Tom teetotal)
    { id: 'sw1', expenseId: 'exp_wine', userId: 'guest_jay',   amountOwedCents: 2134, amountPaidCents: 0 },
    { id: 'sw2', expenseId: 'exp_wine', userId: 'guest_marie', amountOwedCents: 2133, amountPaidCents: 0 },
    { id: 'sw3', expenseId: 'exp_wine', userId: 'guest_sara',  amountOwedCents: 2133, amountPaidCents: 0 },

    // Desserts — Tom pays, 4-way equal
    { id: 'sd1', expenseId: 'exp_desserts', userId: 'guest_jay',   amountOwedCents: 900, amountPaidCents: 0 },
    { id: 'sd2', expenseId: 'exp_desserts', userId: 'guest_marie', amountOwedCents: 900, amountPaidCents: 0 },
    { id: 'sd3', expenseId: 'exp_desserts', userId: 'guest_tom',   amountOwedCents: 900, amountPaidCents: 0 },
    { id: 'sd4', expenseId: 'exp_desserts', userId: 'guest_sara',  amountOwedCents: 900, amountPaidCents: 0 },
  ],
};

export const RESTAURANT_CURRENT_USER = 'Jay';

/**
 * Flatmates group scenario — direct group expenses across two months, plus
 * one linked trip, so simulation mode has something to explore for group
 * screens (added when Groups shipped) and the Reports tab's Group Reports
 * section (added alongside this fixture) — neither had any group test data
 * before this.
 *
 * Unlike the other scenarios' fixed historical dates (fine for trip screens,
 * which aren't date-filtered), these expenses are dated relative to whenever
 * simulation mode actually runs — Group Reports' month stepper defaults to
 * the real current month, so a hardcoded past date would never appear
 * without manually stepping back. Rent (direct) and Taxi (from the linked
 * trip) both land in the current month, so the default report view
 * immediately demonstrates that trip expenses are pulled into the group
 * report alongside direct ones; Groceries lands last month, so stepping back
 * one month still exercises the month filter.
 *
 * Sara is a guest with no email on file, so she also shows the "hasn't
 * joined yet" indicator on the group screen (owner-only feature).
 *
 * Current user: Jay McCleery (owner) — same identity as restaurantScenario.
 */

import type { StorageFixtures } from './types';

const now = new Date();
const THIS_MONTH = new Date(now.getFullYear(), now.getMonth(), 12);
const LAST_MONTH = new Date(now.getFullYear(), now.getMonth() - 1, 20);

const GROUP_ID = 'group_flatmates';
const TRIP_ID  = 'trip_weekend_getaway';

const GROUP_MEMBERS = [
  { userId: 'user_jay@sim.local', groupId: GROUP_ID, displayName: 'Jay McCleery', joinedAt: LAST_MONTH, isGuest: false },
  { userId: 'guest_arnaud',       groupId: GROUP_ID, displayName: 'Arnaud Denechaud', joinedAt: LAST_MONTH, isGuest: true },
  { userId: 'guest_sara',         groupId: GROUP_ID, displayName: 'Sara', joinedAt: LAST_MONTH, isGuest: true },
];

const TRIP_MEMBERS = [
  { userId: 'user_jay@sim.local', tripId: TRIP_ID, displayName: 'Jay McCleery', joinedAt: LAST_MONTH, isGuest: false },
  { userId: 'guest_arnaud',       tripId: TRIP_ID, displayName: 'Arnaud Denechaud', joinedAt: LAST_MONTH, isGuest: true },
];

export const groupScenario: StorageFixtures = {
  groups: [
    {
      id:          GROUP_ID,
      name:        'Flatmates',
      currency:    'EUR',
      ownerId:     'user_jay@sim.local',
      createdAt:   LAST_MONTH,
      inviteToken: 'FLATMATES',
      members:     GROUP_MEMBERS,
    },
  ],

  trips: [
    {
      id:        TRIP_ID,
      name:      'Weekend Getaway',
      currency:  'EUR',
      ownerId:   'user_jay@sim.local',
      createdAt: LAST_MONTH,
      groupId:   GROUP_ID,
      status:    'active' as const,
      closedAt:  null,
      members:   TRIP_MEMBERS,
    },
  ],

  members: TRIP_MEMBERS,

  expenses: [
    {
      id: 'exp_rent', groupId: GROUP_ID,
      description: 'Rent', totalAmountCents: 90000, currency: 'EUR',
      paidByUserId: 'user_jay@sim.local', createdAt: THIS_MONTH, settledAt: null, splits: [], metadata: {},
    },
    {
      id: 'exp_groceries', groupId: GROUP_ID,
      description: 'Groceries', totalAmountCents: 6600, currency: 'EUR',
      paidByUserId: 'guest_sara', createdAt: LAST_MONTH, settledAt: null, splits: [], metadata: {},
    },
    {
      id: 'exp_taxi', tripId: TRIP_ID,
      description: 'Taxi to the cabin', totalAmountCents: 4200, currency: 'EUR',
      paidByUserId: 'guest_arnaud', createdAt: THIS_MONTH, settledAt: null, splits: [], metadata: {},
    },
  ],

  splits: [
    // Rent — Jay pays, 3-way equal
    { id: 'sr1', expenseId: 'exp_rent', userId: 'user_jay@sim.local', amountOwedCents: 30000, amountPaidCents: 0 },
    { id: 'sr2', expenseId: 'exp_rent', userId: 'guest_arnaud',       amountOwedCents: 30000, amountPaidCents: 0 },
    { id: 'sr3', expenseId: 'exp_rent', userId: 'guest_sara',         amountOwedCents: 30000, amountPaidCents: 0 },

    // Groceries — Sara pays, 3-way equal
    { id: 'sg1', expenseId: 'exp_groceries', userId: 'user_jay@sim.local', amountOwedCents: 2200, amountPaidCents: 0 },
    { id: 'sg2', expenseId: 'exp_groceries', userId: 'guest_arnaud',       amountOwedCents: 2200, amountPaidCents: 0 },
    { id: 'sg3', expenseId: 'exp_groceries', userId: 'guest_sara',         amountOwedCents: 2200, amountPaidCents: 0 },

    // Taxi — Arnaud pays, 2-way equal (just the two of them on this trip)
    { id: 'st1', expenseId: 'exp_taxi', userId: 'user_jay@sim.local', amountOwedCents: 2100, amountPaidCents: 0 },
    { id: 'st2', expenseId: 'exp_taxi', userId: 'guest_arnaud',       amountOwedCents: 2100, amountPaidCents: 0 },
  ],
};

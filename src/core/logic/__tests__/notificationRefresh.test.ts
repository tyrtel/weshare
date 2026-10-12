import { bucketsForNotification } from '../notificationRefresh';

describe('bucketsForNotification', () => {
  it('refreshes a group\'s expenses and payments', () => {
    expect(bucketsForNotification({ eventType: 'expense_added', groupId: 'g1' })).toEqual(['group:g1', 'groupRequests:g1']);
  });

  it('refreshes a trip\'s expenses and payments', () => {
    expect(bucketsForNotification({ tripId: 't1' })).toEqual(['trip:t1', 'tripRequests:t1']);
  });

  it('refreshes nothing for a notification without ids (e.g. sent by an older server)', () => {
    expect(bucketsForNotification({ eventType: 'expense_added' })).toEqual([]);
    expect(bucketsForNotification(undefined)).toEqual([]);
  });
});

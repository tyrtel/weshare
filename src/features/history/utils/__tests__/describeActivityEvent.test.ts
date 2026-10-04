import { describeActivityEvent } from '../describeActivityEvent';
import type { ActivityEvent } from '../../../../core/models/ActivityEvent';

function makeEvent(overrides: Partial<ActivityEvent> = {}): ActivityEvent {
  return {
    id: 'e1',
    eventType: 'expense.created',
    entityType: 'expense',
    entityId: 'exp1',
    groupId: null,
    tripId: 't1',
    expenseId: 'exp1',
    actorUserId: 'u1',
    payload: { description: 'Dinner' },
    createdAt: new Date('2026-09-01T12:00:00Z'),
    ...overrides,
  };
}

describe('describeActivityEvent', () => {
  it('maps expense.created to a plus-circle icon and the created key', () => {
    const result = describeActivityEvent(makeEvent({ eventType: 'expense.created' }));
    expect(result.iconName).toBe('plus-circle');
    expect(result.i18nKey).toBe('history.event.expense_created');
    expect(result.i18nParams).toEqual({ description: 'Dinner' });
  });

  it('maps expense.updated to an edit icon and the updated key', () => {
    const result = describeActivityEvent(makeEvent({ eventType: 'expense.updated' }));
    expect(result.iconName).toBe('edit-2');
    expect(result.i18nKey).toBe('history.event.expense_updated');
  });

  it('maps expense.deleted to a trash icon and the deleted key', () => {
    const result = describeActivityEvent(makeEvent({ eventType: 'expense.deleted' }));
    expect(result.iconName).toBe('trash-2');
    expect(result.i18nKey).toBe('history.event.expense_deleted');
  });

  it('falls back to a generic description for unrecognized event types', () => {
    const result = describeActivityEvent(makeEvent({ eventType: 'group.renamed' }));
    expect(result.iconName).toBe('activity');
    expect(result.i18nKey).toBe('history.event.unknown');
  });

  it('falls back to an em dash when payload has no description', () => {
    const result = describeActivityEvent(makeEvent({ payload: null }));
    expect(result.i18nParams.description).toBe('—');
  });
});

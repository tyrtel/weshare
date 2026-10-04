import { groupEventsByDay, formatDaySectionLabel } from '../groupEventsByDay';
import type { ActivityEvent } from '../../../../core/models/ActivityEvent';

function makeEvent(id: string, createdAt: Date): ActivityEvent {
  return {
    id,
    eventType: 'expense.created',
    entityType: 'expense',
    entityId: 'exp1',
    groupId: 'g1',
    tripId: null,
    expenseId: 'exp1',
    actorUserId: 'u1',
    payload: null,
    createdAt,
  };
}

describe('groupEventsByDay', () => {
  it('groups same-day events into one section, preserving order', () => {
    const events = [
      makeEvent('e1', new Date('2026-09-01T18:00:00')),
      makeEvent('e2', new Date('2026-09-01T09:00:00')),
      makeEvent('e3', new Date('2026-08-31T12:00:00')),
    ];
    const sections = groupEventsByDay(events);

    expect(sections).toHaveLength(2);
    expect(sections[0].events.map(e => e.id)).toEqual(['e1', 'e2']);
    expect(sections[1].events.map(e => e.id)).toEqual(['e3']);
  });

  it('returns an empty array for no events', () => {
    expect(groupEventsByDay([])).toEqual([]);
  });

  it('does not merge two separated runs of the same calendar day', () => {
    // Not sorted purely by day — a day reappears after a different day, as
    // could happen with unusual clock skew across sources. Grouping should
    // not silently merge non-adjacent runs into one section.
    const events = [
      makeEvent('e1', new Date('2026-09-01T18:00:00')),
      makeEvent('e2', new Date('2026-08-31T12:00:00')),
      makeEvent('e3', new Date('2026-09-01T09:00:00')),
    ];
    const sections = groupEventsByDay(events);
    expect(sections).toHaveLength(3);
  });
});

describe('formatDaySectionLabel', () => {
  it('labels the current day as today', () => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    expect(formatDaySectionLabel(today, 'Today', 'Yesterday')).toBe('Today');
  });

  it('labels the previous day as yesterday', () => {
    const yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - 1);
    yesterday.setHours(0, 0, 0, 0);
    expect(formatDaySectionLabel(yesterday, 'Today', 'Yesterday')).toBe('Yesterday');
  });

  it('formats an older date as a weekday/month/day string', () => {
    const older = new Date('2020-01-15T00:00:00');
    expect(formatDaySectionLabel(older, 'Today', 'Yesterday')).not.toBe('Today');
    expect(formatDaySectionLabel(older, 'Today', 'Yesterday')).not.toBe('Yesterday');
    expect(formatDaySectionLabel(older, 'Today', 'Yesterday')).toContain('Jan');
  });
});

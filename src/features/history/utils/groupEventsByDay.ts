import type { ActivityEvent } from '../../../core/models/ActivityEvent';

export interface ActivityDaySection {
  dayKey: string; // yyyy-mm-dd, local time
  date:   Date;   // midnight local time of that day
  events: ActivityEvent[];
}

function dayKeyOf(date: Date): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

/** Assumes `events` is already sorted newest-first; preserves that order. */
export function groupEventsByDay(events: ActivityEvent[]): ActivityDaySection[] {
  const sections: ActivityDaySection[] = [];

  for (const event of events) {
    const key = dayKeyOf(event.createdAt);
    const last = sections[sections.length - 1];
    if (last?.dayKey === key) {
      last.events.push(event);
    } else {
      const date = new Date(event.createdAt);
      date.setHours(0, 0, 0, 0);
      sections.push({ dayKey: key, date, events: [event] });
    }
  }

  return sections;
}

/** Pure so tests don't need an i18n instance — pass already-translated labels. */
export function formatDaySectionLabel(date: Date, todayLabel: string, yesterdayLabel: string): string {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const yesterday = new Date(today);
  yesterday.setDate(yesterday.getDate() - 1);

  if (date.getTime() === today.getTime()) return todayLabel;
  if (date.getTime() === yesterday.getTime()) return yesterdayLabel;
  return date.toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' });
}

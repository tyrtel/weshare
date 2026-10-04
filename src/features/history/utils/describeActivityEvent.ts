import type { ActivityEvent } from '../../../core/models/ActivityEvent';

export type ActivityEventI18nKey =
  | 'history.event.expense_created'
  | 'history.event.expense_updated'
  | 'history.event.expense_deleted'
  | 'history.event.unknown';

export interface ActivityEventDescription {
  iconName: string;   // Feather icon name
  i18nKey:  ActivityEventI18nKey;
  i18nParams: { description: string };
}

const UNKNOWN_DESCRIPTION = '—'; // em dash, shown when payload carries no description

export function describeActivityEvent(event: ActivityEvent): ActivityEventDescription {
  const description = (event.payload?.description as string | undefined) ?? UNKNOWN_DESCRIPTION;

  switch (event.eventType) {
    case 'expense.created':
      return { iconName: 'plus-circle', i18nKey: 'history.event.expense_created', i18nParams: { description } };
    case 'expense.updated':
      return { iconName: 'edit-2', i18nKey: 'history.event.expense_updated', i18nParams: { description } };
    case 'expense.deleted':
      return { iconName: 'trash-2', i18nKey: 'history.event.expense_deleted', i18nParams: { description } };
    default:
      return { iconName: 'activity', i18nKey: 'history.event.unknown', i18nParams: { description } };
  }
}

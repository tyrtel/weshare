import type { RemoteChange } from '../interfaces/IRealtimeService';
import type { TripSessionState } from '../interfaces/ITripSessionStore';
import { bucket, type CacheBucket } from './cacheFreshness';

function str(v: unknown): string | null {
  return typeof v === 'string' && v ? v : null;
}

function findIn<T extends { id: string }>(lists: Record<string, T[]>, id: string): string | null {
  for (const [key, list] of Object.entries(lists)) {
    if (list.some(item => item.id === id)) return key;
  }
  return null;
}

/**
 * Which cache buckets a streamed row change affects. A DELETE carries only the
 * primary key, so its scope is recovered from what's cached — a deleted row
 * this device never had is irrelevant to it.
 */
export function bucketsForChange(change: RemoteChange, state: TripSessionState): CacheBucket[] {
  const rec = change.row ?? change.old ?? {};
  const id  = str(rec.id);
  const tripId  = str(rec.trip_id);
  const groupId = str(rec.group_id);

  switch (change.table) {
    case 'trips':         return ['trips'];
    case 'groups':        return ['groups'];
    case 'group_members': return ['groups'];
    case 'trip_members':  return tripId ? [bucket.trip(tripId), 'trips'] : ['trips'];

    case 'expenses': {
      if (groupId) return [bucket.group(groupId)];
      if (tripId)  return [bucket.trip(tripId)];
      if (!id) return [];
      const cachedTrip  = findIn(state.expenses, id);
      if (cachedTrip) return [bucket.trip(cachedTrip)];
      const cachedGroup = findIn(state.groupExpenses, id);
      return cachedGroup ? [bucket.group(cachedGroup)] : [];
    }

    case 'split_requests': {
      if (groupId) return [bucket.groupRequests(groupId)];
      if (tripId)  return [bucket.tripRequests(tripId)];
      if (!id) return [];
      const cachedTrip  = findIn(state.splitRequests, id);
      if (cachedTrip) return [bucket.tripRequests(cachedTrip)];
      const cachedGroup = findIn(state.groupSplitRequests, id);
      return cachedGroup ? [bucket.groupRequests(cachedGroup)] : [];
    }

    case 'recurring_expenses': {
      if (groupId) return [bucket.recurring(groupId)];
      if (!id) return [];
      const cachedGroup = findIn(state.recurringExpenses, id);
      return cachedGroup ? [bucket.recurring(cachedGroup)] : [];
    }
  }
}

import { bucket, type CacheBucket } from './cacheFreshness';

/** Cache buckets a push notification's data says may have changed. */
export function bucketsForNotification(data: Record<string, unknown> | undefined): CacheBucket[] {
  const tripId  = typeof data?.tripId  === 'string' && data.tripId  ? data.tripId  : null;
  const groupId = typeof data?.groupId === 'string' && data.groupId ? data.groupId : null;
  return [
    ...(tripId  ? [bucket.trip(tripId), bucket.tripRequests(tripId)] : []),
    ...(groupId ? [bucket.group(groupId), bucket.groupRequests(groupId)] : []),
  ];
}

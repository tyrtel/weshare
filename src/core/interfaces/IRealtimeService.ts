export type RealtimeTable =
  | 'trips'
  | 'trip_members'
  | 'expenses'
  | 'groups'
  | 'group_members'
  | 'split_requests'
  | 'recurring_expenses';

export const REALTIME_TABLES: readonly RealtimeTable[] = [
  'trips', 'trip_members', 'expenses', 'groups', 'group_members', 'split_requests', 'recurring_expenses',
];

/** A row change made by anyone (including this user) that the server streamed to us. */
export interface RemoteChange {
  table: RealtimeTable;
  type: 'INSERT' | 'UPDATE' | 'DELETE';
  /** The row after the change; null for DELETE. */
  row: Record<string, unknown> | null;
  /** For DELETE: the primary key columns only. */
  old: Record<string, unknown> | null;
}

export interface IRealtimeService {
  /** Start streaming changes; returns a function that stops the stream. */
  subscribe(onChange: (change: RemoteChange) => void): () => void;
}

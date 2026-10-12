import type { IRealtimeService, RemoteChange } from '../core/interfaces/IRealtimeService';

export class MockRealtimeService implements IRealtimeService {
  private listeners = new Set<(change: RemoteChange) => void>();

  get subscriberCount(): number {
    return this.listeners.size;
  }

  subscribe = (onChange: (change: RemoteChange) => void): (() => void) => {
    this.listeners.add(onChange);
    return () => { this.listeners.delete(onChange); };
  };

  /** Deliver a change to every current subscriber, as the server would. */
  emit(change: RemoteChange): void {
    for (const l of this.listeners) l(change);
  }
}

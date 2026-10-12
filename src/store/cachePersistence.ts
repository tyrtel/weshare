import type { ICacheStorage } from '../core/interfaces/ICacheStorage';
import type { TripSessionState } from '../core/interfaces/ITripSessionStore';
import type { Trip } from '../core/models/Trip';
import type { TripMember } from '../core/models/TripMember';
import type { Expense } from '../core/models/Expense';
import type { Group } from '../core/models/Group';
import type { SplitRequest } from '../core/models/SplitRequest';
import type { RecurringExpense } from '../core/models/RecurringExpense';
import { tripSchema, expenseSchema, tripMemberSchema, groupSchema } from '../core/schemas/billSessionSchema';
import { logger } from '../core/utils/logger';
import { parseMany, type TripSessionStoreApi } from './tripSessionStore';

/** Bump whenever a persisted model changes shape; older caches are discarded. */
export const CACHE_SCHEMA_VERSION = 1;
const CACHE_KEY        = 'session';
const SAVE_DEBOUNCE_MS = 1000;
// Android's AsyncStorage database defaults to 6 MB in total. Past this size
// the cache is dropped rather than risk crowding out everything else there.
export const MAX_CACHE_CHARS = 2_000_000;

const PERSISTED_KEYS = [
  'trips', 'expenses', 'members', 'splitRequests', 'groupSplitRequests',
  'groups', 'groupExpenses', 'recurringExpenses', 'fetchedAt',
] as const;

type PersistedState = Pick<TripSessionState, typeof PERSISTED_KEYS[number]>;

interface CacheEnvelope {
  version: number;
  userId: string;
  state: PersistedState;
}

function pick(s: TripSessionState): PersistedState {
  // An optimistic expense whose save hasn't confirmed yet must not outlive
  // the app if it's killed mid-save.
  const pending = new Set(s.pendingExpenseIds);
  const confirmed = (rec: Record<string, Expense[]>) =>
    pending.size === 0 ? rec : mapValues(rec, list => list.filter(e => !pending.has(e.id)));
  return {
    trips:              s.trips,
    expenses:           confirmed(s.expenses),
    members:            s.members,
    splitRequests:      s.splitRequests,
    groupSplitRequests: s.groupSplitRequests,
    groups:             s.groups,
    groupExpenses:      confirmed(s.groupExpenses),
    recurringExpenses:  s.recurringExpenses,
    fetchedAt:          s.fetchedAt,
  };
}

function mapValues<A, B>(rec: Record<string, A>, fn: (a: A) => B): Record<string, B> {
  return Object.fromEntries(Object.entries(rec).map(([k, v]) => [k, fn(v)]));
}

function reviveSplitRequest(r: SplitRequest): SplitRequest {
  return { ...r, createdAt: new Date(r.createdAt), updatedAt: new Date(r.updatedAt) };
}

function reviveRecurring(r: RecurringExpense): RecurringExpense {
  return {
    ...r,
    startDate:     new Date(r.startDate),
    nextDueAt:     new Date(r.nextDueAt),
    lastSpawnedAt: r.lastSpawnedAt ? new Date(r.lastSpawnedAt) : null,
    pausedAt:      r.pausedAt ? new Date(r.pausedAt) : null,
    createdAt:     new Date(r.createdAt),
  };
}

// JSON turns Dates into strings; the same Zod schemas the repos' results go
// through restore them (and drop anything malformed rather than crash).
function revive(raw: PersistedState): PersistedState {
  return {
    trips:              parseMany<Trip>(raw.trips, tripSchema),
    expenses:           mapValues(raw.expenses, l => parseMany<Expense>(l, expenseSchema)),
    members:            mapValues(raw.members, l => parseMany<TripMember>(l, tripMemberSchema)),
    splitRequests:      mapValues(raw.splitRequests, l => l.map(reviveSplitRequest)),
    groupSplitRequests: mapValues(raw.groupSplitRequests, l => l.map(reviveSplitRequest)),
    groups:             parseMany<Group>(raw.groups, groupSchema),
    groupExpenses:      mapValues(raw.groupExpenses, l => parseMany<Expense>(l, expenseSchema)),
    recurringExpenses:  mapValues(raw.recurringExpenses, l => l.map(reviveRecurring)),
    fetchedAt:          raw.fetchedAt,
  };
}

export interface CacheSession {
  /** Write any pending change now (e.g. the app is going to the background). */
  flush(): Promise<void>;
  stop(): void;
}

export function createCachePersistence(store: TripSessionStoreApi, storage: ICacheStorage) {
  return {
    /** Load the signed-in user's cached state into the store. Resolves false
     *  when there is nothing usable (none saved, other user, old version). */
    async restore(userId: string): Promise<boolean> {
      const raw = await storage.getItem(CACHE_KEY);
      if (!raw) return false;
      try {
        const envelope = JSON.parse(raw) as CacheEnvelope;
        if (envelope.version !== CACHE_SCHEMA_VERSION || envelope.userId !== userId) {
          await storage.removeItem(CACHE_KEY);
          return false;
        }
        store.setState({ ...revive(envelope.state), isHydrated: true, hydrationError: null });
        return true;
      } catch (e) {
        logger.error(e instanceof Error ? e : new Error(String(e)));
        await storage.removeItem(CACHE_KEY);
        return false;
      }
    },

    /** Save the store for this user, debounced, until stopped. */
    start(userId: string): CacheSession {
      let timer: ReturnType<typeof setTimeout> | null = null;

      const write = async () => {
        timer = null;
        const envelope: CacheEnvelope = { version: CACHE_SCHEMA_VERSION, userId, state: pick(store.getState()) };
        const json = JSON.stringify(envelope);
        try {
          if (json.length > MAX_CACHE_CHARS) {
            await storage.removeItem(CACHE_KEY);
            logger.warn(`cache_too_large: ${json.length} chars, not persisted`);
            return;
          }
          await storage.setItem(CACHE_KEY, json);
        } catch (e) {
          // A failed cache write only costs the next cold start its head start.
          logger.error(e instanceof Error ? e : new Error(String(e)));
        }
      };

      const unsubscribe = store.subscribe((next, prev) => {
        if (PERSISTED_KEYS.every(k => next[k] === prev[k])) return;
        if (timer) clearTimeout(timer);
        timer = setTimeout(() => { void write(); }, SAVE_DEBOUNCE_MS);
      });

      return {
        flush: () => {
          if (!timer) return Promise.resolve();
          clearTimeout(timer);
          return write();
        },
        stop: () => {
          unsubscribe();
          if (timer) clearTimeout(timer);
          timer = null;
        },
      };
    },

    /** Forget everything cached on this device, e.g. on sign-out. */
    clear(): Promise<void> {
      return storage.clear();
    },
  };
}

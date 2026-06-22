import * as SecureStore from 'expo-secure-store';
import { logger } from '../../core/utils/logger';

// expo-secure-store caps each value at ~2 KB. Supabase session JSON (access
// token + refresh token + user metadata) can exceed that, so we chunk long
// values across multiple keys and track the count in a separate key.
const CHUNK_SIZE = 1800; // bytes — well within the 2 048-byte limit

// Maps a storage key to a short label that won't trigger Sentry's automatic
// PII scrubber. Keys containing "token" / "auth" / "secret" get redacted.
function labelFor(key: string): string {
  if (key.includes('auth')) return 'session';
  if (key.includes('user')) return 'user-cache';
  return `key(${key.length}ch)`;
}

async function getItem(key: string): Promise<string | null> {
  const lbl = labelFor(key);
  try {
    const countStr = await SecureStore.getItemAsync(`${key}_n`);
    if (countStr) {
      const count = parseInt(countStr, 10);
      logger.log(`[store:read] ${lbl} chunked n=${count}`);
      const parts: string[] = [];
      for (let i = 0; i < count; i++) {
        const chunk = await SecureStore.getItemAsync(`${key}_${i}`);
        if (chunk === null) {
          logger.error(new Error(`[store:read] ${lbl} missing chunk ${i}/${count} — partial write corruption`));
          return null;
        }
        parts.push(chunk);
      }
      logger.log(`[store:read] ${lbl} chunked ok len=${parts.join('').length}`);
      return parts.join('');
    }
    const value = await SecureStore.getItemAsync(key);
    logger.log(`[store:read] ${lbl} single=${value !== null ? `found(${value.length}ch)` : 'null'}`);
    return value;
  } catch (e) {
    logger.error(e instanceof Error ? e : new Error(String(e)));
    return null;
  }
}

async function setItem(key: string, value: string): Promise<void> {
  const lbl = labelFor(key);
  try {
    // Clear any previous layout (chunked or single) so stale keys can't
    // shadow the new value. Wrapped in try/catch so a failed cleanup never
    // prevents the write itself.
    try {
      await removeItem(key);
    } catch {
      logger.log(`[store:write] ${lbl} pre-clear failed (ignored)`);
    }

    if (value.length <= CHUNK_SIZE) {
      await SecureStore.setItemAsync(key, value);
      logger.log(`[store:write] ${lbl} single len=${value.length}`);
      return;
    }
    const count = Math.ceil(value.length / CHUNK_SIZE);
    await SecureStore.setItemAsync(`${key}_n`, String(count));
    for (let i = 0; i < count; i++) {
      await SecureStore.setItemAsync(`${key}_${i}`, value.slice(i * CHUNK_SIZE, (i + 1) * CHUNK_SIZE));
    }
    logger.log(`[store:write] ${lbl} chunked n=${count} len=${value.length}`);
  } catch (e) {
    logger.error(e instanceof Error ? e : new Error(String(e)));
  }
}

async function removeItem(key: string): Promise<void> {
  const countStr = await SecureStore.getItemAsync(`${key}_n`);
  if (countStr) {
    const count = parseInt(countStr, 10);
    await Promise.all([
      SecureStore.deleteItemAsync(`${key}_n`),
      ...Array.from({ length: count }, (_, i) => SecureStore.deleteItemAsync(`${key}_${i}`)),
    ]);
  } else {
    await SecureStore.deleteItemAsync(key);
  }
}

export const LargeSecureStore = { getItem, setItem, removeItem };

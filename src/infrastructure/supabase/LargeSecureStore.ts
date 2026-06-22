import * as SecureStore from 'expo-secure-store';
import { logger } from '../../core/utils/logger';

// expo-secure-store caps each value at ~2 KB. Supabase session JSON (access
// token + refresh token + user metadata) can exceed that, so we chunk long
// values across multiple keys and track the count in a separate key.
const CHUNK_SIZE = 1800; // bytes — well within the 2 048-byte limit

async function getItem(key: string): Promise<string | null> {
  const tag = key.slice(-24); // last 24 chars of key — avoids logging the full key
  try {
    const countStr = await SecureStore.getItemAsync(`${key}_n`);
    if (countStr) {
      const count = parseInt(countStr, 10);
      logger.log(`[SecureStore] getItem ${tag} chunked n=${count}`);
      const parts: string[] = [];
      for (let i = 0; i < count; i++) {
        const chunk = await SecureStore.getItemAsync(`${key}_${i}`);
        if (chunk === null) {
          // A missing chunk means a partial write — report as an error so
          // Sentry flushes all preceding breadcrumbs and creates an event.
          logger.error(new Error(`[SecureStore] getItem ${tag} missing chunk ${i} of ${count}`));
          return null;
        }
        parts.push(chunk);
      }
      return parts.join('');
    }
    const value = await SecureStore.getItemAsync(key);
    logger.log(`[SecureStore] getItem ${tag} single=${value !== null ? 'found' : 'null'}`);
    return value;
  } catch (e) {
    logger.error(e instanceof Error ? e : new Error(String(e)));
    return null;
  }
}

async function setItem(key: string, value: string): Promise<void> {
  const tag = key.slice(-24);
  try {
    // Clear any previous layout (chunked or single) so stale keys can't
    // shadow the new value. Wrapped in try/catch so a failed cleanup never
    // prevents the write itself.
    try {
      await removeItem(key);
    } catch {
      logger.log(`[SecureStore] setItem ${tag} removeItem failed (ignored)`);
    }

    if (value.length <= CHUNK_SIZE) {
      await SecureStore.setItemAsync(key, value);
      logger.log(`[SecureStore] setItem ${tag} single len=${value.length}`);
      return;
    }
    const count = Math.ceil(value.length / CHUNK_SIZE);
    await SecureStore.setItemAsync(`${key}_n`, String(count));
    for (let i = 0; i < count; i++) {
      await SecureStore.setItemAsync(`${key}_${i}`, value.slice(i * CHUNK_SIZE, (i + 1) * CHUNK_SIZE));
    }
    logger.log(`[SecureStore] setItem ${tag} chunked n=${count} len=${value.length}`);
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

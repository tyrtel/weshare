import * as SecureStore from 'expo-secure-store';
import * as Sentry from '@sentry/react-native';
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

function bc(message: string, level: Sentry.SeverityLevel = 'info') {
  Sentry.addBreadcrumb({ category: 'storage', message, level });
}

async function getItem(key: string): Promise<string | null> {
  const lbl = labelFor(key);
  const t0 = Date.now();
  bc(`store_read_start: ${lbl}`);
  try {
    const countStr = await SecureStore.getItemAsync(`${key}_n`);
    if (countStr) {
      const count = parseInt(countStr, 10);
      bc(`store_read_count_key_found: ${lbl} n=${count}`);
      logger.log(`[store:read] ${lbl} chunked n=${count}`);
      const parts: string[] = [];
      for (let i = 0; i < count; i++) {
        const chunk = await SecureStore.getItemAsync(`${key}_${i}`);
        if (chunk === null) {
          const msg = `store_read_chunk_missing: ${lbl} chunk=${i}/${count}`;
          bc(msg, 'error');
          Sentry.captureMessage(msg, 'error');
          logger.error(new Error(msg));
          return null;
        }
        parts.push(chunk);
      }
      const assembled = parts.join('');
      logger.log(`[store:read] ${lbl} chunked ok len=${assembled.length}`);
      bc(`store_read_done: ${lbl} layout=chunked n=${count} len=${assembled.length} ms=${Date.now() - t0}`);
      return assembled;
    }
    const value = await SecureStore.getItemAsync(key);
    logger.log(`[store:read] ${lbl} single=${value !== null ? `found(${value.length}ch)` : 'null'}`);
    bc(`store_read_done: ${lbl} layout=single present=${value !== null} ms=${Date.now() - t0}`);
    return value;
  } catch (e) {
    const err = e instanceof Error ? e : new Error(String(e));
    logger.error(err);
    bc(`store_read_error: ${lbl} ms=${Date.now() - t0}`, 'error');
    Sentry.captureException(err, { tags: { storage_label: lbl, storage_op: 'read' } });
    return null;
  }
}

async function setItem(key: string, value: string): Promise<void> {
  const lbl = labelFor(key);
  const t0 = Date.now();
  bc(`store_write_start: ${lbl} len=${value.length}`);
  try {
    // Clear any previous layout (chunked or single) so stale keys can't
    // shadow the new value. Wrapped in try/catch so a failed cleanup never
    // prevents the write itself.
    try {
      await removeItem(key);
      bc(`store_write_pre_clear_done: ${lbl} ms=${Date.now() - t0}`);
    } catch {
      logger.log(`[store:write] ${lbl} pre-clear failed (ignored)`);
      bc(`store_write_pre_clear_failed: ${lbl}`, 'warning');
    }

    if (value.length <= CHUNK_SIZE) {
      await SecureStore.setItemAsync(key, value);
      logger.log(`[store:write] ${lbl} single len=${value.length}`);
      bc(`store_write_done: ${lbl} layout=single len=${value.length} ms=${Date.now() - t0}`);
      return;
    }
    const count = Math.ceil(value.length / CHUNK_SIZE);
    await SecureStore.setItemAsync(`${key}_n`, String(count));
    bc(`store_write_count_key_done: ${lbl} n=${count} ms=${Date.now() - t0}`);
    for (let i = 0; i < count; i++) {
      await SecureStore.setItemAsync(`${key}_${i}`, value.slice(i * CHUNK_SIZE, (i + 1) * CHUNK_SIZE));
      bc(`store_write_chunk_done: ${lbl} chunk=${i}/${count} ms=${Date.now() - t0}`);
    }
    logger.log(`[store:write] ${lbl} chunked n=${count} len=${value.length}`);
    bc(`store_write_done: ${lbl} layout=chunked n=${count} len=${value.length} ms=${Date.now() - t0}`);
  } catch (e) {
    const err = e instanceof Error ? e : new Error(String(e));
    logger.error(err);
    bc(`store_write_error: ${lbl} ms=${Date.now() - t0}`, 'error');
    Sentry.captureException(err, { tags: { storage_label: lbl, storage_op: 'write' } });
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

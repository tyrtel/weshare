jest.mock('../../core/utils/logger', () => ({
  logger: { log: jest.fn(), warn: jest.fn(), error: jest.fn() },
}));

import * as SecureStore from 'expo-secure-store';
import * as Sentry from '@sentry/react-native';
import { LargeSecureStore } from '../supabase/LargeSecureStore';

// expo-secure-store and @sentry/react-native are globally mocked (see
// jest.config.js moduleNameMapper) with a real in-memory key/value store and
// jest.fn() spies respectively — no per-test jest.mock() needed for them.

beforeEach(() => {
  jest.clearAllMocks();
});

describe('LargeSecureStore — single-value layout (value fits in one chunk)', () => {
  it('round-trips a short value through a single key', async () => {
    await LargeSecureStore.setItem('single-1', 'hello world');

    expect(SecureStore.setItemAsync).toHaveBeenCalledWith('single-1', 'hello world');
    expect(SecureStore.setItemAsync).not.toHaveBeenCalledWith('single-1_n', expect.anything());

    const result = await LargeSecureStore.getItem('single-1');
    expect(result).toBe('hello world');
  });

  it('returns null for a key that was never written', async () => {
    const result = await LargeSecureStore.getItem('never-written');
    expect(result).toBeNull();
  });
});

describe('LargeSecureStore — chunked layout (value exceeds the 1800-byte chunk size)', () => {
  it('splits a long value across numbered chunk keys and reassembles it on read', async () => {
    const longValue = 'a'.repeat(1800) + 'b'.repeat(1800) + 'c'.repeat(100); // 3 chunks

    await LargeSecureStore.setItem('chunked-1', longValue);

    expect(SecureStore.setItemAsync).toHaveBeenCalledWith('chunked-1_n', '3');
    expect(SecureStore.setItemAsync).toHaveBeenCalledWith('chunked-1_0', 'a'.repeat(1800));
    expect(SecureStore.setItemAsync).toHaveBeenCalledWith('chunked-1_1', 'b'.repeat(1800));
    expect(SecureStore.setItemAsync).toHaveBeenCalledWith('chunked-1_2', 'c'.repeat(100));

    const result = await LargeSecureStore.getItem('chunked-1');
    expect(result).toBe(longValue);
  });

  it('writes exactly at the chunk-size boundary as a single chunk', async () => {
    const exactValue = 'x'.repeat(1800);

    await LargeSecureStore.setItem('boundary-1', exactValue);

    expect(SecureStore.setItemAsync).toHaveBeenCalledWith('boundary-1', exactValue);
    expect(SecureStore.setItemAsync).not.toHaveBeenCalledWith('boundary-1_n', expect.anything());
  });

  it('returns null and reports to Sentry when a chunk is missing mid-assembly', async () => {
    const longValue = 'a'.repeat(1800) + 'b'.repeat(500);
    await LargeSecureStore.setItem('chunked-missing', longValue);

    await SecureStore.deleteItemAsync('chunked-missing_1');

    const result = await LargeSecureStore.getItem('chunked-missing');

    expect(result).toBeNull();
    expect(Sentry.captureMessage).toHaveBeenCalledWith(expect.stringContaining('store_read_chunk_missing'), 'error');
  });
});

describe('LargeSecureStore — switching layout on rewrite', () => {
  it('clears the old single key when a later write becomes chunked', async () => {
    await LargeSecureStore.setItem('switch-1', 'short');
    await LargeSecureStore.setItem('switch-1', 'z'.repeat(4000));

    const result = await LargeSecureStore.getItem('switch-1');
    expect(result).toBe('z'.repeat(4000));
  });

  it('clears old chunk keys when a later write becomes a single value', async () => {
    await LargeSecureStore.setItem('switch-2', 'z'.repeat(4000));
    await LargeSecureStore.setItem('switch-2', 'short again');

    const result = await LargeSecureStore.getItem('switch-2');
    expect(result).toBe('short again');
    // The stale count key must be gone, or getItem would try (and fail) to
    // reassemble chunks that no longer exist.
    expect(await SecureStore.getItemAsync('switch-2_n')).toBeNull();
  });
});

describe('LargeSecureStore — removeItem', () => {
  it('deletes just the single key for a single-layout value', async () => {
    await LargeSecureStore.setItem('remove-single', 'value');
    jest.clearAllMocks();

    await LargeSecureStore.removeItem('remove-single');

    expect(SecureStore.deleteItemAsync).toHaveBeenCalledWith('remove-single');
    expect(await SecureStore.getItemAsync('remove-single')).toBeNull();
  });

  it('deletes the count key and every chunk key for a chunked value', async () => {
    await LargeSecureStore.setItem('remove-chunked', 'y'.repeat(4000));
    jest.clearAllMocks();

    await LargeSecureStore.removeItem('remove-chunked');

    expect(SecureStore.deleteItemAsync).toHaveBeenCalledWith('remove-chunked_n');
    expect(SecureStore.deleteItemAsync).toHaveBeenCalledWith('remove-chunked_0');
    expect(SecureStore.deleteItemAsync).toHaveBeenCalledWith('remove-chunked_1');
    expect(SecureStore.deleteItemAsync).toHaveBeenCalledWith('remove-chunked_2');
    expect(await SecureStore.getItemAsync('remove-chunked_n')).toBeNull();
  });

  it('is a no-op (does not throw) for a key that was never written', async () => {
    await expect(LargeSecureStore.removeItem('never-existed')).resolves.toBeUndefined();
  });
});

describe('LargeSecureStore — error handling', () => {
  it('getItem catches a thrown error, returns null, and reports to Sentry', async () => {
    (SecureStore.getItemAsync as jest.Mock).mockRejectedValueOnce(new Error('secure enclave unavailable'));

    const result = await LargeSecureStore.getItem('error-read');

    expect(result).toBeNull();
    expect(Sentry.captureException).toHaveBeenCalledWith(
      expect.objectContaining({ message: 'secure enclave unavailable' }),
      expect.objectContaining({ tags: expect.objectContaining({ storage_op: 'read' }) }),
    );
  });

  it('setItem catches a thrown error and reports to Sentry rather than rejecting', async () => {
    (SecureStore.setItemAsync as jest.Mock).mockRejectedValueOnce(new Error('disk full'));

    await expect(LargeSecureStore.setItem('error-write', 'value')).resolves.toBeUndefined();

    expect(Sentry.captureException).toHaveBeenCalledWith(
      expect.objectContaining({ message: 'disk full' }),
      expect.objectContaining({ tags: expect.objectContaining({ storage_op: 'write' }) }),
    );
  });

  it('setItem still writes the new value when the pre-write cleanup itself fails', async () => {
    (SecureStore.getItemAsync as jest.Mock).mockRejectedValueOnce(new Error('transient read failure'));

    await LargeSecureStore.setItem('error-preclear', 'value after failed cleanup');

    const result = await LargeSecureStore.getItem('error-preclear');
    expect(result).toBe('value after failed cleanup');
  });
});

describe('LargeSecureStore — key labelling for Sentry breadcrumbs', () => {
  it('labels auth-related keys as "session" rather than leaking the raw key', async () => {
    await LargeSecureStore.setItem('sb-auth-token', 'jwt-value');

    expect(Sentry.addBreadcrumb).toHaveBeenCalledWith(
      expect.objectContaining({ message: expect.stringContaining('session') }),
    );
    expect(Sentry.addBreadcrumb).not.toHaveBeenCalledWith(
      expect.objectContaining({ message: expect.stringContaining('sb-auth-token') }),
    );
  });
});

import AsyncStorage from '@react-native-async-storage/async-storage';
import * as SecureStore from 'expo-secure-store';
import { EncryptedCacheStorage } from '../EncryptedCacheStorage';

beforeEach(async () => {
  await AsyncStorage.clear();
  await SecureStore.deleteItemAsync('weshare_cache_key');
});

describe('EncryptedCacheStorage', () => {
  it('round-trips a value, including non-ASCII text', async () => {
    const storage = new EncryptedCacheStorage();
    await storage.setItem('session', '{"name":"Café — 東京"}');
    expect(await storage.getItem('session')).toBe('{"name":"Café — 東京"}');
  });

  it('never writes the plaintext to AsyncStorage', async () => {
    await new EncryptedCacheStorage().setItem('session', 'secret-expense-description');
    const raw = await AsyncStorage.getItem('weshare_cache:session');
    expect(raw).not.toBeNull();
    expect(raw).not.toContain('secret-expense-description');
  });

  it('reads a value back with a new instance (key persisted in SecureStore)', async () => {
    await new EncryptedCacheStorage().setItem('session', 'hello');
    expect(await new EncryptedCacheStorage().getItem('session')).toBe('hello');
  });

  it('returns null and drops the item when the ciphertext was tampered with', async () => {
    const storage = new EncryptedCacheStorage();
    await storage.setItem('session', 'hello');
    const raw = (await AsyncStorage.getItem('weshare_cache:session'))!;
    const flipped = raw.slice(0, -4) + (raw.endsWith('AAAA') ? 'BBBB' : 'AAAA');
    await AsyncStorage.setItem('weshare_cache:session', flipped);

    expect(await storage.getItem('session')).toBeNull();
    expect(await AsyncStorage.getItem('weshare_cache:session')).toBeNull();
  });

  it('returns null when the key is gone (e.g. Keychain wiped on reinstall)', async () => {
    await new EncryptedCacheStorage().setItem('session', 'hello');
    await SecureStore.deleteItemAsync('weshare_cache_key');
    expect(await new EncryptedCacheStorage().getItem('session')).toBeNull();
  });

  it('clear removes cached items and the key, leaving unrelated storage alone', async () => {
    const storage = new EncryptedCacheStorage();
    await storage.setItem('session', 'hello');
    await AsyncStorage.setItem('theme', 'dark');

    await storage.clear();

    expect(await AsyncStorage.getItem('weshare_cache:session')).toBeNull();
    expect(await SecureStore.getItemAsync('weshare_cache_key')).toBeNull();
    expect(await AsyncStorage.getItem('theme')).toBe('dark');
  });
});

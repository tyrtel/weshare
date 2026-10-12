import AsyncStorage from '@react-native-async-storage/async-storage';
import * as SecureStore from 'expo-secure-store';
import { getRandomBytes } from 'expo-crypto';
import { gcm } from '@noble/ciphers/aes.js';
import { bytesToHex, hexToBytes, utf8ToBytes, bytesToUtf8 } from '@noble/ciphers/utils.js';
import type { ICacheStorage } from '../../core/interfaces/ICacheStorage';

// The 256-bit key is the only thing in the Keychain/Keystore (one small entry);
// the ciphertext lives in AsyncStorage.
// LargeSecureStore isn't used here: it chunks values into 1.8 KB SecureStore
// entries written sequentially, far too slow for a cache rewritten on every change.
const KEY_NAME     = 'weshare_cache_key';
const ITEM_PREFIX  = 'weshare_cache:';
const NONCE_BYTES  = 12;

// Base64 rather than hex for the ciphertext: Android's AsyncStorage database is
// capped (6 MB by default), and hex would double the stored size.
function toBase64(bytes: Uint8Array): string {
  let binary = '';
  for (let i = 0; i < bytes.length; i += 0x8000) {
    binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  }
  return btoa(binary);
}

function fromBase64(b64: string): Uint8Array {
  const binary = atob(b64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

export class EncryptedCacheStorage implements ICacheStorage {
  private keyPromise: Promise<Uint8Array> | null = null;

  private key(): Promise<Uint8Array> {
    if (!this.keyPromise) {
      this.keyPromise = SecureStore.getItemAsync(KEY_NAME).then(async hex => {
        if (hex) return hexToBytes(hex);
        const fresh = getRandomBytes(32);
        await SecureStore.setItemAsync(KEY_NAME, bytesToHex(fresh));
        return fresh;
      });
      this.keyPromise.catch(() => { this.keyPromise = null; });
    }
    return this.keyPromise;
  }

  async getItem(key: string): Promise<string | null> {
    const stored = await AsyncStorage.getItem(ITEM_PREFIX + key);
    if (!stored) return null;
    try {
      const bytes = fromBase64(stored);
      const nonce = bytes.subarray(0, NONCE_BYTES);
      const plain = gcm(await this.key(), nonce).decrypt(bytes.subarray(NONCE_BYTES));
      return bytesToUtf8(plain);
    } catch {
      // Tampered, truncated, or encrypted under a key that no longer exists
      // (e.g. Keychain wiped on reinstall) — unreadable either way.
      await AsyncStorage.removeItem(ITEM_PREFIX + key);
      return null;
    }
  }

  async setItem(key: string, value: string): Promise<void> {
    const nonce  = getRandomBytes(NONCE_BYTES);
    const cipher = gcm(await this.key(), nonce).encrypt(utf8ToBytes(value));
    const out    = new Uint8Array(NONCE_BYTES + cipher.length);
    out.set(nonce, 0);
    out.set(cipher, NONCE_BYTES);
    await AsyncStorage.setItem(ITEM_PREFIX + key, toBase64(out));
  }

  async removeItem(key: string): Promise<void> {
    await AsyncStorage.removeItem(ITEM_PREFIX + key);
  }

  async clear(): Promise<void> {
    const keys = await AsyncStorage.getAllKeys();
    await AsyncStorage.multiRemove(keys.filter(k => k.startsWith(ITEM_PREFIX)));
    await SecureStore.deleteItemAsync(KEY_NAME);
    this.keyPromise = null;
  }
}

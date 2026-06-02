import * as SecureStore from 'expo-secure-store';

// expo-secure-store caps each value at ~2 KB. Supabase session JSON (access
// token + refresh token + user metadata) can exceed that, so we chunk long
// values across multiple keys and track the count in a separate key.
const CHUNK_SIZE = 1800; // bytes — well within the 2 048-byte limit

async function getItem(key: string): Promise<string | null> {
  const countStr = await SecureStore.getItemAsync(`${key}_n`);
  if (!countStr) return SecureStore.getItemAsync(key);

  const count = parseInt(countStr, 10);
  const parts: string[] = [];
  for (let i = 0; i < count; i++) {
    const chunk = await SecureStore.getItemAsync(`${key}_${i}`);
    if (chunk === null) return null;
    parts.push(chunk);
  }
  return parts.join('');
}

async function setItem(key: string, value: string): Promise<void> {
  if (value.length <= CHUNK_SIZE) {
    await SecureStore.setItemAsync(key, value);
    return;
  }
  const count = Math.ceil(value.length / CHUNK_SIZE);
  await SecureStore.setItemAsync(`${key}_n`, String(count));
  for (let i = 0; i < count; i++) {
    await SecureStore.setItemAsync(`${key}_${i}`, value.slice(i * CHUNK_SIZE, (i + 1) * CHUNK_SIZE));
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

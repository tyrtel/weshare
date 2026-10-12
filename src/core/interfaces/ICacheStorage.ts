/** On-device storage for the offline data cache. Values are opaque strings. */
export interface ICacheStorage {
  getItem(key: string): Promise<string | null>;
  setItem(key: string, value: string): Promise<void>;
  removeItem(key: string): Promise<void>;
  /** Remove every cached value and any key material, e.g. on sign-out. */
  clear(): Promise<void>;
}

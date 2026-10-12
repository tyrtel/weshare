import type { ICacheStorage } from '../core/interfaces/ICacheStorage';

export class InMemoryCacheStorage implements ICacheStorage {
  readonly items = new Map<string, string>();

  getItem = async (key: string): Promise<string | null> => this.items.get(key) ?? null;

  setItem = async (key: string, value: string): Promise<void> => {
    this.items.set(key, value);
  };

  removeItem = async (key: string): Promise<void> => {
    this.items.delete(key);
  };

  clear = async (): Promise<void> => {
    this.items.clear();
  };
}
